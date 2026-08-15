import { z } from 'zod'
import { requiredText } from './field.js'

/**
 * Documentation attached to a contact, optionally to an activity. Files hang
 * off a note (`note_file`), never off a contact or an activity directly — that
 * gives attachments the same locking semantics as the text without a second
 * mechanism (CLAUDE.md rule 7).
 *
 * `text` with a named check constraint rather than an enum: CLAUDE.md marks
 * this set as expected to change. `document` rather than the sketch's `file`,
 * because a note of type "file" next to a table called `note_file` reads as if
 * it were the attachment itself.
 */
export const noteTypes = [
  'general',
  'session',
  'document',
  'correspondence',
  'addendum',
  'other',
] as const
export const noteTypeSchema = z.enum(noteTypes)
export type NoteType = z.infer<typeof noteTypeSchema>

/** The upper bound on a note's text. Generous — a session note is prose, not a
 *  form field — but not unbounded, so one paste cannot fill the disk. */
const MAX_NOTE_TEXT = 20_000

/**
 * A locked note cannot be corrected, only supplemented: a new note of type
 * `addendum` pointing at the locked one. The two conditions imply each other,
 * here and in the check constraint `note_addendum_target`.
 */
function addendumTargetsMatch(input: { type: NoteType; correctsNoteId: string | null }): boolean {
  return (input.type === 'addendum') === (input.correctsNoteId !== null)
}

const addendumRefinement = {
  message: 'an addendum needs a note it corrects, and only an addendum may have one',
  path: ['correctsNoteId'],
}

export const noteInputSchema = z
  .object({
    contactId: z.uuid(),
    /** Optional — a note may document a session or stand on its own. */
    activityId: z.uuid().nullable().default(null),
    /** The day being documented, which is not always the day of writing. */
    noteDate: z.iso.date(),
    type: noteTypeSchema,
    text: requiredText(MAX_NOTE_TEXT),
    correctsNoteId: z.uuid().nullable().default(null),
  })
  .refine(addendumTargetsMatch, addendumRefinement)

export type NoteInput = z.infer<typeof noteInputSchema>

/** Editing leaves contact and addendum target alone: neither moves once the
 *  note exists. */
export const noteUpdateSchema = z.object({
  activityId: z.uuid().nullable().default(null),
  noteDate: z.iso.date(),
  type: noteTypeSchema,
  text: requiredText(MAX_NOTE_TEXT),
})

export type NoteUpdate = z.infer<typeof noteUpdateSchema>

/** `storage_path` deliberately does not travel: where the bytes sit on disk is
 *  nobody's business outside the server. */
export const noteFileSchema = z.object({
  id: z.uuid(),
  noteId: z.uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  sha256: z.string(),
  createdAt: z.iso.datetime(),
})

export type NoteFile = z.infer<typeof noteFileSchema>

export const noteSchema = z.object({
  id: z.uuid(),
  contactId: z.uuid(),
  activityId: z.uuid().nullable(),
  noteDate: z.iso.date(),
  type: noteTypeSchema,
  text: z.string(),
  createdBy: z.uuid(),
  createdByName: z.string(),
  createdAt: z.iso.datetime(),
  lockedAt: z.iso.datetime().nullable(),
  lockedByName: z.string().nullable(),
  contentHash: z.string().nullable(),
  prevHash: z.string().nullable(),
  correctsNoteId: z.uuid().nullable(),
  files: z.array(noteFileSchema),
})

export type Note = z.infer<typeof noteSchema>

/** Either by contact or by activity; the route requires one, so a bare call
 *  cannot walk the whole documentation. */
export const noteListQuerySchema = z
  .object({
    contactId: z.uuid().optional(),
    activityId: z.uuid().optional(),
  })
  .refine((query) => query.contactId !== undefined || query.activityId !== undefined, {
    message: 'contactId or activityId is required',
  })

export type NoteListQuery = z.infer<typeof noteListQuerySchema>

/**
 * The verification report.
 *
 * Content and files are reported apart on purpose: they have different causes
 * and different consequences. A content mismatch means the row itself was
 * altered — the hash no longer follows from what is stored. A file mismatch
 * means the row is intact and the bytes behind it are not, which is a swapped
 * or corrupted attachment. A link mismatch means the chain was cut between two
 * notes, typically because a note was deleted or inserted after the fact.
 */
export const noteFileCheckSchema = z.object({
  fileId: z.uuid(),
  fileName: z.string(),
  status: z.enum(['ok', 'mismatch', 'missing']),
})

export const noteChainEntrySchema = z.object({
  noteId: z.uuid(),
  noteDate: z.iso.date(),
  lockedAt: z.iso.datetime(),
  /** The recomputed content hash equals the stored one. */
  contentOk: z.boolean(),
  /** `prev_hash` points at the predecessor's stored hash. */
  linkOk: z.boolean(),
  /** Empty when the files were not read — see `checkedFiles`. */
  files: z.array(noteFileCheckSchema),
})

export type NoteChainEntry = z.infer<typeof noteChainEntrySchema>

export const noteChainReportSchema = z.object({
  contactId: z.uuid(),
  /** False when only the database was checked, which is the parameter the UI
   *  never sets — it always asks for the full check. */
  checkedFiles: z.boolean(),
  entries: z.array(noteChainEntrySchema),
})

export type NoteChainReport = z.infer<typeof noteChainReportSchema>

export function chainEntryOk(entry: NoteChainEntry): boolean {
  return entry.contentOk && entry.linkOk && entry.files.every((file) => file.status === 'ok')
}

export function chainOk(report: NoteChainReport): boolean {
  return report.entries.every(chainEntryOk)
}
