import { z } from 'zod'
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
 */
export const recipientSnapshotSchema = z.object({
  contactNumber: z.number().int(),
  name: z.string(),
  contactPerson: z.string().nullable().default(null),
  street: z.string().nullable().default(null),
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

/** One of a contact's activity items that may still be put on an invoice. */
export const billableItemSchema = z.object({
  id: z.uuid(),
  activityId: z.uuid(),
  occurredAt: z.iso.datetime(),
  activityTitle: z.string().nullable(),
  /** The `code` of the activity's type. Sent so the picker can fall back to
   *  its label where the activity has no title of its own — the client
   *  resolves it from the catalogue, like everywhere else. */
  activityType: z.string(),
  description: z.string(),
  feeCode: z.string().nullable(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
})

export type BillableItem = z.infer<typeof billableItemSchema>

export const billableQuerySchema = z.object({ contactId: z.uuid() })

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
