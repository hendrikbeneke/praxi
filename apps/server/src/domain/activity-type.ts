import type { ActivityType, ActivityTypeCreate, ActivityTypeInput } from '@praxi/shared'
import { and, asc, eq } from 'drizzle-orm'
import type { Database, Transaction } from '../db/client.js'
import { activityType } from '../db/schema.js'
import { newId } from '../id.js'

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
 * The default duration and the default service or group are **presets**. They
 * are read when a type is applied to an activity and never again; changing
 * them here reaches nothing that already exists (rule 5). This file therefore
 * has no "re-apply to existing activities" function, and must not grow one.
 */

const columns = {
  id: activityType.id,
  code: activityType.code,
  label: activityType.label,
  color: activityType.color,
  defaultDurationMin: activityType.defaultDurationMin,
  defaultServiceId: activityType.defaultServiceId,
  defaultServiceGroupId: activityType.defaultServiceGroupId,
  isDefault: activityType.isDefault,
  sortOrder: activityType.sortOrder,
  active: activityType.active,
}

export async function listActivityTypes(
  database: Database,
  tenantId: string,
  includeInactive: boolean,
): Promise<ActivityType[]> {
  const filters = [eq(activityType.tenantId, tenantId)]
  if (!includeInactive) filters.push(eq(activityType.active, true))

  return database
    .select(columns)
    .from(activityType)
    .where(and(...filters))
    .orderBy(asc(activityType.sortOrder), asc(activityType.label))
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

export async function createActivityType(
  database: Database,
  tenantId: string,
  input: ActivityTypeCreate,
): Promise<ActivityType> {
  return database.transaction(async (tx) => {
    await clearDefault(tx, tenantId, input)

    const [row] = await tx
      .insert(activityType)
      .values({ id: newId(), tenantId, ...input })
      .returning(columns)

    if (!row) throw new Error('insert returned no row')
    return row
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
      .set(input)
      .where(and(eq(activityType.tenantId, tenantId), eq(activityType.id, id)))
      .returning(columns)

    return row ?? null
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
