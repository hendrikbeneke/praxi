import type { NoteType, NoteTypeInput } from '@praxi/shared'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { note, noteType } from '../db/schema.js'
import { newId } from '../id.js'
import { moveInList } from './reorder.js'

/**
 * The catalogue of note types (L1, migration 0038). `note.type` was a check
 * constraint over six fixed values until then; how a practice files its
 * documentation is its own business, so the practitioner maintains it.
 *
 * Built like `contact_role_type` after 0035: no `code` as an anchor, so a
 * label stays renamable and every note follows, and no `active` flag, because
 * the assignment is one column at the note with nothing hanging off it — a
 * type can always be swapped out on an open note, and a locked one is closed
 * to every change anyway. There is no dead end here for a flag to manage,
 * unlike a service, which can never be taken off a finalized invoice.
 *
 * An empty catalogue is a legitimate state and needs no guard: a note cannot
 * be written without a type, the screen says so and points at the settings.
 * Whoever deletes the last entry has done it.
 *
 * Its own module rather than an entry in `value-list.ts`, which is "the three
 * lists behind a contact's own fields" — a note type is none of those, and the
 * table it counts holders in is a different one.
 */

/** A type some note still carries. Counted rather than left to the foreign
 *  key, so the message can say how many — "change them first" without a number
 *  sends the practitioner through the whole documentation. */
export class NoteTypeInUseError extends Error {
  constructor(readonly count: number) {
    super(`note type is carried by ${count} notes`)
    this.name = 'NoteTypeInUseError'
  }
}

const typeColumns = {
  id: noteType.id,
  label: noteType.label,
  showAsTab: noteType.showAsTab,
  sortOrder: noteType.sortOrder,
}

export function listNoteTypes(database: Database, tenantId: string): Promise<NoteType[]> {
  return database
    .select(typeColumns)
    .from(noteType)
    .where(eq(noteType.tenantId, tenantId))
    .orderBy(asc(noteType.sortOrder), asc(noteType.label))
}

export async function createNoteType(
  database: Database,
  tenantId: string,
  input: NoteTypeInput,
): Promise<NoteType> {
  const [row] = await database
    .insert(noteType)
    .values({ id: newId(), tenantId, ...input })
    .returning(typeColumns)

  if (!row) throw new Error('insert returned no row')
  return row
}

export async function updateNoteType(
  database: Database,
  tenantId: string,
  id: string,
  input: NoteTypeInput,
): Promise<NoteType | null> {
  const [row] = await database
    .update(noteType)
    .set(input)
    .where(and(eq(noteType.tenantId, tenantId), eq(noteType.id, id)))
    .returning(typeColumns)

  return row ?? null
}

/**
 * Deletes a type, unless a note still carries it.
 *
 * The foreign key would refuse it too and stays as the backstop, but it can
 * only name a constraint. Note that this reaches locked notes as well: a
 * locked note is immutable, so its type can never be moved out of the way —
 * the count is the answer, and it is a final one.
 */
export async function deleteNoteType(
  database: Database,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const [existing] = await database
    .select({ id: noteType.id })
    .from(noteType)
    .where(and(eq(noteType.tenantId, tenantId), eq(noteType.id, id)))
    .limit(1)

  if (!existing) return false

  const [held] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(note)
    .where(and(eq(note.tenantId, tenantId), eq(note.noteTypeId, id)))

  if (held && held.count > 0) throw new NoteTypeInUseError(held.count)

  const deleted = await database
    .delete(noteType)
    .where(and(eq(noteType.tenantId, tenantId), eq(noteType.id, id)))
    .returning({ id: noteType.id })

  return deleted.length > 0
}

/** Swaps with the neighbour `delta` steps away and renumbers the whole list
 *  gaplessly, in one transaction — see `domain/reorder.ts`. Ordered exactly as
 *  the listing above orders, so a move lines up with the screen. */
export function moveNoteType(
  database: Database,
  tenantId: string,
  id: string,
  delta: 1 | -1,
): Promise<boolean> {
  return moveInList(database, tenantId, id, delta, {
    list: (reader, tid) =>
      reader
        .select({ id: noteType.id, sortOrder: noteType.sortOrder })
        .from(noteType)
        .where(eq(noteType.tenantId, tid))
        .orderBy(asc(noteType.sortOrder), asc(noteType.label)),
    setSortOrder: async (tx, rowId, sortOrder) => {
      await tx.update(noteType).set({ sortOrder }).where(eq(noteType.id, rowId))
    },
  })
}
