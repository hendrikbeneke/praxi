import type { ActivityType, CalendarEntry } from '@praxi/shared'
import { activityTypeLabel, occupiesSlot } from '@praxi/shared'
import { strings } from './strings'

/**
 * What a calendar entry is *called*, and what stands under it (D-K2).
 *
 * Two lines, four screens: the grid, the day's schedule beside it, and the
 * month and list views that follow. Written once here rather than four times,
 * for the same reason `activityLabel()` lives in `packages/shared` — except
 * that this pair reads `strings`, so it belongs to the client and not to the
 * shared package.
 */

/**
 * The bold line: **the title, else the contact's name.**
 *
 * That order and not the other way round. A Vorgang usually has no title and
 * the name is what identifies it; where a title *was* typed, it was typed to
 * be read — and an appointment that belongs to nobody has nothing else at all.
 * Until D-K2 this was the contact name and only the contact name, which is why
 * a blocker would have been drawn as a nameless box.
 */
export function entryName(
  entry: Pick<CalendarEntry, 'title' | 'contactName' | 'activityType'>,
  types: readonly ActivityType[] | undefined,
): string {
  if (entry.title !== null) return entry.title
  if (entry.contactName !== null) return entry.contactName
  return entry.activityType
    ? activityTypeLabel(types, entry.activityType)
    : strings.appointment.untitled
}

/**
 * The grey line under it: **the kind of appointment — unless something became
 * of the slot.**
 *
 * A cancellation replaces the type ("Abgesagt", "Kurzfristig abgesagt"),
 * because that is the thing worth knowing at a glance; a request stands beside
 * it ("Angefragt · Erstgespräch"), because the slot is asked for and the kind
 * still says what for.
 *
 * What does **not** appear here is `activity.status`. Until D-K2 a rendered or
 * missed session showed "Stattgefunden" where its type belongs, so a past week
 * lost the one piece of information the column is scanned for. The status of
 * the treatment is a property of the Vorgang and is read in its own list.
 */
export function entrySubline(
  entry: Pick<CalendarEntry, 'status' | 'activityType'>,
  types: readonly ActivityType[] | undefined,
): string {
  const type = entry.activityType ? activityTypeLabel(types, entry.activityType) : ''

  if (!occupiesSlot(entry.status)) return strings.appointment.status[entry.status]
  if (entry.status === 'requested') {
    const asked = strings.appointment.status.requested
    return type === '' ? asked : `${asked} · ${type}`
  }
  return type
}
