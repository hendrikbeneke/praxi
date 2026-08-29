import type { ActivityListQuery, ActivitySummary, ActivitySummaryQuery } from '@praxi/shared'
import { fromBerlinDateTimeLocal } from '@praxi/shared'
import { z } from 'zod'
import { addDays } from '@/lib/calendar-dates'
import { strings } from '@/lib/strings'

/**
 * What narrows a list of Vorgänge — on the Vorgänge page and in a contact's
 * Vorgänge tab, which is one set of rules and therefore one file (B2).
 *
 * The two screens had different filters until then: the page a window and a
 * type, the tab five chips and nothing else. A filter one of them has and the
 * other does not is not the same screen twice, so both got all of it.
 */

/**
 * The five chips, in the design's order.
 *
 * Each entry is a **query**, not a predicate: what narrows the list is what the
 * server is asked, so a chip cannot mean one thing in the count and another in
 * the rows. The past is paged, and a browser cannot narrow what it never
 * fetched.
 *
 * **There is deliberately no chip for a Terminstatus**, and none for "Ohne
 * Termin" either — this filters Vorgänge, not Termine. The appointment's status
 * still stands in every row as a badge, because a cancelled slot is something
 * one wants to see while skimming; being worth seeing and being worth filtering
 * by are different questions.
 */
export const activityFilters = {
  planned: { status: 'planned' },
  rendered: { status: 'rendered' },
  no_show: { status: 'no_show' },
  billed: { billing: 'billed' },
  unbilled: { billing: 'open' },
} as const satisfies Record<string, Pick<Partial<ActivityListQuery>, 'status' | 'billing'>>

export type ActivityFilterId = keyof typeof activityFilters

export const activityFilterIds = [
  'planned',
  'rendered',
  'no_show',
  'billed',
  'unbilled',
] as const satisfies readonly ActivityFilterId[]

/**
 * The filter in the URL, on both screens (B2).
 *
 * Dates, a chip and a type id — nothing personal, so the address may carry
 * them, and a narrowed view of one record becomes a link one can send. In the
 * contact record it stands beside `tab=activities`, which is in the URL for the
 * same reason.
 *
 * **Nothing is prefilled**, and the window least of all: a range the software
 * invented would read as a range somebody chose. Both bounds are optional all
 * the way down to `activityListQuerySchema`.
 */
export const activityFilterSearchSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  activityTypeId: z.uuid().optional(),
  filter: z.enum(activityFilterIds).optional(),
})

export type ActivityFilterValue = z.infer<typeof activityFilterSearchSchema>

/**
 * The window as the server wants it: two instants.
 *
 * `to` is **inclusive on screen and exclusive in the query** — "bis 11.09."
 * means that day counts, so what travels is the following midnight. Getting
 * this wrong drops a whole day of work out of a list without a trace.
 */
function windowOf(value: ActivityFilterValue) {
  return {
    ...(value.from ? { from: fromBerlinDateTimeLocal(`${value.from}T00:00`) } : {}),
    ...(value.to ? { to: fromBerlinDateTimeLocal(`${addDays(value.to, 1)}T00:00`) } : {}),
  }
}

/** What the two halves of the list are asked for. The contact is the one thing
 *  the two screens do not share: set means the tab, absent means the page. */
export function activityListParams(contactId: string | undefined, value: ActivityFilterValue) {
  return {
    ...(contactId ? { contactId } : {}),
    ...windowOf(value),
    ...(value.activityTypeId ? { activityTypeId: value.activityTypeId } : {}),
    ...(value.filter ? activityFilters[value.filter] : {}),
  }
}

/**
 * What the figures above it are asked for — the same selection **minus the
 * chip**.
 *
 * The counts describe what there is, not what is being looked at, so pressing a
 * chip must not change the number written on it. The window and the type do
 * reach them, because those sit above the chips rather than among them.
 */
export function activitySummaryParams(
  contactId: string | undefined,
  value: ActivityFilterValue,
): ActivitySummaryQuery {
  return {
    ...(contactId ? { contactId } : {}),
    ...windowOf(value),
    ...(value.activityTypeId ? { activityTypeId: value.activityTypeId } : {}),
  }
}

function chipLabel(id: ActivityFilterId): string {
  if (id === 'billed') return strings.counts.activitiesBilled
  if (id === 'unbilled') return strings.counts.activitiesUnbilled
  return strings.activity.statuses[id]
}

/** The count is the summary's, field for field — a chip must never work its
 *  own number out of the rows it happens to have. Undefined while the figures
 *  are still on their way, which a chip renders as no number rather than 0. */
function chipCount(summary: ActivitySummary | undefined, id: ActivityFilterId): number | undefined {
  if (!summary) return undefined
  if (id === 'planned') return summary.planned
  if (id === 'rendered') return summary.rendered
  if (id === 'no_show') return summary.noShow
  if (id === 'billed') return summary.billed
  return summary.unbilled
}

export function activityChips(
  summary: ActivitySummary | undefined,
): { id: ActivityFilterId; label: string; count: number | undefined }[] {
  return activityFilterIds.map((id) => ({
    id,
    label: chipLabel(id),
    count: chipCount(summary, id),
  }))
}
