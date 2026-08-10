import { describe, expect, it } from 'vitest'
import { formatDateDE, formatTimeDE, isRealDate, parseDateDE, parseTimeDE } from './date-format.js'

/**
 * The border between what a person types and what the application stores.
 *
 * Everything here is a pure function of its input, `now` included — a test
 * about two-digit years must not start failing in January.
 */

const NOW = new Date('2026-08-11T10:00:00.000Z')

describe('parseDateDE', () => {
  it('reads the written form', () => {
    expect(parseDateDE('13.07.2026')).toBe('2026-07-13')
  })

  it('does not insist on leading zeros', () => {
    expect(parseDateDE('1.7.2026')).toBe('2026-07-01')
    expect(parseDateDE('13.7.2026')).toBe('2026-07-13')
  })

  it('takes a two-digit year', () => {
    expect(parseDateDE('13.7.26')).toBe('2026-07-13')
  })

  it('takes the other separators a keyboard offers', () => {
    expect(parseDateDE('13/7/2026')).toBe('2026-07-13')
    expect(parseDateDE('13-7-2026')).toBe('2026-07-13')
  })

  it('takes a bare run of digits, for the number pad', () => {
    expect(parseDateDE('13072026')).toBe('2026-07-13')
    expect(parseDateDE('130726')).toBe('2026-07-13')
  })

  it('ignores surrounding whitespace', () => {
    expect(parseDateDE('  13.07.2026 ')).toBe('2026-07-13')
  })

  /**
   * The one thing it is strict about. JavaScript answers `Date.UTC(2026, 1,
   * 31)` with the third of March rather than refusing, and a date that rolled
   * over silently is worse than one that was rejected: nobody sees it happen.
   */
  it('refuses a day that does not exist', () => {
    expect(parseDateDE('31.02.2026')).toBeNull()
    expect(parseDateDE('30.02.2026')).toBeNull()
    expect(parseDateDE('31.04.2026')).toBeNull()
    expect(parseDateDE('32.01.2026')).toBeNull()
    expect(parseDateDE('01.13.2026')).toBeNull()
  })

  it('knows which February has 29 days', () => {
    expect(parseDateDE('29.02.2024')).toBe('2024-02-29')
    expect(parseDateDE('29.02.2026')).toBeNull()
  })

  it('is null for anything that is not a date', () => {
    expect(parseDateDE('')).toBeNull()
    expect(parseDateDE('   ')).toBeNull()
    expect(parseDateDE('gestern')).toBeNull()
    expect(parseDateDE('13.07.')).toBeNull()
    expect(parseDateDE('13.07')).toBeNull()
    expect(parseDateDE('13.07.2026.1')).toBeNull()
    expect(parseDateDE('1307')).toBeNull()
    expect(parseDateDE('13.7.6')).toBeNull()
    expect(parseDateDE('2026-07-13')).toBeNull()
  })
})

/**
 * The date of birth is the only field that reaches far enough back for
 * "00–69 is this century" to turn into a wrong answer rather than a harmless
 * one, so it is the only field that asks for this mode.
 */
describe('parseDateDE with twoDigitYear: past', () => {
  const past = { twoDigitYear: 'past', now: NOW } as const

  it('reads a two-digit year as the last one that has happened', () => {
    expect(parseDateDE('12.3.46', past)).toBe('1946-03-12')
    expect(parseDateDE('1.1.99', past)).toBe('1999-01-01')
  })

  it('leaves a two-digit year alone when it is already in the past', () => {
    expect(parseDateDE('1.1.20', past)).toBe('2020-01-01')
    expect(parseDateDE('1.1.26', past)).toBe('2026-01-01')
  })

  it('steps back a century for a day later this year', () => {
    // 11 August 2026 is "today" here, so the 12th has not happened yet.
    expect(parseDateDE('12.8.26', past)).toBe('1926-08-12')
    expect(parseDateDE('11.8.26', past)).toBe('2026-08-11')
  })

  /** Typed in full it is taken at its word, in every field. */
  it('never reinterprets a four-digit year', () => {
    expect(parseDateDE('12.3.2046', past)).toBe('2046-03-12')
  })

  it('changes nothing about the default mode', () => {
    expect(parseDateDE('12.3.46')).toBe('2046-03-12')
    expect(parseDateDE('12.3.46', { twoDigitYear: 'nearest', now: NOW })).toBe('2046-03-12')
  })
})

describe('formatDateDE', () => {
  it('writes the stored form the way it is read', () => {
    expect(formatDateDE('2026-07-13')).toBe('13.07.2026')
    expect(formatDateDE('1946-03-12')).toBe('12.03.1946')
  })

  it('shows nothing rather than something invented', () => {
    expect(formatDateDE('')).toBe('')
    expect(formatDateDE('2026-02-31')).toBe('')
    expect(formatDateDE('13.07.2026')).toBe('')
    expect(formatDateDE('nonsense')).toBe('')
  })

  it('round-trips', () => {
    for (const written of ['13.07.2026', '01.01.1970', '29.02.2024', '31.12.1999']) {
      const iso = parseDateDE(written)
      expect(iso).not.toBeNull()
      expect(formatDateDE(iso ?? '')).toBe(written)
    }
  })
})

describe('isRealDate', () => {
  it('accepts a day that exists and refuses one that does not', () => {
    expect(isRealDate('2026-07-13')).toBe(true)
    expect(isRealDate('2026-02-31')).toBe(false)
    expect(isRealDate('2026-13-01')).toBe(false)
    expect(isRealDate('2026-7-13')).toBe(false)
    expect(isRealDate('')).toBe(false)
  })
})

describe('parseTimeDE', () => {
  it('reads the written form', () => {
    expect(parseTimeDE('09:30')).toBe('09:30')
    expect(parseTimeDE('9:30')).toBe('09:30')
  })

  it('pads both halves', () => {
    expect(parseTimeDE('9:5')).toBe('09:05')
  })

  it('takes a full stop, which is what a German keyboard offers', () => {
    expect(parseTimeDE('9.30')).toBe('09:30')
  })

  it('takes a bare run of digits', () => {
    expect(parseTimeDE('0930')).toBe('09:30')
    expect(parseTimeDE('930')).toBe('09:30')
    expect(parseTimeDE('9')).toBe('09:00')
    expect(parseTimeDE('09')).toBe('09:00')
    expect(parseTimeDE('0000')).toBe('00:00')
  })

  /** 24 hours throughout. The other half of why this field is not a native
   *  one: an en-US browser offers AM/PM, and half a day is a missed session. */
  it('refuses an hour or a minute that does not exist', () => {
    expect(parseTimeDE('24:00')).toBeNull()
    expect(parseTimeDE('23:60')).toBeNull()
    expect(parseTimeDE('25')).toBeNull()
  })

  it('is null for anything that is not a time', () => {
    expect(parseTimeDE('')).toBeNull()
    expect(parseTimeDE('halb zehn')).toBeNull()
    expect(parseTimeDE('9:30:00')).toBeNull()
    expect(parseTimeDE('09301')).toBeNull()
  })
})

describe('formatTimeDE', () => {
  it('normalizes what it is given', () => {
    expect(formatTimeDE('09:30')).toBe('09:30')
    expect(formatTimeDE('9:5')).toBe('09:05')
  })

  it('shows nothing rather than something invented', () => {
    expect(formatTimeDE('')).toBe('')
    expect(formatTimeDE('24:00')).toBe('')
  })
})
