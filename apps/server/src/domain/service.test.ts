import type { CatalogueListQuery, ServiceGroupInput, ServiceInput } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { service, serviceGroup, serviceGroupItem } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant, roleTypeId } from '../test/fixtures.js'
import { createActivity } from './activity.js'
import { createActivityType } from './activity-type.js'
import { createContact } from './contact.js'
import {
  createService,
  createServiceGroup,
  deleteService,
  deleteServiceGroup,
  listServiceGroups,
  listServices,
  ServiceGroupInUseError,
  ServiceInUseError,
  UnknownServiceError,
  updateService,
  updateServiceGroup,
} from './service.js'

let tenantId: string

beforeEach(async () => {
  tenantId = await createTenant(db())
})

const active: CatalogueListQuery = { includeInactive: false }
const all: CatalogueListQuery = { includeInactive: true }

/*
 * Reloading goes through the list, because the catalogue has no single-record
 * read: `getService` and `getServiceGroup` existed for two HTTP routes nothing
 * ever called, and both went with them. The list carries the same columns, and
 * asserting through it has the side benefit that these tests exercise the query
 * the application actually runs.
 */
async function reloadService(tenant: string, id: string) {
  return (await listServices(db(), tenant, all)).find((row) => row.id === id) ?? null
}

async function reloadGroup(tenant: string, id: string) {
  return (await listServiceGroups(db(), tenant, all)).find((row) => row.id === id) ?? null
}

function serviceInput(overrides: Partial<ServiceInput> = {}): ServiceInput {
  return {
    shortCode: null,
    description: 'Folgesitzung',
    feeCode: null,
    defaultPriceCents: 9000,
    defaultDurationMin: 50,
    sortOrder: 0,
    active: true,
    ...overrides,
  }
}

function groupInput(overrides: Partial<ServiceGroupInput> = {}): ServiceGroupInput {
  return {
    name: 'Paket',
    sortOrder: 0,
    active: true,
    items: [],
    ...overrides,
  }
}

describe('services', () => {
  it('stores prices as integer cents', async () => {
    const created = await createService(db(), tenantId, serviceInput({ defaultPriceCents: 13500 }))

    expect(created.defaultPriceCents).toBe(13500)
    expect(Number.isInteger(created.defaultPriceCents)).toBe(true)
  })

  it('allows a service without a duration', async () => {
    const created = await createService(
      db(),
      tenantId,
      serviceInput({ description: 'Ausfallhonorar', defaultDurationMin: null }),
    )

    expect(created.defaultDurationMin).toBeNull()
  })

  it('rejects a negative price', async () => {
    await expect(
      createService(db(), tenantId, serviceInput({ defaultPriceCents: -100 })),
    ).rejects.toThrow()
  })

  it('rejects a duration of zero', async () => {
    await expect(
      createService(db(), tenantId, serviceInput({ defaultDurationMin: 0 })),
    ).rejects.toThrow()
  })

  it('keeps short codes unique, but only where given', async () => {
    await createService(db(), tenantId, serviceInput({ shortCode: 'FS' }))
    await expect(
      createService(db(), tenantId, serviceInput({ shortCode: 'FS', description: 'Andere' })),
    ).rejects.toThrow()

    // Two without a code are fine — that is what the partial index is for.
    await createService(db(), tenantId, serviceInput({ description: 'Ohne Kürzel A' }))
    await createService(db(), tenantId, serviceInput({ description: 'Ohne Kürzel B' }))

    expect(await listServices(db(), tenantId, all)).toHaveLength(3)
  })

  it('lets two tenants use the same short code', async () => {
    const otherTenant = await createTenant(db())
    await createService(db(), tenantId, serviceInput({ shortCode: 'FS' }))

    await expect(
      createService(db(), otherTenant, serviceInput({ shortCode: 'FS' })),
    ).resolves.toBeDefined()
  })

  /** The "done when" of this slice: deactivated entries disappear from
   *  selection lists but stay maintainable. */
  it('hides inactive services unless asked for them', async () => {
    const kept = await createService(db(), tenantId, serviceInput({ description: 'Aktiv' }))
    await createService(db(), tenantId, serviceInput({ description: 'Alt', active: false }))

    expect((await listServices(db(), tenantId, active)).map((row) => row.id)).toEqual([kept.id])
    expect(await listServices(db(), tenantId, all)).toHaveLength(2)
  })

  it('sorts by description', async () => {
    await createService(db(), tenantId, serviceInput({ description: 'Vortrag' }))
    await createService(db(), tenantId, serviceInput({ description: 'Erstgespräch' }))
    await createService(db(), tenantId, serviceInput({ description: 'Ärztliches Attest' }))

    expect((await listServices(db(), tenantId, active)).map((row) => row.description)).toEqual([
      'Ärztliches Attest',
      'Erstgespräch',
      'Vortrag',
    ])
  })

  /** `sort_order` wins over the alphabet; ties fall back to it (rule from the
   *  design handoff — see the C) part of the D1 slice). */
  it('sorts by sortOrder first, description second', async () => {
    await createService(db(), tenantId, serviceInput({ description: 'Vortrag', sortOrder: 20 }))
    await createService(
      db(),
      tenantId,
      serviceInput({ description: 'Erstgespräch', sortOrder: 10 }),
    )
    await createService(
      db(),
      tenantId,
      serviceInput({ description: 'Ärztliches Attest', sortOrder: 10 }),
    )

    expect((await listServices(db(), tenantId, active)).map((row) => row.description)).toEqual([
      'Ärztliches Attest',
      'Erstgespräch',
      'Vortrag',
    ])
  })

  it('does not reach into another tenant', async () => {
    const created = await createService(db(), tenantId, serviceInput())
    const otherTenant = await createTenant(db())

    expect(await reloadService(otherTenant, created.id)).toBeNull()
    expect(await updateService(db(), otherTenant, created.id, serviceInput())).toBeNull()
  })
})

describe('service groups', () => {
  async function catalogue() {
    const first = await createService(
      db(),
      tenantId,
      serviceInput({ description: 'Erstgespräch', shortCode: 'EG', defaultPriceCents: 13500 }),
    )
    const follow = await createService(
      db(),
      tenantId,
      serviceInput({ description: 'Folgesitzung', shortCode: 'FS', defaultPriceCents: 9000 }),
    )
    return { first, follow }
  }

  it('keeps the order the items were given in', async () => {
    const { first, follow } = await catalogue()

    const group = await createServiceGroup(
      db(),
      tenantId,
      groupInput({
        name: 'Einstiegspaket',
        items: [
          { serviceId: follow.id, quantity: 4 },
          { serviceId: first.id, quantity: 1 },
        ],
      }),
    )

    expect(group.items.map((item) => item.description)).toEqual(['Folgesitzung', 'Erstgespräch'])
    expect(group.items.map((item) => item.quantity)).toEqual([4, 1])
  })

  it('numbers positions from zero without gaps', async () => {
    const { first, follow } = await catalogue()
    const group = await createServiceGroup(
      db(),
      tenantId,
      groupInput({
        items: [
          { serviceId: first.id, quantity: 1 },
          { serviceId: follow.id, quantity: 2 },
        ],
      }),
    )

    await updateServiceGroup(
      db(),
      tenantId,
      group.id,
      groupInput({
        items: [
          { serviceId: follow.id, quantity: 2 },
          { serviceId: first.id, quantity: 1 },
        ],
      }),
    )

    const rows = await db()
      .select({ position: serviceGroupItem.position, serviceId: serviceGroupItem.serviceId })
      .from(serviceGroupItem)
      .where(eq(serviceGroupItem.serviceGroupId, group.id))
      .orderBy(serviceGroupItem.position)

    expect(rows.map((row) => row.position)).toEqual([0, 1])
    expect(rows[0]?.serviceId).toBe(follow.id)
  })

  it('carries the catalogue values along for display', async () => {
    const { first } = await catalogue()
    const group = await createServiceGroup(
      db(),
      tenantId,
      groupInput({ items: [{ serviceId: first.id, quantity: 1 }] }),
    )

    expect(group.items[0]).toMatchObject({
      description: 'Erstgespräch',
      shortCode: 'EG',
      defaultPriceCents: 13500,
      serviceActive: true,
    })
  })

  /** A group may hold a service that was deactivated later; the UI has to be
   *  able to point that out rather than quietly showing a stale entry. */
  it('reports a deactivated service inside a group', async () => {
    const { first } = await catalogue()
    const group = await createServiceGroup(
      db(),
      tenantId,
      groupInput({ items: [{ serviceId: first.id, quantity: 1 }] }),
    )

    await updateService(
      db(),
      tenantId,
      first.id,
      serviceInput({ description: 'Erstgespräch', active: false }),
    )
    const reloaded = await reloadGroup(tenantId, group.id)

    expect(reloaded?.items[0]?.serviceActive).toBe(false)
  })

  it('refuses a service from another tenant', async () => {
    const otherTenant = await createTenant(db())
    const foreign = await createService(db(), otherTenant, serviceInput())

    await expect(
      createServiceGroup(
        db(),
        tenantId,
        groupInput({ items: [{ serviceId: foreign.id, quantity: 1 }] }),
      ),
    ).rejects.toBeInstanceOf(UnknownServiceError)
  })

  it('refuses a service id that does not exist', async () => {
    await expect(
      createServiceGroup(
        db(),
        tenantId,
        groupInput({ items: [{ serviceId: newId(), quantity: 1 }] }),
      ),
    ).rejects.toBeInstanceOf(UnknownServiceError)
  })

  it('hides inactive groups unless asked for them', async () => {
    await createServiceGroup(db(), tenantId, groupInput({ name: 'Aktuell' }))
    await createServiceGroup(db(), tenantId, groupInput({ name: 'Eingestellt', active: false }))

    expect(await listServiceGroups(db(), tenantId, active)).toHaveLength(1)
    expect(await listServiceGroups(db(), tenantId, all)).toHaveLength(2)
  })

  it('sorts by sortOrder first, name second', async () => {
    await createServiceGroup(db(), tenantId, groupInput({ name: 'Zweites', sortOrder: 0 }))
    await createServiceGroup(db(), tenantId, groupInput({ name: 'Erstes', sortOrder: 0 }))

    expect((await listServiceGroups(db(), tenantId, active)).map((row) => row.name)).toEqual([
      'Erstes',
      'Zweites',
    ])
  })

  it('keeps group names unique per tenant', async () => {
    await createServiceGroup(db(), tenantId, groupInput())

    await expect(createServiceGroup(db(), tenantId, groupInput())).rejects.toThrow()
  })

  it('leaves the services alone when a group is emptied', async () => {
    const { first } = await catalogue()
    const group = await createServiceGroup(
      db(),
      tenantId,
      groupInput({ items: [{ serviceId: first.id, quantity: 1 }] }),
    )

    await updateServiceGroup(db(), tenantId, group.id, groupInput())

    expect(await reloadService(tenantId, first.id)).not.toBeNull()
  })

  it('does not reach into another tenant', async () => {
    const group = await createServiceGroup(db(), tenantId, groupInput())
    const otherTenant = await createTenant(db())

    expect(await reloadGroup(otherTenant, group.id)).toBeNull()
    expect(
      await updateServiceGroup(db(), otherTenant, group.id, groupInput({ name: 'Umbenannt' })),
    ).toBeNull()
  })
})

describe('deleting the catalogue', () => {
  it('deletes a service that nothing references', async () => {
    const created = await createService(db(), tenantId, serviceInput())

    expect(await deleteService(db(), tenantId, created.id)).toBe(true)
    expect(await reloadService(tenantId, created.id)).toBeNull()
  })

  /**
   * D5: the error carries *which* of the three tables still reference the
   * service, not just that one does — "wird verwendet" alone is a message
   * the practitioner cannot act on. One test per reason, plus one where more
   * than one applies at once, since the message has to name all of them.
   */
  it('refuses to delete a service used by a group, and names that reason', async () => {
    const created = await createService(db(), tenantId, serviceInput())
    await createServiceGroup(
      db(),
      tenantId,
      groupInput({ items: [{ serviceId: created.id, quantity: 1 }] }),
    )

    const error = await deleteService(db(), tenantId, created.id).catch((caught) => caught)
    expect(error).toBeInstanceOf(ServiceInUseError)
    expect((error as ServiceInUseError).usage).toEqual({
      activity: false,
      group: true,
      preset: false,
    })
    expect(await reloadService(tenantId, created.id)).not.toBeNull()
  })

  it('refuses to delete a service used by an activity item, and names that reason', async () => {
    const created = await createService(db(), tenantId, serviceInput())
    const contact = await createContact(db(), tenantId, {
      kind: 'person',
      salutationId: null,
      title: null,
      firstName: 'Erika',
      lastName: 'Musterfrau',
      dateOfBirth: null,
      birthPlace: null,
      genderId: null,
      vatId: null,
      street: null,
      houseNumber: null,
      postalCode: null,
      city: null,
      countryId: null,
      email: null,
      phoneMobile: null,
      phoneLandline: null,
      internalNote: null,
      diagnosis: null,
      roles: [{ roleTypeId: await roleTypeId(db(), tenantId, 'Patient'), since: null }],
    })
    await createActivity(db(), tenantId, {
      contactId: contact.id,
      type: 'session',
      status: 'planned',
      occurredAt: new Date('2026-09-01T08:00:00Z').toISOString(),
      durationMin: null,
      title: null,
      internalNote: null,
      appointment: null,
      items: [{ kind: 'service', serviceId: created.id, quantity: 1, billable: true }],
    })

    const error = await deleteService(db(), tenantId, created.id).catch((caught) => caught)
    expect(error).toBeInstanceOf(ServiceInUseError)
    expect((error as ServiceInUseError).usage).toEqual({
      activity: true,
      group: false,
      preset: false,
    })
  })

  it('refuses to delete a service used as an activity type preset, and names that reason', async () => {
    const created = await createService(db(), tenantId, serviceInput())
    await createActivityType(db(), tenantId, {
      code: 'preset_user',
      label: 'Verwendet Vorbelegung',
      color: '#64748b',
      defaultDurationMin: null,
      presetItems: [{ serviceId: created.id, quantity: 1 }],
      isDefault: false,
      sortOrder: 100,
      active: true,
    })

    const error = await deleteService(db(), tenantId, created.id).catch((caught) => caught)
    expect(error).toBeInstanceOf(ServiceInUseError)
    expect((error as ServiceInUseError).usage).toEqual({
      activity: false,
      group: false,
      preset: true,
    })
  })

  it('names every reason at once when more than one applies', async () => {
    const created = await createService(db(), tenantId, serviceInput())
    await createServiceGroup(
      db(),
      tenantId,
      groupInput({ items: [{ serviceId: created.id, quantity: 1 }] }),
    )
    await createActivityType(db(), tenantId, {
      code: 'preset_user_2',
      label: 'Verwendet Vorbelegung 2',
      color: '#64748b',
      defaultDurationMin: null,
      presetItems: [{ serviceId: created.id, quantity: 1 }],
      isDefault: false,
      sortOrder: 100,
      active: true,
    })

    const error = await deleteService(db(), tenantId, created.id).catch((caught) => caught)
    expect(error).toBeInstanceOf(ServiceInUseError)
    expect((error as ServiceInUseError).usage).toEqual({
      activity: false,
      group: true,
      preset: true,
    })
  })

  it('reports false rather than throwing for an id in another tenant', async () => {
    const created = await createService(db(), tenantId, serviceInput())
    const otherTenant = await createTenant(db())

    expect(await deleteService(db(), otherTenant, created.id)).toBe(false)
    expect(await reloadService(tenantId, created.id)).not.toBeNull()
  })

  it('deletes a service group that nothing references', async () => {
    const group = await createServiceGroup(db(), tenantId, groupInput())

    expect(await deleteServiceGroup(db(), tenantId, group.id)).toBe(true)
    expect(await reloadGroup(tenantId, group.id)).toBeNull()
  })

  /**
   * Nothing references a group from outside it since D1 — an activity type's
   * preset resolves a chosen group into service rows immediately rather than
   * keeping the group id (CLAUDE.md rule 5) — so this only proves the call
   * exists and does not throw for the case the domain check exists for.
   */
  it('has a ServiceGroupInUseError type ready for the day something references a group', () => {
    expect(new ServiceGroupInUseError()).toBeInstanceOf(Error)
  })
})

describe('the catalogue holds no live references', () => {
  /**
   * "No table ever stores a reference to a group" (CLAUDE.md rule 5). A group
   * is a selection helper that is resolved at entry time, so renaming or
   * emptying one can never reach back into what was entered from it.
   *
   * A reference to a *service* is a different matter and explicitly allowed:
   * `activity_item.service_id` records where a position came from and means
   * nothing for its price or text — the values were copied. Slice 4 added it,
   * and this test was narrowed to the rule it actually protects.
   *
   * D1 removed the last exception, `activity_type.default_service_group_id`:
   * an activity type's preset now references services directly
   * (`activity_type_preset_item`), never a group, so nothing at all may
   * appear in this list anymore. Anything that does needs weighing against
   * rule 5 before it is added.
   */
  it('lets nothing outside the catalogue reference a service group', async () => {
    const referencing = await db().execute<{ table_name: string }>(`
      select distinct tc.table_name
      from information_schema.table_constraints tc
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY'
        and ccu.table_name = 'service_group'
        and tc.table_name <> 'service_group_item'
      order by 1
    `)

    expect([...referencing].map((row) => row.table_name)).toEqual([])
  })

  it('allows a service to be referenced only as a record of origin', async () => {
    const referencing = await db().execute<{ table_name: string; column_name: string }>(`
      select distinct tc.table_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY'
        and ccu.table_name = 'service'
        and kcu.column_name = 'service_id'
      order by 1
    `)

    // Anything new appearing here has to be weighed against rule 5 before it
    // is added to the list.
    expect([...referencing].map((row) => row.table_name)).toEqual([
      'activity_item',
      'activity_type_preset_item',
      'service_group_item',
    ])
  })

  it('does not change an existing group entry when the catalogue is edited', async () => {
    const original = await createService(
      db(),
      tenantId,
      serviceInput({ description: 'Folgesitzung', defaultPriceCents: 9000 }),
    )
    const group = await createServiceGroup(
      db(),
      tenantId,
      groupInput({ items: [{ serviceId: original.id, quantity: 2 }] }),
    )

    await updateService(
      db(),
      tenantId,
      original.id,
      serviceInput({ description: 'Folgesitzung', defaultPriceCents: 9900 }),
    )

    // The group holds a reference, not a copy — it is a selection helper, and
    // the copy happens in slice 4 when an activity item is created from it.
    const reloaded = await reloadGroup(tenantId, group.id)
    expect(reloaded?.items[0]?.defaultPriceCents).toBe(9900)
    expect(reloaded?.items[0]?.quantity).toBe(2)
  })

  it('has no validity columns on the catalogue', async () => {
    const columns = await db().execute<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'service'`,
    )
    const names = [...columns].map((row) => row.column_name)

    expect(names).not.toContain('valid_from')
    expect(names).not.toContain('valid_to')
    expect(names.filter((name) => name.includes('price'))).toEqual(['default_price_cents'])
  })
})

describe('database guarantees', () => {
  it('refuses to delete a service that a group uses', async () => {
    const created = await createService(db(), tenantId, serviceInput())
    await createServiceGroup(
      db(),
      tenantId,
      groupInput({ items: [{ serviceId: created.id, quantity: 1 }] }),
    )

    // The domain refuses first (see "deleting the catalogue" above); this is
    // the foreign key backstopping it even from psql.
    await expect(db().delete(service).where(eq(service.id, created.id))).rejects.toThrow()
  })

  it('removes the items when a group row is deleted', async () => {
    const created = await createService(db(), tenantId, serviceInput())
    const group = await createServiceGroup(
      db(),
      tenantId,
      groupInput({ items: [{ serviceId: created.id, quantity: 1 }] }),
    )

    await db().delete(serviceGroup).where(eq(serviceGroup.id, group.id))

    expect(
      await db()
        .select()
        .from(serviceGroupItem)
        .where(eq(serviceGroupItem.serviceGroupId, group.id)),
    ).toEqual([])
  })
})
