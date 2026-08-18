import {
  type ActivityStatus,
  activityStatuses,
  formatEuro,
  fromBerlinDateTimeLocal,
  typeCodeSchema,
} from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { ActivityList } from '@/components/activity-list'
import { filterChipClass } from '@/components/chip'
import { ContentWidth } from '@/components/content-width'
import { DateField } from '@/components/date-field'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { activityListQueryOptions, activitySummaryQueryOptions } from '@/lib/activities'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { strings } from '@/lib/strings'

/** Dates, a status and a type code — nothing personal, so the URL may carry
 *  them. Which row is expanded is not in here: it is a scroll position, not a
 *  place, and it belongs to the visit rather than to the address. */
const searchSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(activityStatuses).optional(),
  type: typeCodeSchema.optional(),
})

export const Route = createFileRoute('/_app/activities')({
  validateSearch: searchSchema,
  component: ActivitiesPage,
})

const ALL_TYPES = 'all'

function todayInBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

function shiftDays(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

function ActivitiesPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const today = todayInBerlin()
  const from = search.from ?? shiftDays(today, -90)
  const to = search.to ?? shiftDays(today, 30)

  const window = {
    from: fromBerlinDateTimeLocal(`${from}T00:00`),
    to: fromBerlinDateTimeLocal(`${shiftDays(to, 1)}T00:00`),
  }

  const types = useQuery(activityTypeListQueryOptions(true))
  const activities = useQuery(
    activityListQueryOptions({
      ...window,
      ...(search.status ? { status: search.status } : {}),
      ...(search.type ? { type: search.type } : {}),
    }),
  )
  /**
   * Its own request, unlike D7's invoice list, which counts the 200 rows it
   * loaded. The reason is the data, not a change of mind: the default window
   * here is 120 days, which for a working practice is some 700 activities, so
   * the list is paged and the browser cannot count what it never fetched.
   */
  const summary = useQuery(
    activitySummaryQueryOptions({ ...window, ...(search.type ? { type: search.type } : {}) }),
  )

  const [creating, setCreating] = useState(false)

  const setSearch = (change: Partial<z.infer<typeof searchSchema>>) =>
    void navigate({ search: (previous) => ({ ...previous, ...change }) })

  const counts = summary.data
  const chips: { value: ActivityStatus | undefined; label: string; count: number | undefined }[] = [
    { value: undefined, label: strings.activity.allStatuses, count: counts?.total },
    { value: 'planned', label: strings.activity.statuses.planned, count: counts?.planned },
    { value: 'rendered', label: strings.activity.statuses.rendered, count: counts?.rendered },
    { value: 'no_show', label: strings.activity.statuses.no_show, count: counts?.noShow },
  ]

  return (
    <>
      {/*
          Title, filters, chips and the summary are one full-bleed sticky band
          in card colour, and its bottom border is the rule the design runs
          across the whole width — the same shape as the contact record's
          header strip (K6). The rule is why the band exists: drawn under a
          capped block it would stop where the list stops, which is not a
          division of the screen but a line in the middle of it. The shell
          gives this route no padding (`lib/page-chrome.ts`).
        */}
      <div className="sticky top-0 z-5 border-b bg-card px-8 pt-[22px] pb-3.5">
        <PageHeader
          className="mb-0"
          title={strings.activity.title}
          description={strings.activity.description}
          actions={
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden />
              {strings.activity.create}
            </Button>
          }
        />

        {/* One wrapping row, bottom-aligned: the two date fields, the type
            filter, the chips and the summary sentence all sit on the same
            baseline (design). */}
        <div className="mt-4 flex flex-wrap items-end gap-[18px]">
          <div>
            <Label htmlFor="from">{strings.activity.rangeFrom}</Label>
            <DateField
              id="from"
              className="mt-1.5 w-40"
              value={from}
              onChange={(value: string) => setSearch({ from: value })}
            />
          </div>
          <div>
            <Label htmlFor="to">{strings.activity.rangeTo}</Label>
            <DateField
              id="to"
              className="mt-1.5 w-40"
              value={to}
              onChange={(value: string) => setSearch({ to: value })}
            />
          </div>
          <div>
            <Label htmlFor="type">{strings.activity.type}</Label>
            <Select
              value={search.type ?? ALL_TYPES}
              onValueChange={(value) =>
                setSearch({ type: value === ALL_TYPES ? undefined : value })
              }
            >
              <SelectTrigger id="type" className="mt-1.5 w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPES}>{strings.activity.allTypes}</SelectItem>
                {(types.data ?? [])
                  .filter((entry) => entry.active || entry.code === search.type)
                  .map((entry) => (
                    <SelectItem key={entry.code} value={entry.code}>
                      <span
                        aria-hidden
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      {entry.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* The counts describe the window, not the selection — picking a
              chip must not change the number written on it. Only the type
              filter beside them narrows them. */}
          <div className="flex flex-wrap items-center gap-2 pb-[7px]">
            {chips.map((chip) => (
              <button
                key={chip.value ?? 'all'}
                type="button"
                className={filterChipClass(search.status === chip.value)}
                onClick={() => setSearch({ status: chip.value })}
              >
                {/* The number first: on a filter chip it is the statement — how
                    many rows to expect — while a tab's number is an aside to
                    its name. Two roles, two positions (K8). */}
                {chip.count !== undefined && (
                  <span className="font-semibold tabular-nums">{chip.count}</span>
                )}
                {chip.label}
              </button>
            ))}
          </div>

          {counts && (
            <p className="pb-[9px] text-[13px] text-muted-foreground">
              {strings.activity.summary(
                counts.total,
                counts.upcoming,
                formatEuro(counts.unbilledCents),
              )}
            </p>
          )}
        </div>
      </div>

      <div className="px-8 pt-[18px] pb-12">
        {/* Only the list is capped; the band above runs to the window edge,
            which is what carries its full-width rule (K1). */}
        <ContentWidth max={1180}>
          <ActivityList
            activities={activities.data ?? []}
            emptyText={activities.isPending ? strings.status.loading : strings.activity.empty}
            creating={creating}
            onCreated={() => setCreating(false)}
            onCancelCreate={() => setCreating(false)}
          />
        </ContentWidth>
      </div>
    </>
  )
}
