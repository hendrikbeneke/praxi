import { describe, expect, it } from 'vitest'
import {
  addMinutesToLocal,
  ageInYears,
  formatBerlinDayTime,
  formatBerlinTime,
  formatRelativeBerlin,
  formatRelativeDayBerlin,
  fromBerlinDateTimeLocal,
  minutesBetween,
  toBerlinDate,
  toBerlinDateTimeLocal,
} from './datetime.js'

/**
 * Germany runs on CET (+01:00) in winter and CEST (+02:00) in summer. In 2026
 * the clocks go forward on 29 March and back on 25 October.
 */
describe('UTC to Berlin', () => {
  it('reads winter and summer differently', () => {
    expect(toBerlinDateTimeLocal('2026-01-15T11:00:00.000Z')).toBe('2026-01-15T12:00')
    expect(toBerlinDateTimeLocal('2026-07-15T10:00:00.000Z')).toBe('2026-07-15T12:00')
  })

  /**
   * The reason this lives in packages/shared: slice 6 takes an invoice's
   * date of service from an activity's timestamp. A late session is the
   * previous day in UTC, and the invoice would print the wrong date.
   */
  it('puts a late-evening session on the day it happened', () => {
    // 00:30 Berlin on 2 September is 22:30 UTC on 1 September.
    expect(toBerlinDate('2026-09-01T22:30:00.000Z')).toBe('2026-09-02')
    expect(toBerlinDate('2026-09-01T21:30:00.000Z')).toBe('2026-09-01')
  })

  it('formats the time of day the German way', () => {
    expect(formatBerlinTime('2026-07-15T07:05:00.000Z')).toBe('09:05')
  })
})

describe('Berlin back to UTC', () => {
  it('round-trips winter and summer', () => {
    expect(fromBerlinDateTimeLocal('2026-01-15T12:00')).toBe('2026-01-15T11:00:00.000Z')
    expect(fromBerlinDateTimeLocal('2026-07-15T12:00')).toBe('2026-07-15T10:00:00.000Z')
  })

  it('survives both clock changes', () => {
    // Forward: 2026-03-29, 02:00 becomes 03:00. 01:30 is still CET,
    // 03:30 is already CEST.
    expect(fromBerlinDateTimeLocal('2026-03-29T01:30')).toBe('2026-03-29T00:30:00.000Z')
    expect(fromBerlinDateTimeLocal('2026-03-29T03:30')).toBe('2026-03-29T01:30:00.000Z')

    // Back: 2026-10-25, 03:00 becomes 02:00. 01:30 is CEST, 03:30 is CET.
    expect(fromBerlinDateTimeLocal('2026-10-25T01:30')).toBe('2026-10-24T23:30:00.000Z')
    expect(fromBerlinDateTimeLocal('2026-10-25T03:30')).toBe('2026-10-25T02:30:00.000Z')
  })

  it('round-trips through both directions', () => {
    for (const iso of [
      '2026-01-15T11:00:00.000Z',
      '2026-07-15T10:00:00.000Z',
      '2026-03-29T00:30:00.000Z',
      '2026-10-25T23:00:00.000Z',
    ]) {
      expect(fromBerlinDateTimeLocal(toBerlinDateTimeLocal(iso))).toBe(iso)
    }
  })

  /**
   * `Date.parse` alone is not a validator: V8 answers `Date.parse('gestern:00Z')`
   * with 1 January 2000 instead of `NaN`, so a `Number.isNaN` guard would have
   * let this through as a real appointment.
   */
  it('refuses something that is not a local date-time', () => {
    expect(() => fromBerlinDateTimeLocal('gestern')).toThrow()
    expect(() => fromBerlinDateTimeLocal('')).toThrow()
    expect(() => fromBerlinDateTimeLocal('2026-09-01')).toThrow()
    expect(() => fromBerlinDateTimeLocal('2026-09-01T10:00:00Z')).toThrow()
    expect(() => addMinutesToLocal('gestern', 30)).toThrow()
  })

  it('refuses a well-formed but impossible date', () => {
    expect(() => fromBerlinDateTimeLocal('2026-02-31T10:00')).toThrow()
  })
})

describe('helpers', () => {
  it('adds minutes in wall-clock terms', () => {
    expect(addMinutesToLocal('2026-09-01T10:00', 50)).toBe('2026-09-01T10:50')
    expect(addMinutesToLocal('2026-09-01T23:30', 60)).toBe('2026-09-02T00:30')
  })

  it('measures a session in minutes', () => {
    expect(minutesBetween('2026-09-01T08:00:00.000Z', '2026-09-01T08:50:00.000Z')).toBe(50)
  })
})

/**
 * The list's "Termin" column. Everything is measured against one fixed
 * instant: 2026-08-24 is a Monday, 10:00 Berlin is 08:00 UTC in summer.
 */
describe('formatRelativeBerlin', () => {
  const now = new Date('2026-08-24T08:00:00.000Z')

  it('says minutes in both directions', () => {
    expect(formatRelativeBerlin('2026-08-24T07:48:00.000Z', now)).toBe('vor 12 Min.')
    expect(formatRelativeBerlin('2026-08-24T08:12:00.000Z', now)).toBe('in 12 Min.')
  })

  it('says hours once an hour has passed', () => {
    expect(formatRelativeBerlin('2026-08-24T06:00:00.000Z', now)).toBe('vor 2 Std.')
    expect(formatRelativeBerlin('2026-08-24T10:00:00.000Z', now)).toBe('in 2 Std.')
  })

  it('does not round up into an hour it is not', () => {
    // 59 minutes stays minutes; 61 becomes an hour.
    expect(formatRelativeBerlin('2026-08-24T07:01:00.000Z', now)).toBe('vor 59 Min.')
    expect(formatRelativeBerlin('2026-08-24T06:59:00.000Z', now)).toBe('vor 1 Std.')
  })

  it('names yesterday and tomorrow by the calendar, not by 24 hours', () => {
    // 07:00 Berlin the next morning is 23 hours away and still "morgen".
    expect(formatRelativeBerlin('2026-08-25T05:00:00.000Z', now)).toBe('morgen 07:00')
    expect(formatRelativeBerlin('2026-08-23T18:00:00.000Z', now)).toBe('gestern 20:00')
  })

  it('falls back to the weekday further out', () => {
    // The German short weekday carries its own full stop — "Do.", not "Do".
    expect(formatRelativeBerlin('2026-08-27T07:00:00.000Z', now)).toBe('Do., 27.08. 09:00')
  })

  it('has a word for right now', () => {
    expect(formatRelativeBerlin('2026-08-24T08:00:20.000Z', now)).toBe('gerade eben')
  })
})

/**
 * The two halves of the contact list's "Termin" cell. They are tested together
 * because the point is that they say different things: one names the day, the
 * other says how far off it is, and the cell is only readable while neither
 * repeats the other.
 */
describe('formatBerlinDayTime and formatRelativeDayBerlin', () => {
  const now = new Date('2026-08-24T08:00:00.000Z')

  it('writes the day and the time without the year', () => {
    expect(formatBerlinDayTime('2026-08-27T07:00:00.000Z')).toBe('Do., 27.08. · 09:00')
  })

  it('has a word for the three days that have one', () => {
    expect(formatRelativeDayBerlin('2026-08-24T15:00:00.000Z', now)).toBe('heute')
    expect(formatRelativeDayBerlin('2026-08-25T07:00:00.000Z', now)).toBe('morgen')
    expect(formatRelativeDayBerlin('2026-08-23T07:00:00.000Z', now)).toBe('gestern')
  })

  it('counts days in both directions beyond that', () => {
    expect(formatRelativeDayBerlin('2026-08-30T07:00:00.000Z', now)).toBe('in 6 Tagen')
    expect(formatRelativeDayBerlin('2026-08-19T07:00:00.000Z', now)).toBe('vor 5 Tagen')
  })

  it('counts calendar days, not 24-hour steps', () => {
    // 23:30 tonight and 00:30 tomorrow are an hour apart and still two words.
    expect(formatRelativeDayBerlin('2026-08-24T21:30:00.000Z', now)).toBe('heute')
    expect(formatRelativeDayBerlin('2026-08-24T22:30:00.000Z', now)).toBe('morgen')
  })

  it('never falls back to a date, which is what lets it stand beside one', () => {
    // `formatRelativeBerlin` prints the date itself this far out — that is the
    // whole reason this second function exists (K6).
    const far = '2026-09-14T07:00:00.000Z'
    expect(formatRelativeBerlin(far, now)).toContain('14.09.')
    expect(formatRelativeDayBerlin(far, now)).toBe('in 21 Tagen')
  })
})

describe('ageInYears', () => {
  const now = new Date('2026-08-24T08:00:00.000Z')

  it('counts the birthday as the day the number goes up', () => {
    expect(ageInYears('2008-08-24', now)).toBe(18)
    expect(ageInYears('2008-08-25', now)).toBe(17)
    expect(ageInYears('2008-08-23', now)).toBe(18)
  })

  it('does not turn someone a year younger late in the evening', () => {
    // 00:30 Berlin on their birthday is 22:30 UTC the day before.
    expect(ageInYears('2008-08-25', new Date('2026-08-24T22:30:00.000Z'))).toBe(18)
  })

  it('lets a leap-year birthday pass on 1 March in a common year', () => {
    expect(ageInYears('2008-02-29', new Date('2026-02-28T12:00:00.000Z'))).toBe(17)
    expect(ageInYears('2008-02-29', new Date('2026-03-01T12:00:00.000Z'))).toBe(18)
  })
})
