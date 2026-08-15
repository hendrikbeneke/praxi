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

/**
 * What the invoice list under Zahlungen may be filtered by — one band of
 * chips, not two (D7).
 *
 * Until D7 there were two screens with a filter each: the invoice list
 * filtered on `invoice.status` (Entwurf / Festgeschrieben / Storniert) and the
 * Bezahlübersicht filtered on the payment state. Merging them mechanically
 * would have produced two rows of chips stacked on each other, and that is
 * not how a document reads: it is in *one* state, and which of the two axes
 * that state comes from is the software's business, not the practitioner's.
 *
 * So the two vocabularies became this one. `draft` is the only entry that
 * comes from `invoice.status`; every other decision is made by
 * `invoicePaymentState()`, which stays the single definition of what
 * "bezahlt" or "überfällig" means.
 *
 * `overdue` is a filter and not a status, for the reason given on
 * `paymentStatuses` above: an invoice can be partly paid *and* overdue, so
 * the two travel on separate axes. Here — as a filter, where they cannot
 * collide — it may sit in the same list.
 */
export const invoiceListFilters = [
  'draft',
  'open',
  'partially_paid',
  'overdue',
  'paid',
  'cancelled',
] as const
export const invoiceListFilterSchema = z.enum(invoiceListFilters)
export type InvoiceListFilter = z.infer<typeof invoiceListFilterSchema>

/**
 * Does an invoice belong under this filter? The one definition, shared so
 * that the chips and whatever else asks the question cannot drift apart.
 *
 * Takes the invoice's own status *and* its derived state, because two of the
 * six answers cannot be read off the state alone:
 *
 * - **`draft`** — `invoicePaymentState()` answers `open` for a draft, since
 *   nothing has been paid on it. That is right for the state and wrong for
 *   the filter: a draft is not a claim, so it must not turn up under "Offen".
 * - **`cancelled`** — this catches both a cancelled invoice (`cancelled`) and
 *   a cancellation document (`cancellation`). The predecessor of this
 *   function compared against the filter name directly and therefore missed
 *   every Stornorechnung, which was a bug and not a decision.
 */
export function matchesInvoiceListFilter(
  invoice: Pick<InvoiceFacts, 'status'>,
  state: PaymentState,
  filter: InvoiceListFilter,
): boolean {
  if (filter === 'draft') return invoice.status === 'draft'
  if (invoice.status === 'draft') return false

  if (filter === 'overdue') return state.daysOverdue !== null
  if (filter === 'cancelled') return state.status === 'cancelled' || state.status === 'cancellation'
  // An overpayment is settled — it belongs under "bezahlt", not under "offen".
  if (filter === 'paid') return state.status === 'paid' || state.status === 'overpaid'
  return state.status === filter
}
