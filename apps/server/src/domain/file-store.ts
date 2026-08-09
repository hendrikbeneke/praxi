import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { sha256OfBytes } from './note-hash.js'

/**
 * Where uploaded bytes live.
 *
 * Everything is addressed by a path **relative to the data root**, and that is
 * what `note_file.storage_path` stores. An absolute path would make moving the
 * practice to a server a data migration instead of a copy plus one environment
 * variable.
 *
 * The layout is
 *
 * ```
 * files/{contactId}/{noteId}/{fileId}.{ext}
 * ```
 *
 * Three ids we generated ourselves, so no part of a path ever comes from user
 * input and traversal is structurally impossible; `absolutePath` asserts it
 * anyway. Grouping by contact keeps one patient's documents together, which is
 * the unit that retention periods and requests for information work in.
 *
 * The uploaded file name is **not** a path segment. A file name is clinical
 * content (CLAUDE.md rule 12) and has no business being readable in a
 * directory listing; it lives in the `file_name` column and nowhere else.
 */
export class FileStore {
  constructor(private readonly root: string) {}

  /** The absolute path, checked to stay under the root. */
  absolutePath(storagePath: string): string {
    if (isAbsolute(storagePath)) throw new Error('storage path must be relative')

    const root = resolve(this.root)
    const full = resolve(root, storagePath)
    if (full !== root && !full.startsWith(root + sep)) {
      throw new Error('storage path escapes the data root')
    }
    return full
  }

  async write(storagePath: string, bytes: Uint8Array): Promise<void> {
    const full = this.absolutePath(storagePath)
    await mkdir(resolve(full, '..'), { recursive: true })
    await writeFile(full, bytes)
  }

  async read(storagePath: string): Promise<Buffer> {
    return readFile(this.absolutePath(storagePath))
  }

  /** The hash of what is actually on disk, or `null` when the file is gone.
   *  This is what separates "the row was altered" from "the bytes were". */
  async sha256OnDisk(storagePath: string): Promise<string | null> {
    try {
      return sha256OfBytes(await this.read(storagePath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async remove(storagePath: string): Promise<void> {
    await rm(this.absolutePath(storagePath), { force: true })
  }

  /** Removes a whole note's directory, used when an unlocked note is deleted. */
  async removeNoteDirectory(contactId: string, noteId: string): Promise<void> {
    await rm(this.absolutePath(noteDirectory(contactId, noteId)), {
      recursive: true,
      force: true,
    })
  }

  /** For the orphan sweep, which has to look at the directory tree rather than
   *  at rows. */
  filesRoot(): string {
    return this.absolutePath(FILES_PREFIX)
  }

  relativeToRoot(absolute: string): string {
    return relative(resolve(this.root), absolute)
  }
}

const FILES_PREFIX = 'files'

export function noteDirectory(contactId: string, noteId: string): string {
  return join(FILES_PREFIX, contactId, noteId)
}

export function fileStoragePath(
  contactId: string,
  noteId: string,
  fileId: string,
  extension: string,
): string {
  return join(noteDirectory(contactId, noteId), `${fileId}${extension}`)
}
