import { clockToMinutes } from '@praxi/shared'
import { strings } from './strings'

/**
 * Calendar arithmetic on plain `YYYY-MM-DD` strings.
 *
 * Never on `Date` objects in the local zone: a day is a day, and adding 24
 * hours to an instant shifts it by one when the clocks change. Every function
 * here anchors at midday UTC, which no European offset can push across a date
 * boundary, and returns the date part again.
 *
 * It lives in `lib/` rather than in the calendar component because the mini
 * month, the grid and the page shell all need the same week arithmetic, and
 * three copies of "which Monday is this" would eventually be two.
 */

const NOON = 'T12:00:00Z'

/** Today in Berlin as `YYYY-MM-DD`. */
export function todayInBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

export function addDays(date: string, days: number): string {
  const shifted = new Date(`${date}${NOON}`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

/** Monday 0 … Sunday 6 — the German week, not the JavaScript one. */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}${NOON}`).getUTCDay() + 6) % 7
}

/** Monday of the week the date falls in. */
export function startOfWeek(date: string): string {
  return addDays(date, -weekdayIndex(date))
}

/**
 * ISO 8601 week number — the "KW" beside the range in the header.
 *
 * The Thursday rule: the week belongs to the year its Thursday is in, which is
 * what makes the turn of the year come out right rather than off by one.
 */
export function isoWeek(date: string): number {
  const thursday = new Date(`${addDays(startOfWeek(date), 3)}${NOON}`)
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4, 12))
  const offset = (firstThursday.getUTCDay() + 6) % 7
  const firstWeekMonday = new Date(firstThursday)
  firstWeekMonday.setUTCDate(firstThursday.getUTCDate() - offset)
  return Math.round((thursday.getTime() - firstWeekMonday.getTime()) / (7 * 86_400_000)) + 1
}

/** The same day-of-month in another month, clamped to its length — the 31st
 *  of January is the 28th of February, not the 3rd of March. Paging a month
 *  view uses it, which is why it does not simply add 30 days. */
export function shiftMonth(date: string, months: number): string {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7)) - 1 + months
  const day = Number(date.slice(8, 10))
  const lastOfTarget = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate()
  const moved = new Date(Date.UTC(year, month, Math.min(day, lastOfTarget), 12))
  return moved.toISOString().slice(0, 10)
}

export function monthLabel(date: string): string {
  const month = strings.date.months[Number(date.slice(5, 7)) - 1] ?? ''
  return `${month} ${date.slice(0, 4)}`
}

/** `08.10.` — the day in a column header, where the year is already in the
 *  heading above. */
export function shortDate(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.`
}

/** Minutes since midnight of the Berlin wall-clock time an instant falls on. */
export function minutesOfDay(local: string): number {
  return clockToMinutes(local.slice(11, 16))
}

// `minutesToClock` lives in `@praxi/shared` (D9.5): the opening hours and the
// slot search need the same conversion on the server, and one of the two
// copies would eventually round differently.
export { minutesToClock } from '@praxi/shared'
