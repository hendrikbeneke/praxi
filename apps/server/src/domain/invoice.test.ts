import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Invoice } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { raisedMessage } from '../db/errors.js'
import {
  contact,
  invoice,
  invoiceLine,
  numberRange,
  practiceSettings,
  service,
} from '../db/schema.js'
import { newId } from '../id.js'
import { renderInvoicePdf } from '../pdf/render.js'
import { createTenant, createUser, finalizeDocument } from '../test/fixtures.js'
import { BilledItemError, createActivity, deleteActivity, updateActivity } from './activity.js'
import { listBillableItems } from './billable.js'
import { cancelInvoice } from './cancel-invoice.js'
import { FileStore } from './file-store.js'
import { pdfPathFor } from './finalize-invoice.js'
import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  InvoiceEmptyError,
  InvoiceNotADraftError,
  ItemAlreadyBilledError,
  updateInvoice,
} from './invoice.js'
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

  // The invoice range never creates itself; every test that finalizes needs
  // it set up, exactly as the practitioner would.
  await upsertNumberRange(db(), tenantId, 'invoice', {
    prefix: 'RH-2026-',
    padding: 3,
    nextValue: 1,
  })

  storeRoot = await mkdtemp(join(tmpdir(), 'praxi-invoices-'))
  store = new FileStore(storeRoot)
})

afterEach(async () => {
  await rm(storeRoot, { recursive: true, force: true })
})

async function makeActivityWithItem(price = 13_500) {
  return createActivity(db(), tenantId, {
    contactId,
    type: 'session',
    status: 'planned',
    occurredAt: '2026-08-09T07:00:00.000Z',
    durationMin: 90,
    title: null,
    internalNote: null,
    items: [{ kind: 'service', serviceId, quantity: 1, billable: true }],
    appointment: null,
  }).then(async (created) => {
    if (price !== 13_500) {
      await db().update(service).set({ defaultPriceCents: price }).where(eq(service.id, serviceId))
    }
    return created
  })
}

async function draftFromBillable(): Promise<Invoice> {
  const items = await listBillableItems(db(), tenantId, contactId)
  return createInvoice(db(), tenantId, {
    contactId,
    invoiceDate: INVOICE_DATE,
    activityItemIds: items.map((item) => item.id),
  })
}

const render = (entry: Invoice) => renderInvoicePdf(entry, null)

describe('billable items', () => {
  it('offers an item that is on no invoice', async () => {
    await makeActivityWithItem()
    const items = await listBillableItems(db(), tenantId, contactId)

    expect(items).toHaveLength(1)
    expect(items[0]?.description).toBe('Erstgespräch')
  })

  it('leaves out an item that is not billable', async () => {
    const activity = await makeActivityWithItem()
    const item = activity.items[0]
    if (!item) throw new Error('no item')

    await updateActivity(db(), tenantId, activity.id, {
      contactId,
      type: 'session',
      status: 'planned',
      occurredAt: '2026-08-09T07:00:00.000Z',
      durationMin: 90,
      title: null,
      internalNote: null,
      items: [
        {
          kind: 'custom',
          id: item.id,
          serviceId,
          description: item.description,
          feeCode: null,
          quantity: 1,
          unitPriceCents: item.unitPriceCents,
          billable: false,
        },
      ],
      appointment: null,
    })

    expect(await listBillableItems(db(), tenantId, contactId)).toHaveLength(0)
  })

  /**
   * The three cases the cancelled-invoice exclusion has to get right. Written
   * now although cancelling itself arrives in slice 7 — an exception added
   * later is an exception that was forgotten.
   */
  describe('and invoices', () => {
    it('does not offer an item that sits on an active invoice', async () => {
      await makeActivityWithItem()
      await draftFromBillable()

      // A draft already claims the item: otherwise it lands on two invoices.
      expect(await listBillableItems(db(), tenantId, contactId)).toHaveLength(0)
    })

    /**
     * Both exclusions in one go, through the real path: an item on a cancelled
     * invoice is billable again, even though the cancellation document repeats
     * its `activity_item_id` and is itself finalized and not cancelled. Take
     * the type exclusion out of `domain/billable.ts` and this test fails.
     */
    it('offers it again once that invoice is cancelled', async () => {
      await makeActivityWithItem()
      const draft = await draftFromBillable()
      await finalizeDocument(db(), tenantId, store, draft.id, render)

      expect(await listBillableItems(db(), tenantId, contactId)).toHaveLength(0)

      const cancellation = await cancelInvoice(db(), tenantId, store, draft.id, render)

      // The document does carry the item — that is how it shows what it takes
      // back — and the item is free all the same.
      expect(cancellation?.lines[0]?.activityItemId).toBe(
        (await db().select().from(invoiceLine))[0]?.activityItemId,
      )
      expect(await listBillableItems(db(), tenantId, contactId)).toHaveLength(1)
    })
  })
})

describe('drafts', () => {
  it('takes the payment term from the practice settings', async () => {
    await makeActivityWithItem()
    const draft = await draftFromBillable()

    expect(draft.paymentTermDays).toBe(14)
    expect(draft.status).toBe('draft')
    expect(draft.number).toBeNull()
    expect(draft.totalCents).toBe(13_500)
  })

  it('refuses an item that is already on another invoice', async () => {
    await makeActivityWithItem()
    const items = await listBillableItems(db(), tenantId, contactId)
    await draftFromBillable()

    await expect(
      createInvoice(db(), tenantId, {
        contactId,
        invoiceDate: INVOICE_DATE,
        activityItemIds: items.map((item) => item.id),
      }),
    ).rejects.toBeInstanceOf(ItemAlreadyBilledError)
  })

  it('recomputes the total when lines change', async () => {
    await makeActivityWithItem()
    const draft = await draftFromBillable()
    const line = draft.lines[0]
    if (!line) throw new Error('no line')

    const updated = await updateInvoice(db(), tenantId, draft.id, {
      invoiceDate: INVOICE_DATE,
      paymentTermDays: 14,
      introText: null,
      outroText: null,
      lines: [
        { ...line, feeCode: null },
        {
          activityItemId: null,
          description: 'Rabatt',
          feeCode: null,
          dateOfService: null,
          quantity: 1,
          unitPriceCents: -1_500,
        },
      ],
    })

    expect(updated?.totalCents).toBe(12_000)
    expect(updated?.lines[1]?.amountCents).toBe(-1_500)
  })

  /** Rule 8: a discarded draft never held a number, so no gap arises. */
  it('discarding one does not move the counter', async () => {
    await makeActivityWithItem()
    const draft = await draftFromBillable()

    const before = await db().select().from(numberRange).where(eq(numberRange.code, 'invoice'))
    expect(await deleteInvoice(db(), tenantId, draft.id)).toBe(true)
    const after = await db().select().from(numberRange).where(eq(numberRange.code, 'invoice'))

    expect(after[0]?.nextValue).toBe(before[0]?.nextValue)
  })

  /**
   * Rule for the preview: it may not leave a trace. Structurally guaranteed —
   * `renderInvoicePdf` has no `FileStore` to write to — and asserted here so
   * that handing it one later fails loudly instead of quietly filing drafts.
   */
  it('previewing writes nothing to disk', async () => {
    await makeActivityWithItem()
    const draft = await draftFromBillable()

    const bytes = await render(draft)
    expect(bytes.byteLength).toBeGreaterThan(0)
    await expect(readdir(join(storeRoot, 'invoices'))).rejects.toThrow()
  })

  it('refuses to finalize an empty invoice', async () => {
    const draft = await createInvoice(db(), tenantId, {
      contactId,
      invoiceDate: INVOICE_DATE,
      activityItemIds: [],
    })

    await expect(finalizeDocument(db(), tenantId, store, draft.id, render)).rejects.toBeInstanceOf(
      InvoiceEmptyError,
    )
  })
})

describe('finalizing', () => {
  it('assigns the number, snapshots everything and writes the document', async () => {
    await makeActivityWithItem()
    const draft = await draftFromBillable()

    const finalized = await finalizeDocument(db(), tenantId, store, draft.id, render)
    if (!finalized) throw new Error('not finalized')

    expect(finalized.status).toBe('finalized')
    expect(finalized.number).toBe('RH-2026-001')
    expect(finalized.numberPrefix).toBe('RH-2026-')
    expect(finalized.numberValue).toBe(1)
    expect(finalized.recipientSnapshot?.name).toBe('Erika Testperson')
    expect(finalized.recipientSnapshot?.city).toBe('Teststadt')
    expect(finalized.totalCents).toBe(13_500)

    const path = pdfPathFor(INVOICE_DATE, 'RH-2026-001')
    const bytes = await store.read(path)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(finalized.pdfHash)
    expect(bytes.subarray(0, 5).toString('utf8')).toBe('%PDF-')
  })

  it('keeps the counter moving forward', async () => {
    await makeActivityWithItem()
    await finalizeDocument(db(), tenantId, store, (await draftFromBillable()).id, render)

    await makeActivityWithItem()
    const second = await finalizeDocument(
      db(),
      tenantId,
      store,
      (await draftFromBillable()).id,
      render,
    )

    expect(second?.number).toBe('RH-2026-002')
  })

  it('refuses without a configured number range', async () => {
    await db().delete(numberRange).where(eq(numberRange.code, 'invoice'))
    await makeActivityWithItem()
    const draft = await draftFromBillable()

    await expect(finalizeDocument(db(), tenantId, store, draft.id, render)).rejects.toThrow(
      /No number range configured/,
    )
  })

  it('refuses a number that is already issued', async () => {
    await makeActivityWithItem()
    await finalizeDocument(db(), tenantId, store, (await draftFromBillable()).id, render)

    // The yearly reset, done wrong: back to a value that was already used.
    await upsertNumberRange(db(), tenantId, 'invoice', {
      prefix: 'RH-2026-',
      padding: 3,
      nextValue: 1,
    })

    await makeActivityWithItem()
    const draft = await draftFromBillable()
    await expect(finalizeDocument(db(), tenantId, store, draft.id, render)).rejects.toThrow(
      /already been issued/,
    )
  })

  /**
   * The failure this ordering exists for. The render throws after the number
   * was assigned; nothing may survive it — no file, no consumed number, no
   * half-finalized row.
   */
  it('leaves nothing behind when rendering fails', async () => {
    await makeActivityWithItem()
    const draft = await draftFromBillable()

    await expect(
      finalizeDocument(db(), tenantId, store, draft.id, async () => {
        throw new Error('render exploded')
      }),
    ).rejects.toThrow('render exploded')

    const [range] = await db().select().from(numberRange).where(eq(numberRange.code, 'invoice'))
    expect(range?.nextValue).toBe(1)

    const still = await getInvoice(db(), tenantId, draft.id)
    expect(still?.status).toBe('draft')
    expect(still?.number).toBeNull()

    await expect(readdir(join(storeRoot, 'invoices'))).rejects.toThrow()
  })

  /** The same, one step later: the bytes are already on disk when it breaks. */
  it('removes the written file when something fails after the write', async () => {
    await makeActivityWithItem()
    const draft = await draftFromBillable()

    /** Writes for real, then fails — the crash window this ordering accepts. */
    class FlakyStore extends FileStore {
      override async write(path: string, bytes: Uint8Array): Promise<void> {
        await super.write(path, bytes)
        throw new Error('disk went away')
      }
    }

    await expect(
      finalizeDocument(db(), tenantId, new FlakyStore(storeRoot), draft.id, render),
    ).rejects.toThrow('disk went away')

    const [range] = await db().select().from(numberRange).where(eq(numberRange.code, 'invoice'))
    expect(range?.nextValue).toBe(1)
    expect(await getInvoice(db(), tenantId, draft.id).then((i) => i?.status)).toBe('draft')
    // The bytes were removed again by the catch.
    expect(await store.sha256OnDisk(pdfPathFor(INVOICE_DATE, 'RH-2026-001'))).toBeNull()
  })

  it('does not change a finalized invoice when the catalogue or the contact does', async () => {
    await makeActivityWithItem()
    const finalized = await finalizeDocument(
      db(),
      tenantId,
      store,
      (await draftFromBillable()).id,
      render,
    )
    if (!finalized) throw new Error('not finalized')

    await db().update(service).set({ defaultPriceCents: 19_900 }).where(eq(service.id, serviceId))
    await db().update(contact).set({ lastName: 'Andersname' }).where(eq(contact.id, contactId))

    const again = await getInvoice(db(), tenantId, finalized.id)
    expect(again?.totalCents).toBe(13_500)
    expect(again?.recipientSnapshot?.name).toBe('Erika Testperson')
    expect(again?.contactName).toBe('Erika Testperson')
  })
})

describe('the database refuses on its own', () => {
  async function refusal(query: PromiseLike<unknown>): Promise<string | null> {
    try {
      await query
    } catch (error) {
      return raisedMessage(error)
    }
    throw new Error('expected the database to refuse, but the query succeeded')
  }

  it('blocks changing or deleting a finalized invoice', async () => {
    await makeActivityWithItem()
    const finalized = await finalizeDocument(
      db(),
      tenantId,
      store,
      (await draftFromBillable()).id,
      render,
    )
    if (!finalized) throw new Error('not finalized')

    expect(
      await refusal(
        db().update(invoice).set({ totalCents: 1 }).where(eq(invoice.id, finalized.id)),
      ),
    ).toBe('finalized invoice is immutable except for its status')

    expect(await refusal(db().delete(invoice).where(eq(invoice.id, finalized.id)))).toBe(
      'finalized invoice cannot be deleted',
    )

    /**
     * `status` on its own no longer moves either: since slice 7,
     * `invoice_cancelled_state` ties `cancelled` to the reference to the
     * document that did the cancelling. The pair is what is allowed, and
     * `cancelInvoice` is the only thing that writes it.
     *
     * `refusal` throws when a query goes through, so this asserts refusal; it
     * answers `null` because a check constraint raised it rather than a
     * trigger.
     */
    expect(
      await refusal(
        db().update(invoice).set({ status: 'cancelled' }).where(eq(invoice.id, finalized.id)),
      ),
    ).toBeNull()

    const cancellation = await cancelInvoice(db(), tenantId, store, finalized.id, render)
    expect(cancellation?.cancelsInvoiceId).toBe(finalized.id)
  })

  it('blocks touching the lines of a finalized invoice', async () => {
    await makeActivityWithItem()
    const finalized = await finalizeDocument(
      db(),
      tenantId,
      store,
      (await draftFromBillable()).id,
      render,
    )
    if (!finalized) throw new Error('not finalized')
    const lineId = finalized.lines[0]?.id ?? ''

    expect(
      await refusal(
        db().update(invoiceLine).set({ description: 'anders' }).where(eq(invoiceLine.id, lineId)),
      ),
    ).toBe('finalized invoice is immutable')

    expect(await refusal(db().delete(invoiceLine).where(eq(invoiceLine.id, lineId)))).toBe(
      'finalized invoice is immutable',
    )
  })

  it('blocks changing a billed activity item', async () => {
    const activity = await makeActivityWithItem()
    const itemId = activity.items[0]?.id ?? ''
    await finalizeDocument(db(), tenantId, store, (await draftFromBillable()).id, render)

    const { activityItem } = await import('../db/schema.js')
    expect(
      await refusal(
        db().update(activityItem).set({ unitPriceCents: 1 }).where(eq(activityItem.id, itemId)),
      ),
    ).toBe('activity item is billed and cannot be modified')
  })

  it('refuses to modify a finalized invoice through the domain as well', async () => {
    await makeActivityWithItem()
    const finalized = await finalizeDocument(
      db(),
      tenantId,
      store,
      (await draftFromBillable()).id,
      render,
    )
    if (!finalized) throw new Error('not finalized')

    await expect(
      updateInvoice(db(), tenantId, finalized.id, {
        invoiceDate: INVOICE_DATE,
        paymentTermDays: 30,
        introText: null,
        outroText: null,
        lines: [],
      }),
    ).rejects.toBeInstanceOf(InvoiceNotADraftError)

    await expect(deleteInvoice(db(), tenantId, finalized.id)).rejects.toBeInstanceOf(
      InvoiceNotADraftError,
    )
  })
})

/** The point carried over from slice 4. */
describe('an activity item that is on an invoice', () => {
  it('cannot be removed from its activity', async () => {
    const activity = await makeActivityWithItem()
    await draftFromBillable()

    await expect(
      updateActivity(db(), tenantId, activity.id, {
        contactId,
        type: 'session',
        status: 'planned',
        occurredAt: '2026-08-09T07:00:00.000Z',
        durationMin: 90,
        title: null,
        internalNote: null,
        items: [],
        appointment: null,
      }),
    ).rejects.toBeInstanceOf(BilledItemError)
  })

  it('blocks deleting the whole activity', async () => {
    const activity = await makeActivityWithItem()
    await draftFromBillable()

    await expect(deleteActivity(db(), tenantId, activity.id)).rejects.toBeInstanceOf(
      BilledItemError,
    )
  })

  it('names the invoice it is on', async () => {
    const activity = await makeActivityWithItem()
    await finalizeDocument(db(), tenantId, store, (await draftFromBillable()).id, render)

    const error = await deleteActivity(db(), tenantId, activity.id).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BilledItemError)
    expect((error as BilledItemError).invoiceNumber).toBe('RH-2026-001')
  })
})
