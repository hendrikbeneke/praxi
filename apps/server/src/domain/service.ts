import type {
  CatalogueListQuery,
  Service,
  ServiceGroup,
  ServiceGroupInput,
  ServiceInput,
} from '@praxi/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Database, DbReader, Transaction } from '../db/client.js'
import {
  activityItem,
  activityTypePresetItem,
  service,
  serviceGroup,
  serviceGroupItem,
} from '../db/schema.js'
import { newId } from '../id.js'
import { moveInList } from './reorder.js'

/**
 * The catalogue. Everything here is a template store — see CLAUDE.md rule 5.
 * There is deliberately no pricing logic and no history: nothing in this file
 * reaches into an activity or an invoice, now or later.
 */

/** A group, or an activity type's preset, may not reference a service of
 *  another tenant, and the composite foreign key says so — but a clear error
 *  beats a constraint violation. */
export class UnknownServiceError extends Error {
  constructor() {
    super('reference to a service that does not exist in this tenant')
    this.name = 'UnknownServiceError'
  }
}

/** Which of the three tables a service is still referenced from — D5 needs
 *  this broken out because "wird verwendet" without saying where is a
 *  message that does not help the practitioner act on it. */
export type ServiceUsage = {
  activity: boolean
  group: boolean
  preset: boolean
}

function usageIsEmpty(usage: ServiceUsage): boolean {
  return !usage.activity && !usage.group && !usage.preset
}

/** A service still referenced elsewhere is refused before the foreign keys
 *  even see it, so the message can name what stands in the way. */
export class ServiceInUseError extends Error {
  readonly usage: ServiceUsage

  constructor(usage: ServiceUsage) {
    super('service is referenced by an activity item, a group or a preset')
    this.name = 'ServiceInUseError'
    this.usage = usage
  }
}

/** A service group still referenced elsewhere — today that can only be its
 *  own items, which are removed along with it, so this exists for symmetry
 *  and for the day something outside the catalogue references a group. */
export class ServiceGroupInUseError extends Error {
  constructor() {
    super('service group is referenced outside its own items')
    this.name = 'ServiceGroupInUseError'
  }
}

const serviceColumns = {
  id: service.id,
  shortCode: service.shortCode,
  description: service.description,
  feeCode: service.feeCode,
  defaultPriceCents: service.defaultPriceCents,
  defaultDurationMin: service.defaultDurationMin,
  sortOrder: service.sortOrder,
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
    .orderBy(asc(service.sortOrder), asc(service.description))
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
    .select({
      id: serviceGroup.id,
      name: serviceGroup.name,
      sortOrder: serviceGroup.sortOrder,
      active: serviceGroup.active,
    })
    .from(serviceGroup)
    .where(and(...filters))
    .orderBy(asc(serviceGroup.sortOrder), asc(serviceGroup.name))

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
    .select({
      id: serviceGroup.id,
      name: serviceGroup.name,
      sortOrder: serviceGroup.sortOrder,
      active: serviceGroup.active,
    })
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
    await tx.insert(serviceGroup).values({
      id,
      tenantId,
      name: input.name,
      sortOrder: input.sortOrder,
      active: input.active,
    })
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
      .set({ name: input.name, sortOrder: input.sortOrder, active: input.active })
      .where(and(eq(serviceGroup.tenantId, tenantId), eq(serviceGroup.id, id)))
      .returning({ id: serviceGroup.id })

    if (!existing) return null

    await replaceItems(tx, tenantId, id, input.items)
    return loadGroup(tx, tenantId, id)
  })
}

/**
 * Where a service is still referenced, if anywhere — checked in the domain so
 * the message can name every place rather than surfacing a constraint name or
 * a bare "in use". The foreign keys from all three tables stay in place as
 * the actual guarantee; this only runs ahead of them, for the sentence.
 */
async function serviceUsage(reader: DbReader, tenantId: string, id: string): Promise<ServiceUsage> {
  const [usedByActivity, usedByGroup, usedByPreset] = await Promise.all([
    reader
      .select({ id: activityItem.id })
      .from(activityItem)
      .where(and(eq(activityItem.tenantId, tenantId), eq(activityItem.serviceId, id)))
      .limit(1),
    reader
      .select({ id: serviceGroupItem.id })
      .from(serviceGroupItem)
      .where(and(eq(serviceGroupItem.tenantId, tenantId), eq(serviceGroupItem.serviceId, id)))
      .limit(1),
    reader
      .select({ id: activityTypePresetItem.id })
      .from(activityTypePresetItem)
      .where(
        and(
          eq(activityTypePresetItem.tenantId, tenantId),
          eq(activityTypePresetItem.serviceId, id),
        ),
      )
      .limit(1),
  ])

  return {
    activity: usedByActivity.length > 0,
    group: usedByGroup.length > 0,
    preset: usedByPreset.length > 0,
  }
}

/** Deletable once nothing references it; deactivation is the answer while it
 *  is still used anywhere. `false` if the id does not exist in this tenant. */
export async function deleteService(
  database: Database,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const usage = await serviceUsage(database, tenantId, id)
  if (!usageIsEmpty(usage)) throw new ServiceInUseError(usage)

  const deleted = await database
    .delete(service)
    .where(and(eq(service.tenantId, tenantId), eq(service.id, id)))
    .returning({ id: service.id })

  return deleted.length > 0
}

/**
 * Whether a group is referenced anywhere outside its own items — always
 * `false` today, deliberately: since D1, an activity type's presets reference
 * services directly and never a group (CLAUDE.md rule 5), so nothing but
 * `service_group_item` — the group's own, cascade-deleted rows — ever carries
 * a `service_group_id`. Kept as its own function, in the same shape as
 * `serviceIsInUse`, so the day a table does reference a group, the check has
 * somewhere to go rather than needing to be invented from scratch.
 */
async function serviceGroupIsInUse(
  _reader: DbReader,
  _tenantId: string,
  _id: string,
): Promise<boolean> {
  return false
}

/** Deletable once nothing references it — see `serviceGroupIsInUse`. `false`
 *  if the id does not exist in this tenant. */
export async function deleteServiceGroup(
  database: Database,
  tenantId: string,
  id: string,
): Promise<boolean> {
  if (await serviceGroupIsInUse(database, tenantId, id)) throw new ServiceGroupInUseError()

  const deleted = await database
    .delete(serviceGroup)
    .where(and(eq(serviceGroup.tenantId, tenantId), eq(serviceGroup.id, id)))
    .returning({ id: serviceGroup.id })

  return deleted.length > 0
}

/** Swaps with the neighbour `delta` steps away and renumbers the whole list
 *  gaplessly, in one transaction — see `domain/reorder.ts`. */
export function moveService(
  database: Database,
  tenantId: string,
  id: string,
  delta: 1 | -1,
): Promise<boolean> {
  return moveInList(database, tenantId, id, delta, {
    list: (reader, tid) =>
      reader
        .select({ id: service.id, sortOrder: service.sortOrder })
        .from(service)
        .where(eq(service.tenantId, tid))
        .orderBy(asc(service.sortOrder), asc(service.description)),
    setSortOrder: async (tx, rowId, sortOrder) => {
      await tx.update(service).set({ sortOrder }).where(eq(service.id, rowId))
    },
  })
}

/** Swaps with the neighbour `delta` steps away and renumbers the whole list
 *  gaplessly, in one transaction — see `domain/reorder.ts`. */
export function moveServiceGroup(
  database: Database,
  tenantId: string,
  id: string,
  delta: 1 | -1,
): Promise<boolean> {
  return moveInList(database, tenantId, id, delta, {
    list: (reader, tid) =>
      reader
        .select({ id: serviceGroup.id, sortOrder: serviceGroup.sortOrder })
        .from(serviceGroup)
        .where(eq(serviceGroup.tenantId, tid))
        .orderBy(asc(serviceGroup.sortOrder), asc(serviceGroup.name)),
    setSortOrder: async (tx, rowId, sortOrder) => {
      await tx.update(serviceGroup).set({ sortOrder }).where(eq(serviceGroup.id, rowId))
    },
  })
}
