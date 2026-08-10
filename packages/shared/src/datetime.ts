/**
 * Timestamps are stored and transported in UTC; display and input happen in
 * `Europe/Berlin` (CLAUDE.md rule 3). These functions are the only place the
 * two meet.
 *
 * They live in `packages/shared` rather than in the frontend because slice 6
 * derives an invoice's `date_of_service` from an activity's `occurred_at` on
 * the server. A session at 00:30 Berlin time is 22:30 UTC the previous day —
 * taking the date off the UTC timestamp would put it on the wrong day, and the
 * invoice would say so in print.
 */

import { DISPLAY_LOCALE } from './date-format.js'

export const PRACTICE_TIME_ZONE = 'Europe/Berlin'

const partsFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: PRACTICE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

type Wall = { date: string; time: string }

/** What a clock on the practice wall reads at this instant. */
function wallClock(instant: Date): Wall {
  const parts = new Map(partsFormat.formatToParts(instant).map((part) => [part.type, part.value]))
  const hour = parts.get('hour') === '24' ? '00' : parts.get('hour')

  return {
    date: `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`,
    time: `${hour}:${parts.get('minute')}:${parts.get('second')}`,
  }
}

/** How far Berlin is ahead of UTC at this instant, in milliseconds. */
function offsetAt(instant: Date): number {
  const wall = wallClock(instant)
  return Date.parse(`${wall.date}T${wall.time}Z`) - instant.getTime()
}

/** `YYYY-MM-DD` in Berlin. This is the date that belongs on an invoice. */
export function toBerlinDate(iso: string): string {
  return wallClock(new Date(iso)).date
}

/** `YYYY-MM-DDTHH:mm`, the format `<input type="datetime-local">` speaks. */
export function toBerlinDateTimeLocal(iso: string): string {
  const wall = wallClock(new Date(iso))
  return `${wall.date}T${wall.time.slice(0, 5)}`
}

const LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/**
 * Reads `YYYY-MM-DDTHH:mm` as if it were UTC, for offset arithmetic.
 *
 * The shape is checked with a pattern first, and deliberately so: `Date.parse`
 * falls back to an implementation-defined parser for anything it does not
 * recognise, and V8 answers `Date.parse('gestern:00Z')` with 1 January 2000
 * rather than `NaN`. A `Number.isNaN` guard alone lets garbage through as a
 * plausible-looking date.
 */
function parseLocal(local: string): number {
  if (!LOCAL_PATTERN.test(local)) throw new Error(`not a local date-time: ${local}`)

  const parsed = Date.parse(`${local}:00Z`)
  if (Number.isNaN(parsed)) throw new Error(`not a real date: ${local}`)

  // V8 rolls out-of-range components over instead of rejecting them:
  // 2026-02-31 comes back as 3 March. Comparing the round trip is what
  // actually catches an impossible date.
  if (new Date(parsed).toISOString().slice(0, 16) !== local) {
    throw new Error(`not a real date: ${local}`)
  }

  return parsed
}

/**
 * The reverse: a wall-clock string from the form back to a UTC instant.
 *
 * Two passes, because the offset depends on the very instant being computed.
 * The first pass guesses using the offset at the naive timestamp, the second
 * corrects it with the offset that actually applies — which matters on the two
 * nights a year the clocks move.
 */
export function fromBerlinDateTimeLocal(local: string): string {
  const naive = parseLocal(local)
  const firstGuess = new Date(naive - offsetAt(new Date(naive)))
  return new Date(naive - offsetAt(firstGuess)).toISOString()
}

/** Adds minutes to a wall-clock string, staying in wall-clock terms. */
export function addMinutesToLocal(local: string, minutes: number): string {
  return new Date(parseLocal(local) + minutes * 60_000).toISOString().slice(0, 16)
}

const dateFormat = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: PRACTICE_TIME_ZONE,
  dateStyle: 'medium',
})
const timeFormat = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: PRACTICE_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})
const weekdayFormat = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: PRACTICE_TIME_ZONE,
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
})

export function formatBerlinDate(iso: string): string {
  return dateFormat.format(new Date(iso))
}

export function formatBerlinTime(iso: string): string {
  return timeFormat.format(new Date(iso))
}

export function formatBerlinWeekday(iso: string): string {
  return weekdayFormat.format(new Date(iso))
}

export function formatBerlinDateTime(iso: string): string {
  return `${formatBerlinDate(iso)}, ${formatBerlinTime(iso)}`
}

/** Minutes between two instants, for showing how long an appointment runs. */
export function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000)
}

/**
 * Completed years between a date of birth and today, counted the way a person
 * counts them: the birthday itself is the day the number goes up.
 *
 * Both dates are read as Berlin calendar days. Late in the evening UTC is
 * already the previous day here, and someone would be a year too young on
 * their own birthday.
 */
export function ageInYears(dateOfBirth: string, now: Date): number {
  const today = toBerlinDate(now.toISOString())

  const [birthYear, birthMonth, birthDay] = dateOfBirth.split('-').map(Number)
  const [year, month, day] = today.split('-').map(Number)
  if (!birthYear || !birthMonth || !birthDay || !year || !month || !day) {
    throw new Error('not a date')
  }

  const hadBirthday = month > birthMonth || (month === birthMonth && day >= birthDay)
  return year - birthYear - (hadBirthday ? 0 : 1)
}

/** Whole days between two instants, counted in Berlin calendar days rather
 *  than in 24-hour steps — "yesterday" is a day on the wall calendar. */
function berlinDayDifference(iso: string, now: Date): number {
  const target = Date.parse(`${toBerlinDate(iso)}T00:00:00Z`)
  const today = Date.parse(`${toBerlinDate(now.toISOString())}T00:00:00Z`)
  return Math.round((target - today) / 86_400_000)
}

/**
 * How far away an appointment is, in the shortest German that still says it
 * exactly: "vor 12 Min.", "in 2 Std.", "morgen 09:00", "Mo, 24.08. 09:00".
 *
 * Hand-written rather than `Intl.RelativeTimeFormat`, which says "vor 2
 * Stunden" and offers no way to shorten it — in a table column the long form
 * pushes the date out of view.
 *
 * `now` is a parameter so the rendering is a pure function of its input and
 * the tests do not depend on the clock.
 */
export function formatRelativeBerlin(iso: string, now: Date): string {
  const difference = new Date(iso).getTime() - now.getTime()
  const distance = Math.abs(difference)
  const past = difference < 0

  if (distance < 60_000) return 'gerade eben'

  const minutes = Math.round(distance / 60_000)
  if (minutes < 60) return past ? `vor ${minutes} Min.` : `in ${minutes} Min.`

  const days = berlinDayDifference(iso, now)
  if (days === 0) {
    const hours = Math.round(distance / 3_600_000)
    return past ? `vor ${hours} Std.` : `in ${hours} Std.`
  }
  if (days === -1) return `gestern ${formatBerlinTime(iso)}`
  if (days === 1) return `morgen ${formatBerlinTime(iso)}`

  return `${formatBerlinWeekday(iso)} ${formatBerlinTime(iso)}`
}
