import type { ActivityInput, ServiceInput } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { activity, activityItem, appointment } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant } from '../test/fixtures.js'
import {
  createActivity,
  deleteActivity,
  getActivity,
  listActivities,
  UnknownServiceError,
  UnknownServiceGroupError,
  updateActivity,
} from './activity.js'
import { createContact } from './contact.js'
import { createService, createServiceGroup, updateService, updateServiceGroup } from './service.js'

let tenantId: string
let contactId: string

const AT = (iso: string) => new Date(iso).toISOString()

beforeEach(async () => {
  tenantId = await createTenant(db())
  const created = await createContact(db(), tenantId, {
    kind: 'person',
    salutation: null,
    title: null,
    firstName: 'Erika',
    lastName: 'Musterfrau',
    dateOfBirth: null,
    vatId: null,
    street: null,
    postalCode: null,
    city: null,
    country: 'DE',
    email: null,
    phone: null,
    internalNote: null,
    roles: [{ role: 'patient', since: null }],
  })
  contactId = created.id
})

function serviceInput(overrides: Partial<ServiceInput> = {}): ServiceInput {
  return {
    shortCode: null,
    description: 'Folgesitzung',
    feeCode: null,
    defaultPriceCents: 9000,
    defaultDurationMin: 50,
    active: true,
    ...overrides,
  }
}

function activityInput(overrides: Partial<ActivityInput> = {}): ActivityInput {
  return {
    contactId,
    type: 'session',
    occurredAt: AT('2026-09-01T08:00:00Z'),
    durationMin: null,
    title: null,
    internalNote: null,
    items: [],
    appointment: null,
    ...overrides,
  }
}

const slot = (
  startsAt: string,
  endsAt: string,
  status: 'planned' | 'cancelled' | 'no_show' | 'cancelled_late' = 'planned',
) => ({
  startsAt: AT(startsAt),
  endsAt: AT(endsAt),
  status,
  title: null,
  note: null,
})

describe('copying from the catalogue', () => {
  it('copies description, fee code, price and duration', async () => {
    const entry = await createService(
      db(),
      tenantId,
      serviceInput({
        description: 'Erstgespräch',
        feeCode: '19',
        defaultPriceCents: 13_500,
        defaultDurationMin: 90,
      }),
    )

    const created = await createActivity(
      db(),
      tenantId,
      activityInput({
        items: [{ kind: 'service', serviceId: entry.id, quantity: 1, billable: true }],
      }),
    )

    expect(created.items).toHaveLength(1)
    expect(created.items[0]).toMatchObject({
      serviceId: entry.id,
      description: 'Erstgespräch',
      feeCode: '19',
      quantity: 1,
      unitPriceCents: 13_500,
      durationMin: 90,
      billable: true,
    })
  })

  /**
   * The point of rule 5, and the "done when" of this slice: the catalogue is a
   * template store. Editing it must leave everything that already exists
   * untouched — past bookings and future ones alike.
   */
  it('does not follow a later change to the catalogue', async () => {
    const entry = await createService(db(), tenantId, serviceInput({ defaultPriceCents: 9000 }))

    const past = await createActivity(
      db(),
      tenantId,
      activityInput({
        occurredAt: AT('2026-01-05T08:00:00Z'),
        items: [{ kind: 'service', serviceId: entry.id, quantity: 1, billable: true }],
      }),
    )
    const future = await createActivity(
      db(),
      tenantId,
      activityInput({
        occurredAt: AT('2026-12-05T08:00:00Z'),
        items: [{ kind: 'service', serviceId: entry.id, quantity: 1, billable: true }],
      }),
    )

    await updateService(
      db(),
      tenantId,
      entry.id,
      serviceInput({
        description: 'Folgesitzung (neu)',
        defaultPriceCents: 11_000,
        defaultDurationMin: 60,
      }),
    )

    for (const id of [past.id, future.id]) {
      const reloaded = await getActivity(db(), tenantId, id)
      expect(reloaded?.items[0]).toMatchObject({
        description: 'Folgesitzung',
        unitPriceCents: 9000,
        durationMin: 50,
      })
    }
  })

  it('keeps service_id only as a record of origin', async () => {
    const entry = await createService(db(), tenantId, serviceInput())
    const created = await createActivity(
      db(),
      tenantId,
      activityInput({
        items: [{ kind: 'service', serviceId: entry.id, quantity: 1, billable: true }],
      }),
    )

    // Freely editable afterwards, without losing where it came from.
    const updated = await updateActivity(
      db(),
      tenantId,
      created.id,
      activityInput({
        items: [
          {
            kind: 'custom',
            id: created.items[0]?.id,
            serviceId: entry.id,
            description: 'Folgesitzung, Sozialtarif',
            feeCode: null,
            quantity: 1,
            unitPriceCents: 6000,
            durationMin: 50,
            billable: true,
          },
        ],
      }),
    )

    expect(updated?.items[0]).toMatchObject({
      serviceId: entry.id,
      description: 'Folgesitzung, Sozialtarif',
      unitPriceCents: 6000,
    })
  })

  it('accepts a free item with no service at all', async () => {
    const created = await createActivity(
      db(),
      tenantId,
      activityInput({
        type: 'talk',
        items: [
          {
            kind: 'custom',
            serviceId: null,
            description: 'Vortrag Volkshochschule',
            feeCode: null,
            quantity: 1,
            unitPriceCents: 42_000,
            durationMin: 90,
            billable: true,
          },
        ],
      }),
    )

    expect(created.items[0]).toMatchObject({ serviceId: null, unitPriceCents: 42_000 })
  })

  /** Rule 5 leaves the price on an item free, which is how a discount is
   *  granted — no separate mechanism, and no non-negative constraint here. */
  it('accepts a negative item as a discount line', async () => {
    const created = await createActivity(
      db(),
      tenantId,
      activityInput({
        items: [
          {
            kind: 'custom',
            serviceId: null,
            description: 'Nachlass',
            feeCode: null,
            quantity: 1,
            unitPriceCents: -1500,
            durationMin: null,
            billable: true,
          },
        ],
      }),
    )

    expect(created.items[0]?.unitPriceCents).toBe(-1500)
  })

  it('refuses a service from another tenant', async () => {
    const otherTenant = await createTenant(db(), 'Mandant B')
    const foreign = await createService(db(), otherTenant, serviceInput())

    await expect(
      createActivity(
        db(),
        tenantId,
        activityInput({
          items: [{ kind: 'service', serviceId: foreign.id, quantity: 1, billable: true }],
        }),
      ),
    ).rejects.toBeInstanceOf(UnknownServiceError)
  })
})

describe('resolving a service group', () => {
  async function group() {
    const first = await createService(
      db(),
      tenantId,
      serviceInput({
        description: 'Erstgespräch',
        defaultPriceCents: 13_500,
        defaultDurationMin: 90,
      }),
    )
    const follow = await createService(
      db(),
      tenantId,
      serviceInput({
        description: 'Folgesitzung',
        defaultPriceCents: 9000,
        defaultDurationMin: 50,
      }),
    )
    const created = await createServiceGroup(db(), tenantId, {
      name: 'Einstiegspaket',
      active: true,
      items: [
        { serviceId: first.id, quantity: 1 },
        { serviceId: follow.id, quantity: 4 },
      ],
    })
    return { first, follow, group: created }
  }

  it('expands into individual items in the group order, carrying the quantity', async () => {
    const { group: created } = await group()

    const result = await createActivity(
      db(),
      tenantId,
      activityInput({ items: [{ kind: 'group', serviceGroupId: created.id }] }),
    )

    expect(result.items.map((item) => [item.description, item.quantity])).toEqual([
      ['Erstgespräch', 1],
      ['Folgesitzung', 4],
    ])
    expect(result.items.map((item) => item.position)).toEqual([0, 1])
  })

  /**
   * "No table ever stores a reference to a group" (rule 5). Checked against
   * the catalogue rather than the code, so a later column would be caught.
   */
  it('stores no group reference anywhere', async () => {
    const { group: created } = await group()
    await createActivity(
      db(),
      tenantId,
      activityInput({ items: [{ kind: 'group', serviceGroupId: created.id }] }),
    )

    const columns = await db().execute<{ table_name: string; column_name: string }>(`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and column_name like '%group%'
        and table_name <> 'service_group'
        and table_name <> 'service_group_item'
    `)

    expect([...columns]).toEqual([])
  })

  it('is unaffected when the group is changed afterwards', async () => {
    const { first, group: created } = await group()

    const result = await createActivity(
      db(),
      tenantId,
      activityInput({ items: [{ kind: 'group', serviceGroupId: created.id }] }),
    )

    // Empty the group and rename it — the activity must not notice.
    await createServiceGroup(db(), tenantId, { name: 'Anderes', active: true, items: [] })
    await updateServiceGroup(db(), tenantId, created.id, {
      name: 'Einstiegspaket (alt)',
      active: false,
      items: [{ serviceId: first.id, quantity: 9 }],
    })

    const reloaded = await getActivity(db(), tenantId, result.id)
    expect(reloaded?.items.map((item) => [item.description, item.quantity])).toEqual([
      ['Erstgespräch', 1],
      ['Folgesitzung', 4],
    ])
  })

  it('refuses an empty or unknown group instead of adding nothing', async () => {
    const empty = await createServiceGroup(db(), tenantId, {
      name: 'Leer',
      active: true,
      items: [],
    })

    await expect(
      createActivity(
        db(),
        tenantId,
        activityInput({ items: [{ kind: 'group', serviceGroupId: empty.id }] }),
      ),
    ).rejects.toBeInstanceOf(UnknownServiceGroupError)

    await expect(
      createActivity(
        db(),
        tenantId,
        activityInput({ items: [{ kind: 'group', serviceGroupId: newId() }] }),
      ),
    ).rejects.toBeInstanceOf(UnknownServiceGroupError)
  })
})

describe('items are stable across an edit', () => {
  /**
   * Slice 6 points `invoice_line.activity_item_id` at these rows, so editing
   * an activity must update them rather than replace them.
   */
  it('keeps the row id of an item that stays', async () => {
    const entry = await createService(db(), tenantId, serviceInput())
    const created = await createActivity(
      db(),
      tenantId,
      activityInput({
        items: [{ kind: 'service', serviceId: entry.id, quantity: 1, billable: true }],
      }),
    )
    const originalId = created.items[0]?.id

    const updated = await updateActivity(
      db(),
      tenantId,
      created.id,
      activityInput({
        title: 'Ergänzt',
        items: [
          {
            kind: 'custom',
            id: originalId,
            serviceId: entry.id,
            description: 'Folgesitzung',
            feeCode: null,
            quantity: 2,
            unitPriceCents: 9000,
            durationMin: 50,
            billable: true,
          },
        ],
      }),
    )

    expect(updated?.items[0]?.id).toBe(originalId)
    expect(updated?.items[0]?.quantity).toBe(2)
  })

  it('removes an item that is no longer submitted', async () => {
    const entry = await createService(db(), tenantId, serviceInput())
    const created = await createActivity(
      db(),
      tenantId,
      activityInput({
        items: [
          { kind: 'service', serviceId: entry.id, quantity: 1, billable: true },
          { kind: 'service', serviceId: entry.id, quantity: 1, billable: true },
        ],
      }),
    )
    expect(created.items).toHaveLength(2)

    const kept = created.items[0]
    if (!kept) throw new Error('fixture missing')

    const updated = await updateActivity(
      db(),
      tenantId,
      created.id,
      activityInput({
        items: [
          {
            kind: 'custom',
            id: kept.id,
            serviceId: kept.serviceId,
            description: kept.description,
            feeCode: kept.feeCode,
            quantity: kept.quantity,
            unitPriceCents: kept.unitPriceCents,
            durationMin: kept.durationMin,
            billable: kept.billable,
          },
        ],
      }),
    )

    expect(updated?.items).toHaveLength(1)
    expect(updated?.items[0]?.id).toBe(kept.id)
  })

  it('refuses an item id belonging to a different activity', async () => {
    const entry = await createService(db(), tenantId, serviceInput())
    const first = await createActivity(
      db(),
      tenantId,
      activityInput({
        items: [{ kind: 'service', serviceId: entry.id, quantity: 1, billable: true }],
      }),
    )
    const second = await createActivity(db(), tenantId, activityInput())

    await expect(
      updateActivity(
        db(),
        tenantId,
        second.id,
        activityInput({
          items: [
            {
              kind: 'custom',
              id: first.items[0]?.id,
              serviceId: null,
              description: 'Geklaut',
              feeCode: null,
              quantity: 1,
              unitPriceCents: 100,
              durationMin: null,
              billable: true,
            },
          ],
        }),
      ),
    ).rejects.toThrow()
  })
})

describe('the no-show workflow', () => {
  /** Rule 6: the unbilled item stays, because it documents that a session was
   *  planned and did not happen; an Ausfallhonorar is added next to it. */
  it('turns a session into a no-show with a cancellation fee', async () => {
    const session = await createService(db(), tenantId, serviceInput())
    const fee = await createService(
      db(),
      tenantId,
      serviceInput({
        description: 'Ausfallhonorar',
        defaultPriceCents: 6000,
        defaultDurationMin: null,
      }),
    )

    const created = await createActivity(
      db(),
      tenantId,
      activityInput({
        items: [{ kind: 'service', serviceId: session.id, quantity: 1, billable: true }],
        appointment: slot('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'),
      }),
    )
    const planned = created.items[0]
    if (!planned) throw new Error('fixture missing')

    const updated = await updateActivity(
      db(),
      tenantId,
      created.id,
      activityInput({
        items: [
          {
            kind: 'custom',
            id: planned.id,
            serviceId: planned.serviceId,
            description: planned.description,
            feeCode: planned.feeCode,
            quantity: planned.quantity,
            unitPriceCents: planned.unitPriceCents,
            durationMin: planned.durationMin,
            billable: false,
          },
          { kind: 'service', serviceId: fee.id, quantity: 1, billable: true },
        ],
        appointment: slot('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z', 'no_show'),
      }),
    )

    expect(updated?.items.map((item) => [item.description, item.billable])).toEqual([
      ['Folgesitzung', false],
      ['Ausfallhonorar', true],
    ])
    expect(updated?.appointment?.status).toBe('no_show')
  })
})

describe('the appointment beside the activity', () => {
  it('creates one by default and links it', async () => {
    const created = await createActivity(
      db(),
      tenantId,
      activityInput({ appointment: slot('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z') }),
    )

    expect(created.appointment).not.toBeNull()
    expect(created.appointment?.contactId).toBe(contactId)
  })

  it('can be skipped entirely', async () => {
    const created = await createActivity(db(), tenantId, activityInput({ appointment: null }))

    expect(created.appointment).toBeNull()
    expect(await db().select().from(appointment)).toHaveLength(0)
  })

  it('leaves the activity standing when the appointment row is deleted', async () => {
    const created = await createActivity(
      db(),
      tenantId,
      activityInput({ appointment: slot('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z') }),
    )
    const appointmentId = created.appointment?.id
    if (!appointmentId) throw new Error('fixture missing')

    await db().delete(appointment).where(eq(appointment.id, appointmentId))

    const reloaded = await getActivity(db(), tenantId, created.id)
    expect(reloaded).not.toBeNull()
    expect(reloaded?.appointment).toBeNull()

    // Only appointment_id was nulled — the composite key's other columns
    // survived, which is what the column list on ON DELETE SET NULL buys.
    const [row] = await db().select().from(activity).where(eq(activity.id, created.id))
    expect(row?.contactId).toBe(contactId)
    expect(row?.tenantId).toBe(tenantId)
  })

  /** The three-column foreign key: an activity of one contact cannot hold the
   *  appointment of another. */
  it('refuses an appointment belonging to a different contact', async () => {
    const other = await createContact(db(), tenantId, {
      kind: 'organization',
      companyName: 'Beispiel GmbH',
      contactPerson: null,
      vatId: null,
      street: null,
      postalCode: null,
      city: null,
      country: 'DE',
      email: null,
      phone: null,
      internalNote: null,
      roles: [],
    })

    const created = await createActivity(
      db(),
      tenantId,
      activityInput({ appointment: slot('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z') }),
    )
    const appointmentId = created.appointment?.id
    if (!appointmentId) throw new Error('fixture missing')

    await expect(
      db()
        .insert(activity)
        .values({
          id: newId(),
          tenantId,
          contactId: other.id,
          type: 'session',
          occurredAt: new Date('2026-09-01T08:00:00Z'),
          appointmentId,
        }),
    ).rejects.toThrow()
  })

  it('deletes the appointment when the activity is deleted', async () => {
    const created = await createActivity(
      db(),
      tenantId,
      activityInput({ appointment: slot('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z') }),
    )

    expect(await deleteActivity(db(), tenantId, created.id)).toBe(true)
    expect(await db().select().from(appointment)).toHaveLength(0)
    expect(await db().select().from(activityItem)).toHaveLength(0)
  })
})

describe('listing', () => {
  it('filters by contact and by date range, newest first', async () => {
    const other = await createContact(db(), tenantId, {
      kind: 'organization',
      companyName: 'Beispiel GmbH',
      contactPerson: null,
      vatId: null,
      street: null,
      postalCode: null,
      city: null,
      country: 'DE',
      email: null,
      phone: null,
      internalNote: null,
      roles: [],
    })

    await createActivity(db(), tenantId, activityInput({ occurredAt: AT('2026-03-01T08:00:00Z') }))
    await createActivity(db(), tenantId, activityInput({ occurredAt: AT('2026-05-01T08:00:00Z') }))
    await createActivity(
      db(),
      tenantId,
      activityInput({ contactId: other.id, occurredAt: AT('2026-04-01T08:00:00Z') }),
    )

    const byContact = await listActivities(db(), tenantId, {
      contactId,
      limit: 50,
      offset: 0,
    })
    expect(byContact.map((item) => item.occurredAt)).toEqual([
      AT('2026-05-01T08:00:00Z'),
      AT('2026-03-01T08:00:00Z'),
    ])

    const byRange = await listActivities(db(), tenantId, {
      from: AT('2026-04-01T00:00:00Z'),
      to: AT('2026-06-01T00:00:00Z'),
      limit: 50,
      offset: 0,
    })
    expect(byRange).toHaveLength(2)
  })

  it('shows only its own tenant', async () => {
    const otherTenant = await createTenant(db(), 'Mandant B')
    await createActivity(db(), tenantId, activityInput())

    expect(
      await listActivities(db(), otherTenant, {
        from: AT('2020-01-01T00:00:00Z'),
        limit: 50,
        offset: 0,
      }),
    ).toEqual([])
  })
})
