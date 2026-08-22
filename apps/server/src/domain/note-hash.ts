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
 *  "fileHashes":["<64 hex>",…],"noteDate":"2026-08-09",
 *  "noteTypeId":"<uuid>","text":"…"}
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
 * - `noteTypeId` — the note type as stored, which since migration 0038 is the
 *   id of a `note_type` row. See "Why it is the id" below.
 * - `text` — exactly as stored. **No Unicode normalization**: the bytes that
 *   were saved are the bytes that are hashed.
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
 *
 * **The format was changed once, before the software went into use**, when the
 * note type became a catalogue (L1, migration 0038): the key `type` holding
 * one of six fixed words became `noteTypeId` holding a uuid. Every hash
 * written before that stopped verifying, and there is no way to re-lock a
 * note, so the locked test notes of the development database were deleted with
 * it. That was possible exactly once, on a database holding nothing that
 * cannot be recreated. It does not happen again, for any reason.
 *
 * ## Why it is the id
 *
 * A catalogue entry has two faces, and only one of them can be hashed.
 *
 * The **label** is what a reader sees, and it is editable: hashing it would
 * mean that correcting a spelling in the settings invalidates every chain
 * filed under that type. A typo must not devalue documentation.
 *
 * The **id** never changes, sits in the note row itself, and is therefore
 * covered against exactly what this hash is for — a change made past the
 * application, in `psql`. That it says nothing to a human is not new here:
 * `createdBy` is a user id for the same reason, and the user's *name* is
 * deliberately not in the hash either, because it is editable. The note type
 * is now that same shape.
 *
 * Leaving the type out entirely was the third option. It fails on the same
 * point: the trigger `protect_locked_note` stops the application from moving
 * it, but the hash is what notices when something else did.
 *
 * ## Which normalizations are safe, and which are not
 *
 * `text` reaches the database already trimmed — `requiredText` in
 * `packages/shared/src/field.ts` does that. That is harmless, and the rule
 * behind why is worth stating, because it is what decided the shape of the
 * note editor:
 *
 * > A normalization on the way **in** is harmless as long as it is
 * > idempotent — `trim(trim(x)) === trim(x)`, so saving without changing
 * > anything cannot move the text. A normalization on the way **out of
 * > storage**, when loading into an editor, is dangerous: there,
 * > opening-and-saving changes the text without anybody having typed.
 *
 * That is why D10 gave notes a `<textarea>` holding Markdown and not a
 * ProseMirror editor. ProseMirror keeps a document model, so loading parses
 * and saving re-serializes: list markers get unified, blank lines collapse,
 * heading levels are clamped. For a note about to be locked, the hashed text
 * would then not be the text that was typed — and nobody would see it happen.
 */

/** Exactly the keys that go into the hash. Sorted at use, not by hand: the
 *  sort has to be executed so a reordered object literal cannot shift it. */
const HASHED_KEYS = ['createdAt', 'createdBy', 'fileHashes', 'noteDate', 'noteTypeId', 'text']

export type HashableNote = {
  noteDate: string
  noteTypeId: string
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
      noteTypeId: note.noteTypeId,
      text: note.text,
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
