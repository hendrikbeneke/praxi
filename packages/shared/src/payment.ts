import { z } from 'zod'
import { optionalText } from './field.js'
import { dueDate } from './invoice.js'

/**
 * Payments, and the invoice status derived from them (CLAUDE.md rule 9).
 *
 * Payments are entered by hand, one row each. There is no import, no bank
 * reconciliation and no payment provider — that stays in the accounting
 * software (see "Out of scope"). The amount is editable, so partial payments
 * and overpayments exist as facts without being a concept of their own.
 *
 * A payment never touches the invoice row. `protect_finalized_invoice` still
 * freezes everything about a finalized invoice; this is a separate table with
 * a foreign key, and a draft cannot be paid at all — `domain/payment.ts`
 * refuses first and the `payment_requires_finalized_invoice` trigger makes it
 * unreachable.
 */

/** Structurally fixed, hence a `pgEnum` — see the Conventions in CLAUDE.md. */
export const paymentMethods = ['bank_transfer', 'card', 'other'] as const
export const paymentMethodSchema = z.enum(paymentMethods)
export type PaymentMethod = z.infer<typeof paymentMethodSchema>

export const paymentInputSchema = z.object({
  paidOn: z.iso.date(),
  /**
   * No sign restriction beyond "not zero". A negative payment is how a refund
   * is recorded without inventing a second concept — the same reasoning that
   * leaves `activity_item.unit_price_cents` free so a discount needs no
   * mechanism (rule 5). Zero, on the other hand, is always a typo.
   */
  amountCents: z
    .number()
    .int()
    .min(-100_000_000)
    .max(100_000_000)
    .refine((value) => value !== 0, { message: 'a payment of zero is not a payment' }),
  method: paymentMethodSchema.default('bank_transfer'),
  note: optionalText(500),
})

export type PaymentInput = z.infer<typeof paymentInputSchema>

export const paymentSchema = z.object({
  id: z.uuid(),
  invoiceId: z.uuid(),
  paidOn: z.iso.date(),
  amountCents: z.number().int(),
  method: paymentMethodSchema,
  note: z.string().nullable(),
})

export type Payment = z.infer<typeof paymentSchema>

/**
 * What state an invoice is in, as far as money is concerned.
 *
 * `overdue` is deliberately **not** one of these. It is a second axis: an
 * invoice can be partly paid *and* overdue at the same time, and a single
 * column would have to keep one of the two quiet. It travels beside the status
 * as `daysOverdue`.
 */
export const paymentStatuses = [
  'open',
  'partially_paid',
  'paid',
  'overpaid',
  'cancelled',
  'cancellation',
] as const
export const paymentStatusSchema = z.enum(paymentStatuses)
export type PaymentStatus = z.infer<typeof paymentStatusSchema>

export type PaymentState = {
  status: PaymentStatus
  paidCents: number
  /** What is still owed. Zero once settled, negative on an overpayment. */
  openCents: number
  /** Null for a draft: it is not a claim yet, so it cannot fall due. */
  dueDate: string | null
  /** Days past the due date, and only while something is still owed. Null
   *  means "not overdue", which is what the receivables filter tests. */
  daysOverdue: number | null
}

/** Whole days from one plain date to another, both in the practice's calendar.
 *  Midday avoids ever landing on the wrong side of a daylight-saving jump. */
function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T12:00:00Z`)
  const end = Date.parse(`${to}T12:00:00Z`)
  return Math.round((end - start) / 86_400_000)
}

type InvoiceFacts = {
  type: 'invoice' | 'cancellation_invoice'
  status: 'draft' | 'finalized' | 'cancelled'
  totalCents: number
  invoiceDate: string
  paymentTermDays: number
}

/**
 * The payment state of one invoice, derived from the sum of its payments.
 *
 * **This is never stored.** Not in a column, not in a cache, not as a
 * denormalized flag. The payments are the only record of what was received,
 * and a second place saying the same thing would eventually say something
 * else — the invoice row is immutable after finalization anyway, so a stored
 * status could not even be corrected without going around the trigger.
 *
 * The order of the checks is load-bearing:
 *
 * 1. A **cancellation invoice** has no payment state at all. It is a document
 *    with negative amounts, not a claim; "open" would be meaningless on it,
 *    and netting it against the original would be a running account, which
 *    accounting keeps, not this software.
 * 2. A **cancelled invoice** is never open, whatever was paid on it. The
 *    payment stays where it is — on that day that money did arrive, and
 *    deleting it would be a forgery. Refunding it is a step outside this
 *    software; if the practitioner wants it visible, a negative payment on the
 *    original records it.
 * 3. A **draft** is not a claim yet, so it has no due date and cannot be
 *    overdue. It also cannot carry payments in the first place.
 * 4. Only then do the amounts decide. An overpayment is its own answer rather
 *    than `paid`, because "more came in than was asked for" is something the
 *    practitioner has to see; folding it into `paid` would hide it.
 */
export function invoicePaymentState(
  invoice: InvoiceFacts,
  paidCents: number,
  today: string,
): PaymentState {
  const openCents = invoice.totalCents - paidCents

  if (invoice.type === 'cancellation_invoice') {
    return { status: 'cancellation', paidCents, openCents: 0, dueDate: null, daysOverdue: null }
  }
  if (invoice.status === 'cancelled') {
    return { status: 'cancelled', paidCents, openCents: 0, dueDate: null, daysOverdue: null }
  }
  if (invoice.status === 'draft') {
    return { status: 'open', paidCents, openCents, dueDate: null, daysOverdue: null }
  }

  const due = dueDate(invoice.invoiceDate, invoice.paymentTermDays)

  const status: PaymentStatus =
    paidCents > invoice.totalCents
      ? 'overpaid'
      : paidCents >= invoice.totalCents
        ? 'paid'
        : paidCents > 0
          ? 'partially_paid'
          : 'open'

  // The due date itself is not yet late — payment is owed *by* that day.
  const overdueBy = daysBetween(due, today)
  const daysOverdue = openCents > 0 && overdueBy > 0 ? overdueBy : null

  return { status, paidCents, openCents, dueDate: due, daysOverdue }
}

/** Sum of a set of payments. One implementation, so the invoice screen, the
 *  receivables view and the tests cannot disagree. */
export function sumPayments(payments: readonly Pick<Payment, 'amountCents'>[]): number {
  return payments.reduce((total, payment) => total + payment.amountCents, 0)
}

/** One row of the receivables view: the invoice, plus what it derives. */
export const receivableSchema = z.object({
  id: z.uuid(),
  contactId: z.uuid(),
  contactName: z.string(),
  number: z.string().nullable(),
  invoiceDate: z.iso.date(),
  dueDate: z.iso.date().nullable(),
  totalCents: z.number().int(),
  paidCents: z.number().int(),
  openCents: z.number().int(),
  status: paymentStatusSchema,
  daysOverdue: z.number().int().nullable(),
})

export type Receivable = z.infer<typeof receivableSchema>

/**
 * What the receivables view may be filtered by. `overdue` is not a status
 * (see above) but it is the most useful thing to filter on, so it joins the
 * list here — as a filter, where the two axes do not collide.
 */
export const receivableFilters = ['open', 'partially_paid', 'paid', 'overdue', 'cancelled'] as const
export const receivableFilterSchema = z.enum(receivableFilters)
export type ReceivableFilter = z.infer<typeof receivableFilterSchema>

export const receivableQuerySchema = z.object({
  filter: receivableFilterSchema.optional(),
})

/** Does a row belong under this filter? Shared, because the server narrows the
 *  list and the client labels the buttons from the same set. */
export function matchesReceivableFilter(row: Receivable, filter: ReceivableFilter): boolean {
  if (filter === 'overdue') return row.daysOverdue !== null
  // An overpayment is settled — it belongs under "bezahlt", not under "offen".
  if (filter === 'paid') return row.status === 'paid' || row.status === 'overpaid'
  return row.status === filter
}
