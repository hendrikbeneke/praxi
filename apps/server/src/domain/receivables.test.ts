import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Invoice, ReceivableFilter } from '@praxi/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { contact, practiceSettings, service } from '../db/schema.js'
import { newId } from '../id.js'
import { renderInvoicePdf } from '../pdf/render.js'
import { createTenant, createUser, finalizeDocument } from '../test/fixtures.js'
import { createActivity } from './activity.js'
import { listBillableItems } from './billable.js'
import { cancelInvoice } from './cancel-invoice.js'
import { FileStore } from './file-store.js'
import { createInvoice } from './invoice.js'
import { upsertNumberRange } from './number-range.js'
import { addPayment } from './payment.js'
import { listReceivables } from './receivables.js'

let tenantId: string
let contactId: string
let serviceId: string
let store: FileStore
let storeRoot: string

const PRICE = 10_000

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
    .values({ id: serviceId, tenantId, description: 'Sitzung', defaultPriceCents: PRICE })

  await upsertNumberRange(db(), tenantId, 'invoice', {
    prefix: 'RH-2026-',
    padding: 3,
    nextValue: 1,
  })

  storeRoot = await mkdtemp(join(tmpdir(), 'praxi-receivables-'))
  store = new FileStore(storeRoot)
})

afterEach(async () => {
  await rm(storeRoot, { recursive: true, force: true })
})

const render = (entry: Invoice) => renderInvoicePdf(entry, null)

async function draftOn(invoiceDate: string): Promise<Invoice> {
  await createActivity(db(), tenantId, {
    contactId,
    type: 'session',
    status: 'rendered',
    occurredAt: `${invoiceDate}T07:00:00.000Z`,
    durationMin: 50,
    title: null,
    internalNote: null,
    items: [{ kind: 'service', serviceId, quantity: 1, billable: true }],
    appointment: null,
  })

  const items = await listBillableItems(db(), tenantId, contactId)
  return createInvoice(db(), tenantId, {
    contactId,
    invoiceDate,
    activityItemIds: items.map((item) => item.id),
  })
}

async function finalizedOn(invoiceDate: string): Promise<Invoice> {
  const entry = await finalizeDocument(
    db(),
    tenantId,
    store,
    (await draftOn(invoiceDate)).id,
    render,
  )
  if (!entry) throw new Error('the invoice was not finalized')
  return entry
}

/** Everything as it stands on 20 September 2026. */
const rows = (filter?: ReceivableFilter) =>
  listReceivables(db(), tenantId, { ...(filter ? { filter } : {}), today: '2026-09-20' })

describe('the receivables view', () => {
  /** A draft is not a claim: nothing is owed until the invoice exists as a
   *  document, so it has no place here. */
  it('leaves drafts out', async () => {
    await draftOn('2026-09-01')
    expect(await rows()).toEqual([])
  })

  it('carries the amounts, the due date and the days overdue', async () => {
    const entry = await finalizedOn('2026-09-01')
    await addPayment(db(), tenantId, entry.id, {
      paidOn: '2026-09-10',
      amountCents: 4000,
      method: 'bank_transfer',
      note: null,
    })

    const [row] = await rows()
    expect(row).toMatchObject({
      number: 'RH-2026-001',
      contactName: 'Erika Testperson',
      dueDate: '2026-09-15',
      totalCents: PRICE,
      paidCents: 4000,
      openCents: 6000,
      status: 'partially_paid',
      // 20 September, due on the 15th.
      daysOverdue: 5,
    })
  })

  it('sorts oldest first — that is the order they are chased in', async () => {
    await finalizedOn('2026-09-05')
    await finalizedOn('2026-09-01')

    expect((await rows()).map((row) => row.invoiceDate)).toEqual(['2026-09-01', '2026-09-05'])
  })
})

describe('the filters', () => {
  it('narrows to open, partially paid, paid and overdue', async () => {
    const open = await finalizedOn('2026-09-18') // due on 2 October, not late
    const part = await finalizedOn('2026-09-01') // due on 15 September, late
    const paid = await finalizedOn('2026-09-02')

    await addPayment(db(), tenantId, part.id, {
      paidOn: '2026-09-10',
      amountCents: 4000,
      method: 'bank_transfer',
      note: null,
    })
    await addPayment(db(), tenantId, paid.id, {
      paidOn: '2026-09-03',
      amountCents: PRICE,
      method: 'card',
      note: null,
    })

    expect((await rows('open')).map((row) => row.id)).toEqual([open.id])
    expect((await rows('partially_paid')).map((row) => row.id)).toEqual([part.id])
    expect((await rows('paid')).map((row) => row.id)).toEqual([paid.id])
    // Overdue is the second axis: it cuts across the statuses rather than
    // being one of them, so the partly paid invoice is what it finds.
    expect((await rows('overdue')).map((row) => row.id)).toEqual([part.id])
  })

  /** An overpayment is settled — it belongs under "bezahlt", not under
   *  "offen", and certainly not nowhere. */
  it('counts an overpayment as paid', async () => {
    const entry = await finalizedOn('2026-09-01')
    await addPayment(db(), tenantId, entry.id, {
      paidOn: '2026-09-03',
      amountCents: PRICE + 500,
      method: 'card',
      note: null,
    })

    expect((await rows('paid')).map((row) => row.id)).toEqual([entry.id])
    expect(await rows('open')).toEqual([])
    expect(await rows('overdue')).toEqual([])
  })
})

describe('cancellation', () => {
  /**
   * The one thing this view must get right: a cancelled invoice is not open,
   * and the cancellation document is not a claim of its own. Both are loaded
   * from the database — only the status rule keeps them out, which is what
   * makes this test worth having.
   */
  it('keeps a cancelled invoice and its cancellation document out of the open items', async () => {
    const entry = await finalizedOn('2026-09-01')
    const cancellation = await cancelInvoice(db(), tenantId, store, entry.id, render)
    if (!cancellation) throw new Error('nothing was cancelled')

    for (const filter of ['open', 'partially_paid', 'paid', 'overdue'] as const) {
      const ids = (await rows(filter)).map((row) => row.id)
      expect(ids).not.toContain(entry.id)
      expect(ids).not.toContain(cancellation.id)
    }

    // They are still visible unfiltered, each with its own state.
    const all = await rows()
    expect(all.find((row) => row.id === entry.id)?.status).toBe('cancelled')
    expect(all.find((row) => row.id === cancellation.id)?.status).toBe('cancellation')
  })
})

describe('tenant isolation', () => {
  it('shows only its own tenant', async () => {
    await finalizedOn('2026-09-01')
    const other = await createTenant(db(), 'Mandant B')

    expect(await listReceivables(db(), other, { today: '2026-09-20' })).toEqual([])
  })
})
