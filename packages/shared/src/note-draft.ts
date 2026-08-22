import { z } from 'zod'

/**
 * The unsaved state of a note being written (L2).
 *
 * **A draft is not the note.** On an existing note the editor cannot write
 * into the row: what stands there is the last saved version, so writing into
 * it would make "Abbrechen" impossible, and a crash halfway through a
 * rephrasing would turn half a sentence into the valid documentation. So the
 * text under the cursor lives here until "Speichern" makes a note of it.
 *
 * That also settles what this is not: no versioning, no history, no merge.
 * There is always exactly one draft, and the newer overwrites the older.
 *
 * **The draft mirrors the form, gaps included.** `noteDate` and `noteTypeId`
 * may be empty, because a save running while the date field is briefly blank
 * during retyping must not fail — it would lose the text, which is the one
 * thing this exists to keep. Only `text` is required, and not blank: a draft
 * without text is not a draft, so emptying the field deletes it rather than
 * leaving a husk to be asked about later.
 */

/** The upper bound matches `noteInputSchema`: a draft may not hold more than
 *  the note it will become. */
const MAX_NOTE_TEXT = 20_000

export const noteDraftInputSchema = z.object({
  contactId: z.uuid(),
  /** Null while the note does not exist yet — the key is then the contact. */
  noteId: z.uuid().nullable().default(null),
  /**
   * Set while an addendum is being written. It belongs here for a reason
   * worth naming: an addendum is a *new* note, so it shares the one draft per
   * contact, and without this column accepting it back would silently produce
   * an ordinary note — twenty minutes of addendum losing the very thing that
   * made it one.
   */
  correctsNoteId: z.uuid().nullable().default(null),
  activityId: z.uuid().nullable().default(null),
  noteTypeId: z.uuid().nullable().default(null),
  noteDate: z.iso.date().nullable().default(null),
  text: z.string().trim().min(1).max(MAX_NOTE_TEXT),
})

export type NoteDraftInput = z.infer<typeof noteDraftInputSchema>

export const noteDraftSchema = z.object({
  id: z.uuid(),
  contactId: z.uuid(),
  noteId: z.uuid().nullable(),
  correctsNoteId: z.uuid().nullable(),
  activityId: z.uuid().nullable(),
  noteTypeId: z.uuid().nullable(),
  noteDate: z.iso.date().nullable(),
  text: z.string(),
  /** When it was last written — what the question on opening reports. */
  updatedAt: z.iso.datetime(),
})

export type NoteDraft = z.infer<typeof noteDraftSchema>

/** Which draft is meant: the one for this note, or the one for a new note at
 *  this contact. The user is never part of it — that comes from the session. */
export const noteDraftQuerySchema = z.object({
  contactId: z.uuid(),
  noteId: z.uuid().optional(),
})

export type NoteDraftQuery = z.infer<typeof noteDraftQuerySchema>

/**
 * How the editor saves: three seconds after the last keystroke, and at the
 * latest every twenty even if nobody pauses.
 *
 * Three seconds because pauses of that length happen constantly between
 * sentences, so most saves land while the writer is thinking. Twenty is the
 * actual promise — never more than twenty seconds of work at stake. There is
 * deliberately no `beforeunload` handler beside them: the case this exists
 * for is a browser that crashes, and a crash fires no event.
 */
export const NOTE_DRAFT_IDLE_MS = 3_000
export const NOTE_DRAFT_MAX_WAIT_MS = 20_000

/** How long an untouched draft survives, swept at login like an expired
 *  session. Long enough for "I meant to come back to it", short enough that
 *  unsaved documentation does not pile up unnoticed. */
export const NOTE_DRAFT_MAX_AGE_DAYS = 30
