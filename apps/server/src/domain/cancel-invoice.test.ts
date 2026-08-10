import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Invoice } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { raisedMessage, uniqueViolationConstraint } from '../db/errors.js'
import { contact, invoice, numberRange, practiceSettings, service } from '../db/schema.js'
import { newId } from '../id.js'
import { renderInvoicePdf } from '../pdf/render.js'
import { createTenant, createUser } from '../test/fixtures.js'
import { createActivity } from './activity.js'
import { listBillableItems } from './billable.js'
import {
  CancellationNotCancellableError,
  cancelInvoice,
  InvoiceAlreadyCancelledError,
  InvoiceNotFinalizedError,
} from './cancel-invoice.js'
import { FileStore } from './file-store.js'
import { finalizeInvoice } from './finalize-invoice.js'
import { createInvoice, getInvoice } from './invoice.js'
import { upsertNumberRange } from './number-range.js'

let tenantId: string
let contactId: string
let serviceId: string
let store: FileStore
let storeRoot: string

const INVOICE_DATE = '2026-08-09'

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
  await db().insert(service).values({
    id: serviceId,
    tenantId,
    description: 'Erstgespräch',
    defaultPriceCents: 13_500,
    defaultDurationMin: 90,
  })

  // The invoice range never creates itself (rule 8) — cancellations draw from
  // the same one.
  await upsertNumberRange(db(), tenantId, 'invoice', {
    prefix: 'RH-2026-',
    padding: 3,
    nextValue: 1,
  })

  storeRoot = await mkdtemp(join(tmpdir(), 'praxi-cancel-'))
  store = new FileStore(storeRoot)
})

afterEach(async () => {
  await rm(storeRoot, { recursive: true, force: true })
})

const render = (entry: Invoice) => renderInvoicePdf(entry, null)

/** An activity with one billable item, an invoice made from it, finalized. */
async function finalizedInvoice(quantity = 1): Promise<Invoice> {
  await createActivity(db(), tenantId, {
    contactId,
    type: 'session',
    status: 'planned',
    occurredAt: '2026-08-09T07:00:00.000Z',
    durationMin: 90,
    title: null,
    internalNote: null,
    items: [{ kind: 'service', serviceId, quantity, billable: true }],
    appointment: null,
  })

  const items = await listBillableItems(db(), tenantId, contactId)
  const draft = await createInvoice(db(), tenantId, {
    contactId,
    invoiceDate: INVOICE_DATE,
    activityItemIds: items.map((item) => item.id),
  })

  const finalized = await finalizeInvoice(db(), tenantId, store, draft.id, render)
  if (!finalized) throw new Error('the invoice was not finalized')
  return finalized
}

describe('the cancellation document', () => {
  it('negates the original, line by line', async () => {
    const original = await finalizedInvoice(2)
    const cancellation = await cancelInvoice(db(), tenantId, store, original.id, render)

    expect(cancellation?.type).toBe('cancellation_invoice')
    expect(cancellation?.totalCents).toBe(-original.totalCents)
    expect(cancellation?.lines).toHaveLength(original.lines.length)

    const line = cancellation?.lines[0]
    const source = original.lines[0]
    expect(line?.description).toBe(source?.description)
    // The quantity stays positive — the price carries the sign, because
    // `invoice_line_quantity_positive` forbids the other way round.
    expect(line?.quantity).toBe(source?.quantity)
    expect(line?.unitPriceCents).toBe(-(source?.unitPriceCents ?? 0))
    expect(line?.amountCents).toBe(-(source?.amountCents ?? 0))
    // The record of origin travels along, so the document shows what it takes
    // back.
    expect(line?.activityItemId).toBe(source?.activityItemId)
  })

  it('carries no intro or outro text, and names the invoice it cancels', async () => {
    const original = await finalizedInvoice()
    const cancellation = await cancelInvoice(db(), tenantId, store, original.id, render)

    expect(cancellation?.introText).toBeNull()
    expect(cancellation?.outroText).toBeNull()
    expect(cancellation?.cancelsInvoiceNumber).toBe(original.number)
  })

  it('links both rows, in both directions', async () => {
    const original = await finalizedInvoice()
    const cancellation = await cancelInvoice(db(), tenantId, store, original.id, render)
    if (!cancellation) throw new Error('nothing was cancelled')

    expect(cancellation.cancelsInvoiceId).toBe(original.id)

    const after = await getInvoice(db(), tenantId, original.id)
    expect(after?.status).toBe('cancelled')
    expect(after?.cancelledByInvoiceId).toBe(cancellation.id)
    expect(after?.cancelledByInvoiceNumber).toBe(cancellation.number)
  })

  it('leaves the original untouched apart from status and reference', async () => {
    const original = await finalizedInvoice()
    await cancelInvoice(db(), tenantId, store, original.id, render)

    const after = await getInvoice(db(), tenantId, original.id)
    expect(after).toMatchObject({
      number: original.number,
      totalCents: original.totalCents,
      pdfHash: original.pdfHash,
      finalizedAt: original.finalizedAt,
    })
  })

  it('is written to disk with the hash that is stored', async () => {
    const original = await finalizedInvoice()
    const cancellation = await cancelInvoice(db(), tenantId, store, original.id, render)
    if (!cancellation?.number) throw new Error('no number')

    const bytes = await store.read(`invoices/2026/${cancellation.number}.pdf`)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(cancellation.pdfHash)
  })
})

describe('numbering', () => {
  it('draws from the invoice range, without a gap', async () => {
    const first = await finalizedInvoice()
    const cancellation = await cancelInvoice(db(), tenantId, store, first.id, render)

    // A second invoice, to show the sequence carried on across the
    // cancellation rather than beside it.
    const second = await finalizedInvoice()

    expect([first.number, cancellation?.number, second.number]).toEqual([
      'RH-2026-001',
      'RH-2026-002',
      'RH-2026-003',
    ])

    const [range] = await db()
      .select({ nextValue: numberRange.nextValue })
      .from(numberRange)
      .where(eq(numberRange.tenantId, tenantId))
    expect(range?.nextValue).toBe(4)
  })
})

describe('what cannot be cancelled', () => {
  it('refuses a draft', async () => {
    const draft = await createInvoice(db(), tenantId, {
      contactId,
      invoiceDate: INVOICE_DATE,
      activityItemIds: [],
    })

    await expect(cancelInvoice(db(), tenantId, store, draft.id, render)).rejects.toThrow(
      InvoiceNotFinalizedError,
    )
  })

  it('refuses a second cancellation', async () => {
    const original = await finalizedInvoice()
    await cancelInvoice(db(), tenantId, store, original.id, render)

    await expect(cancelInvoice(db(), tenantId, store, original.id, render)).rejects.toThrow(
      InvoiceAlreadyCancelledError,
    )
  })

  it('refuses it at the database as well', async () => {
    const original = await finalizedInvoice()
    await cancelInvoice(db(), tenantId, store, original.id, render)

    /**
     * Around the domain: a second document aimed at the same invoice, written
     * as a draft so nothing but the partial unique index can object. That
     * index is what makes a double cancellation unreachable rather than merely
     * refused.
     */
    let constraint: string | null = null
    try {
      await db().insert(invoice).values({
        id: newId(),
        tenantId,
        contactId,
        type: 'cancellation_invoice',
        status: 'draft',
        invoiceDate: INVOICE_DATE,
        paymentTermDays: 14,
        cancelsInvoiceId: original.id,
      })
      throw new Error('expected the database to refuse, but the insert succeeded')
    } catch (error) {
      constraint = uniqueViolationConstraint(error)
    }

    expect(constraint).toBe('invoice_cancels_key')
  })

  it('refuses a cancellation invoice', async () => {
    const original = await finalizedInvoice()
    const cancellation = await cancelInvoice(db(), tenantId, store, original.id, render)
    if (!cancellation) throw new Error('nothing was cancelled')

    await expect(cancelInvoice(db(), tenantId, store, cancellation.id, render)).rejects.toThrow(
      CancellationNotCancellableError,
    )
  })

  it('refuses to un-cancel', async () => {
    const original = await finalizedInvoice()
    await cancelInvoice(db(), tenantId, store, original.id, render)

    let message: string | null = null
    try {
      await db()
        .update(invoice)
        .set({ status: 'finalized', cancelledByInvoiceId: null })
        .where(eq(invoice.id, original.id))
      throw new Error('expected the database to refuse, but the update succeeded')
    } catch (error) {
      message = raisedMessage(error)
    }
    expect(message).toBe('a cancelled invoice cannot be uncancelled')
  })
})

describe('the two ends stay paired', () => {
  /**
   * The redundancy of storing both directions is held by a deferred constraint
   * trigger, not by discipline: writing one side alone fails at COMMIT.
   */
  it('refuses a half-written pair', async () => {
    const original = await finalizedInvoice()
    const other = await finalizedInvoice()

    let message: string | null = null
    try {
      // `cancelled_by_invoice_id` on its own, with nothing pointing back.
      // `invoice_cancelled_state` needs the status to move with it, so this is
      // as close to a half pair as the schema allows.
      await db()
        .update(invoice)
        .set({ status: 'cancelled', cancelledByInvoiceId: other.id })
        .where(eq(invoice.id, original.id))
      throw new Error('expected the database to refuse, but the update succeeded')
    } catch (error) {
      message = raisedMessage(error)
    }

    expect(message).toBe('cancellation is not paired: the document does not point back')
  })
})

describe('when the file cannot be written', () => {
  it('leaves neither a document nor a number behind', async () => {
    const original = await finalizedInvoice()

    const failing = (): Promise<Uint8Array> => {
      throw new Error('render failed')
    }

    await expect(cancelInvoice(db(), tenantId, store, original.id, failing)).rejects.toThrow(
      'render failed',
    )

    const after = await getInvoice(db(), tenantId, original.id)
    expect(after?.status).toBe('finalized')

    const rows = await db().select({ id: invoice.id }).from(invoice)
    expect(rows).toHaveLength(1)

    // The counter rolled back with the transaction, so no number was consumed.
    const [range] = await db()
      .select({ nextValue: numberRange.nextValue })
      .from(numberRange)
      .where(eq(numberRange.tenantId, tenantId))
    expect(range?.nextValue).toBe(2)
  })
})
