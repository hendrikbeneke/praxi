import type { NoteDraft, NoteDraftInput, NoteDraftQuery } from '@praxi/shared'
import { NOTE_DRAFT_MAX_AGE_DAYS } from '@praxi/shared'
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { note, noteDraft } from '../db/schema.js'
import { newId } from '../id.js'

/**
 * The unsaved state of a note being written (L2, rule 7).
 *
 * A draft is not the note. Saving makes a note of it and deletes it;
 * cancelling leaves it lying, because the practitioner may come back. There is
 * exactly one draft per key — `(user, note)` for an existing note,
 * `(user, contact)` for one that does not exist yet — and the newer overwrites
 * the older. No versioning, no history, no merge.
 *
 * The user is always the caller's own. It comes from the session and is never
 * accepted from a payload, the same way `tenantId` is.
 */

export class DraftNoteLockedError extends Error {
  constructor() {
    super('a locked note has no draft')
    this.name = 'DraftNoteLockedError'
  }
}

const draftColumns = {
  id: noteDraft.id,
  contactId: noteDraft.contactId,
  noteId: noteDraft.noteId,
  correctsNoteId: noteDraft.correctsNoteId,
  activityId: noteDraft.activityId,
  noteTypeId: noteDraft.noteTypeId,
  noteDate: noteDraft.noteDate,
  text: noteDraft.text,
  updatedAt: noteDraft.updatedAt,
}

type DraftRow = Omit<NoteDraft, 'updatedAt'> & { updatedAt: Date }

function toDraft(row: DraftRow): NoteDraft {
  return { ...row, updatedAt: row.updatedAt.toISOString() }
}

/** Which row the key names: this note's draft, or the one for a new note at
 *  this contact. */
function keyOf(userId: string, query: NoteDraftQuery) {
  return query.noteId
    ? and(eq(noteDraft.userId, userId), eq(noteDraft.noteId, query.noteId))
    : and(
        eq(noteDraft.userId, userId),
        eq(noteDraft.contactId, query.contactId),
        isNull(noteDraft.noteId),
      )
}

/**
 * The draft for this form, or null.
 *
 * **A draft older than its note is not handed out.** It can only mean the note
 * was saved after the draft was written, so the draft is superseded — and that
 * is at the same time the net under deleting after saving: if a client loses
 * that call, the note it just wrote is newer, and the leftover never surfaces.
 * `deleteStaleNoteDrafts` collects it later.
 */
export async function getNoteDraft(
  database: Database,
  tenantId: string,
  userId: string,
  query: NoteDraftQuery,
): Promise<NoteDraft | null> {
  const [row] = await database
    .select(draftColumns)
    .from(noteDraft)
    .leftJoin(note, eq(note.id, noteDraft.noteId))
    .where(
      and(
        eq(noteDraft.tenantId, tenantId),
        keyOf(userId, query),
        or(isNull(noteDraft.noteId), sql`${noteDraft.updatedAt} > ${note.updatedAt}`),
      ),
    )
    .limit(1)

  return row ? toDraft(row) : null
}

/**
 * Writes the draft for this form, creating it or replacing what is there.
 *
 * One statement rather than select-then-write: two forms open at the same
 * contact would otherwise race, and the partial unique indexes would answer
 * with a constraint name instead of the newer text winning.
 */
export async function saveNoteDraft(
  database: Database,
  tenantId: string,
  userId: string,
  input: NoteDraftInput,
): Promise<NoteDraft> {
  if (input.noteId) {
    const [target] = await database
      .select({ lockedAt: note.lockedAt })
      .from(note)
      .where(and(eq(note.tenantId, tenantId), eq(note.id, input.noteId)))
      .limit(1)

    // The trigger refuses it too and stays as the backstop; the domain refuses
    // first so the answer is a sentence.
    if (target?.lockedAt) throw new DraftNoteLockedError()
  }

  const values = {
    tenantId,
    userId,
    contactId: input.contactId,
    noteId: input.noteId,
    correctsNoteId: input.correctsNoteId,
    activityId: input.activityId,
    noteTypeId: input.noteTypeId,
    noteDate: input.noteDate,
    text: input.text,
  }

  const [row] = await database
    .insert(noteDraft)
    .values({ id: newId(), ...values })
    .onConflictDoUpdate({
      target: input.noteId
        ? [noteDraft.userId, noteDraft.noteId]
        : [noteDraft.userId, noteDraft.contactId],
      targetWhere: input.noteId ? sql`${noteDraft.noteId} is not null` : isNull(noteDraft.noteId),
      set: values,
    })
    .returning(draftColumns)

  if (!row) throw new Error('upsert returned no row')
  return toDraft(row)
}

/** Discarding, and what "Speichern" does to the draft it came from. Scoped to
 *  the caller's own drafts: one user's id is never a handle on another's. */
export async function deleteNoteDraft(
  database: Database,
  tenantId: string,
  userId: string,
  id: string,
): Promise<boolean> {
  const deleted = await database
    .delete(noteDraft)
    .where(
      and(eq(noteDraft.tenantId, tenantId), eq(noteDraft.userId, userId), eq(noteDraft.id, id)),
    )
    .returning({ id: noteDraft.id })

  return deleted.length > 0
}

/**
 * Housekeeping at login, beside `deleteExpiredSessions` — two sweeps in one
 * statement, because both leave a row that can never be reached again:
 *
 * - **untouched for 30 days.** A draft nobody ever takes over would otherwise
 *   lie there forever, and it holds treatment documentation.
 * - **older than its note**, whatever its age: `getNoteDraft` already refuses
 *   to hand those out, so they are invisible from the moment they go stale.
 *
 * Returns how many went, for the test rather than for a log line.
 */
export async function deleteStaleNoteDrafts(database: Database, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - NOTE_DRAFT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000)

  const deleted = await database
    .delete(noteDraft)
    .where(
      or(
        lt(noteDraft.updatedAt, cutoff),
        sql`exists (select 1 from ${note} where ${note.id} = ${noteDraft.noteId}
              and ${note.updatedAt} >= ${noteDraft.updatedAt})`,
      ),
    )
    .returning({ id: noteDraft.id })

  return deleted.length
}
