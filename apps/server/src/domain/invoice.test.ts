import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Invoice, sumItems } from '@praxi/shared'
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
  activity as schemaActivity,
  service,
} from '../db/schema.js'
import { newId } from '../id.js'
import { renderInvoicePdf } from '../pdf/render.js'
import { createTenant, createUser, finalizeDocument } from '../test/fixtures.js'
import { BilledItemError, createActivity, deleteActivity, updateActivity } from './activity.js'
import { billingStateOf, listBillableItems, unbilledCentsInRange } from './billable.js'
import { cancelInvoice } from './cancel-invoice.js'
import { FileStore } from './file-store.js'
import { pdfPathFor } from './finalize-invoice.js'
import {
  collectBillableItems,
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

  /** Prefilled once, from the contact's master data, exactly like the intro
   *  and outro texts — then free to edit for this one invoice
   *  (CLAUDE.md rule 12). */
  it('prefills diagnosis from the contact, then leaves it editable', async () => {
    await db()
      .update(contact)
      .set({ diagnosis: 'Anpassungsstörung' })
      .where(eq(contact.id, contactId))
    await makeActivityWithItem()

    const draft = await draftFromBillable()
    expect(draft.diagnosis).toBe('Anpassungsstörung')

    const updated = await updateInvoice(db(), tenantId, draft.id, {
      invoiceDate: INVOICE_DATE,
      paymentTermDays: 14,
      introText: null,
      outroText: null,
      diagnosis: 'Andere Diagnose',
      lines: draft.lines.map((line) => ({ ...line, feeCode: null })),
    })
    expect(updated?.diagnosis).toBe('Andere Diagnose')
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
      diagnosis: null,
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

  /**
   * The line points at its activity as well as at its item, joined in on read
   * and stored nowhere (K7). A screen needs it to say how many *activities* an
   * invoice covers — several lines routinely come out of one session, so the
   * number of lines answers a different question.
   */
  it('names the activity a line came from, and nothing for a free one', async () => {
    const activity = await makeActivityWithItem()
    const draft = await draftFromBillable()
    const line = draft.lines[0]
    if (!line) throw new Error('no line')

    expect(line.activityId).toBe(activity.id)

    const updated = await updateInvoice(db(), tenantId, draft.id, {
      invoiceDate: INVOICE_DATE,
      paymentTermDays: 14,
      introText: null,
      outroText: null,
      diagnosis: null,
      lines: [
        { ...line, feeCode: null },
        {
          activityItemId: null,
          description: 'Freie Position',
          feeCode: null,
          dateOfService: null,
          quantity: 1,
          unitPriceCents: 2_000,
        },
      ],
    })

    // A free line belongs to no activity, and the left join has to leave it on
    // the invoice rather than drop it.
    expect(updated?.lines.map((entry) => entry.activityId)).toEqual([activity.id, null])
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

  /**
   * `protect_finalized_invoice` (migration 0030) diffs the whole row and
   * names what is *allowed* to change, rather than listing protected columns
   * — so a column added after that migration, like `diagnosis`, is frozen
   * automatically instead of needing this trigger to be remembered too.
   */
  it('freezes a column added after the immutability trigger without naming it there', async () => {
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
        db()
          .update(invoice)
          .set({ diagnosis: 'nachträglich eingefügt' })
          .where(eq(invoice.id, finalized.id)),
      ),
    ).toBe('finalized invoice is immutable except for its status')
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
        diagnosis: null,
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

/** A second contact, so the tenant-wide list and `collect` have something to
 *  keep apart. */
async function secondContact(): Promise<string> {
  const id = newId()
  await db()
    .insert(contact)
    .values({ id, tenantId, contactNumber: 2, kind: 'person', lastName: 'Zweitperson' })
  return id
}

async function activityFor(contactForItem: string, occurredAt = '2026-08-09T07:00:00.000Z') {
  return createActivity(db(), tenantId, {
    contactId: contactForItem,
    type: 'session',
    status: 'planned',
    occurredAt,
    durationMin: 90,
    title: null,
    internalNote: null,
    items: [{ kind: 'service', serviceId, quantity: 1, billable: true }],
    appointment: null,
  })
}

describe('the billable list across contacts', () => {
  it('spans every contact when none is named', async () => {
    const other = await secondContact()
    await makeActivityWithItem()
    await activityFor(other)

    const all = await listBillableItems(db(), tenantId)
    expect(all).toHaveLength(2)
    expect(new Set(all.map((item) => item.contactId))).toEqual(new Set([contactId, other]))
  })

  it('narrows to one contact when it is', async () => {
    const other = await secondContact()
    await makeActivityWithItem()
    await activityFor(other)

    const mine = await listBillableItems(db(), tenantId, contactId)
    expect(mine).toHaveLength(1)
    expect(mine[0]?.contactId).toBe(contactId)
  })

  it('carries the contact and the activity status for display', async () => {
    await makeActivityWithItem()
    const [item] = await listBillableItems(db(), tenantId)

    expect(item?.contactName).toBe('Erika Testperson')
    expect(item?.contactNumber).toBe(1)
    // Shown, never filtered on: a past activity still standing on "planned" is
    // the row worth noticing, and `billableQuerySchema` has no status field to
    // hide it with.
    expect(item?.activityStatus).toBe('planned')
  })

  /** Billability does not depend on a status (rule 6), so no status may keep
   *  an item out of this list. */
  it('offers an item of a no-show exactly like any other', async () => {
    const activity = await makeActivityWithItem()
    await db()
      .update(schemaActivity)
      .set({ status: 'no_show' })
      .where(eq(schemaActivity.id, activity.id))

    expect(await listBillableItems(db(), tenantId)).toHaveLength(1)
  })
})

describe('collecting billable items into drafts', () => {
  it('opens one draft per contact', async () => {
    const other = await secondContact()
    await makeActivityWithItem()
    await activityFor(other)

    const items = await listBillableItems(db(), tenantId)
    const results = await collectBillableItems(db(), tenantId, {
      activityItemIds: items.map((item) => item.id),
      invoiceDate: INVOICE_DATE,
    })

    expect(results).toHaveLength(2)
    expect(results.every((entry) => entry.created)).toBe(true)
    expect(new Set(results.map((entry) => entry.invoiceId)).size).toBe(2)
    expect(await listBillableItems(db(), tenantId)).toHaveLength(0)
  })

  /** The rule the whole endpoint exists for: a contact gets one draft, not a
   *  second one beside the first. */
  it('appends to a draft the contact already has', async () => {
    await makeActivityWithItem()
    const first = await draftFromBillable()

    const later = await activityFor(contactId, '2026-08-16T07:00:00.000Z')
    const [item] = await listBillableItems(db(), tenantId, contactId)
    expect(item?.activityId).toBe(later.id)

    const [result] = await collectBillableItems(db(), tenantId, {
      activityItemIds: [item?.id ?? ''],
      invoiceDate: INVOICE_DATE,
    })

    expect(result?.created).toBe(false)
    expect(result?.invoiceId).toBe(first.id)

    const draft = await getInvoice(db(), tenantId, first.id)
    expect(draft?.lines).toHaveLength(2)
    // Positions continue rather than restart, and the total is summed over all
    // the lines rather than added to.
    expect(draft?.lines.map((line) => line.position)).toEqual([0, 1])
    expect(draft?.totalCents).toBe(27_000)
  })

  it('refuses an item that is already claimed', async () => {
    await makeActivityWithItem()
    const [item] = await listBillableItems(db(), tenantId)
    await draftFromBillable()

    await expect(
      collectBillableItems(db(), tenantId, {
        activityItemIds: [item?.id ?? ''],
        invoiceDate: INVOICE_DATE,
      }),
    ).rejects.toBeInstanceOf(ItemAlreadyBilledError)
  })

  /**
   * The whole set is resolved before anything is written, and all of it runs
   * in one transaction — so a set with one claimed item in it leaves no drafts
   * behind for the contacts that would have been fine. A half-finished collect
   * would leave the practitioner guessing which contacts still need doing.
   */
  it('creates nothing at all when one item is not billable', async () => {
    const other = await secondContact()
    await makeActivityWithItem()
    await activityFor(other)

    const items = await listBillableItems(db(), tenantId)
    const claimed = items[0]
    await collectBillableItems(db(), tenantId, {
      activityItemIds: [claimed?.id ?? ''],
      invoiceDate: INVOICE_DATE,
    })

    const before = await db().select().from(invoice)

    await expect(
      collectBillableItems(db(), tenantId, {
        activityItemIds: items.map((item) => item.id),
        invoiceDate: INVOICE_DATE,
      }),
    ).rejects.toBeInstanceOf(ItemAlreadyBilledError)

    expect(await db().select().from(invoice)).toHaveLength(before.length)
  })
})

describe('billingState', () => {
  it('is none when there is nothing to bill', async () => {
    const activity = await createActivity(db(), tenantId, {
      contactId,
      type: 'session',
      status: 'planned',
      occurredAt: '2026-08-09T07:00:00.000Z',
      durationMin: 90,
      title: null,
      internalNote: null,
      items: [],
      appointment: null,
    })

    expect(await billingStateOf(db(), tenantId, activity.id)).toBe('none')
  })

  it('is open while an item is on no active invoice', async () => {
    const activity = await makeActivityWithItem()
    expect(await billingStateOf(db(), tenantId, activity.id)).toBe('open')
  })

  it('is billed once every item is claimed — a draft counts', async () => {
    const activity = await makeActivityWithItem()
    await draftFromBillable()

    expect(await billingStateOf(db(), tenantId, activity.id)).toBe('billed')
  })

  /**
   * **The test this commit is really about.**
   *
   * What it protects is not the three values but that `billingStateOf` and
   * `listBillableItems` decide with the *same* condition. Cancelling an
   * invoice returns its items to the billable pool (rule 9) — the lines stay
   * where they are, because a finalized invoice is immutable, and it is the
   * `status <> 'cancelled'` exclusion alone that frees them.
   *
   * So if somebody later implements `billingState` more conveniently — a
   * column on `activity`, a flag written at finalization, a second query that
   * only asks "is there any invoice line" — every easy case still passes and
   * this one falls over. That is exactly what it is for. Do not relax it.
   */
  it('falls back to open when the invoice is cancelled', async () => {
    const activity = await makeActivityWithItem()
    const draft = await draftFromBillable()
    await finalizeDocument(db(), tenantId, store, draft.id, render)

    expect(await billingStateOf(db(), tenantId, activity.id)).toBe('billed')

    await cancelInvoice(db(), tenantId, store, draft.id, render)

    expect(await billingStateOf(db(), tenantId, activity.id)).toBe('open')
    // And the two answers agree, which is the point.
    expect(await listBillableItems(db(), tenantId, contactId)).toHaveLength(1)
  })
})

/**
 * The money figure in the Vorgänge summary line (D8), tested here rather than
 * in `activity.test.ts` because the interesting cases need real invoices.
 *
 * It is the third reader of `claimedByAnActiveInvoice`, and it has to answer
 * like the other two in every case — which is only visible on a cancellation.
 */
describe('unbilled cents in a window', () => {
  const WINDOW = { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-09-01T00:00:00Z') }

  it('adds up what no active invoice claims', async () => {
    await makeActivityWithItem()

    expect(await unbilledCentsInRange(db(), tenantId, WINDOW)).toBe(13_500)
  })

  it('counts nothing outside the window', async () => {
    await makeActivityWithItem()

    expect(
      await unbilledCentsInRange(db(), tenantId, {
        from: new Date('2026-09-01T00:00:00Z'),
        to: new Date('2026-10-01T00:00:00Z'),
      }),
    ).toBe(0)
  })

  /** A draft counts as claimed, exactly as it does for the billable list — an
   *  item already on someone's draft must not be offered a second time, and
   *  must not be counted as still owed either. */
  it('drops an item the moment it lands on a draft', async () => {
    await makeActivityWithItem()
    await draftFromBillable()

    expect(await unbilledCentsInRange(db(), tenantId, WINDOW)).toBe(0)
  })

  /** The case that would break a second, simpler implementation, and the
   *  reason this function lives next to the condition it shares. */
  it('counts it again once the invoice is cancelled', async () => {
    await makeActivityWithItem()
    const draft = await draftFromBillable()
    await finalizeDocument(db(), tenantId, store, draft.id, render)

    expect(await unbilledCentsInRange(db(), tenantId, WINDOW)).toBe(0)

    await cancelInvoice(db(), tenantId, store, draft.id, render)

    expect(await unbilledCentsInRange(db(), tenantId, WINDOW)).toBe(13_500)
  })

  /** The summary line is meant to be checkable by adding the column up, so it
   *  has to equal what the rows badged "Offen" carry — no status of its own
   *  and no cut-off at today (rule 6). */
  it('agrees with the rows the list badges open', async () => {
    const planned = await makeActivityWithItem()

    expect(await billingStateOf(db(), tenantId, planned.id)).toBe('open')
    expect(await unbilledCentsInRange(db(), tenantId, WINDOW)).toBe(
      sumItems(planned.items, { billableOnly: true }),
    )
  })
})
