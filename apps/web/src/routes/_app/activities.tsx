import { type Activity, activityStatuses, fromBerlinDateTimeLocal } from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { ActivityDialog } from '@/components/activity-dialog'
import { ActivityList } from '@/components/activity-list'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { activityListQueryOptions } from '@/lib/activities'
import { strings } from '@/lib/strings'

/** Dates and a status — nothing personal, so the URL may carry them. */
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
})

export const Route = createFileRoute('/_app/activities')({
  validateSearch: searchSchema,
  component: ActivitiesPage,
})

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

  const activities = useQuery(
    activityListQueryOptions({
      from: fromBerlinDateTimeLocal(`${from}T00:00`),
      to: fromBerlinDateTimeLocal(`${shiftDays(to, 1)}T00:00`),
      ...(search.status ? { status: search.status } : {}),
    }),
  )

  const [dialogOpen, setDialogOpen] = useState(false)
  const [edited, setEdited] = useState<Activity | undefined>()

  function open(activity?: Activity) {
    setEdited(activity)
    setDialogOpen(true)
  }

  return (
    <>
      <PageHeader
        title={strings.activity.title}
        description={strings.activity.description}
        actions={
          <Button onClick={() => open()}>
            <Plus className="size-4" aria-hidden />
            {strings.activity.create}
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="from">{strings.appointment.previous}</Label>
          <Input
            id="from"
            type="date"
            className="mt-2"
            value={from}
            onChange={(event) =>
              void navigate({ search: (previous) => ({ ...previous, from: event.target.value }) })
            }
          />
        </div>
        <div>
          <Label htmlFor="to">{strings.appointment.next}</Label>
          <Input
            id="to"
            type="date"
            className="mt-2"
            value={to}
            onChange={(event) =>
              void navigate({ search: (previous) => ({ ...previous, to: event.target.value }) })
            }
          />
        </div>

        {/* Filtered on the server: this list is paged, so narrowing it in the
            browser would hide rows the page never fetched. */}
        <div className="flex gap-1">
          {[undefined, ...activityStatuses].map((value) => (
            <Button
              key={value ?? 'all'}
              size="sm"
              variant={search.status === value ? 'default' : 'outline'}
              onClick={() =>
                void navigate({ search: (previous) => ({ ...previous, status: value }) })
              }
            >
              {value === undefined
                ? strings.activity.allStatuses
                : strings.activity.statuses[value]}
            </Button>
          ))}
        </div>
      </div>

      <ActivityList
        activities={activities.data ?? []}
        onOpen={open}
        emptyText={activities.isPending ? strings.status.loading : strings.activity.empty}
      />

      <ActivityDialog activity={edited} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
