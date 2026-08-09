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
 */

const sample: HashableNote = {
  noteDate: '2026-08-09',
  type: 'session',
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
        '"text":"Erstgespräch geführt.\\nNächster Termin \\"offen\\".",' +
        '"type":"session"}',
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
      '0ade3205bc2158a76f0faa944df33a2bc9c2ac94ebf76fc15295096c9bc9964a',
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
})
