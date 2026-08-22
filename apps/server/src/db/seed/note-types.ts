/**
 * The note types every tenant starts with (L1).
 *
 * None of these entries has any standing: they are a starting point,
 * renamable and deletable like anything the practitioner adds, and no code
 * reads any of them. There is deliberately no undeletable entry — that was the
 * `is_system` mechanism migration 0035 took off the roles, and its only
 * justification is logic depending on a particular row. Nothing depends on a
 * note type. Without one, no note can be written; the screen says so and
 * points at the settings, which is the whole handling of that case.
 *
 * "Sitzung" sorts first because the note dialog preselects the first entry —
 * an order can carry that decision, so there is no is_default flag.
 *
 * `Nachtrag` is not here and is not a type anymore: an addendum is a note with
 * a `corrects_note_id`, and it carries a type of its own like every other.
 *
 * Idempotent: an entry that already exists keeps what it has. Migration 0038
 * carries a frozen copy for the tenant that existed when it ran — this file is
 * the living definition.
 */
import { newId } from '../../id.js'
import type { Database } from '../client.js'
import { noteType } from '../schema.js'

const NOTE_TYPES = [
  { label: 'Sitzung', showAsTab: true, sortOrder: 10 },
  { label: 'Allgemein', showAsTab: true, sortOrder: 20 },
  { label: 'Dokument', showAsTab: true, sortOrder: 30 },
  { label: 'Korrespondenz', showAsTab: true, sortOrder: 40 },
  { label: 'Sonstiges', showAsTab: true, sortOrder: 50 },
] as const

export async function seedNoteTypes(database: Database, tenantId: string): Promise<void> {
  for (const entry of NOTE_TYPES) {
    await database
      .insert(noteType)
      .values({ id: newId(), tenantId, ...entry })
      .onConflictDoNothing({ target: [noteType.tenantId, noteType.label] })
  }
}
