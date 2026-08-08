import type {
  CatalogueListQuery,
  Service,
  ServiceGroup,
  ServiceGroupInput,
  ServiceInput,
} from '@praxi/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Database, DbReader, Transaction } from '../db/client.js'
import { service, serviceGroup, serviceGroupItem } from '../db/schema.js'
import { newId } from '../id.js'

/**
 * The catalogue. Everything here is a template store — see CLAUDE.md rule 5.
 * There is deliberately no pricing logic and no history: nothing in this file
 * reaches into an activity or an invoice, now or later.
 */

/** A group may not reference a service of another tenant, and the composite
 *  foreign key says so — but a clear error beats a constraint violation. */
export class UnknownServiceError extends Error {
  constructor() {
    super('service group references a service that does not exist in this tenant')
    this.name = 'UnknownServiceError'
  }
}

const serviceColumns = {
  id: service.id,
  shortCode: service.shortCode,
  description: service.description,
  feeCode: service.feeCode,
  defaultPriceCents: service.defaultPriceCents,
  defaultDurationMin: service.defaultDurationMin,
  active: service.active,
}

export async function listServices(
  database: Database,
  tenantId: string,
  query: CatalogueListQuery,
): Promise<Service[]> {
  const filters = [eq(service.tenantId, tenantId)]
  // This is what keeps deactivated entries out of every selection list.
  if (!query.includeInactive) filters.push(eq(service.active, true))

  return database
    .select(serviceColumns)
    .from(service)
    .where(and(...filters))
    .orderBy(asc(service.description))
}

export async function getService(
  database: Database,
  tenantId: string,
  id: string,
): Promise<Service | null> {
  const [row] = await database
    .select(serviceColumns)
    .from(service)
    .where(and(eq(service.tenantId, tenantId), eq(service.id, id)))
    .limit(1)

  return row ?? null
}

export async function createService(
  database: Database,
  tenantId: string,
  input: ServiceInput,
): Promise<Service> {
  const [row] = await database
    .insert(service)
    .values({ id: newId(), tenantId, ...input })
    .returning(serviceColumns)

  if (!row) throw new Error('insert returned no row')
  return row
}

export async function updateService(
  database: Database,
  tenantId: string,
  id: string,
  input: ServiceInput,
): Promise<Service | null> {
  const [row] = await database
    .update(service)
    .set(input)
    .where(and(eq(service.tenantId, tenantId), eq(service.id, id)))
    .returning(serviceColumns)

  return row ?? null
}

/**
 * Groups are loaded with their items joined to the catalogue, so the editor
 * and the picker do not each have to fetch the services themselves.
 *
 * `serviceActive` comes along on purpose: a group may well contain a service
 * that has since been deactivated, and the UI has to be able to say so rather
 * than quietly showing a stale price.
 */
async function itemsFor(
  reader: DbReader,
  groupIds: string[],
): Promise<Map<string, ServiceGroup['items']>> {
  if (groupIds.length === 0) return new Map()

  const rows = await reader
    .select({
      groupId: serviceGroupItem.serviceGroupId,
      serviceId: serviceGroupItem.serviceId,
      quantity: serviceGroupItem.quantity,
      description: service.description,
      shortCode: service.shortCode,
      defaultPriceCents: service.defaultPriceCents,
      defaultDurationMin: service.defaultDurationMin,
      serviceActive: service.active,
    })
    .from(serviceGroupItem)
    .innerJoin(service, eq(service.id, serviceGroupItem.serviceId))
    .where(inArray(serviceGroupItem.serviceGroupId, groupIds))
    .orderBy(asc(serviceGroupItem.position))

  const byGroup = new Map<string, ServiceGroup['items']>()
  for (const { groupId, ...item } of rows) {
    const list = byGroup.get(groupId) ?? []
    list.push(item)
    byGroup.set(groupId, list)
  }
  return byGroup
}

export async function listServiceGroups(
  database: Database,
  tenantId: string,
  query: CatalogueListQuery,
): Promise<ServiceGroup[]> {
  const filters = [eq(serviceGroup.tenantId, tenantId)]
  if (!query.includeInactive) filters.push(eq(serviceGroup.active, true))

  const groups = await database
    .select({ id: serviceGroup.id, name: serviceGroup.name, active: serviceGroup.active })
    .from(serviceGroup)
    .where(and(...filters))
    .orderBy(asc(serviceGroup.name))

  const items = await itemsFor(
    database,
    groups.map((group) => group.id),
  )

  return groups.map((group) => ({ ...group, items: items.get(group.id) ?? [] }))
}

async function loadGroup(
  reader: DbReader,
  tenantId: string,
  id: string,
): Promise<ServiceGroup | null> {
  const [row] = await reader
    .select({ id: serviceGroup.id, name: serviceGroup.name, active: serviceGroup.active })
    .from(serviceGroup)
    .where(and(eq(serviceGroup.tenantId, tenantId), eq(serviceGroup.id, id)))
    .limit(1)

  if (!row) return null

  const items = await itemsFor(reader, [row.id])
  return { ...row, items: items.get(row.id) ?? [] }
}

export function getServiceGroup(
  database: Database,
  tenantId: string,
  id: string,
): Promise<ServiceGroup | null> {
  return loadGroup(database, tenantId, id)
}

/**
 * Replaces the group's items wholesale.
 *
 * Unlike the roles on a contact, these rows carry nothing worth preserving —
 * no date, no history — so delete-and-insert is both simpler and correct here.
 * `position` is rewritten from the array index, which is what keeps the order
 * gapless without a unique constraint to fight.
 */
async function replaceItems(
  tx: Transaction,
  tenantId: string,
  groupId: string,
  items: ServiceGroupInput['items'],
): Promise<void> {
  await tx.delete(serviceGroupItem).where(eq(serviceGroupItem.serviceGroupId, groupId))
  if (items.length === 0) return

  const known = await tx
    .select({ id: service.id })
    .from(service)
    .where(
      and(
        eq(service.tenantId, tenantId),
        inArray(
          service.id,
          items.map((item) => item.serviceId),
        ),
      ),
    )

  if (known.length !== items.length) throw new UnknownServiceError()

  await tx.insert(serviceGroupItem).values(
    items.map((item, index) => ({
      id: newId(),
      tenantId,
      serviceGroupId: groupId,
      serviceId: item.serviceId,
      quantity: item.quantity,
      position: index,
    })),
  )
}

export async function createServiceGroup(
  database: Database,
  tenantId: string,
  input: ServiceGroupInput,
): Promise<ServiceGroup> {
  return database.transaction(async (tx) => {
    const id = newId()
    await tx.insert(serviceGroup).values({ id, tenantId, name: input.name, active: input.active })
    await replaceItems(tx, tenantId, id, input.items)

    const created = await loadGroup(tx, tenantId, id)
    if (!created) throw new Error('service group vanished within its own transaction')
    return created
  })
}

export async function updateServiceGroup(
  database: Database,
  tenantId: string,
  id: string,
  input: ServiceGroupInput,
): Promise<ServiceGroup | null> {
  return database.transaction(async (tx) => {
    const [existing] = await tx
      .update(serviceGroup)
      .set({ name: input.name, active: input.active })
      .where(and(eq(serviceGroup.tenantId, tenantId), eq(serviceGroup.id, id)))
      .returning({ id: serviceGroup.id })

    if (!existing) return null

    await replaceItems(tx, tenantId, id, input.items)
    return loadGroup(tx, tenantId, id)
  })
}
