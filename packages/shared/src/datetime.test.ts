import { describe, expect, it } from 'vitest'
import {
  addMinutesToLocal,
  formatBerlinTime,
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
