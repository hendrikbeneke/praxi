import type { Note, NoteChainEntry, NoteChainReport } from '@praxi/shared'
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { note, noteFile } from '../db/schema.js'
import type { FileStore } from './file-store.js'
import { getNote } from './note.js'
import { computeContentHash } from './note-hash.js'

/**
 * Locking and verifying (CLAUDE.md rule 7).
 *
 * Locking is one-way. There is no counterpart to `lockNote` in this file, in
 * any route, or in any script, and adding one would defeat the purpose: the
 * point of the chain is that nobody — including whoever runs the server — can
 * revise the record after the fact without it showing.
 */

export class NoteAlreadyLockedError extends Error {
  constructor() {
    super('note is already locked')
    this.name = 'NoteAlreadyLockedError'
  }
}

/**
 * Locks a note and links it into its contact's chain.
 *
 * Everything happens in one transaction, and the note is taken under
 * `FOR UPDATE` first: the hash covers the files as they are *at this moment*,
 * so nothing may be attached between reading them and writing `locked_at`.
 * `addFile` takes the same row lock, which is what makes the two serialize.
 *
 * The predecessor is the most recently locked note of the same contact. Two
 * notes locked at the very same instant would both find it and both write its
 * hash into `prev_hash`; `note_chain_link_key` rejects the second, which is a
 * far better outcome than two chains that each verify on their own.
 */
export async function lockNote(
  database: Database,
  tenantId: string,
  userId: string,
  noteId: string,
): Promise<Note | null> {
  const locked = await database.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: note.id,
        contactId: note.contactId,
        noteDate: note.noteDate,
        type: note.type,
        text: note.text,
        createdAt: note.createdAt,
        createdBy: note.createdBy,
        lockedAt: note.lockedAt,
      })
      .from(note)
      .where(and(eq(note.tenantId, tenantId), eq(note.id, noteId)))
      .for('update')
      .limit(1)

    if (!row) return false
    if (row.lockedAt !== null) throw new NoteAlreadyLockedError()

    const files = await tx
      .select({ sha256: noteFile.sha256 })
      .from(noteFile)
      .where(eq(noteFile.noteId, noteId))

    const contentHash = computeContentHash({
      noteDate: row.noteDate,
      type: row.type,
      text: row.text,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      fileHashes: files.map((file) => file.sha256),
    })

    const [previous] = await tx
      .select({ contentHash: note.contentHash })
      .from(note)
      .where(
        and(
          eq(note.tenantId, tenantId),
          eq(note.contactId, row.contactId),
          isNotNull(note.lockedAt),
        ),
      )
      // Ties broken by id, which is a UUIDv7 and therefore time-ordered.
      .orderBy(desc(note.lockedAt), desc(note.id))
      .limit(1)

    await tx
      .update(note)
      .set({
        lockedAt: new Date(),
        lockedBy: userId,
        contentHash,
        prevHash: previous?.contentHash ?? null,
      })
      .where(eq(note.id, noteId))

    return true
  })

  return locked ? getNote(database, tenantId, noteId) : null
}

/**
 * Walks a contact's chain and reports what does not add up.
 *
 * Three failures are told apart because they have different causes and call
 * for different responses:
 *
 * - **content** — the recomputed hash differs from the stored one. The row was
 *   altered after locking, which the trigger prevents through the application
 *   and through psql, so this means the table was touched some other way.
 * - **link** — `prev_hash` does not name the predecessor's stored hash. The
 *   chain was cut: a note between the two was removed, or one was inserted.
 * - **file** — the row is intact and the bytes behind it are not. A swapped or
 *   corrupted attachment, or one that is simply gone from disk.
 *
 * `checkFiles` defaults to true and the UI never sets it. The database-only
 * mode exists for later — a server with far more data, where reading every
 * attachment of a long history is worth avoiding — and deliberately has no
 * switch in the interface, because a check that quietly skips half of what it
 * claims to verify is worse than no check.
 */
export async function verifyChain(
  database: Database,
  tenantId: string,
  store: FileStore,
  contactId: string,
  options: { checkFiles?: boolean } = {},
): Promise<NoteChainReport> {
  const checkFiles = options.checkFiles ?? true

  const rows = await database
    .select({
      id: note.id,
      noteDate: note.noteDate,
      type: note.type,
      text: note.text,
      createdAt: note.createdAt,
      createdBy: note.createdBy,
      lockedAt: note.lockedAt,
      contentHash: note.contentHash,
      prevHash: note.prevHash,
    })
    .from(note)
    .where(
      and(eq(note.tenantId, tenantId), eq(note.contactId, contactId), isNotNull(note.lockedAt)),
    )
    .orderBy(asc(note.lockedAt), asc(note.id))

  const entries: NoteChainEntry[] = []
  let expectedPrev: string | null = null

  for (const row of rows) {
    const files = await database
      .select({
        id: noteFile.id,
        fileName: noteFile.fileName,
        storagePath: noteFile.storagePath,
        sha256: noteFile.sha256,
      })
      .from(noteFile)
      .where(eq(noteFile.noteId, row.id))

    const recomputed = computeContentHash({
      noteDate: row.noteDate,
      type: row.type,
      text: row.text,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      fileHashes: files.map((file) => file.sha256),
    })

    const checks: NoteChainEntry['files'] = []
    if (checkFiles) {
      for (const file of files) {
        const onDisk = await store.sha256OnDisk(file.storagePath)
        checks.push({
          fileId: file.id,
          fileName: file.fileName,
          status: onDisk === null ? 'missing' : onDisk === file.sha256 ? 'ok' : 'mismatch',
        })
      }
    }

    entries.push({
      noteId: row.id,
      noteDate: row.noteDate,
      // Non-null by the query's own filter; the column type does not know that.
      lockedAt: (row.lockedAt ?? new Date(0)).toISOString(),
      contentOk: recomputed === row.contentHash,
      linkOk: row.prevHash === expectedPrev,
      files: checks,
    })

    // The *stored* hash, not the recomputed one: `prev_hash` was written from
    // what was stored, so following the stored values keeps a tampered note
    // reported as one broken link instead of breaking everything after it.
    expectedPrev = row.contentHash
  }

  return { contactId, checkedFiles: checkFiles, entries }
}
