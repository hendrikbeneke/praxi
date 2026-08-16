import type { BusyInterval, FreeSlotQuery, FreeSlotsResponse } from '@praxi/shared'
import {
  fromBerlinDateTimeLocal,
  minutesToClock,
  SLOT_RELEASING_STATUSES,
  toBerlinDateTimeLocal,
} from '@praxi/shared'
import { and, eq, gte, inArray, lt, not } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { appointment } from '../db/schema.js'
import { listOpeningHours, windowsOfWeekday } from './opening-hour.js'

/**
 * Where a treatment of a given length would still fit (D9.5).
 *
 * **This runs on the server, and that makes rule 13 stricter rather than
 * weaker.** The search needs the practitioner's private busy times to be any
 * use — otherwise it offers the hour they are at the dentist — so it asks
 * Google for them, computes with them, and **does not return them**. The
 * answer is free windows and a flag. Nothing is stored, in no table and no
 * cache; the intervals live for the length of one request and are not even
 * sent to the browser, which is more than can be said for the calendar view,
 * where they have to travel because they are painted.
 *
 * The Google side arrives as a **parameter**, the shape `google/client.ts`
 * established: no test here talks to a service, and the tests assert what the
 * algorithm makes of what it was handed.
 *
 * Three things block a slot, and the difference between them matters:
 *
 * - **An appointment that holds its slot.** Cancelled ones do not (rule 6 and
 *   the exclusion constraint agree on this); a no-show does, because the time
 *   really was occupied.
 * - **A busy interval from Google.** Advisory in the calendar, where one may
 *   drop an appointment onto it — but a *suggestion* that lands there would be
 *   actively unhelpful, so here it counts.
 * - **Being outside the opening hours**, which is the whole reason this
 *   package needed a schema change.
 */

/** Suggestions start on a quarter hour. A slot at 09:07 is technically free
 *  and nobody books it. */
const ALIGN_MINUTES = 15

/** How the busy times are fetched. Injected so the domain never opens a
 *  connection and the tests never need one. */
export type BusyLookup = (from: Date, to: Date) => Promise<BusyInterval[]>

export async function findFreeSlots(
  database: Database,
  tenantId: string,
  query: FreeSlotQuery,
  busyLookup: BusyLookup,
  now: Date,
): Promise<FreeSlotsResponse> {
  const from = new Date(query.from)
  const to = new Date(query.to)

  const hours = await listOpeningHours(database, tenantId)
  if (hours.length === 0) {
    // No pattern, no ground to stand on. Answering with an assumed working day
    // would be the kind of invented state the screens are not allowed to show,
    // so this answers with nothing and says why. Google is not asked either —
    // there is nothing to check against.
    return { slots: [], privateCalendarsChecked: false, openingHoursSet: false }
  }

  const booked = await database
    .select({ startsAt: appointment.startsAt, endsAt: appointment.endsAt })
    .from(appointment)
    .where(
      and(
        eq(appointment.tenantId, tenantId),
        // Cancelled entries release the slot — the same condition the
        // exclusion constraint uses, so the calendar and the finder cannot
        // disagree about what "occupied" means.
        not(inArray(appointment.status, [...SLOT_RELEASING_STATUSES])),
        // An entry that starts before the window can still reach into it.
        lt(appointment.startsAt, to),
        gte(appointment.endsAt, from),
      ),
    )

  let privateCalendarsChecked = true
  const busy = await busyLookup(from, to).catch(() => {
    privateCalendarsChecked = false
    return [] as BusyInterval[]
  })

  const blocks = [
    ...booked.map((row) => [row.startsAt, row.endsAt] as const),
    ...busy.map((row) => [new Date(row.startsAt), new Date(row.endsAt)] as const),
  ]

  const slots: FreeSlotsResponse['slots'] = []
  for (const day of berlinDaysBetween(from, to)) {
    const weekday = isoWeekday(day)
    const onThisDay = blocks
      .map(([start, end]) => clampToDay(day, start, end))
      .filter((range): range is [number, number] => range !== null)

    for (const [openFrom, openTo] of windowsOfWeekday(hours, weekday)) {
      for (const [gapFrom, gapTo] of subtract([openFrom, openTo], onThisDay)) {
        let start = Math.ceil(gapFrom / ALIGN_MINUTES) * ALIGN_MINUTES
        while (start + query.durationMin <= gapTo) {
          const startsAt = fromBerlinDateTimeLocal(`${day}T${minutesToClock(start)}`)
          const endsAt = fromBerlinDateTimeLocal(
            `${day}T${minutesToClock(start + query.durationMin)}`,
          )
          // A free slot in the past is not an offer.
          if (new Date(startsAt) >= now && new Date(startsAt) >= from && new Date(endsAt) <= to) {
            slots.push({ startsAt, endsAt })
          }
          start += query.durationMin
        }
      }
    }
  }

  slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  return { slots, privateCalendarsChecked, openingHoursSet: true }
}

/** Every Berlin calendar day the window touches, as `YYYY-MM-DD`. Walked in
 *  wall-clock terms rather than by adding 24 hours, so the day the clocks
 *  change is one day like any other. */
function berlinDaysBetween(from: Date, to: Date): string[] {
  const first = toBerlinDateTimeLocal(from.toISOString()).slice(0, 10)
  const last = toBerlinDateTimeLocal(new Date(to.getTime() - 1).toISOString()).slice(0, 10)

  const days: string[] = []
  let cursor = first
  // A window longer than a year is not something any screen asks for; the
  // bound is here so a bad parameter cannot spin.
  for (let guard = 0; guard < 400 && cursor <= last; guard += 1) {
    days.push(cursor)
    const next = new Date(`${cursor}T12:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    cursor = next.toISOString().slice(0, 10)
  }
  return days
}

/** ISO 8601 weekday of a `YYYY-MM-DD`: Monday is 1. */
function isoWeekday(day: string): number {
  return ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1
}

/**
 * An interval as minutes within one Berlin day, or `null` when it does not
 * touch that day. Clamped at both ends: an all-day blocker from a private
 * calendar spans the whole day, and one that starts the evening before reaches
 * into the morning.
 */
function clampToDay(day: string, start: Date, end: Date): [number, number] | null {
  const dayStart = new Date(fromBerlinDateTimeLocal(`${day}T00:00`)).getTime()
  const nextDay = new Date(`${day}T12:00:00Z`)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  const dayEnd = new Date(
    fromBerlinDateTimeLocal(`${nextDay.toISOString().slice(0, 10)}T00:00`),
  ).getTime()

  const from = Math.max(start.getTime(), dayStart)
  const to = Math.min(end.getTime(), dayEnd)
  if (to <= from) return null

  return [Math.floor((from - dayStart) / 60_000), Math.ceil((to - dayStart) / 60_000)]
}

/** What is left of a window once the blocks are taken out of it. */
function subtract(
  window: [number, number],
  blocks: readonly [number, number][],
): [number, number][] {
  const overlapping = blocks
    .filter(([from, to]) => to > window[0] && from < window[1])
    .sort((a, b) => a[0] - b[0])

  const gaps: [number, number][] = []
  let cursor = window[0]
  for (const [from, to] of overlapping) {
    if (from > cursor) gaps.push([cursor, Math.min(from, window[1])])
    cursor = Math.max(cursor, to)
    if (cursor >= window[1]) break
  }
  if (cursor < window[1]) gaps.push([cursor, window[1]])

  return gaps
}
