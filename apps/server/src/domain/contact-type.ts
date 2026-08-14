import type {
  ContactRelationType,
  ContactRelationTypeCreate,
  ContactRelationTypeInput,
  ContactRoleType,
  ContactRoleTypeCreate,
  ContactRoleTypeInput,
} from '@praxi/shared'
import { and, asc, eq } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { contactRelation, contactRelationType, contactRoleType } from '../db/schema.js'
import { newId } from '../id.js'
import { moveInList } from './reorder.js'

/**
 * The two catalogues behind CLAUDE.md rule 4: which roles a contact can hold,
 * and which relations can exist between two contacts. Both are maintained by
 * the practitioner, because the set of roles this practice needs is not known
 * up front.
 *
 * Entries flagged `is_system` are the ones logic is allowed to depend on. They
 * cannot be deleted and their `code` cannot change — enforced here so the
 * message is readable, and by the `protect_system_type` trigger so it also
 * holds for anything that goes around this file. `is_system` appears in no
 * input schema; only the seed sets it.
 *
 * A `code` never changes, for system and non-system entries alike: it is the
 * handle other rows point at, and the update schemas simply do not carry one.
 * A typo is fixed by deleting the unused entry and adding it again.
 */

export class SystemTypeError extends Error {
  constructor() {
    super('system entry is not deletable')
    this.name = 'SystemTypeError'
  }
}

const roleColumns = {
  id: contactRoleType.id,
  code: contactRoleType.code,
  label: contactRoleType.label,
  isSystem: contactRoleType.isSystem,
  showAsTab: contactRoleType.showAsTab,
  sortOrder: contactRoleType.sortOrder,
  active: contactRoleType.active,
}

const relationColumns = {
  id: contactRelationType.id,
  code: contactRelationType.code,
  labelForward: contactRelationType.labelForward,
  labelInverse: contactRelationType.labelInverse,
  isSymmetric: contactRelationType.isSymmetric,
  isExclusive: contactRelationType.isExclusive,
  isSystem: contactRelationType.isSystem,
  sortOrder: contactRelationType.sortOrder,
  active: contactRelationType.active,
}

// ---------------------------------------------------------------- role types

export async function listRoleTypes(
  database: Database,
  tenantId: string,
  includeInactive: boolean,
): Promise<ContactRoleType[]> {
  const filters = [eq(contactRoleType.tenantId, tenantId)]
  if (!includeInactive) filters.push(eq(contactRoleType.active, true))

  return database
    .select(roleColumns)
    .from(contactRoleType)
    .where(and(...filters))
    .orderBy(asc(contactRoleType.sortOrder), asc(contactRoleType.label))
}

export async function createRoleType(
  database: Database,
  tenantId: string,
  input: ContactRoleTypeCreate,
): Promise<ContactRoleType> {
  const [row] = await database
    .insert(contactRoleType)
    .values({ id: newId(), tenantId, ...input })
    .returning(roleColumns)

  if (!row) throw new Error('insert returned no row')
  return row
}

export async function updateRoleType(
  database: Database,
  tenantId: string,
  id: string,
  input: ContactRoleTypeInput,
): Promise<ContactRoleType | null> {
  const [row] = await database
    .update(contactRoleType)
    .set(input)
    .where(and(eq(contactRoleType.tenantId, tenantId), eq(contactRoleType.id, id)))
    .returning(roleColumns)

  return row ?? null
}

/** Refuses a system entry. An entry still assigned to a contact is refused by
 *  the foreign key, which the route turns into its own message. */
export async function deleteRoleType(
  database: Database,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const [existing] = await database
    .select({ isSystem: contactRoleType.isSystem })
    .from(contactRoleType)
    .where(and(eq(contactRoleType.tenantId, tenantId), eq(contactRoleType.id, id)))
    .limit(1)

  if (!existing) return false
  if (existing.isSystem) throw new SystemTypeError()

  const deleted = await database
    .delete(contactRoleType)
    .where(and(eq(contactRoleType.tenantId, tenantId), eq(contactRoleType.id, id)))
    .returning({ id: contactRoleType.id })

  return deleted.length > 0
}

/** Swaps with the neighbour `delta` steps away and renumbers the whole list
 *  gaplessly, in one transaction — see `domain/reorder.ts`. */
export function moveRoleType(
  database: Database,
  tenantId: string,
  id: string,
  delta: 1 | -1,
): Promise<boolean> {
  return moveInList(database, tenantId, id, delta, {
    list: (reader, tid) =>
      reader
        .select({ id: contactRoleType.id, sortOrder: contactRoleType.sortOrder })
        .from(contactRoleType)
        .where(eq(contactRoleType.tenantId, tid))
        .orderBy(asc(contactRoleType.sortOrder), asc(contactRoleType.label)),
    setSortOrder: async (tx, rowId, sortOrder) => {
      await tx.update(contactRoleType).set({ sortOrder }).where(eq(contactRoleType.id, rowId))
    },
  })
}

// ------------------------------------------------------------ relation types

export async function listRelationTypes(
  database: Database,
  tenantId: string,
  includeInactive: boolean,
): Promise<ContactRelationType[]> {
  const filters = [eq(contactRelationType.tenantId, tenantId)]
  if (!includeInactive) filters.push(eq(contactRelationType.active, true))

  return database
    .select(relationColumns)
    .from(contactRelationType)
    .where(and(...filters))
    .orderBy(asc(contactRelationType.sortOrder), asc(contactRelationType.labelForward))
}

export async function createRelationType(
  database: Database,
  tenantId: string,
  input: ContactRelationTypeCreate,
): Promise<ContactRelationType> {
  const [row] = await database
    .insert(contactRelationType)
    .values({ id: newId(), tenantId, ...input })
    .returning(relationColumns)

  if (!row) throw new Error('insert returned no row')
  return row
}

export async function updateRelationType(
  database: Database,
  tenantId: string,
  id: string,
  input: ContactRelationTypeInput,
): Promise<ContactRelationType | null> {
  return database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ code: contactRelationType.code, isExclusive: contactRelationType.isExclusive })
      .from(contactRelationType)
      .where(and(eq(contactRelationType.tenantId, tenantId), eq(contactRelationType.id, id)))
      .limit(1)

    if (!existing) return null

    const [row] = await tx
      .update(contactRelationType)
      .set(input)
      .where(and(eq(contactRelationType.tenantId, tenantId), eq(contactRelationType.id, id)))
      .returning(relationColumns)

    if (existing.isExclusive !== input.isExclusive) {
      /**
       * Rewrite the mirrored flag on this type's relations. The value written
       * here is irrelevant — `contact_relation_set_exclusive` recomputes it
       * from the type row, which this transaction has already updated. The
       * point is that the rows are touched at all.
       *
       * Switching a type to exclusive while some contact already holds two
       * relations of it is rejected right here by
       * `contact_relation_exclusive_key`, and the whole edit rolls back. That
       * check comes for free and is the reason the mirror is worth having.
       */
      await tx
        .update(contactRelation)
        .set({ exclusive: input.isExclusive })
        .where(
          and(
            eq(contactRelation.tenantId, tenantId),
            eq(contactRelation.relationCode, existing.code),
          ),
        )
    }

    return row ?? null
  })
}

export async function deleteRelationType(
  database: Database,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const [existing] = await database
    .select({ isSystem: contactRelationType.isSystem })
    .from(contactRelationType)
    .where(and(eq(contactRelationType.tenantId, tenantId), eq(contactRelationType.id, id)))
    .limit(1)

  if (!existing) return false
  if (existing.isSystem) throw new SystemTypeError()

  const deleted = await database
    .delete(contactRelationType)
    .where(and(eq(contactRelationType.tenantId, tenantId), eq(contactRelationType.id, id)))
    .returning({ id: contactRelationType.id })

  return deleted.length > 0
}

/** Swaps with the neighbour `delta` steps away and renumbers the whole list
 *  gaplessly, in one transaction — see `domain/reorder.ts`. */
export function moveRelationType(
  database: Database,
  tenantId: string,
  id: string,
  delta: 1 | -1,
): Promise<boolean> {
  return moveInList(database, tenantId, id, delta, {
    list: (reader, tid) =>
      reader
        .select({ id: contactRelationType.id, sortOrder: contactRelationType.sortOrder })
        .from(contactRelationType)
        .where(eq(contactRelationType.tenantId, tid))
        .orderBy(asc(contactRelationType.sortOrder), asc(contactRelationType.labelForward)),
    setSortOrder: async (tx, rowId, sortOrder) => {
      await tx
        .update(contactRelationType)
        .set({ sortOrder })
        .where(eq(contactRelationType.id, rowId))
    },
  })
}
