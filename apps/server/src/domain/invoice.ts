import type {
  BillableItem,
  Invoice,
  InvoiceCollect,
  InvoiceCollectResult,
  InvoiceCreate,
  InvoiceLine,
  InvoiceLineInput,
  InvoiceListQuery,
  InvoiceSummary,
  InvoiceSummaryQuery,
  InvoiceUpdate,
  RecipientSnapshot,
} from '@praxi/shared'
import {
  formatContactName,
  invoiceListFilters,
  invoicePaymentState,
  matchesInvoiceListFilter,
  sumLines,
} from '@praxi/shared'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Database, DbReader, Transaction } from '../db/client.js'
import {
  activity,
  activityItem,
  contact,
  contactRelation,
  contactRelationType,
  country,
  invoice,
  invoiceLine,
  practiceSettings,
  salutation,
  textTemplate,
} from '../db/schema.js'
import { newId } from '../id.js'
import { billableSummary, listBillableItems } from './billable.js'
import { lastSendByInvoice } from './invoice-send.js'
import { type PaymentSummary, paymentSummaryByInvoice } from './payment.js'

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
  recipientContactId: invoice.recipientContactId,
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
  /**
   * The activity the line's item belongs to, joined in and stored nowhere —
   * the same shape as `paidCents` and `contactName` (K7). It is what lets a
   * row say "2 Vorgänge" instead of "3 Positionen": several lines routinely
   * come from one activity, so counting lines answers a different question.
   * Null on a free line typed by hand, which belongs to no activity.
   */
  activityId: activityItem.activityId,
  activityOccurredAt: activity.occurredAt,
  activityTypeId: activity.activityTypeId,
  activityTitle: activity.title,
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
  | 'recipientName'
  | 'paidCents'
  | 'lastPaidOn'
  | 'lastSentAt'
  | 'lastSentTo'
> & {
  finalizedAt: Date | null
}

/** The last successful send, derived from `invoice_send` (slice 10). */
type LastSend = { sentAt: Date; recipient: string } | undefined

/** The recipient as they are right now. Frozen into the invoice at
 *  finalization; `formatContactName` is the same function the screen uses. */
/**
 * The contact row plus the two catalogue values a snapshot has to freeze as
 * text. `loadContactRow` resolves them; nothing else does, because nothing
 * else writes a snapshot.
 */
export type SnapshotSource = typeof contact.$inferSelect & {
  salutationLabel: string | null
  countryCode: string | null
}

export function recipientSnapshotOf(row: SnapshotSource): RecipientSnapshot {
  return {
    contactNumber: row.contactNumber,
    name: formatContactName(row),
    // The text, not the reference (D-R3): renaming a salutation afterwards
    // must not change a document that was printed long ago. Same reasoning as
    // the intro and outro texts, one table over.
    salutation: row.salutationLabel,
    contactPerson: row.contactPerson,
    street: row.street,
    houseNumber: row.houseNumber,
    postalCode: row.postalCode,
    city: row.city,
    country: row.countryCode,
    vatId: row.vatId,
  }
}

async function loadLines(reader: DbReader, invoiceIds: readonly string[]) {
  if (invoiceIds.length === 0) return new Map<string, InvoiceLine[]>()

  const rows = await reader
    .select({ ...lineColumns, invoiceId: invoiceLine.invoiceId })
    .from(invoiceLine)
    // Left, not inner: a free line carries no `activity_item_id` at all and
    // must not fall out of the invoice it is on.
    .leftJoin(activityItem, eq(activityItem.id, invoiceLine.activityItemId))
    .leftJoin(activity, eq(activity.id, activityItem.activityId))
    .where(inArray(invoiceLine.invoiceId, [...invoiceIds]))
    .orderBy(asc(invoiceLine.position))

  const byInvoice = new Map<string, InvoiceLine[]>()
  for (const { invoiceId, activityOccurredAt, ...line } of rows) {
    const entry: InvoiceLine = {
      ...line,
      activityOccurredAt: activityOccurredAt?.toISOString() ?? null,
    }
    const list = byInvoice.get(invoiceId)
    if (list) list.push(entry)
    else byInvoice.set(invoiceId, [entry])
  }
  return byInvoice
}

function toInvoice(
  row: InvoiceRow & { contactName: string; contactNumber: number; recipientName: string | null },
  lines: InvoiceLine[],
  payments: PaymentSummary | undefined,
  lastSend: LastSend,
): Invoice {
  return {
    ...row,
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    // Derived, never stored (rule 9). What the number *means* is decided by
    // `invoicePaymentState()` in packages/shared and nowhere else.
    paidCents: payments?.paidCents ?? 0,
    // The day the last payment arrived, so a list can date "bezahlt". Same
    // reasoning as the sum above: no column, because a second place saying
    // when the money came in would eventually say something else.
    lastPaidOn: payments?.lastPaidOn ?? null,
    // Same reasoning one slice later: the send log knows when it last went out
    // and to whom, so there is no column here saying it a second time.
    lastSentAt: lastSend?.sentAt.toISOString() ?? null,
    lastSentTo: lastSend?.recipient ?? null,
    lines,
  }
}

/** The chosen recipient, joined for their name alone — the same shape as
 *  `contactName`, derived on read and stored nowhere. Null where the invoice
 *  goes to the contact itself, which is most of them. */
const recipientContact = alias(contact, 'recipient_contact')

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
  recipientKind: recipientContact.kind,
  recipientTitle: recipientContact.title,
  recipientFirstName: recipientContact.firstName,
  recipientLastName: recipientContact.lastName,
  recipientCompanyName: recipientContact.companyName,
}

/** The name of the chosen recipient, or null where there is none. Not the
 *  snapshot's: this is what the *draft* is pointing at, and the snapshot is
 *  what a finalized document was addressed to. */
function recipientNameOf(row: {
  recipientContactId: string | null
  recipientKind: 'person' | 'organization' | null
  recipientTitle: string | null
  recipientFirstName: string | null
  recipientLastName: string | null
  recipientCompanyName: string | null
}): string | null {
  if (row.recipientContactId === null || row.recipientKind === null) return null
  return formatContactName({
    kind: row.recipientKind,
    title: row.recipientTitle,
    firstName: row.recipientFirstName,
    lastName: row.recipientLastName,
    companyName: row.recipientCompanyName,
  })
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
    .leftJoin(recipientContact, eq(recipientContact.id, invoice.recipientContactId))
    .leftJoin(cancels, eq(cancels.id, invoice.cancelsInvoiceId))
    .leftJoin(cancelledBy, eq(cancelledBy.id, invoice.cancelledByInvoiceId))
    .where(and(...filters))
    .orderBy(desc(invoice.invoiceDate), desc(invoice.createdAt))
    .limit(query.limit)
    .offset(query.offset)

  const ids = rows.map((row) => row.id)
  const [lines, paid, sent] = await Promise.all([
    loadLines(database, ids),
    paymentSummaryByInvoice(database, tenantId, ids),
    lastSendByInvoice(database, tenantId, ids),
  ])

  return rows.map((row) =>
    toInvoice(
      {
        ...row,
        contactName: displayName(row),
        contactNumber: row.contactNumber,
        recipientName: recipientNameOf(row),
      },
      lines.get(row.id) ?? [],
      paid.get(row.id),
      sent.get(row.id),
    ),
  )
}

/**
 * The numbers above the invoice list: the chips, and the two tiles (B3).
 *
 * **Counted over every row of the selection, never over a page of it.** Both
 * screens folded whatever the list request had returned until B3, and that
 * request is capped at 200 — so a tile said "3 offen" of the first two hundred
 * documents. A figure that changes as one scrolls is a wrong figure, not a
 * partial one.
 *
 * **It folds in TypeScript rather than in SQL, and that is deliberate.** What
 * "offen", "bezahlt" or "überfällig" mean is `invoicePaymentState()` and
 * `matchesInvoiceListFilter()` in `packages/shared`, which rule 9 makes the
 * only place that decides — the rows use them, and restating them as a `WHERE`
 * clause here would be a second definition that agrees until it does not. The
 * columns loaded are exactly the six those two functions read, so this stays a
 * count over narrow rows and not a second `listInvoices`.
 *
 * The counts are built as a `Record` over `invoiceListFilters`: a sixth chip
 * cannot be added without its number coming with it.
 */
export async function invoiceSummary(
  reader: DbReader,
  tenantId: string,
  query: InvoiceSummaryQuery,
  today: string,
): Promise<InvoiceSummary> {
  const filters = [eq(invoice.tenantId, tenantId)]
  if (query.contactId) filters.push(eq(invoice.contactId, query.contactId))

  const [rows, billable] = await Promise.all([
    reader
      .select({
        id: invoice.id,
        type: invoice.type,
        status: invoice.status,
        totalCents: invoice.totalCents,
        invoiceDate: invoice.invoiceDate,
        paymentTermDays: invoice.paymentTermDays,
      })
      .from(invoice)
      .where(and(...filters)),
    billableSummary(reader, tenantId, query.contactId),
  ])

  /* The same grouped query `listInvoices` uses for the same number, rather
     than a subquery of its own: what has been received on an invoice is asked
     in one place. */
  const paid = await paymentSummaryByInvoice(
    reader,
    tenantId,
    rows.map((row) => row.id),
  )

  const counts: Record<(typeof invoiceListFilters)[number], number> = {
    draft: 0,
    open: 0,
    overdue: 0,
    paid: 0,
    cancelled: 0,
  }
  let openCents = 0

  for (const row of rows) {
    const state = invoicePaymentState(row, paid.get(row.id)?.paidCents ?? 0, today)
    for (const filter of invoiceListFilters) {
      if (matchesInvoiceListFilter(row, state, filter)) counts[filter] += 1
    }
    // A draft is not a claim, so it owes nothing — `invoicePaymentState`
    // reports its total as open, which is right for the row and wrong here.
    if (row.status !== 'draft') openCents += state.openCents
  }

  return {
    total: rows.length,
    ...counts,
    openCents,
    billableActivities: billable.activities,
    billableItems: billable.items,
    billableCents: billable.cents,
  }
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
    .leftJoin(recipientContact, eq(recipientContact.id, invoice.recipientContactId))
    .leftJoin(cancels, eq(cancels.id, invoice.cancelsInvoiceId))
    .leftJoin(cancelledBy, eq(cancelledBy.id, invoice.cancelledByInvoiceId))
    .where(and(eq(invoice.tenantId, tenantId), eq(invoice.id, id)))
    .limit(1)

  if (!row) return null
  const lines = await loadLines(reader, [row.id])
  const paid = await paymentSummaryByInvoice(reader, tenantId, [row.id])
  const sent = await lastSendByInvoice(reader, tenantId, [row.id])
  return toInvoice(
    {
      ...row,
      contactName: displayName(row),
      contactNumber: row.contactNumber,
      recipientName: recipientNameOf(row),
    },
    lines.get(row.id) ?? [],
    paid.get(row.id),
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

  /* A new draft starts on the contact's billing recipient where there is one
     — the child is the patient, the mother pays, and having to pick her on
     every invoice would be the relation not being used. Exclusive, so there
     is at most one to take. */
  const [recipient] = await billingRecipientsOf(tx, tenantId, contactId)

  const invoiceId = newId()
  await tx.insert(invoice).values({
    id: invoiceId,
    tenantId,
    contactId,
    recipientContactId: recipient?.id ?? null,
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
/**
 * Who an invoice for this contact may be addressed to (L8).
 *
 * The `billing_recipient` relation, and nothing else. It is a system type with
 * `is_exclusive`, so there is at most one — the list shape is deliberate all
 * the same: the exclusivity is a rule about the *contact*, and a screen that
 * offered a choice of one would still have to say which one.
 *
 * **The invoice itself is never a free choice.** Accepting any contact id
 * would let one request address a patient's invoice to anybody in the card
 * index, which is a disclosure and not a typo; so this is both what the picker
 * is filled from and what `updateInvoice` validates against.
 */
export async function billingRecipientsOf(
  reader: DbReader,
  tenantId: string,
  contactId: string,
): Promise<{ id: string; name: string; relationLabel: string }[]> {
  const rows = await reader
    .select({
      id: contact.id,
      kind: contact.kind,
      title: contact.title,
      firstName: contact.firstName,
      lastName: contact.lastName,
      companyName: contact.companyName,
      relationLabel: contactRelationType.labelForward,
    })
    .from(contactRelation)
    .innerJoin(contact, eq(contact.id, contactRelation.toContactId))
    .innerJoin(
      contactRelationType,
      and(
        eq(contactRelationType.tenantId, contactRelation.tenantId),
        eq(contactRelationType.code, contactRelation.relationCode),
      ),
    )
    .where(
      and(
        eq(contactRelation.tenantId, tenantId),
        eq(contactRelation.fromContactId, contactId),
        eq(contactRelation.relationCode, BILLING_RECIPIENT_CODE),
      ),
    )
    .orderBy(asc(contact.sortName))

  return rows.map((row) => ({
    id: row.id,
    name: formatContactName(row),
    relationLabel: row.relationLabel,
  }))
}

/** The one relation code this file depends on. It is a system type, so it
 *  cannot be renamed or deleted — that is what `is_system` is for (rule 4). */
export const BILLING_RECIPIENT_CODE = 'billing_recipient'

export class UnknownRecipientError extends Error {
  constructor() {
    super('recipient is not a billing recipient of this contact')
  }
}

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
      .select({ status: invoice.status, contactId: invoice.contactId })
      .from(invoice)
      .where(and(eq(invoice.tenantId, tenantId), eq(invoice.id, id)))
      .limit(1)

    if (!existing) return false
    if (existing.status !== 'draft') throw new InvoiceNotADraftError()

    /* Checked, not trusted: without this, one request could address a
       patient's invoice to any contact in the card index. */
    if (input.recipientContactId !== null) {
      const allowed = await billingRecipientsOf(tx, tenantId, existing.contactId)
      if (!allowed.some((entry) => entry.id === input.recipientContactId)) {
        throw new UnknownRecipientError()
      }
    }

    await syncLines(tx, tenantId, id, input.lines)

    await tx
      .update(invoice)
      .set({
        invoiceDate: input.invoiceDate,
        paymentTermDays: input.paymentTermDays,
        recipientContactId: input.recipientContactId,
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
): Promise<SnapshotSource | null> {
  // Left joins: both are optional at the contact, and a missing one is a
  // snapshot field that is null — not a row that fails to load.
  const [row] = await tx
    .select({
      contact,
      salutationLabel: salutation.label,
      countryCode: country.isoCode,
    })
    .from(contact)
    .leftJoin(salutation, eq(salutation.id, contact.salutationId))
    .leftJoin(country, eq(country.id, contact.countryId))
    .where(and(eq(contact.tenantId, tenantId), eq(contact.id, contactId)))
    .limit(1)

  if (!row) return null
  return { ...row.contact, salutationLabel: row.salutationLabel, countryCode: row.countryCode }
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
