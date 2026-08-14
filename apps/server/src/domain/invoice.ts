import type {
  BillableItem,
  Invoice,
  InvoiceCollect,
  InvoiceCollectResult,
  InvoiceCreate,
  InvoiceLine,
  InvoiceLineInput,
  InvoiceListQuery,
  InvoiceUpdate,
  RecipientSnapshot,
} from '@praxi/shared'
import { formatContactName, sumLines } from '@praxi/shared'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Database, DbReader, Transaction } from '../db/client.js'
import { contact, invoice, invoiceLine, practiceSettings, textTemplate } from '../db/schema.js'
import { newId } from '../id.js'
import { listBillableItems } from './billable.js'
import { lastSendByInvoice } from './invoice-send.js'
import { paidCentsByInvoice } from './payment.js'

/**
 * Invoice drafts: creating, editing, discarding. Finalization lives next door
 * in `finalize-invoice.ts`, because it is a different kind of operation — one
 * transaction that reaches outside the database and cannot be undone.
 */

export class InvoiceNotADraftError extends Error {
  constructor() {
    super('invoice is finalized and cannot be modified')
    this.name = 'InvoiceNotADraftError'
  }
}

export class InvoiceEmptyError extends Error {
  constructor() {
    super('an invoice needs at least one line')
    this.name = 'InvoiceEmptyError'
  }
}

export class ItemAlreadyBilledError extends Error {
  constructor() {
    super('one of the chosen activity items is already on an invoice')
    this.name = 'ItemAlreadyBilledError'
  }
}

const invoiceColumns = {
  id: invoice.id,
  contactId: invoice.contactId,
  type: invoice.type,
  status: invoice.status,
  number: invoice.number,
  numberPrefix: invoice.numberPrefix,
  numberValue: invoice.numberValue,
  invoiceDate: invoice.invoiceDate,
  paymentTermDays: invoice.paymentTermDays,
  recipientSnapshot: invoice.recipientSnapshot,
  introText: invoice.introText,
  outroText: invoice.outroText,
  diagnosis: invoice.diagnosis,
  totalCents: invoice.totalCents,
  pdfHash: invoice.pdfHash,
  finalizedAt: invoice.finalizedAt,
  cancelsInvoiceId: invoice.cancelsInvoiceId,
  cancelledByInvoiceId: invoice.cancelledByInvoiceId,
}

/**
 * The other end of a cancellation, joined in for its number alone. A list
 * filtered by status may not contain the counterpart at all, so the client
 * cannot resolve the link from the rows it was given.
 */
const cancels = alias(invoice, 'cancels_invoice')
const cancelledBy = alias(invoice, 'cancelled_by_invoice')

const lineColumns = {
  id: invoiceLine.id,
  position: invoiceLine.position,
  activityItemId: invoiceLine.activityItemId,
  description: invoiceLine.description,
  feeCode: invoiceLine.feeCode,
  dateOfService: invoiceLine.dateOfService,
  quantity: invoiceLine.quantity,
  unitPriceCents: invoiceLine.unitPriceCents,
  amountCents: invoiceLine.amountCents,
}

type InvoiceRow = Omit<
  Invoice,
  | 'finalizedAt'
  | 'lines'
  | 'contactName'
  | 'contactNumber'
  | 'paidCents'
  | 'lastSentAt'
  | 'lastSentTo'
> & {
  finalizedAt: Date | null
}

/** The last successful send, derived from `invoice_send` (slice 10). */
type LastSend = { sentAt: Date; recipient: string } | undefined

/** The recipient as they are right now. Frozen into the invoice at
 *  finalization; `formatContactName` is the same function the screen uses. */
export function recipientSnapshotOf(row: typeof contact.$inferSelect): RecipientSnapshot {
  return {
    contactNumber: row.contactNumber,
    name: formatContactName(row),
    contactPerson: row.contactPerson,
    street: row.street,
    houseNumber: row.houseNumber,
    postalCode: row.postalCode,
    city: row.city,
    country: row.country,
    vatId: row.vatId,
  }
}

async function loadLines(reader: DbReader, invoiceIds: readonly string[]) {
  if (invoiceIds.length === 0) return new Map<string, InvoiceLine[]>()

  const rows = await reader
    .select({ ...lineColumns, invoiceId: invoiceLine.invoiceId })
    .from(invoiceLine)
    .where(inArray(invoiceLine.invoiceId, [...invoiceIds]))
    .orderBy(asc(invoiceLine.position))

  const byInvoice = new Map<string, InvoiceLine[]>()
  for (const { invoiceId, ...line } of rows) {
    const list = byInvoice.get(invoiceId)
    if (list) list.push(line)
    else byInvoice.set(invoiceId, [line])
  }
  return byInvoice
}

function toInvoice(
  row: InvoiceRow & { contactName: string; contactNumber: number },
  lines: InvoiceLine[],
  paidCents: number,
  lastSend: LastSend,
): Invoice {
  return {
    ...row,
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    // Derived, never stored (rule 9). What the number *means* is decided by
    // `invoicePaymentState()` in packages/shared and nowhere else.
    paidCents,
    // Same reasoning one slice later: the send log knows when it last went out
    // and to whom, so there is no column here saying it a second time.
    lastSentAt: lastSend?.sentAt.toISOString() ?? null,
    lastSentTo: lastSend?.recipient ?? null,
    lines,
  }
}

const withContact = {
  ...invoiceColumns,
  cancelsInvoiceNumber: cancels.number,
  cancelledByInvoiceNumber: cancelledBy.number,
  contactKind: contact.kind,
  contactTitle: contact.title,
  contactFirstName: contact.firstName,
  contactLastName: contact.lastName,
  contactCompanyName: contact.companyName,
  contactNumber: contact.contactNumber,
}

/** The name shown in a list. For a finalized invoice the snapshot is what
 *  counts — the contact may have been renamed since. */
function displayName(row: {
  recipientSnapshot: RecipientSnapshot | null
  contactKind: 'person' | 'organization'
  contactTitle: string | null
  contactFirstName: string | null
  contactLastName: string | null
  contactCompanyName: string | null
}): string {
  if (row.recipientSnapshot) return row.recipientSnapshot.name
  return formatContactName({
    kind: row.contactKind,
    title: row.contactTitle,
    firstName: row.contactFirstName,
    lastName: row.contactLastName,
    companyName: row.contactCompanyName,
  })
}

export async function listInvoices(
  database: Database,
  tenantId: string,
  query: InvoiceListQuery,
): Promise<Invoice[]> {
  const filters = [eq(invoice.tenantId, tenantId)]
  if (query.contactId) filters.push(eq(invoice.contactId, query.contactId))
  if (query.status) filters.push(eq(invoice.status, query.status))

  const rows = await database
    .select(withContact)
    .from(invoice)
    .innerJoin(contact, eq(contact.id, invoice.contactId))
    .leftJoin(cancels, eq(cancels.id, invoice.cancelsInvoiceId))
    .leftJoin(cancelledBy, eq(cancelledBy.id, invoice.cancelledByInvoiceId))
    .where(and(...filters))
    .orderBy(desc(invoice.invoiceDate), desc(invoice.createdAt))
    .limit(query.limit)
    .offset(query.offset)

  const ids = rows.map((row) => row.id)
  const [lines, paid, sent] = await Promise.all([
    loadLines(database, ids),
    paidCentsByInvoice(database, tenantId, ids),
    lastSendByInvoice(database, tenantId, ids),
  ])

  return rows.map((row) =>
    toInvoice(
      { ...row, contactName: displayName(row), contactNumber: row.contactNumber },
      lines.get(row.id) ?? [],
      paid.get(row.id) ?? 0,
      sent.get(row.id),
    ),
  )
}

export async function getInvoice(
  reader: DbReader,
  tenantId: string,
  id: string,
): Promise<Invoice | null> {
  const [row] = await reader
    .select(withContact)
    .from(invoice)
    .innerJoin(contact, eq(contact.id, invoice.contactId))
    .leftJoin(cancels, eq(cancels.id, invoice.cancelsInvoiceId))
    .leftJoin(cancelledBy, eq(cancelledBy.id, invoice.cancelledByInvoiceId))
    .where(and(eq(invoice.tenantId, tenantId), eq(invoice.id, id)))
    .limit(1)

  if (!row) return null
  const lines = await loadLines(reader, [row.id])
  const paid = await paidCentsByInvoice(reader, tenantId, [row.id])
  const sent = await lastSendByInvoice(reader, tenantId, [row.id])
  return toInvoice(
    { ...row, contactName: displayName(row), contactNumber: row.contactNumber },
    lines.get(row.id) ?? [],
    paid.get(row.id) ?? 0,
    sent.get(row.id),
  )
}

/**
 * The defaults a new draft opens with: the practice's payment term and
 * whichever intro and outro block is marked as the default.
 *
 * Shared by `createInvoice` and `collectBillableItems`, because a draft that
 * came into being from the billable list must not differ from one started by
 * hand — the difference would only show up on the finished document.
 */
async function insertDraft(
  tx: Transaction,
  tenantId: string,
  contactId: string,
  invoiceDate: string,
  paymentTermDays?: number | null,
): Promise<string> {
  const [settings] = await tx
    .select({ term: practiceSettings.defaultPaymentTermDays })
    .from(practiceSettings)
    .where(eq(practiceSettings.tenantId, tenantId))
    .limit(1)

  // Prefilled once, from the contact's master data (CLAUDE.md rule 12), then
  // free to edit for this one invoice — same reasoning as the texts below.
  const [contactRow] = await tx
    .select({ diagnosis: contact.diagnosis })
    .from(contact)
    .where(and(eq(contact.tenantId, tenantId), eq(contact.id, contactId)))
    .limit(1)

  const defaultBody = async (kind: 'intro' | 'outro') => {
    const [template] = await tx
      .select({ body: textTemplate.body })
      .from(textTemplate)
      .where(
        and(
          eq(textTemplate.tenantId, tenantId),
          eq(textTemplate.kind, kind),
          eq(textTemplate.isDefault, true),
        ),
      )
      .limit(1)
    return template?.body ?? null
  }

  const invoiceId = newId()
  await tx.insert(invoice).values({
    id: invoiceId,
    tenantId,
    contactId,
    invoiceDate,
    paymentTermDays: paymentTermDays ?? settings?.term ?? 14,
    introText: await defaultBody('intro'),
    outroText: await defaultBody('outro'),
    diagnosis: contactRow?.diagnosis ?? null,
  })

  return invoiceId
}

/**
 * Appends billable items to a draft as lines and rewrites the total.
 *
 * The total is summed over *all* the draft's lines rather than added to, so
 * appending twice cannot drift away from what the lines say.
 */
async function appendLines(
  tx: Transaction,
  tenantId: string,
  invoiceId: string,
  items: readonly BillableItem[],
): Promise<void> {
  if (items.length === 0) return

  const [last] = await tx
    .select({ position: sql<number | null>`max(${invoiceLine.position})` })
    .from(invoiceLine)
    .where(eq(invoiceLine.invoiceId, invoiceId))

  const start = (last?.position ?? -1) + 1

  await tx.insert(invoiceLine).values(
    items.map((item, index) => ({
      id: newId(),
      tenantId,
      invoiceId,
      position: start + index,
      activityItemId: item.id,
      description: item.description,
      feeCode: item.feeCode,
      dateOfService: item.occurredAt.slice(0, 10),
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
  )

  const stored = await tx
    .select({ quantity: invoiceLine.quantity, unitPriceCents: invoiceLine.unitPriceCents })
    .from(invoiceLine)
    .where(eq(invoiceLine.invoiceId, invoiceId))

  await tx
    .update(invoice)
    .set({ totalCents: sumLines(stored) })
    .where(eq(invoice.id, invoiceId))
}

/**
 * Resolves the chosen ids against what is actually billable, rather than
 * trusting them: a stale browser tab could otherwise put an item on a second
 * invoice.
 */
async function resolveBillable(
  tx: Transaction,
  tenantId: string,
  activityItemIds: readonly string[],
): Promise<BillableItem[]> {
  const billable = await listBillableItems(tx, tenantId)
  const allowed = new Map(billable.map((item) => [item.id, item]))

  return activityItemIds.map((itemId) => {
    const item = allowed.get(itemId)
    if (!item) throw new ItemAlreadyBilledError()
    return item
  })
}

/** A new draft, optionally filled from the contact's billable items. */
export async function createInvoice(
  database: Database,
  tenantId: string,
  input: InvoiceCreate,
): Promise<Invoice> {
  const id = await database.transaction(async (tx) => {
    const invoiceId = await insertDraft(
      tx,
      tenantId,
      input.contactId,
      input.invoiceDate,
      input.paymentTermDays,
    )

    const chosen = await resolveBillable(tx, tenantId, input.activityItemIds)
    // Items of a different contact would end up on this contact's invoice.
    if (chosen.some((item) => item.contactId !== input.contactId)) {
      throw new ItemAlreadyBilledError()
    }

    await appendLines(tx, tenantId, invoiceId, chosen)
    return invoiceId
  })

  const created = await getInvoice(database, tenantId, id)
  if (!created) throw new Error('insert returned no row')
  return created
}

/**
 * Turns billable items into drafts — one per contact, appending to a draft the
 * contact already has instead of opening a second one.
 *
 * Both ways into billing land here: the button on a single activity and the
 * bulk action on the billable list. They differ only in how many items they
 * hand over, so the rule about what happens to them lives in one place rather
 * than in two screens.
 *
 * One transaction for all contacts. Either every draft named in the answer
 * exists or none does — a half-finished collect would leave the practitioner
 * guessing which contacts still need doing.
 */
export async function collectBillableItems(
  database: Database,
  tenantId: string,
  input: InvoiceCollect,
): Promise<InvoiceCollectResult[]> {
  return database.transaction(async (tx) => {
    const chosen = await resolveBillable(tx, tenantId, input.activityItemIds)

    const byContact = new Map<string, BillableItem[]>()
    for (const item of chosen) {
      const bucket = byContact.get(item.contactId)
      if (bucket) bucket.push(item)
      else byContact.set(item.contactId, [item])
    }

    const results: InvoiceCollectResult[] = []

    for (const [contactId, items] of byContact) {
      /**
       * The draft to append to. Ordered newest first because that is the one
       * being worked on; with the single draft this practice normally has, the
       * ordering never comes up.
       */
      const [open] = await tx
        .select({ id: invoice.id })
        .from(invoice)
        .where(
          and(
            eq(invoice.tenantId, tenantId),
            eq(invoice.contactId, contactId),
            eq(invoice.status, 'draft'),
            eq(invoice.type, 'invoice'),
          ),
        )
        .orderBy(desc(invoice.createdAt))
        .limit(1)

      const invoiceId = open
        ? open.id
        : await insertDraft(tx, tenantId, contactId, input.invoiceDate)

      await appendLines(tx, tenantId, invoiceId, items)

      results.push({
        invoiceId,
        contactId,
        contactName: items[0]?.contactName ?? '',
        created: !open,
        addedLines: items.length,
      })
    }

    return results
  })
}

/**
 * Brings the stored lines in line with the submitted ones, in place.
 *
 * Rows are updated rather than replaced for the same reason as
 * `activity_item`: a stable id is what the record of origin hangs on. Deleting
 * a line is fine here — it only detaches the activity item, which then becomes
 * billable again.
 */
async function syncLines(
  tx: Transaction,
  tenantId: string,
  invoiceId: string,
  lines: readonly InvoiceLineInput[],
): Promise<void> {
  const existing = await tx
    .select({ id: invoiceLine.id })
    .from(invoiceLine)
    .where(eq(invoiceLine.invoiceId, invoiceId))

  const submitted = new Set(lines.map((line) => line.id).filter(Boolean))
  const removed = existing.filter((row) => !submitted.has(row.id)).map((row) => row.id)

  if (removed.length > 0) {
    await tx.delete(invoiceLine).where(inArray(invoiceLine.id, removed))
  }

  for (const [position, line] of lines.entries()) {
    const values = {
      position,
      activityItemId: line.activityItemId,
      description: line.description,
      feeCode: line.feeCode,
      dateOfService: line.dateOfService,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
    }

    if (line.id && existing.some((row) => row.id === line.id)) {
      await tx.update(invoiceLine).set(values).where(eq(invoiceLine.id, line.id))
    } else {
      await tx.insert(invoiceLine).values({ id: newId(), tenantId, invoiceId, ...values })
    }
  }
}

export async function updateInvoice(
  database: Database,
  tenantId: string,
  id: string,
  input: InvoiceUpdate,
): Promise<Invoice | null> {
  const found = await database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ status: invoice.status })
      .from(invoice)
      .where(and(eq(invoice.tenantId, tenantId), eq(invoice.id, id)))
      .limit(1)

    if (!existing) return false
    if (existing.status !== 'draft') throw new InvoiceNotADraftError()

    await syncLines(tx, tenantId, id, input.lines)

    await tx
      .update(invoice)
      .set({
        invoiceDate: input.invoiceDate,
        paymentTermDays: input.paymentTermDays,
        introText: input.introText,
        outroText: input.outroText,
        diagnosis: input.diagnosis,
        totalCents: sumLines(input.lines),
      })
      .where(eq(invoice.id, id))

    return true
  })

  return found ? getInvoice(database, tenantId, id) : null
}

/** Discarding a draft. It never held a number, so no gap arises — see the note
 *  on `nextNumber`. A finalized invoice is refused here and by the trigger. */
export async function deleteInvoice(
  database: Database,
  tenantId: string,
  id: string,
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ status: invoice.status })
      .from(invoice)
      .where(and(eq(invoice.tenantId, tenantId), eq(invoice.id, id)))
      .limit(1)

    if (!existing) return false
    if (existing.status !== 'draft') throw new InvoiceNotADraftError()

    await tx.delete(invoice).where(eq(invoice.id, id))
    return true
  })
}

/** Used by the finalize path, which needs the raw contact row for the
 *  snapshot rather than the joined display columns. */
export async function loadContactRow(
  tx: Transaction,
  tenantId: string,
  contactId: string,
): Promise<typeof contact.$inferSelect | null> {
  const [row] = await tx
    .select()
    .from(contact)
    .where(and(eq(contact.tenantId, tenantId), eq(contact.id, contactId)))
    .limit(1)

  return row ?? null
}

/** `pdf_path` is internal and deliberately absent from the payload — where a
 *  document sits on disk is nobody's business outside the server. The download
 *  route reads it through here. */
export async function getStoredPdfPath(
  reader: DbReader,
  tenantId: string,
  id: string,
): Promise<string | null> {
  const [row] = await reader
    .select({ pdfPath: invoice.pdfPath })
    .from(invoice)
    .where(and(eq(invoice.tenantId, tenantId), eq(invoice.id, id)))
    .limit(1)

  return row?.pdfPath ?? null
}
