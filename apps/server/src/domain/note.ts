import type { Note, NoteFile, NoteInput, NoteListQuery, NoteUpdate } from '@praxi/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Database, DbReader } from '../db/client.js'
import { appUser, note, noteFile } from '../db/schema.js'
import { newId } from '../id.js'
import type { FileStore } from './file-store.js'
import { fileStoragePath } from './file-store.js'
import { detectFileType, MAX_UPLOAD_BYTES } from './file-type.js'
import { sha256OfBytes } from './note-hash.js'

/**
 * Notes and their attachments. The locking itself lives next door in
 * `note-lock.ts`; everything here works on notes that are still open, and
 * refuses as soon as one is not.
 */

/** Thrown wherever a locked note is asked to change. The database trigger says
 *  the same thing, but a caught error carries a readable message. */
export class NoteLockedError extends Error {
  constructor() {
    super('note is locked and cannot be modified')
    this.name = 'NoteLockedError'
  }
}

export class AddendumTargetError extends Error {
  constructor(reason: 'missing' | 'unlocked') {
    super(`addendum target is ${reason}`)
    this.name = 'AddendumTargetError'
    this.reason = reason
  }
  readonly reason: 'missing' | 'unlocked'
}

export class UnsupportedFileTypeError extends Error {
  constructor() {
    super('file type is not accepted')
    this.name = 'UnsupportedFileTypeError'
  }
}

export class FileTooLargeError extends Error {
  constructor() {
    super('file exceeds the maximum upload size')
    this.name = 'FileTooLargeError'
  }
}

const noteColumns = {
  id: note.id,
  contactId: note.contactId,
  activityId: note.activityId,
  noteDate: note.noteDate,
  type: note.type,
  text: note.text,
  createdBy: note.createdBy,
  createdAt: note.createdAt,
  lockedAt: note.lockedAt,
  lockedBy: note.lockedBy,
  contentHash: note.contentHash,
  prevHash: note.prevHash,
  correctsNoteId: note.correctsNoteId,
}

const fileColumns = {
  id: noteFile.id,
  noteId: noteFile.noteId,
  fileName: noteFile.fileName,
  mimeType: noteFile.mimeType,
  sizeBytes: noteFile.sizeBytes,
  storagePath: noteFile.storagePath,
  sha256: noteFile.sha256,
  createdAt: noteFile.createdAt,
}

/** The shape of a `select(noteColumns)` row: like `Note`, but with the
 *  database's own types for the timestamps and without the joined names. */
type NoteRow = Omit<Note, 'createdAt' | 'lockedAt' | 'createdByName' | 'lockedByName' | 'files'> & {
  createdAt: Date
  lockedAt: Date | null
  lockedBy: string | null
}

type FileRow = Omit<NoteFile, 'createdAt'> & { createdAt: Date; storagePath: string }

function toNoteFile(row: FileRow): NoteFile {
  return {
    id: row.id,
    noteId: row.noteId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    createdAt: row.createdAt.toISOString(),
  }
}

function toNote(row: NoteRow, names: Map<string, string>, files: readonly FileRow[]): Note {
  return {
    id: row.id,
    contactId: row.contactId,
    activityId: row.activityId,
    noteDate: row.noteDate,
    type: row.type,
    text: row.text,
    createdBy: row.createdBy,
    createdByName: names.get(row.createdBy) ?? '',
    createdAt: row.createdAt.toISOString(),
    lockedAt: row.lockedAt?.toISOString() ?? null,
    lockedByName: row.lockedBy === null ? null : (names.get(row.lockedBy) ?? ''),
    contentHash: row.contentHash,
    prevHash: row.prevHash,
    correctsNoteId: row.correctsNoteId,
    files: files.map(toNoteFile),
  }
}

/** Files and author names for a set of notes, in two queries rather than one
 *  per note. */
async function decorate(reader: DbReader, rows: NoteRow[]): Promise<Note[]> {
  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)
  const files = await reader
    .select(fileColumns)
    .from(noteFile)
    .where(inArray(noteFile.noteId, ids))
    .orderBy(asc(noteFile.fileName), asc(noteFile.id))

  const userIds = [
    ...new Set(
      rows.flatMap((row) => (row.lockedBy ? [row.createdBy, row.lockedBy] : [row.createdBy])),
    ),
  ]
  const users = await reader
    .select({ id: appUser.id, name: appUser.name })
    .from(appUser)
    .where(inArray(appUser.id, userIds))

  const names = new Map(users.map((user) => [user.id, user.name]))
  const byNote = new Map<string, FileRow[]>()
  for (const file of files) {
    const list = byNote.get(file.noteId)
    if (list) list.push(file)
    else byNote.set(file.noteId, [file])
  }

  return rows.map((row) => toNote(row, names, byNote.get(row.id) ?? []))
}

/**
 * Chronological, newest first — the order the practitioner reads in. Addenda
 * come back in the same list; nesting them under the note they correct is the
 * UI's job, because an addendum has its own date and must stay visible as a
 * separate, later entry.
 */
export async function listNotes(
  database: Database,
  tenantId: string,
  query: NoteListQuery,
): Promise<Note[]> {
  const filters = [eq(note.tenantId, tenantId)]
  if (query.contactId) filters.push(eq(note.contactId, query.contactId))
  if (query.activityId) filters.push(eq(note.activityId, query.activityId))

  const rows = await database
    .select(noteColumns)
    .from(note)
    .where(and(...filters))
    .orderBy(asc(note.noteDate), asc(note.createdAt))

  return decorate(database, rows)
}

export async function getNote(
  reader: DbReader,
  tenantId: string,
  id: string,
): Promise<Note | null> {
  const [row] = await reader
    .select(noteColumns)
    .from(note)
    .where(and(eq(note.tenantId, tenantId), eq(note.id, id)))
    .limit(1)

  if (!row) return null
  const [decorated] = await decorate(reader, [row])
  return decorated ?? null
}

export async function createNote(
  database: Database,
  tenantId: string,
  userId: string,
  input: NoteInput,
): Promise<Note> {
  return database.transaction(async (tx) => {
    if (input.correctsNoteId !== null) {
      const [target] = await tx
        .select({ lockedAt: note.lockedAt, contactId: note.contactId })
        .from(note)
        .where(and(eq(note.tenantId, tenantId), eq(note.id, input.correctsNoteId)))
        .limit(1)

      // Same contact is guaranteed by the three-column foreign key; being
      // locked is not, and it is the whole point: an open note is corrected by
      // editing it, not by supplementing it.
      if (!target || target.contactId !== input.contactId) {
        throw new AddendumTargetError('missing')
      }
      if (target.lockedAt === null) throw new AddendumTargetError('unlocked')
    }

    const [row] = await tx
      .insert(note)
      .values({
        id: newId(),
        tenantId,
        contactId: input.contactId,
        activityId: input.activityId,
        noteDate: input.noteDate,
        type: input.type,
        text: input.text,
        createdBy: userId,
        correctsNoteId: input.correctsNoteId,
      })
      .returning(noteColumns)

    if (!row) throw new Error('insert returned no row')
    const [created] = await decorate(tx, [row])
    if (!created) throw new Error('insert returned no row')
    return created
  })
}

export async function updateNote(
  database: Database,
  tenantId: string,
  id: string,
  input: NoteUpdate,
): Promise<Note | null> {
  return database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ lockedAt: note.lockedAt, correctsNoteId: note.correctsNoteId })
      .from(note)
      .where(and(eq(note.tenantId, tenantId), eq(note.id, id)))
      .limit(1)

    if (!existing) return null
    if (existing.lockedAt !== null) throw new NoteLockedError()

    // The addendum target does not move, so the type cannot cross that line
    // either — the check constraint would reject it anyway, less clearly.
    if ((input.type === 'addendum') !== (existing.correctsNoteId !== null)) {
      throw new AddendumTargetError(existing.correctsNoteId === null ? 'missing' : 'unlocked')
    }

    const [row] = await tx
      .update(note)
      .set({
        activityId: input.activityId,
        noteDate: input.noteDate,
        type: input.type,
        text: input.text,
      })
      .where(eq(note.id, id))
      .returning(noteColumns)

    if (!row) return null
    const [updated] = await decorate(tx, [row])
    return updated ?? null
  })
}

/**
 * Deleting an open note.
 *
 * The rows go first and the bytes second, deliberately in that order. Both
 * orders leave a window, and this is the one whose failure is recoverable: a
 * directory left behind is garbage that `pnpm files:orphans` finds and removes,
 * while a row pointing at a file that is already gone is data loss.
 *
 * The caller is told whether the directory could be removed; the route logs
 * that with ids only and still answers success, because the note really is
 * gone.
 */
export async function deleteNote(
  database: Database,
  tenantId: string,
  store: FileStore,
  id: string,
): Promise<{ deleted: boolean; filesRemoved: boolean }> {
  const contactId = await database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ lockedAt: note.lockedAt, contactId: note.contactId })
      .from(note)
      .where(and(eq(note.tenantId, tenantId), eq(note.id, id)))
      .limit(1)

    if (!existing) return null
    if (existing.lockedAt !== null) throw new NoteLockedError()

    await tx.delete(note).where(eq(note.id, id))
    return existing.contactId
  })

  if (contactId === null) return { deleted: false, filesRemoved: true }

  try {
    await store.removeNoteDirectory(contactId, id)
    return { deleted: true, filesRemoved: true }
  } catch {
    return { deleted: true, filesRemoved: false }
  }
}

export type Upload = { fileName: string; bytes: Uint8Array }

/**
 * Attaching a file to an open note.
 *
 * The row is inserted first and the bytes written before the commit, so the
 * common failure — no space, no permission — rolls back and leaves nothing
 * behind. The reverse order would leave an orphan on every failed insert.
 *
 * The row is taken under `FOR UPDATE` on the parent note so an upload and a
 * lock cannot pass each other: without it a file could land after the hash was
 * formed but before `locked_at` was visible. The trigger would still catch it
 * in the end, but this way the error is the readable one.
 */
export async function addFile(
  database: Database,
  tenantId: string,
  store: FileStore,
  noteId: string,
  upload: Upload,
): Promise<NoteFile | null> {
  if (upload.bytes.byteLength > MAX_UPLOAD_BYTES) throw new FileTooLargeError()
  if (upload.bytes.byteLength === 0) throw new UnsupportedFileTypeError()

  const type = detectFileType(upload.bytes)
  if (!type) throw new UnsupportedFileTypeError()

  return database.transaction(async (tx) => {
    const [parent] = await tx
      .select({ lockedAt: note.lockedAt, contactId: note.contactId })
      .from(note)
      .where(and(eq(note.tenantId, tenantId), eq(note.id, noteId)))
      .for('update')
      .limit(1)

    if (!parent) return null
    if (parent.lockedAt !== null) throw new NoteLockedError()

    const id = newId()
    const storagePath = fileStoragePath(parent.contactId, noteId, id, type.extension)

    const [row] = await tx
      .insert(noteFile)
      .values({
        id,
        tenantId,
        noteId,
        fileName: upload.fileName,
        mimeType: type.mimeType,
        sizeBytes: upload.bytes.byteLength,
        storagePath,
        sha256: sha256OfBytes(upload.bytes),
      })
      .returning(fileColumns)

    if (!row) throw new Error('insert returned no row')

    // Inside the transaction on purpose — see the note above.
    await store.write(storagePath, upload.bytes)
    return toNoteFile(row)
  })
}

export async function removeFile(
  database: Database,
  tenantId: string,
  store: FileStore,
  noteId: string,
  fileId: string,
): Promise<{ deleted: boolean; fileRemoved: boolean }> {
  const storagePath = await database.transaction(async (tx) => {
    const [parent] = await tx
      .select({ lockedAt: note.lockedAt })
      .from(note)
      .where(and(eq(note.tenantId, tenantId), eq(note.id, noteId)))
      .limit(1)

    if (!parent) return null
    if (parent.lockedAt !== null) throw new NoteLockedError()

    const [row] = await tx
      .select({ storagePath: noteFile.storagePath })
      .from(noteFile)
      .where(
        and(eq(noteFile.tenantId, tenantId), eq(noteFile.noteId, noteId), eq(noteFile.id, fileId)),
      )
      .limit(1)

    if (!row) return null
    await tx.delete(noteFile).where(eq(noteFile.id, fileId))
    return row.storagePath
  })

  if (storagePath === null) return { deleted: false, fileRemoved: true }

  try {
    await store.remove(storagePath)
    return { deleted: true, fileRemoved: true }
  } catch {
    return { deleted: true, fileRemoved: false }
  }
}

/** Everything the download route needs. Reading is always allowed, locked or
 *  not. */
export async function getFileForDownload(
  database: Database,
  tenantId: string,
  noteId: string,
  fileId: string,
): Promise<{ fileName: string; mimeType: string; storagePath: string } | null> {
  const [row] = await database
    .select({
      fileName: noteFile.fileName,
      mimeType: noteFile.mimeType,
      storagePath: noteFile.storagePath,
    })
    .from(noteFile)
    .where(
      and(eq(noteFile.tenantId, tenantId), eq(noteFile.noteId, noteId), eq(noteFile.id, fileId)),
    )
    .limit(1)

  return row ?? null
}
