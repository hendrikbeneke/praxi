import type { TextTemplate, TextTemplateInput } from '@praxi/shared'
import { and, asc, eq } from 'drizzle-orm'
import type { Database, Transaction } from '../db/client.js'
import { textTemplate } from '../db/schema.js'
import { newId } from '../id.js'
import { moveInList } from './reorder.js'

/**
 * The intro and outro blocks. A catalogue like `service`, and template-shaped
 * for the same reason: picking one copies its body onto the draft, and nothing
 * ever holds a reference back. Editing a block here leaves every invoice that
 * already exists untouched.
 */

const columns = {
  id: textTemplate.id,
  kind: textTemplate.kind,
  name: textTemplate.name,
  body: textTemplate.body,
  isDefault: textTemplate.isDefault,
  isPaidVariant: textTemplate.isPaidVariant,
  sortOrder: textTemplate.sortOrder,
  active: textTemplate.active,
}

export async function listTextTemplates(
  database: Database,
  tenantId: string,
  includeInactive: boolean,
): Promise<TextTemplate[]> {
  const filters = [eq(textTemplate.tenantId, tenantId)]
  if (!includeInactive) filters.push(eq(textTemplate.active, true))

  return database
    .select(columns)
    .from(textTemplate)
    .where(and(...filters))
    .orderBy(asc(textTemplate.kind), asc(textTemplate.sortOrder), asc(textTemplate.name))
}

/**
 * Only one default per kind and one paid variant in total — partial unique
 * indexes say so. Setting a new one therefore has to clear the old one first,
 * in the same transaction, or the index rejects the write.
 */
async function clearFlags(
  tx: Transaction,
  tenantId: string,
  input: TextTemplateInput,
): Promise<void> {
  if (input.isDefault) {
    await tx
      .update(textTemplate)
      .set({ isDefault: false })
      .where(and(eq(textTemplate.tenantId, tenantId), eq(textTemplate.kind, input.kind)))
  }
  if (input.isPaidVariant) {
    await tx
      .update(textTemplate)
      .set({ isPaidVariant: false })
      .where(eq(textTemplate.tenantId, tenantId))
  }
}

export async function createTextTemplate(
  database: Database,
  tenantId: string,
  input: TextTemplateInput,
): Promise<TextTemplate> {
  return database.transaction(async (tx) => {
    await clearFlags(tx, tenantId, input)

    const [row] = await tx
      .insert(textTemplate)
      .values({ id: newId(), tenantId, ...input })
      .returning(columns)

    if (!row) throw new Error('insert returned no row')
    return row
  })
}

export async function updateTextTemplate(
  database: Database,
  tenantId: string,
  id: string,
  input: TextTemplateInput,
): Promise<TextTemplate | null> {
  return database.transaction(async (tx) => {
    await clearFlags(tx, tenantId, input)

    const [row] = await tx
      .update(textTemplate)
      .set(input)
      .where(and(eq(textTemplate.tenantId, tenantId), eq(textTemplate.id, id)))
      .returning(columns)

    return row ?? null
  })
}

export async function deleteTextTemplate(
  database: Database,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const deleted = await database
    .delete(textTemplate)
    .where(and(eq(textTemplate.tenantId, tenantId), eq(textTemplate.id, id)))
    .returning({ id: textTemplate.id })

  return deleted.length > 0
}

/** Swaps with the neighbour `delta` steps away and renumbers the whole list
 *  gaplessly, in one transaction — see `domain/reorder.ts`. Order is kept
 *  within a `kind` (intro/outro), matching `listTextTemplates`. */
export function moveTextTemplate(
  database: Database,
  tenantId: string,
  id: string,
  delta: 1 | -1,
): Promise<boolean> {
  return moveInList(database, tenantId, id, delta, {
    list: async (reader, tid) => {
      const [current] = await reader
        .select({ kind: textTemplate.kind })
        .from(textTemplate)
        .where(and(eq(textTemplate.tenantId, tid), eq(textTemplate.id, id)))
        .limit(1)
      if (!current) return []

      return reader
        .select({ id: textTemplate.id, sortOrder: textTemplate.sortOrder })
        .from(textTemplate)
        .where(and(eq(textTemplate.tenantId, tid), eq(textTemplate.kind, current.kind)))
        .orderBy(asc(textTemplate.sortOrder), asc(textTemplate.name))
    },
    setSortOrder: async (tx, rowId, sortOrder) => {
      await tx.update(textTemplate).set({ sortOrder }).where(eq(textTemplate.id, rowId))
    },
  })
}
