import { createHash } from 'node:crypto'

/**
 * The canonical serialization behind `note.content_hash` (CLAUDE.md rule 7).
 *
 * ## The format, in full
 *
 * A single JSON object, exactly these six keys and never any others, sorted
 * alphabetically, with no whitespace, encoded as UTF-8:
 *
 * ```
 * {"createdAt":"2026-08-09T08:11:12.345Z","createdBy":"<uuid>",
 *  "fileHashes":["<64 hex>",…],"noteDate":"2026-08-09","text":"…","type":"session"}
 * ```
 *
 * - `createdAt` — ISO 8601 in UTC with **millisecond** precision, the form
 *   `Date.prototype.toISOString` produces. The column is `timestamptz` and
 *   holds microseconds; the driver hands back a `Date`, so the last three
 *   digits never reach us. They are therefore deliberately not part of the
 *   hash. Should the driver ever start returning strings, this must keep
 *   truncating — the golden test below is what will notice.
 * - `createdBy` — the user id, lower-case as Postgres renders a uuid.
 * - `fileHashes` — the `sha256` of every `note_file` of this note, lower-case
 *   hex, sorted ascending. Sorting the *hashes* rather than trusting row order
 *   makes the value independent of insertion order and of file names.
 * - `noteDate` — `YYYY-MM-DD`.
 * - `text` — exactly as stored. **No Unicode normalization**: the bytes that
 *   were saved are the bytes that are hashed.
 * - `type` — the note type as stored.
 *
 * The hash is the SHA-256 of those bytes, lower-case hex.
 *
 * ## Why it must never change
 *
 * A note locked today has to produce the same hash in ten years, from the same
 * stored data, with nobody around who remembers this file. Changing the key
 * set, the ordering, the date format or the encoding invalidates every chain
 * that already exists, and there is no way to re-lock them — locking is
 * one-way by design.
 *
 * So: adding a column to `note` does **not** add a key here. If a future field
 * genuinely has to be covered, it needs a second hash version with a version
 * marker, not an edit to this one.
 *
 * `note-hash.test.ts` pins the output against a hard-coded expected value.
 * If that test fails, the format changed — do not update the expectation.
 */

/** Exactly the keys that go into the hash. Sorted at use, not by hand: the
 *  sort has to be executed so a reordered object literal cannot shift it. */
const HASHED_KEYS = ['createdAt', 'createdBy', 'fileHashes', 'noteDate', 'text', 'type']

export type HashableNote = {
  noteDate: string
  type: string
  text: string
  createdAt: Date
  createdBy: string
  fileHashes: readonly string[]
}

/** Exported for `note-hash.test.ts`, which asserts the serialization itself —
 *  a hash can only ever say that something changed, not that the key order and
 *  the whitespace are the ones rule 7 names. `hashNote` is the caller. */
export function canonicalNote(note: HashableNote): string {
  return JSON.stringify(
    {
      createdAt: note.createdAt.toISOString(),
      createdBy: note.createdBy,
      fileHashes: [...note.fileHashes].sort(),
      noteDate: note.noteDate,
      text: note.text,
      type: note.type,
    },
    [...HASHED_KEYS].sort(),
  )
}

export function computeContentHash(note: HashableNote): string {
  return createHash('sha256').update(canonicalNote(note), 'utf8').digest('hex')
}

/** SHA-256 of raw bytes, lower-case hex — used for uploaded files. */
export function sha256OfBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
