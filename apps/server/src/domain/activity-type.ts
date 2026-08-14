import type { ActivityType, ActivityTypeCreate, ActivityTypeInput } from '@praxi/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Database, DbReader, Transaction } from '../db/client.js'
import { activityType, activityTypePresetItem, service } from '../db/schema.js'
import { newId } from '../id.js'
import { UnknownServiceError } from './service.js'

/**
 * The catalogue of activity types (CLAUDE.md rule 6).
 *
 * Shaped like the two catalogues of rule 4 in `contact-type.ts`, with one
 * difference: there are no system entries here. Nothing in the software
 * depends on a particular activity type existing, so every entry belongs to
 * the practitioner. What cannot be deleted is a type that is *in use* — the
 * foreign key from `activity` refuses, and `deleteActivityType` lets it,
 * because a type that has been used is history and deactivating it is the
 * answer.
 *
 * `code` is fixed once the entry exists, like everywhere else: it is the handle
 * `activity.type` points at, and the update schema does not carry one.
 *
 * The default duration and `presetItems` are **presets**. They are read when a
 * type is applied to an activity and never again; changing them here reaches
 * nothing that already exists (rule 5). This file therefore has no "re-apply
 * to existing activities" function, and must not grow one.
 */

const columns = {
  id: activityType.id,
  code: activityType.code,
  label: activityType.label,
  color: activityType.color,
  defaultDurationMin: activityType.defaultDurationMin,
  isDefault: activityType.isDefault,
  sortOrder: activityType.sortOrder,
  active: activityType.active,
}

/**
 * The presets of one or more types, joined to the catalogue so the settings
 * screen and the activity dialog do not each have to fetch the services
 * themselves — same shape as `itemsFor` in `service.ts`.
 */
async function presetItemsFor(
  reader: DbReader,
  typeIds: string[],
): Promise<Map<string, ActivityType['presetItems']>> {
  if (typeIds.length === 0) return new Map()

  const rows = await reader
    .select({
      typeId: activityTypePresetItem.activityTypeId,
      serviceId: activityTypePresetItem.serviceId,
      quantity: activityTypePresetItem.quantity,
      description: service.description,
      shortCode: service.shortCode,
      defaultPriceCents: service.defaultPriceCents,
      defaultDurationMin: service.defaultDurationMin,
      serviceActive: service.active,
    })
    .from(activityTypePresetItem)
    .innerJoin(service, eq(service.id, activityTypePresetItem.serviceId))
    .where(inArray(activityTypePresetItem.activityTypeId, typeIds))
    .orderBy(asc(activityTypePresetItem.position))

  const byType = new Map<string, ActivityType['presetItems']>()
  for (const { typeId, ...item } of rows) {
    const list = byType.get(typeId) ?? []
    list.push(item)
    byType.set(typeId, list)
  }
  return byType
}

async function loadType(
  reader: DbReader,
  tenantId: string,
  id: string,
): Promise<ActivityType | null> {
  const [row] = await reader
    .select(columns)
    .from(activityType)
    .where(and(eq(activityType.tenantId, tenantId), eq(activityType.id, id)))
    .limit(1)

  if (!row) return null

  const presetItems = await presetItemsFor(reader, [row.id])
  return { ...row, presetItems: presetItems.get(row.id) ?? [] }
}

export async function listActivityTypes(
  database: Database,
  tenantId: string,
  includeInactive: boolean,
): Promise<ActivityType[]> {
  const filters = [eq(activityType.tenantId, tenantId)]
  if (!includeInactive) filters.push(eq(activityType.active, true))

  const rows = await database
    .select(columns)
    .from(activityType)
    .where(and(...filters))
    .orderBy(asc(activityType.sortOrder), asc(activityType.label))

  const presetItems = await presetItemsFor(
    database,
    rows.map((row) => row.id),
  )

  return rows.map((row) => ({ ...row, presetItems: presetItems.get(row.id) ?? [] }))
}

/**
 * At most one default per tenant — `activity_type_default_key` says so — so
 * setting a new one has to clear the old one first, in the same transaction,
 * or the index rejects the write. Same shape as `text_template`.
 */
async function clearDefault(
  tx: Transaction,
  tenantId: string,
  input: ActivityTypeInput,
): Promise<void> {
  if (!input.isDefault) return
  await tx
    .update(activityType)
    .set({ isDefault: false })
    .where(and(eq(activityType.tenantId, tenantId), eq(activityType.isDefault, true)))
}

/**
 * Replaces a type's preset items wholesale — nothing here carries any history
 * worth preserving, so delete-and-insert is both simpler and correct, exactly
 * as `replaceItems` in `service.ts` does for a group. `position` is rewritten
 * from the array index, which is what keeps the order gapless.
 */
async function replacePresetItems(
  tx: Transaction,
  tenantId: string,
  activityTypeId: string,
  items: ActivityTypeInput['presetItems'],
): Promise<void> {
  await tx
    .delete(activityTypePresetItem)
    .where(eq(activityTypePresetItem.activityTypeId, activityTypeId))
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

  await tx.insert(activityTypePresetItem).values(
    items.map((item, index) => ({
      id: newId(),
      tenantId,
      activityTypeId,
      serviceId: item.serviceId,
      quantity: item.quantity,
      position: index,
    })),
  )
}

export async function createActivityType(
  database: Database,
  tenantId: string,
  input: ActivityTypeCreate,
): Promise<ActivityType> {
  return database.transaction(async (tx) => {
    await clearDefault(tx, tenantId, input)

    const [row] = await tx
      .insert(activityType)
      .values({
        id: newId(),
        tenantId,
        code: input.code,
        label: input.label,
        color: input.color,
        defaultDurationMin: input.defaultDurationMin,
        isDefault: input.isDefault,
        sortOrder: input.sortOrder,
        active: input.active,
      })
      .returning({ id: activityType.id })

    if (!row) throw new Error('insert returned no row')
    await replacePresetItems(tx, tenantId, row.id, input.presetItems)

    const created = await loadType(tx, tenantId, row.id)
    if (!created) throw new Error('activity type vanished within its own transaction')
    return created
  })
}

export async function updateActivityType(
  database: Database,
  tenantId: string,
  id: string,
  input: ActivityTypeInput,
): Promise<ActivityType | null> {
  return database.transaction(async (tx) => {
    await clearDefault(tx, tenantId, input)

    const [row] = await tx
      .update(activityType)
      .set({
        label: input.label,
        color: input.color,
        defaultDurationMin: input.defaultDurationMin,
        isDefault: input.isDefault,
        sortOrder: input.sortOrder,
        active: input.active,
      })
      .where(and(eq(activityType.tenantId, tenantId), eq(activityType.id, id)))
      .returning({ id: activityType.id })

    if (!row) return null

    await replacePresetItems(tx, tenantId, row.id, input.presetItems)
    return loadType(tx, tenantId, row.id)
  })
}

/** A type still used by an activity is refused by `activity_type_fk`, which
 *  the route turns into its own message. */
export async function deleteActivityType(
  database: Database,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const deleted = await database
    .delete(activityType)
    .where(and(eq(activityType.tenantId, tenantId), eq(activityType.id, id)))
    .returning({ id: activityType.id })

  return deleted.length > 0
}
