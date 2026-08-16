import type { OpeningHour, OpeningHoursInput } from '@praxi/shared'
import { clockToMinutes } from '@praxi/shared'
import { asc, eq } from 'drizzle-orm'
import type { Database, DbReader } from '../db/client.js'
import { openingHour } from '../db/schema.js'
import { newId } from '../id.js'

/**
 * The practice's weekly opening pattern.
 *
 * One row per interval (see the table's comment). Reading gives them in
 * weekday and clock order, which is the order the settings form draws and the
 * order the slot search walks.
 */

const columns = {
  id: openingHour.id,
  weekday: openingHour.weekday,
  startsAt: openingHour.startsAt,
  endsAt: openingHour.endsAt,
}

/** Postgres returns `time` as `HH:MM:SS`; the schema and every screen speak
 *  `HH:MM`, and the seconds are always zero because nothing can write them. */
function toClock(value: string): string {
  return value.slice(0, 5)
}

export async function listOpeningHours(reader: DbReader, tenantId: string): Promise<OpeningHour[]> {
  const rows = await reader
    .select(columns)
    .from(openingHour)
    .where(eq(openingHour.tenantId, tenantId))
    .orderBy(asc(openingHour.weekday), asc(openingHour.startsAt))

  return rows.map((row) => ({
    ...row,
    startsAt: toClock(row.startsAt),
    endsAt: toClock(row.endsAt),
  }))
}

/** Two windows on one weekday would overlap. The database refuses this too
 *  (`opening_hour_no_overlap`); the domain refuses first so the answer is a
 *  sentence and names the day. */
export class OverlappingWindowsError extends Error {
  constructor(readonly weekday: number) {
    super(`overlapping opening hours on weekday ${weekday}`)
  }
}

/**
 * Replaces the whole week.
 *
 * A replace rather than a patch, unlike `updatePracticeSettings`: this is one
 * form editing one table, and "this is the week" is a single statement. There
 * is no neighbouring panel whose unsaved field could be overwritten.
 *
 * Delete-and-insert rather than a diff, like `service_group_item`: these rows
 * carry nothing worth preserving — no date, nothing points at them — so
 * matching them up would be work for its own sake.
 */
export async function replaceOpeningHours(
  database: Database,
  tenantId: string,
  input: OpeningHoursInput,
): Promise<OpeningHour[]> {
  assertNoOverlap(input.windows)

  return database.transaction(async (tx) => {
    await tx.delete(openingHour).where(eq(openingHour.tenantId, tenantId))

    if (input.windows.length > 0) {
      await tx.insert(openingHour).values(
        input.windows.map((window) => ({
          id: newId(),
          tenantId,
          weekday: window.weekday,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
        })),
      )
    }

    return listOpeningHours(tx, tenantId)
  })
}

function assertNoOverlap(windows: OpeningHoursInput['windows']): void {
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    const ofDay = windows
      .filter((window) => window.weekday === weekday)
      .map((window) => [clockToMinutes(window.startsAt), clockToMinutes(window.endsAt)] as const)
      .sort((a, b) => a[0] - b[0])

    for (let index = 1; index < ofDay.length; index += 1) {
      const previous = ofDay[index - 1]
      const current = ofDay[index]
      if (previous && current && current[0] < previous[1]) {
        throw new OverlappingWindowsError(weekday)
      }
    }
  }
}

/** The windows of one weekday as minute ranges, sorted — what the slot search
 *  walks. Reads from a list already in hand rather than querying per day. */
export function windowsOfWeekday(
  hours: readonly OpeningHour[],
  weekday: number,
): [number, number][] {
  return hours
    .filter((window) => window.weekday === weekday)
    .map((window): [number, number] => [
      clockToMinutes(window.startsAt),
      clockToMinutes(window.endsAt),
    ])
    .sort((a, b) => a[0] - b[0])
}
