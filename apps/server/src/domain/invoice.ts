import type {
  Invoice,
  InvoiceCreate,
  InvoiceLine,
  InvoiceLineInput,
  InvoiceListQuery,
  InvoiceUpdate,
  RecipientSnapshot,
} from '@praxi/shared'
import { formatContactName, sumLines } from '@praxi/shared'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { Database, DbReader, Transaction } from '../db/client.js'
import { contact, invoice, invoiceLine, practiceSettings, textTemplate } from '../db/schema.js'
import { newId } from '../id.js'
import { listBillableItems } from './billable.js'

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
  totalCents: invoice.totalCents,
  pdfHash: invoice.pdfHash,
  finalizedAt: invoice.finalizedAt,
}

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

type InvoiceRow = Omit<Invoice, 'finalizedAt' | 'lines' | 'contactName' | 'contactNumber'> & {
  finalizedAt: Date | null
}

/** The recipient as they are right now. Frozen into the invoice at
 *  finalization; `formatContactName` is the same function the screen uses. */
export function recipientSnapshotOf(row: typeof contact.$inferSelect): RecipientSnapshot {
  return {
    contactNumber: row.contactNumber,
    name: formatContactName(row),
    contactPerson: row.contactPerson,
    street: row.street,
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
): Invoice {
  return {
    ...row,
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    lines,
  }
}

const withContact = {
  ...invoiceColumns,
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
    .where(and(...filters))
    .orderBy(desc(invoice.invoiceDate), desc(invoice.createdAt))
    .limit(query.limit)
    .offset(query.offset)

  const lines = await loadLines(
    database,
    rows.map((row) => row.id),
  )

  return rows.map((row) =>
    toInvoice(
      { ...row, contactName: displayName(row), contactNumber: row.contactNumber },
      lines.get(row.id) ?? [],
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
    .where(and(eq(invoice.tenantId, tenantId), eq(invoice.id, id)))
    .limit(1)

  if (!row) return null
  const lines = await loadLines(reader, [row.id])
  return toInvoice(
    { ...row, contactName: displayName(row), contactNumber: row.contactNumber },
    lines.get(row.id) ?? [],
  )
}

/**
 * A new draft, optionally filled from the contact's billable items.
 *
 * The chosen items are checked against the billable query rather than trusted:
 * a stale browser tab could otherwise put an item on a second invoice.
 */
export async function createInvoice(
  database: Database,
  tenantId: string,
  input: InvoiceCreate,
): Promise<Invoice> {
  const id = await database.transaction(async (tx) => {
    const [settings] = await tx
      .select({ term: practiceSettings.defaultPaymentTermDays })
      .from(practiceSettings)
      .where(eq(practiceSettings.tenantId, tenantId))
      .limit(1)

    const [intro] = await tx
      .select({ body: textTemplate.body })
      .from(textTemplate)
      .where(
        and(
          eq(textTemplate.tenantId, tenantId),
          eq(textTemplate.kind, 'intro'),
          eq(textTemplate.isDefault, true),
        ),
      )
      .limit(1)

    const [outro] = await tx
      .select({ body: textTemplate.body })
      .from(textTemplate)
      .where(
        and(
          eq(textTemplate.tenantId, tenantId),
          eq(textTemplate.kind, 'outro'),
          eq(textTemplate.isDefault, true),
        ),
      )
      .limit(1)

    const invoiceId = newId()
    await tx.insert(invoice).values({
      id: invoiceId,
      tenantId,
      contactId: input.contactId,
      invoiceDate: input.invoiceDate,
      paymentTermDays: input.paymentTermDays ?? settings?.term ?? 14,
      introText: intro?.body ?? null,
      outroText: outro?.body ?? null,
    })

    if (input.activityItemIds.length > 0) {
      const billable = await listBillableItems(tx, tenantId, input.contactId)
      const allowed = new Map(billable.map((item) => [item.id, item]))

      const chosen = input.activityItemIds.map((itemId) => {
        const item = allowed.get(itemId)
        if (!item) throw new ItemAlreadyBilledError()
        return item
      })

      await tx.insert(invoiceLine).values(
        chosen.map((item, index) => ({
          id: newId(),
          tenantId,
          invoiceId,
          position: index,
          activityItemId: item.id,
          description: item.description,
          feeCode: item.feeCode,
          dateOfService: item.occurredAt.slice(0, 10),
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
        })),
      )

      await tx
        .update(invoice)
        .set({ totalCents: sumLines(chosen) })
        .where(eq(invoice.id, invoiceId))
    }

    return invoiceId
  })

  const created = await getInvoice(database, tenantId, id)
  if (!created) throw new Error('insert returned no row')
  return created
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
