import { describe, expect, it } from 'vitest'
import { relationTypeCodeFrom, TYPE_CODE_MAX_LENGTH, typeCodeSchema } from './type-code.js'

/**
 * The generator and the shape it has to satisfy live in one file, and this is
 * what keeps them together: whatever a label is, the code that comes out has
 * to parse. The collision suffix is the domain's business — it needs the
 * database — and is tested in `apps/server/src/domain/contact-type.test.ts`.
 */

describe('relationTypeCodeFrom', () => {
  it('slugs an ordinary label', () => {
    expect(relationTypeCodeFrom('Betreut von')).toBe('betreut_von')
    expect(relationTypeCodeFrom('Bezugsperson (privat)')).toBe('bezugsperson_privat')
    expect(relationTypeCodeFrom('Kind von')).toBe('kind_von')
  })

  /** Written out, not stripped: "Ärztin" losing its first letter would read as
   *  a bug, and "aerztin" reads as German. */
  it('writes German umlauts out', () => {
    expect(relationTypeCodeFrom('Ärztin für')).toBe('aerztin_fuer')
    expect(relationTypeCodeFrom('Öffentlicher Betreuer')).toBe('oeffentlicher_betreuer')
    expect(relationTypeCodeFrom('Übungsleiter')).toBe('uebungsleiter')
    expect(relationTypeCodeFrom('Straße')).toBe('strasse')
  })

  /** Everything else with a diacritic decomposes and loses the mark. */
  it('strips other diacritics', () => {
    expect(relationTypeCodeFrom('Décharge')).toBe('decharge')
    expect(relationTypeCodeFrom('Señora')).toBe('senora')
  })

  /** The pattern demands a letter first. */
  it('cannot start with a digit', () => {
    expect(relationTypeCodeFrom('2. Kontakt')).toBe('kontakt')
    expect(relationTypeCodeFrom('123')).toBe('relation')
  })

  it('falls back where a label yields nothing', () => {
    expect(relationTypeCodeFrom('—')).toBe('relation')
    expect(relationTypeCodeFrom('   ')).toBe('relation')
    expect(relationTypeCodeFrom('')).toBe('relation')
  })

  /**
   * Truncated, never refused. A code is a handle; one a few characters shorter
   * still works, while an exception on creating a relation type is a dead end
   * on a screen.
   */
  it('truncates a long label instead of failing', () => {
    const code = relationTypeCodeFrom('Ein sehr langer Name für eine besondere Art von Beziehung')

    expect(code.length).toBeLessThanOrEqual(TYPE_CODE_MAX_LENGTH)
    expect(typeCodeSchema.safeParse(code).success).toBe(true)
  })

  /** `reserve` is how the domain keeps room for `_2`, `_17`, `_231`. */
  it('leaves room for a collision suffix when asked', () => {
    const long = 'Ein sehr langer Name für eine besondere Art von Beziehung'

    expect(relationTypeCodeFrom(long, 4).length).toBeLessThanOrEqual(TYPE_CODE_MAX_LENGTH - 4)
    expect(typeCodeSchema.safeParse(`${relationTypeCodeFrom(long, 4)}_999`).success).toBe(true)
  })

  /** A truncation must not leave the code ending on the separator — `foo_`
   *  parses, but it reads like something got lost. */
  it('does not end on an underscore after truncating', () => {
    // 40 characters of base, so the cut lands exactly on the separator.
    expect(relationTypeCodeFrom('abcdefghij klmnopqrst uvwxyzabcd efghij')).not.toMatch(/_$/)
  })

  /**
   * The assertion that makes this file worth having: whatever goes in, what
   * comes out is a code the schema accepts. A generator that could produce an
   * invalid one would fail at the insert, with a constraint name.
   */
  it.each([
    'Betreut von',
    'Ärztin für',
    '2. Kontakt',
    '—',
    '',
    '   ',
    'ÄÖÜäöüß',
    'a'.repeat(200),
    'Ein sehr langer Name für eine besondere Art von Beziehung',
    '!!! ??? ...',
    'Ελληνικά',
    '日本語',
    'x',
  ])('produces something the schema accepts: %s', (label) => {
    expect(typeCodeSchema.safeParse(relationTypeCodeFrom(label)).success).toBe(true)
    expect(typeCodeSchema.safeParse(relationTypeCodeFrom(label, 6)).success).toBe(true)
  })
})
