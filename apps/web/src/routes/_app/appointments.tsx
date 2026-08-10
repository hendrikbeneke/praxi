import {
  activityTypeColor,
  activityTypeLabel,
  appointmentStatuses,
  type CalendarEntry,
  formatBerlinTime,
  fromBerlinDateTimeLocal,
  minutesBetween,
  occupiesSlot,
  readableTextOn,
  toBerlinDateTimeLocal,
} from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { ActivityDialog } from '@/components/activity-dialog'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { activityQueryOptions, calendarQueryOptions } from '@/lib/activities'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { strings } from '@/lib/strings'

/** Nothing personal in the URL: an anchor date and the view. */
const searchSchema = z.object({
  /** `YYYY-MM-DD` in Berlin — the day, or the day the week is taken from. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  view: z.enum(['week', 'day']).optional(),
  /** The slot's status. What became of the treatment is the activity's status
   *  and is filtered on the Vorgänge page, where the list is the record. */
  status: z.enum(appointmentStatuses).optional(),
})

export const Route = createFileRoute('/_app/appointments')({
  validateSearch: searchSchema,
  component: CalendarPage,
})

const DAY_START_HOUR = 7
const DAY_END_HOUR = 21
const PIXELS_PER_HOUR = 56

/** Today in Berlin as `YYYY-MM-DD`. */
function todayInBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

/** Calendar arithmetic on plain `YYYY-MM-DD` strings, so a day never shifts by
 *  an hour when the clocks change. */
function addDays(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

/** Monday of the week the date falls in. */
function startOfWeek(date: string): string {
  const at = new Date(`${date}T12:00:00Z`)
  const weekday = (at.getUTCDay() + 6) % 7
  return addDays(date, -weekday)
}

const WEEKDAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const

function CalendarPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const view = search.view ?? 'week'
  const anchor = search.date ?? todayInBerlin()
  const firstDay = view === 'week' ? startOfWeek(anchor) : anchor
  const dayCount = view === 'week' ? 7 : 1
  const days = Array.from({ length: dayCount }, (_, index) => addDays(firstDay, index))
  const lastDay = addDays(firstDay, dayCount)

  const entries = useQuery(
    calendarQueryOptions(
      fromBerlinDateTimeLocal(`${firstDay}T00:00`),
      fromBerlinDateTimeLocal(`${lastDay}T00:00`),
    ),
  )
  const types = useQuery(activityTypeListQueryOptions(true))

  /**
   * Filtered here rather than on the server: a week is fetched whole, so this
   * is instant and costs no round trip. The Vorgänge page does it the other
   * way round, because that list is paged.
   */
  const shown = (entries.data ?? []).filter(
    (entry) => search.status === undefined || entry.status === search.status,
  )

  const [dialogOpen, setDialogOpen] = useState(false)
  const [slotLocal, setSlotLocal] = useState<string | undefined>()
  const [editedId, setEditedId] = useState<string | undefined>()

  const edited = useQuery({
    ...activityQueryOptions(editedId ?? ''),
    enabled: dialogOpen && editedId !== undefined,
  })

  function openSlot(day: string, hour: number) {
    setEditedId(undefined)
    setSlotLocal(`${day}T${String(hour).padStart(2, '0')}:00`)
    setDialogOpen(true)
  }

  function openEntry(entry: CalendarEntry) {
    if (!entry.activityId) return
    setEditedId(entry.activityId)
    setSlotLocal(undefined)
    setDialogOpen(true)
  }

  function go(days_: number) {
    void navigate({
      search: (previous) => ({ ...previous, date: addDays(anchor, days_) }),
    })
  }

  const hours = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR },
    (_, index) => DAY_START_HOUR + index,
  )

  return (
    <>
      <PageHeader
        title={strings.appointment.title}
        description={strings.appointment.description}
        actions={
          <Button
            onClick={() => {
              setEditedId(undefined)
              setSlotLocal(undefined)
              setDialogOpen(true)
            }}
          >
            <Plus className="size-4" aria-hidden />
            {strings.activity.create}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label={strings.appointment.previous}
          onClick={() => go(-dayCount)}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={strings.appointment.next}
          onClick={() => go(dayCount)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            void navigate({ search: (previous) => ({ ...previous, date: undefined }) })
          }
        >
          {strings.appointment.today}
        </Button>

        <div className="ml-auto flex gap-1">
          {(['week', 'day'] as const).map((value) => (
            <Button
              key={value}
              variant={view === value ? 'default' : 'outline'}
              size="sm"
              onClick={() =>
                void navigate({
                  search: (previous) => ({
                    ...previous,
                    view: value === 'week' ? undefined : value,
                  }),
                })
              }
            >
              {value === 'week' ? strings.appointment.week : strings.appointment.day}
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-1">
          {[undefined, ...appointmentStatuses].map((value) => (
            <Button
              key={value ?? 'all'}
              size="sm"
              variant={search.status === value ? 'default' : 'outline'}
              onClick={() =>
                void navigate({ search: (previous) => ({ ...previous, status: value }) })
              }
            >
              {value === undefined
                ? strings.appointment.allStatuses
                : strings.appointment.status[value]}
            </Button>
          ))}
        </div>

        {/* The legend, so a colour in the grid can be read without opening an
            entry. Only the active types — the rest are history. */}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {(types.data ?? [])
            .filter((entry) => entry.active)
            .map((entry) => (
              <span key={entry.code} className="flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                {entry.label}
              </span>
            ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <div className="min-w-[720px]">
          {/* Day headers */}
          <div
            className="grid border-b bg-muted/40"
            style={{ gridTemplateColumns: `4rem repeat(${dayCount}, minmax(0, 1fr))` }}
          >
            <div />
            {days.map((day, index) => (
              <div key={day} className="border-l px-2 py-2 text-center">
                <span className="text-muted-foreground text-xs">{WEEKDAY_NAMES[index % 7]}</span>{' '}
                <span
                  className={
                    day === todayInBerlin()
                      ? 'font-semibold text-sm'
                      : 'text-muted-foreground text-sm'
                  }
                >
                  {day.slice(8, 10)}.{day.slice(5, 7)}.
                </span>
              </div>
            ))}
          </div>

          {/* Hour grid with absolutely positioned entries per day */}
          <div
            className="relative grid"
            style={{ gridTemplateColumns: `4rem repeat(${dayCount}, minmax(0, 1fr))` }}
          >
            <div>
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="border-b pr-2 text-right text-muted-foreground text-xs"
                  style={{ height: PIXELS_PER_HOUR }}
                >
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {days.map((day) => (
              <div key={day} className="relative border-l">
                {hours.map((hour) => (
                  <button
                    type="button"
                    key={hour}
                    className="block w-full border-b transition-colors hover:bg-accent/50"
                    style={{ height: PIXELS_PER_HOUR }}
                    aria-label={`${strings.appointment.newHere} ${day} ${hour}:00`}
                    onClick={() => openSlot(day, hour)}
                  />
                ))}

                {shown
                  .filter((entry) => toBerlinDateTimeLocal(entry.startsAt).slice(0, 10) === day)
                  .map((entry) => {
                    const startLocal = toBerlinDateTimeLocal(entry.startsAt)
                    const startMinutes =
                      Number(startLocal.slice(11, 13)) * 60 + Number(startLocal.slice(14, 16))
                    const top = ((startMinutes - DAY_START_HOUR * 60) / 60) * PIXELS_PER_HOUR
                    // Clamped to the bottom of the grid. An entry that runs
                    // past the visible day — or, when something went wrong,
                    // past the day itself — must not paint over the columns
                    // below it.
                    const gridHeight = (DAY_END_HOUR - DAY_START_HOUR) * PIXELS_PER_HOUR
                    const height = Math.min(
                      Math.max(
                        18,
                        (minutesBetween(entry.startsAt, entry.endsAt) / 60) * PIXELS_PER_HOUR - 2,
                      ),
                      Math.max(18, gridHeight - top),
                    )
                    const released = !occupiesSlot(entry.status)
                    /**
                     * The colour of the activity's type, with the label in
                     * whichever of black and white reads on it — see
                     * `readableTextOn`. A released slot keeps the muted look
                     * instead: it is struck through, and painting it in the
                     * type's colour would make it as loud as a live entry.
                     */
                    const color = activityTypeColor(types.data, entry.activityType)
                    const paint = released
                      ? undefined
                      : { backgroundColor: color, color: readableTextOn(color), borderColor: color }

                    return (
                      <button
                        type="button"
                        key={entry.id}
                        onClick={() => openEntry(entry)}
                        style={{ top, height, ...paint }}
                        className={`absolute inset-x-1 overflow-hidden rounded border px-1.5 py-0.5 text-left text-xs ${
                          released
                            ? 'border-dashed bg-muted text-muted-foreground line-through'
                            : ''
                        }`}
                        title={[
                          entry.activityType
                            ? activityTypeLabel(types.data, entry.activityType)
                            : null,
                          strings.appointment.status[entry.status],
                          entry.activityStatus && entry.activityStatus !== 'planned'
                            ? strings.activity.statuses[entry.activityStatus]
                            : null,
                          entry.contactName,
                        ]
                          .filter((part) => part !== null)
                          .join(' — ')}
                      >
                        <span className="block truncate font-medium">{entry.contactName}</span>
                        <span className="block truncate">
                          {formatBerlinTime(entry.startsAt)}–{formatBerlinTime(entry.endsAt)}
                          {/* A no-show must not look like an ordinary
                              appointment: the slot is occupied, but nothing
                              happened in it. */}
                          {entry.activityStatus !== null && entry.activityStatus !== 'planned' && (
                            <> · {strings.activity.statuses[entry.activityStatus]}</>
                          )}
                        </span>
                      </button>
                    )
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {entries.data !== undefined && shown.length === 0 && (
        <p className="mt-3 text-muted-foreground text-sm">{strings.appointment.empty}</p>
      )}

      <ActivityDialog
        activity={editedId ? edited.data : undefined}
        startsAtLocal={slotLocal}
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next)
          if (!next) setEditedId(undefined)
        }}
      />
    </>
  )
}
