import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Invoice } from '@praxi/shared'
import { invoicePaymentState, matchesInvoiceListFilter, sumPayments } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { raisedMessage } from '../db/errors.js'
import { contact, payment, practiceSettings, service, textTemplate } from '../db/schema.js'
import { newId } from '../id.js'
import { renderInvoicePdf } from '../pdf/render.js'
import { createTenant, createUser, finalizeDocument } from '../test/fixtures.js'
import { createActivity } from './activity.js'
import { listBillableItems } from './billable.js'
import { cancelInvoice } from './cancel-invoice.js'
import { FileStore } from './file-store.js'
import { finalizeInvoice } from './finalize-invoice.js'
import { createInvoice, getInvoice } from './invoice.js'
import { upsertNumberRange } from './number-range.js'
import { addPayment, deletePayment, InvoiceNotPayableError, listPayments } from './payment.js'

let tenantId: string
let contactId: string
let serviceId: string
let store: FileStore
let storeRoot: string

const INVOICE_DATE = '2026-09-01'
const PRICE = 13_500

beforeEach(async () => {
  tenantId = await createTenant(db())
  await createUser(db(), { tenantId })
  await db().insert(practiceSettings).values({ id: newId(), tenantId, practiceName: 'Testpraxis' })

  contactId = newId()
  await db().insert(contact).values({
    id: contactId,
    tenantId,
    contactNumber: 1,
    kind: 'person',
    lastName: 'Testperson',
    firstName: 'Erika',
    street: 'Teststraße 1',
    postalCode: '12345',
    city: 'Teststadt',
  })

  serviceId = newId()
  await db()
    .insert(service)
    .values({ id: serviceId, tenantId, description: 'Erstgespräch', defaultPriceCents: PRICE })

  await upsertNumberRange(db(), tenantId, 'invoice', {
    prefix: 'RH-2026-',
    padding: 3,
    nextValue: 1,
  })

  storeRoot = await mkdtemp(join(tmpdir(), 'praxi-payment-'))
  store = new FileStore(storeRoot)
})

afterEach(async () => {
  await rm(storeRoot, { recursive: true, force: true })
})

const render = (entry: Invoice) => renderInvoicePdf(entry, null)

/** A draft over one billable item of 135,00 €. */
async function draft(): Promise<Invoice> {
  await createActivity(db(), tenantId, {
    contactId,
    type: 'session',
    status: 'rendered',
    occurredAt: `${INVOICE_DATE}T07:00:00.000Z`,
    durationMin: 90,
    title: null,
    internalNote: null,
    items: [{ kind: 'service', serviceId, quantity: 1, billable: true }],
    appointment: null,
  })

  const items = await listBillableItems(db(), tenantId, contactId)
  return createInvoice(db(), tenantId, {
    contactId,
    invoiceDate: INVOICE_DATE,
    activityItemIds: items.map((item) => item.id),
  })
}

async function finalized(): Promise<Invoice> {
  const entry = await finalizeDocument(db(), tenantId, store, (await draft()).id, render)
  if (!entry) throw new Error('the invoice was not finalized')
  return entry
}

/** The state as the screen would show it on a given day. */
async function stateOn(invoiceId: string, today: string) {
  const entry = await getInvoice(db(), tenantId, invoiceId)
  if (!entry) throw new Error('invoice vanished')
  return invoicePaymentState(entry, entry.paidCents, today)
}

const pay = (invoiceId: string, amountCents: number, paidOn = INVOICE_DATE) =>
  addPayment(db(), tenantId, invoiceId, {
    paidOn,
    amountCents,
    method: 'bank_transfer',
    note: null,
  })

describe('recording a payment', () => {
  it('adds up and comes back in date order', async () => {
    const entry = await finalized()
    await pay(entry.id, 5000, '2026-09-10')
    await pay(entry.id, 3500, '2026-09-05')

    const payments = await listPayments(db(), tenantId, entry.id)
    expect(payments.map((row) => row.paidOn)).toEqual(['2026-09-05', '2026-09-10'])
    expect(sumPayments(payments)).toBe(8500)
    expect((await getInvoice(db(), tenantId, entry.id))?.paidCents).toBe(8500)
  })

  it('turns a part payment into partially_paid', async () => {
    const entry = await finalized()
    await pay(entry.id, 5000)

    expect(await stateOn(entry.id, '2026-09-02')).toMatchObject({
      status: 'partially_paid',
      openCents: PRICE - 5000,
    })
  })

  it('turns the full amount into paid', async () => {
    const entry = await finalized()
    await pay(entry.id, PRICE)

    expect(await stateOn(entry.id, '2026-09-02')).toMatchObject({ status: 'paid', openCents: 0 })
  })

  /** Not `paid` and above all not open: the practitioner has to see that more
   *  came in than was asked for. */
  it('recognizes an overpayment and does not call it open', async () => {
    const entry = await finalized()
    await pay(entry.id, PRICE + 1000)

    const state = await stateOn(entry.id, '2026-09-02')
    expect(state.status).toBe('overpaid')
    expect(state.openCents).toBe(-1000)
    expect(state.daysOverdue).toBeNull()
  })

  /** The amount is free in both directions: a refund is recorded as a negative
   *  payment rather than by deleting history (`payment_amount_not_zero`). */
  it('accepts a negative payment as a refund', async () => {
    const entry = await finalized()
    await pay(entry.id, PRICE)
    await pay(entry.id, -PRICE, '2026-09-20')

    expect(await stateOn(entry.id, '2026-09-21')).toMatchObject({ status: 'open' })
  })

  it('refuses an amount of zero at the database', async () => {
    const entry = await finalized()

    await expect(
      db().insert(payment).values({
        id: newId(),
        tenantId,
        invoiceId: entry.id,
        paidOn: INVOICE_DATE,
        amountCents: 0,
      }),
    ).rejects.toThrow()
  })
})

describe('a draft cannot be paid', () => {
  it('is refused by the domain, readably', async () => {
    const entry = await draft()

    await expect(pay(entry.id, 1000)).rejects.toBeInstanceOf(InvoiceNotPayableError)
    expect(await listPayments(db(), tenantId, entry.id)).toHaveLength(0)
  })

  /** …and by the trigger, for anything that goes around the domain. A draft is
   *  not a claim: it has no number, no document and no date it falls due. */
  it('is refused by the trigger as well', async () => {
    const entry = await draft()

    let message: string | null = null
    try {
      await db().insert(payment).values({
        id: newId(),
        tenantId,
        invoiceId: entry.id,
        paidOn: INVOICE_DATE,
        amountCents: 1000,
      })
      throw new Error('expected the database to refuse, but the insert succeeded')
    } catch (error) {
      message = raisedMessage(error)
    }
    expect(message).toBe('a draft cannot be paid')
  })
})

describe('deleting a payment', () => {
  it('puts the status back', async () => {
    const entry = await finalized()
    const recorded = await pay(entry.id, PRICE)
    if (!recorded) throw new Error('fixture missing')

    expect((await stateOn(entry.id, '2026-09-02')).status).toBe('paid')

    expect(await deletePayment(db(), tenantId, entry.id, recorded.id)).toBe(true)
    expect((await stateOn(entry.id, '2026-09-02')).status).toBe('open')
  })

  it('does not reach into another invoice', async () => {
    const first = await finalized()
    const second = await finalized()
    const recorded = await pay(first.id, 1000)
    if (!recorded) throw new Error('fixture missing')

    expect(await deletePayment(db(), tenantId, second.id, recorded.id)).toBe(false)
    expect(await listPayments(db(), tenantId, first.id)).toHaveLength(1)
  })
})

describe('cancelling and payments', () => {
  /**
   * CLAUDE.md rule 9: the payment stays. On that day the money did arrive, and
   * deleting the row would be a forgery — refunding it is a step outside this
   * software. What changes is that nothing is owed any more.
   */
  it('leaves a payment standing and takes the invoice out of the open items', async () => {
    const entry = await finalized()
    await pay(entry.id, PRICE)
    await cancelInvoice(db(), tenantId, store, entry.id, render)

    const after = await getInvoice(db(), tenantId, entry.id)
    expect(after?.status).toBe('cancelled')
    expect(after?.paidCents).toBe(PRICE)
    expect(await listPayments(db(), tenantId, entry.id)).toHaveLength(1)

    const state = await stateOn(entry.id, '2026-09-30')
    expect(state.status).toBe('cancelled')
    expect(matchesInvoiceListFilter({ status: 'cancelled' }, state, 'open')).toBe(false)
  })

  /**
   * Asked of the rule directly rather than through a listing query. Until D7
   * this went through `listReceivables`, which narrowed the invoices
   * server-side; that endpoint is gone and `matchesInvoiceListFilter` in
   * `packages/shared` is the one place the question is answered now.
   */
  it('also takes an unpaid cancelled invoice out of the open items', async () => {
    const entry = await finalized()
    await cancelInvoice(db(), tenantId, store, entry.id, render)

    const state = await stateOn(entry.id, '2026-12-31')
    for (const filter of ['open', 'overdue'] as const) {
      expect(matchesInvoiceListFilter({ status: 'cancelled' }, state, filter)).toBe(false)
    }
    // …and does turn up under the chip that is meant to find it.
    expect(matchesInvoiceListFilter({ status: 'cancelled' }, state, 'cancelled')).toBe(true)
  })
})

describe('"Betrag erhalten"', () => {
  /** One transaction: number, document, payment over the full amount, and the
   *  outro block for an invoice that is already settled. */
  it('finalizes and records the payment in one go', async () => {
    await db().insert(textTemplate).values({
      id: newId(),
      tenantId,
      kind: 'outro',
      name: 'Bezahlt',
      body: 'Der Betrag wurde bereits beglichen. Vielen Dank.',
      isPaidVariant: true,
    })

    const result = await finalizeInvoice(db(), tenantId, store, (await draft()).id, render, {
      method: 'card',
    })
    if (!result) throw new Error('the invoice was not finalized')

    expect(result.paidTemplateUsed).toBe(true)
    expect(result.invoice.status).toBe('finalized')
    expect(result.invoice.number).toBe('RH-2026-001')
    expect(result.invoice.outroText).toBe('Der Betrag wurde bereits beglichen. Vielen Dank.')

    const payments = await listPayments(db(), tenantId, result.invoice.id)
    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({
      amountCents: PRICE,
      method: 'card',
      // Dated to the invoice, not to the clock.
      paidOn: INVOICE_DATE,
    })
    expect((await stateOn(result.invoice.id, '2026-09-30')).status).toBe('paid')
  })

  /** A missing outro block is a setting, not a failure: the card was taken and
   *  the invoice has to be printable. The answer says the text was not found
   *  so the client can point at the settings. */
  it('works without a paid-variant template and says so', async () => {
    const result = await finalizeInvoice(db(), tenantId, store, (await draft()).id, render, {
      method: 'card',
    })
    if (!result) throw new Error('the invoice was not finalized')

    expect(result.paidTemplateUsed).toBe(false)
    expect(result.invoice.outroText).toBeNull()
    expect(await listPayments(db(), tenantId, result.invoice.id)).toHaveLength(1)
  })

  /** The whole thing is one transaction, so a failed render leaves neither a
   *  document nor a payment nor a consumed number. */
  it('rolls the payment back with the rest', async () => {
    const entry = await draft()
    const failing = (): Promise<Uint8Array> => {
      throw new Error('render failed')
    }

    await expect(
      finalizeInvoice(db(), tenantId, store, entry.id, failing, { method: 'card' }),
    ).rejects.toThrow('render failed')

    expect((await getInvoice(db(), tenantId, entry.id))?.status).toBe('draft')
    expect(await db().select().from(payment)).toHaveLength(0)
  })

  it('leaves the outro alone when it is not being settled', async () => {
    await db().insert(textTemplate).values({
      id: newId(),
      tenantId,
      kind: 'outro',
      name: 'Bezahlt',
      body: 'Der Betrag wurde bereits beglichen.',
      isPaidVariant: true,
    })

    const entry = await finalized()
    expect(entry.outroText).toBeNull()
    expect(await listPayments(db(), tenantId, entry.id)).toHaveLength(0)
  })
})

describe('tenant isolation', () => {
  it('does not list another tenant’s payments', async () => {
    const entry = await finalized()
    await pay(entry.id, 1000)

    const other = await createTenant(db(), 'Mandant B')
    expect(await listPayments(db(), other, entry.id)).toEqual([])
    expect(await deletePayment(db(), other, entry.id, newId())).toBe(false)
    // …and the invoice still has its payment.
    expect(await db().select().from(payment).where(eq(payment.invoiceId, entry.id))).toHaveLength(1)
  })
})
