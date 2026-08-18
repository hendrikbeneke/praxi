import { describe, expect, it } from 'vitest'
import { dueDate, type InvoiceStatus, type InvoiceType } from './invoice.js'
import { type InvoiceListFilter, invoicePaymentState, matchesInvoiceListFilter } from './payment.js'

type Facts = {
  type: InvoiceType
  status: InvoiceStatus
  totalCents: number
  invoiceDate: string
  paymentTermDays: number
}

/** A finalized invoice over 100,00 €, dated 1 September, payable within 14
 *  days — so it falls due on the 15th. */
const INVOICE: Facts = {
  type: 'invoice',
  status: 'finalized',
  totalCents: 10_000,
  invoiceDate: '2026-09-01',
  paymentTermDays: 14,
}

const stateOn = (today: string, paid: number, overrides: Partial<Facts> = {}) =>
  invoicePaymentState({ ...INVOICE, ...overrides }, paid, today)

describe('the amounts decide', () => {
  it('is open while nothing has arrived', () => {
    const state = stateOn('2026-09-02', 0)
    expect(state.status).toBe('open')
    expect(state.openCents).toBe(10_000)
  })

  it('is partially paid on a part payment', () => {
    const state = stateOn('2026-09-02', 4000)
    expect(state.status).toBe('partially_paid')
    expect(state.openCents).toBe(6000)
  })

  it('is paid once the sum reaches the total', () => {
    expect(stateOn('2026-09-02', 10_000)).toMatchObject({ status: 'paid', openCents: 0 })
  })

  /**
   * An overpayment is its own answer, not `paid` and above all not `open`.
   * Folding it into `paid` would hide the one thing the practitioner has to
   * see: more came in than was asked for.
   */
  it('recognizes an overpayment as such', () => {
    const state = stateOn('2026-09-02', 12_000)
    expect(state.status).toBe('overpaid')
    expect(state.openCents).toBe(-2000)
    expect(state.daysOverdue).toBeNull()
  })

  it('adds several payments up', () => {
    expect(stateOn('2026-09-02', 3000 + 3000 + 4000).status).toBe('paid')
  })
})

describe('falling due', () => {
  it('is invoice_date plus payment_term_days', () => {
    expect(dueDate('2026-09-01', 14)).toBe('2026-09-15')
    expect(stateOn('2026-09-02', 0).dueDate).toBe('2026-09-15')
    // Across a month boundary and a daylight-saving change.
    expect(dueDate('2026-10-20', 30)).toBe('2026-11-19')
  })

  /** Payment is owed *by* that day, so the due date itself is not yet late. */
  it('starts the day after the due date', () => {
    expect(stateOn('2026-09-15', 0).daysOverdue).toBeNull()
    expect(stateOn('2026-09-16', 0).daysOverdue).toBe(1)
    expect(stateOn('2026-09-30', 0).daysOverdue).toBe(15)
  })

  /** The second axis: overdue and partly paid at the same time is a state the
   *  status alone could not express, which is why it is a separate field. */
  it('applies to a part payment as well', () => {
    const state = stateOn('2026-09-20', 4000)
    expect(state.status).toBe('partially_paid')
    expect(state.daysOverdue).toBe(5)
  })

  it('stops once nothing is owed', () => {
    expect(stateOn('2026-09-30', 10_000).daysOverdue).toBeNull()
    expect(stateOn('2026-09-30', 12_000).daysOverdue).toBeNull()
  })
})

describe('what has no payment state', () => {
  /**
   * A cancelled invoice is never open, whatever was paid on it. The payment
   * stays where it is — on that day the money did arrive — and refunding it is
   * a step outside this software (CLAUDE.md rule 9).
   */
  it('a cancelled invoice, even a paid one', () => {
    for (const paid of [0, 4000, 10_000]) {
      const state = stateOn('2026-09-30', paid, { status: 'cancelled' })
      expect(state.status).toBe('cancelled')
      expect(state.openCents).toBe(0)
      expect(state.daysOverdue).toBeNull()
      // The payment is not forgotten, only no longer owed.
      expect(state.paidCents).toBe(paid)
    }
  })

  /** A cancellation document is not a claim: "open" would be meaningless, and
   *  netting it against the original would be a running account. */
  it('a cancellation invoice', () => {
    const state = stateOn('2026-09-30', 0, {
      type: 'cancellation_invoice',
      totalCents: -10_000,
    })
    expect(state.status).toBe('cancellation')
    expect(state.openCents).toBe(0)
    expect(state.daysOverdue).toBeNull()
  })

  /** A draft is not a claim yet, so it cannot fall due — and it cannot carry
   *  payments in the first place. */
  it('a draft has no due date', () => {
    const state = stateOn('2026-12-31', 0, { status: 'draft' })
    expect(state).toMatchObject({ status: 'open', dueDate: null, daysOverdue: null })
  })
})

/**
 * The one chip band of the invoice list (D7). Two of the six answers cannot
 * be read off the payment state alone, and those two are what this covers.
 */
describe('matchesInvoiceListFilter', () => {
  const matches = (filter: InvoiceListFilter, overrides: Partial<Facts> = {}, paid = 0) => {
    const facts = { ...INVOICE, ...overrides }
    return matchesInvoiceListFilter(facts, invoicePaymentState(facts, paid, '2026-09-30'), filter)
  }

  /**
   * `invoicePaymentState()` answers `open` for a draft, because nothing has
   * been paid on it. Right for the state, wrong for the filter: a draft is
   * not a claim, so it must not turn up under "Offen".
   */
  it('keeps a draft out of every filter but its own', () => {
    expect(matches('draft', { status: 'draft' })).toBe(true)
    for (const filter of ['open', 'overdue', 'paid', 'cancelled'] as const) {
      expect(matches(filter, { status: 'draft' })).toBe(false)
    }
  })

  /**
   * The predecessor of this function compared the filter name against the
   * status directly, so "Storniert" found cancelled invoices and missed every
   * Stornorechnung — a bug, not a decision.
   */
  it('finds both a cancelled invoice and a cancellation document under "cancelled"', () => {
    expect(matches('cancelled', { status: 'cancelled' })).toBe(true)
    expect(matches('cancelled', { type: 'cancellation_invoice', totalCents: -10_000 })).toBe(true)
  })

  it('counts an overpayment as paid, not as open', () => {
    expect(matches('paid', {}, 12_000)).toBe(true)
    expect(matches('open', {}, 12_000)).toBe(false)
  })

  /**
   * A partly paid invoice is still owed, so it belongs under "Offen" — the
   * design has no chip of its own for it (K8), and a second chip would have
   * made the chips add up to more than there are invoices. Overdue is the
   * second axis, so it is both at once.
   */
  it('counts a partly paid invoice as open, and as overdue beside it', () => {
    expect(matches('open', {}, 4000)).toBe(true)
    expect(matches('overdue', {}, 4000)).toBe(true)
    expect(matches('paid', {}, 4000)).toBe(false)
  })
})
