import { z } from 'zod'
import { activityStatusSchema } from './activity.js'
import { optionalText, requiredText } from './field.js'

/**
 * Invoices (CLAUDE.md rules 8, 9, 10 and 11).
 *
 * Two things shape this file. First, everything on a finalized invoice is a
 * **snapshot**: services, texts and the contact's address all stay editable,
 * and the document has to read identically for the whole retention period.
 * Second, a finalized invoice is immutable — the trigger in migration 0014
 * enforces it, and payments live in their own table so they never touch the
 * row.
 */

export const invoiceTypes = ['invoice', 'cancellation_invoice'] as const
export const invoiceTypeSchema = z.enum(invoiceTypes)
export type InvoiceType = z.infer<typeof invoiceTypeSchema>

export const invoiceStatuses = ['draft', 'finalized', 'cancelled'] as const
export const invoiceStatusSchema = z.enum(invoiceStatuses)
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>

/**
 * The recipient as they were when the invoice was finalized.
 *
 * `name` is produced by `formatContactName`, the same function the screen
 * uses, so the stored name reads exactly like the one that was checked before
 * finalizing.
 *
 * **Every field here is optional with a default, and that is a property of a
 * snapshot rather than a concession to old rows.** What is stored is what the
 * contact looked like at the moment of finalizing. When the contact schema
 * grows a field afterwards — `houseNumber` did — every snapshot written before
 * that simply does not have the key, and reading it must produce the same
 * document it produced on the day it was issued. This holds after going live
 * as much as before it.
 */
export const recipientSnapshotSchema = z.object({
  contactNumber: z.number().int(),
  name: z.string(),
  contactPerson: z.string().nullable().default(null),
  street: z.string().nullable().default(null),
  houseNumber: z.string().nullable().default(null),
  postalCode: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  country: z.string(),
  vatId: z.string().nullable().default(null),
})

export type RecipientSnapshot = z.infer<typeof recipientSnapshotSchema>

/** A line as it is submitted while the invoice is still a draft. */
export const invoiceLineInputSchema = z.object({
  id: z.uuid().optional(),
  /** Where the line came from. Null for a free line typed by hand. */
  activityItemId: z.uuid().nullable().default(null),
  description: requiredText(200),
  feeCode: optionalText(40),
  dateOfService: z.iso.date().nullable().default(null),
  quantity: z.number().int().positive().max(999).default(1),
  /** No sign restriction, like `activity_item.unit_price_cents`. */
  unitPriceCents: z.number().int().min(-100_000_000).max(100_000_000),
})

export type InvoiceLineInput = z.infer<typeof invoiceLineInputSchema>

export const invoiceLineSchema = z.object({
  id: z.uuid(),
  position: z.number().int(),
  activityItemId: z.uuid().nullable(),
  description: z.string(),
  feeCode: z.string().nullable(),
  dateOfService: z.iso.date().nullable(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  amountCents: z.number().int(),
})

export type InvoiceLine = z.infer<typeof invoiceLineSchema>

/** Creating a draft, optionally filled from a contact's billable items. */
export const invoiceCreateSchema = z.object({
  contactId: z.uuid(),
  invoiceDate: z.iso.date(),
  /** Left out: taken from `practice_settings.default_payment_term_days`. */
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  activityItemIds: z.array(z.uuid()).max(200).default([]),
})

export type InvoiceCreate = z.infer<typeof invoiceCreateSchema>

/**
 * Editing a draft. The texts are plain text and not a reference to a template:
 * picking a template fills them, and they stay adjustable for this one
 * invoice. A foreign key to a mutable table on a row that becomes immutable
 * would need `ON DELETE SET NULL`, and that is an UPDATE the trigger would
 * refuse.
 */
export const invoiceUpdateSchema = z.object({
  invoiceDate: z.iso.date(),
  paymentTermDays: z.number().int().min(0).max(365),
  introText: optionalText(4000),
  outroText: optionalText(4000),
  /** Prefilled from `contact.diagnosis` when the draft is created, then free
   *  to edit — same reasoning as the intro and outro texts (CLAUDE.md rule
   *  12: appears on the draft and the PDF, never in a log or an error). */
  diagnosis: optionalText(4000),
  lines: z.array(invoiceLineInputSchema).max(200).default([]),
})

export type InvoiceUpdate = z.infer<typeof invoiceUpdateSchema>

export const invoiceSchema = z.object({
  id: z.uuid(),
  contactId: z.uuid(),
  contactName: z.string(),
  contactNumber: z.number().int(),
  type: invoiceTypeSchema,
  status: invoiceStatusSchema,
  number: z.string().nullable(),
  numberPrefix: z.string().nullable(),
  numberValue: z.number().int().nullable(),
  invoiceDate: z.iso.date(),
  paymentTermDays: z.number().int(),
  recipientSnapshot: recipientSnapshotSchema.nullable(),
  introText: z.string().nullable(),
  outroText: z.string().nullable(),
  diagnosis: z.string().nullable(),
  totalCents: z.number().int(),
  /**
   * The sum of this invoice's payments (slice 8). Derived, never stored — it
   * is read back with the invoice so a list can show the payment state without
   * a second round trip. What that sum *means* is `invoicePaymentState()` in
   * `payment.ts`, which is the only place the status is decided.
   */
  paidCents: z.number().int(),
  /**
   * The last *successful* send (slice 10). Derived from `invoice_send`, never
   * stored — the same reasoning as `paidCents` one line up, and the reason
   * there are no `sent_at` / `sent_to` columns: the log already knows, and a
   * second place saying when it went out would eventually say something else.
   *
   * It also keeps the slice additive. Columns here would have meant widening
   * the allowlist of `protect_finalized_invoice` (migration 0019), which is
   * the immutability of a finalized document.
   */
  lastSentAt: z.iso.datetime().nullable(),
  lastSentTo: z.string().nullable(),
  pdfHash: z.string().nullable(),
  finalizedAt: z.iso.datetime().nullable(),
  /**
   * The two ends of a cancellation, both stored (CLAUDE.md rule 9): the
   * cancellation document points at the invoice it takes back, the original
   * points at the document that took it back. The numbers travel with them so
   * a list can print the link without looking the other row up — with a status
   * filter the counterpart may not even be in the response.
   */
  cancelsInvoiceId: z.uuid().nullable(),
  cancelsInvoiceNumber: z.string().nullable(),
  cancelledByInvoiceId: z.uuid().nullable(),
  cancelledByInvoiceNumber: z.string().nullable(),
  lines: z.array(invoiceLineSchema),
})

export type Invoice = z.infer<typeof invoiceSchema>

export const invoiceListQuerySchema = z.object({
  contactId: z.uuid().optional(),
  status: invoiceStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>

/** An activity item that may still be put on an invoice. */
export const billableItemSchema = z.object({
  id: z.uuid(),
  activityId: z.uuid(),
  /** Carried because the list may span contacts; the draft picker on a single
   *  contact ignores it. */
  contactId: z.uuid(),
  contactNumber: z.number().int(),
  contactName: z.string(),
  occurredAt: z.iso.datetime(),
  activityTitle: z.string().nullable(),
  /** The `code` of the activity's type. Sent so the picker can fall back to
   *  its label where the activity has no title of its own — the client
   *  resolves it from the catalogue, like everywhere else. */
  activityType: z.string(),
  /**
   * What became of the treatment. Shown, never filtered on: a past activity
   * still standing on "geplant" is the one worth noticing, and a filter would
   * hide it. There is no status parameter in the query below, which is what
   * makes that a property of the API rather than a habit.
   */
  activityStatus: activityStatusSchema,
  description: z.string(),
  feeCode: z.string().nullable(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
})

export type BillableItem = z.infer<typeof billableItemSchema>

/**
 * `contactId` narrows the list to one contact; without it the list spans all
 * of them.
 *
 * There is deliberately **no status field here.** Billability does not depend
 * on a status (rule 6), so a filter over it could only ever hide work that is
 * still owed — and what cannot be expressed cannot be added by habit either.
 */
export const billableQuerySchema = z.object({ contactId: z.uuid().optional() })

/**
 * Turn billable items into drafts: one per contact, appending to the draft a
 * contact already has rather than opening a second one.
 *
 * Both ways into billing use this — the button on a single activity and the
 * bulk action on the billable list. They differ only in how many items they
 * hand over, so they are one operation and not two.
 */
export const invoiceCollectSchema = z.object({
  activityItemIds: z.array(z.uuid()).min(1).max(500),
  invoiceDate: z.iso.date(),
})

export type InvoiceCollect = z.infer<typeof invoiceCollectSchema>

/** What became of one contact's share of a `collect`. */
export const invoiceCollectResultSchema = z.object({
  invoiceId: z.uuid(),
  contactId: z.uuid(),
  contactName: z.string(),
  /** False when the items were appended to a draft that already existed. */
  created: z.boolean(),
  addedLines: z.number().int(),
})

export type InvoiceCollectResult = z.infer<typeof invoiceCollectResultSchema>

/** Sum of an invoice's lines. Used by the draft editor and by finalization, so
 *  the number on screen and the number on the document come from one place. */
export function sumLines(
  lines: readonly Pick<InvoiceLine, 'quantity' | 'unitPriceCents'>[],
): number {
  return lines.reduce((total, line) => total + line.quantity * line.unitPriceCents, 0)
}

/** Invoice date plus payment term. Derived, never stored. */
export function dueDate(invoiceDate: string, paymentTermDays: number): string {
  const due = new Date(`${invoiceDate}T12:00:00Z`)
  due.setUTCDate(due.getUTCDate() + paymentTermDays)
  return due.toISOString().slice(0, 10)
}
