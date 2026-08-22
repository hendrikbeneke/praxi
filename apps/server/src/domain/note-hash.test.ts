import { describe, expect, it } from 'vitest'
import { canonicalNote, computeContentHash, type HashableNote } from './note-hash.js'

/**
 * The format is frozen (see the comment in `note-hash.ts`). These tests pin it
 * against hard-coded values rather than round-tripping, because a round trip
 * happily agrees with itself after the format has silently changed — and a
 * changed format invalidates every chain that already exists, with no way to
 * re-lock them.
 *
 * **If one of these fails, the serialization changed. Fix the code, not the
 * expectation.**
 *
 * The expectations below were rewritten once, when the note type became a
 * catalogue and the key `type` became `noteTypeId` (L1, migration 0038) — the
 * one change the format will ever see, made on a database holding nothing but
 * test data. That it took editing this file is the point: the value is not
 * derivable from the code, so it cannot be adjusted by accident.
 */

const sample: HashableNote = {
  noteDate: '2026-08-09',
  noteTypeId: '019ff100-0000-7000-8000-0000000000aa',
  // An umlaut, a newline and a quote — the three things an encoding or
  // escaping change would move.
  text: 'Erstgespräch geführt.\nNächster Termin "offen".',
  createdAt: new Date('2026-08-09T08:11:12.345Z'),
  createdBy: '019fe362-73c4-77e4-af42-33388a5b6c5d',
  fileHashes: [
    'bbbb111111111111111111111111111111111111111111111111111111111111',
    'aaaa000000000000000000000000000000000000000000000000000000000000',
  ],
}

describe('canonicalNote', () => {
  it('produces exactly the documented string', () => {
    expect(canonicalNote(sample)).toBe(
      '{"createdAt":"2026-08-09T08:11:12.345Z",' +
        '"createdBy":"019fe362-73c4-77e4-af42-33388a5b6c5d",' +
        '"fileHashes":["aaaa000000000000000000000000000000000000000000000000000000000000",' +
        '"bbbb111111111111111111111111111111111111111111111111111111111111"],' +
        '"noteDate":"2026-08-09",' +
        '"noteTypeId":"019ff100-0000-7000-8000-0000000000aa",' +
        '"text":"Erstgespräch geführt.\\nNächster Termin \\"offen\\"."}',
    )
  })

  it('sorts the file hashes rather than trusting the order they arrive in', () => {
    const reversed = { ...sample, fileHashes: [...sample.fileHashes].reverse() }
    expect(canonicalNote(reversed)).toBe(canonicalNote(sample))
  })

  it('drops the microseconds a timestamptz can carry', () => {
    // The driver hands back a Date, so this is what the column's extra
    // precision looks like by the time it reaches the hash: gone.
    const withMicros = { ...sample, createdAt: new Date('2026-08-09T08:11:12.345678Z') }
    expect(canonicalNote(withMicros)).toBe(canonicalNote(sample))
  })
})

describe('computeContentHash', () => {
  it('matches the recorded hash for the sample note', () => {
    expect(computeContentHash(sample)).toBe(
      '59382b358434f4d899b5b19a2b7333a5fe9cbf79602fec966522b293b3bf9a85',
    )
  })

  it('changes when a file is added', () => {
    const extra = {
      ...sample,
      fileHashes: [...sample.fileHashes, 'c'.repeat(64)],
    }
    expect(computeContentHash(extra)).not.toBe(computeContentHash(sample))
  })

  it('changes when the text changes by one character', () => {
    expect(computeContentHash({ ...sample, text: `${sample.text} ` })).not.toBe(
      computeContentHash(sample),
    )
  })

  it('changes when the note date changes', () => {
    expect(computeContentHash({ ...sample, noteDate: '2026-08-10' })).not.toBe(
      computeContentHash(sample),
    )
  })

  /** The id is what is covered, so a type swapped past the application shows
   *  up — while renaming the type in the settings leaves every chain alone,
   *  because the label is nowhere in here. */
  it('changes when the note type changes', () => {
    expect(
      computeContentHash({ ...sample, noteTypeId: '019ff100-0000-7000-8000-0000000000bb' }),
    ).not.toBe(computeContentHash(sample))
  })
})
