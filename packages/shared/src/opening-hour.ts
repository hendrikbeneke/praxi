import { z } from 'zod'

/**
 * When the practice is open — the weekly pattern, one row per interval.
 *
 * **One row per interval, not per weekday.** A lunch break is two rows, a
 * morning-only day is one, and a day off is *no rows at all*: "closed" needs no
 * marker because it is the absence of an entry. A row per weekday with
 * from/to could not hold the break without a second pair of columns, and the
 * question after that is what two breaks would look like.
 *
 * Exceptions — holidays, a closed afternoon — are deliberately not here. They
 * are facts about a *date*, not about a weekday, and they arrive as a second
 * table beside this one when they arrive; this pattern does not change for
 * them.
 */

/** ISO 8601: Monday is 1, matching Postgres' `isodow`. The client counts from
 *  zero (`weekdayIndex` in `lib/calendar-dates.ts`) and converts in one place. */
export const weekdaySchema = z.number().int().min(1).max(7)

/** `HH:MM` wall clock. Not a timestamp: "open from eight on Mondays" means
 *  eight o'clock, before and after the clocks change. */
export const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

export const openingHourSchema = z.object({
  id: z.uuid(),
  weekday: weekdaySchema,
  startsAt: clockTimeSchema,
  endsAt: clockTimeSchema,
})

export type OpeningHour = z.infer<typeof openingHourSchema>

const openingHourInput = z
  .object({
    weekday: weekdaySchema,
    startsAt: clockTimeSchema,
    endsAt: clockTimeSchema,
  })
  .refine((window) => window.endsAt > window.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  })

/**
 * The whole week at once.
 *
 * A replace, not a patch, and unlike `practiceSettingsPatchSchema` that is the
 * right shape here: this is one form editing one table, and "this is the week"
 * is a single statement. There is no second panel that could be editing a
 * neighbouring field at the same time.
 */
export const openingHoursInputSchema = z.object({
  windows: z.array(openingHourInput).max(50),
})

export type OpeningHoursInput = z.infer<typeof openingHoursInputSchema>

/** Minutes since midnight, for the arithmetic. `08:30` → `510`. */
export function clockToMinutes(clock: string): number {
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5))
}

/** `510` → `08:30`. */
export function minutesToClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(minutes)))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

/**
 * What the slot finder asks for. The range is a parameter rather than a fixed
 * look-ahead: the calendar passes the window it is showing, and paging forward
 * is how one looks further — which keeps the answer in the grid, where the
 * context is.
 */
export const freeSlotQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  durationMin: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60),
})

export type FreeSlotQuery = z.infer<typeof freeSlotQuerySchema>

export const freeSlotSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
})

export type FreeSlot = z.infer<typeof freeSlotSchema>

/**
 * The answer carries **what it could not check**, not only what it found.
 *
 * `privateCalendarsChecked` is false when there is no Google connection, when
 * no calendar is selected for busy times, or when the query failed. The screen
 * does not distinguish the three, because they mean the same thing to the
 * practitioner: these suggestions do not know about your private appointments.
 *
 * `openingHoursSet` is a different kind of nothing. Without a weekly pattern
 * the search has no ground to stand on and answers with no slots at all rather
 * than assuming a working day — so the screen has to be able to say *why* the
 * list is empty.
 */
export const freeSlotsResponseSchema = z.object({
  slots: z.array(freeSlotSchema),
  privateCalendarsChecked: z.boolean(),
  openingHoursSet: z.boolean(),
})

export type FreeSlotsResponse = z.infer<typeof freeSlotsResponseSchema>
