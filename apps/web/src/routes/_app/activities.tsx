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
      <PageHeader
        title={strings.activity.title}
        description={strings.activity.description}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            {strings.activity.create}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="from">{strings.activity.rangeFrom}</Label>
          <DateField
            id="from"
            className="mt-2 w-40"
            value={from}
            onChange={(value: string) => setSearch({ from: value })}
          />
        </div>
        <div>
          <Label htmlFor="to">{strings.activity.rangeTo}</Label>
          <DateField
            id="to"
            className="mt-2 w-40"
            value={to}
            onChange={(value: string) => setSearch({ to: value })}
          />
        </div>
        <div>
          <Label htmlFor="type">{strings.activity.type}</Label>
          <Select
            value={search.type ?? ALL_TYPES}
            onValueChange={(value) => setSearch({ type: value === ALL_TYPES ? undefined : value })}
          >
            <SelectTrigger id="type" className="mt-2 w-52">
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
      </div>

      {/* The counts describe the window, not the selection — picking a chip
          must not change the number written on it. Only the type filter above
          narrows them, because it sits above the chips. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <Button
            key={chip.value ?? 'all'}
            size="sm"
            className="rounded-full"
            variant={search.status === chip.value ? 'default' : 'outline'}
            onClick={() => setSearch({ status: chip.value })}
          >
            {chip.count !== undefined && (
              <span className="font-semibold tabular-nums">{chip.count}</span>
            )}
            {chip.label}
          </Button>
        ))}
      </div>

      {counts && (
        <p className="mb-6 text-muted-foreground text-sm">
          {strings.activity.summary(
            counts.total,
            counts.upcoming,
            formatEuro(counts.unbilledCents),
          )}
        </p>
      )}

      {/* Only the list is capped; the filter band above keeps running to the
          window edge, which is what carries its full-width rule (K1). */}
      <ContentWidth max={1180}>
        <ActivityList
          activities={activities.data ?? []}
          emptyText={activities.isPending ? strings.status.loading : strings.activity.empty}
          creating={creating}
          onCreated={() => setCreating(false)}
          onCancelCreate={() => setCreating(false)}
        />
      </ContentWidth>
    </>
  )
}
