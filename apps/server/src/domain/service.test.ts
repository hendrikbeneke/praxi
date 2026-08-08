import type { CatalogueListQuery, ServiceInput } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { service, serviceGroup, serviceGroupItem } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant } from '../test/fixtures.js'
import {
  createService,
  createServiceGroup,
  getService,
  getServiceGroup,
  listServiceGroups,
  listServices,
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
    const otherTenant = await createTenant(db(), 'Mandant B')
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

  it('does not reach into another tenant', async () => {
    const created = await createService(db(), tenantId, serviceInput())
    const otherTenant = await createTenant(db(), 'Mandant B')

    expect(await getService(db(), otherTenant, created.id)).toBeNull()
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

    const group = await createServiceGroup(db(), tenantId, {
      name: 'Einstiegspaket',
      active: true,
      items: [
        { serviceId: follow.id, quantity: 4 },
        { serviceId: first.id, quantity: 1 },
      ],
    })

    expect(group.items.map((item) => item.description)).toEqual(['Folgesitzung', 'Erstgespräch'])
    expect(group.items.map((item) => item.quantity)).toEqual([4, 1])
  })

  it('numbers positions from zero without gaps', async () => {
    const { first, follow } = await catalogue()
    const group = await createServiceGroup(db(), tenantId, {
      name: 'Paket',
      active: true,
      items: [
        { serviceId: first.id, quantity: 1 },
        { serviceId: follow.id, quantity: 2 },
      ],
    })

    await updateServiceGroup(db(), tenantId, group.id, {
      name: 'Paket',
      active: true,
      items: [
        { serviceId: follow.id, quantity: 2 },
        { serviceId: first.id, quantity: 1 },
      ],
    })

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
    const group = await createServiceGroup(db(), tenantId, {
      name: 'Paket',
      active: true,
      items: [{ serviceId: first.id, quantity: 1 }],
    })

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
    const group = await createServiceGroup(db(), tenantId, {
      name: 'Paket',
      active: true,
      items: [{ serviceId: first.id, quantity: 1 }],
    })

    await updateService(
      db(),
      tenantId,
      first.id,
      serviceInput({ description: 'Erstgespräch', active: false }),
    )
    const reloaded = await getServiceGroup(db(), tenantId, group.id)

    expect(reloaded?.items[0]?.serviceActive).toBe(false)
  })

  it('refuses a service from another tenant', async () => {
    const otherTenant = await createTenant(db(), 'Mandant B')
    const foreign = await createService(db(), otherTenant, serviceInput())

    await expect(
      createServiceGroup(db(), tenantId, {
        name: 'Paket',
        active: true,
        items: [{ serviceId: foreign.id, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(UnknownServiceError)
  })

  it('refuses a service id that does not exist', async () => {
    await expect(
      createServiceGroup(db(), tenantId, {
        name: 'Paket',
        active: true,
        items: [{ serviceId: newId(), quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(UnknownServiceError)
  })

  it('hides inactive groups unless asked for them', async () => {
    await createServiceGroup(db(), tenantId, { name: 'Aktuell', active: true, items: [] })
    await createServiceGroup(db(), tenantId, { name: 'Eingestellt', active: false, items: [] })

    expect(await listServiceGroups(db(), tenantId, active)).toHaveLength(1)
    expect(await listServiceGroups(db(), tenantId, all)).toHaveLength(2)
  })

  it('keeps group names unique per tenant', async () => {
    await createServiceGroup(db(), tenantId, { name: 'Paket', active: true, items: [] })

    await expect(
      createServiceGroup(db(), tenantId, { name: 'Paket', active: true, items: [] }),
    ).rejects.toThrow()
  })

  it('leaves the services alone when a group is emptied', async () => {
    const { first } = await catalogue()
    const group = await createServiceGroup(db(), tenantId, {
      name: 'Paket',
      active: true,
      items: [{ serviceId: first.id, quantity: 1 }],
    })

    await updateServiceGroup(db(), tenantId, group.id, { name: 'Paket', active: true, items: [] })

    expect(await getService(db(), tenantId, first.id)).not.toBeNull()
  })

  it('does not reach into another tenant', async () => {
    const group = await createServiceGroup(db(), tenantId, {
      name: 'Paket',
      active: true,
      items: [],
    })
    const otherTenant = await createTenant(db(), 'Mandant B')

    expect(await getServiceGroup(db(), otherTenant, group.id)).toBeNull()
    expect(
      await updateServiceGroup(db(), otherTenant, group.id, {
        name: 'Umbenannt',
        active: true,
        items: [],
      }),
    ).toBeNull()
  })
})

describe('the catalogue holds no live references', () => {
  /**
   * CLAUDE.md rule 5: a service is a template. Nothing outside the catalogue
   * stores a group id, and this slice adds no path from a service to anything
   * that was already entered. The check is structural — if a later slice adds
   * such a column, this test is where it should be reconsidered.
   */
  it('is referenced only from service_group_item', async () => {
    const referencing = await db().execute<{ table_name: string; column_name: string }>(`
      select distinct
        tc.table_name,
        kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY'
        and ccu.table_name in ('service', 'service_group')
        and tc.table_name <> 'service_group_item'
    `)

    expect([...referencing]).toEqual([])
  })

  it('does not change an existing group entry when the catalogue is edited', async () => {
    const original = await createService(
      db(),
      tenantId,
      serviceInput({ description: 'Folgesitzung', defaultPriceCents: 9000 }),
    )
    const group = await createServiceGroup(db(), tenantId, {
      name: 'Paket',
      active: true,
      items: [{ serviceId: original.id, quantity: 2 }],
    })

    await updateService(
      db(),
      tenantId,
      original.id,
      serviceInput({ description: 'Folgesitzung', defaultPriceCents: 9900 }),
    )

    // The group holds a reference, not a copy — it is a selection helper, and
    // the copy happens in slice 4 when an activity item is created from it.
    const reloaded = await getServiceGroup(db(), tenantId, group.id)
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
    await createServiceGroup(db(), tenantId, {
      name: 'Paket',
      active: true,
      items: [{ serviceId: created.id, quantity: 1 }],
    })

    // There is no delete path in the domain; deactivation is the way. The
    // foreign key is what makes that stick even from psql.
    await expect(db().delete(service).where(eq(service.id, created.id))).rejects.toThrow()
  })

  it('removes the items when a group row is deleted', async () => {
    const created = await createService(db(), tenantId, serviceInput())
    const group = await createServiceGroup(db(), tenantId, {
      name: 'Paket',
      active: true,
      items: [{ serviceId: created.id, quantity: 1 }],
    })

    await db().delete(serviceGroup).where(eq(serviceGroup.id, group.id))

    expect(
      await db()
        .select()
        .from(serviceGroupItem)
        .where(eq(serviceGroupItem.serviceGroupId, group.id)),
    ).toEqual([])
  })
})
