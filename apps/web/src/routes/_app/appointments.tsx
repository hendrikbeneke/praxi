import {
  activityTypeLabel,
  appointmentStatuses,
  type CalendarEntry,
  type FreeSlot,
  fromBerlinDateTimeLocal,
  occupiesSlot,
  toBerlinDateTimeLocal,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { CalendarGrid, type CalendarView, type DropTarget } from '@/components/calendar-grid'
import { CalendarRail, type RailSelection } from '@/components/calendar-rail'
import { SlotFinder, type SlotSearch } from '@/components/slot-finder'
import { SyncConflictBanner } from '@/components/sync-conflicts'
import { Button } from '@/components/ui/button'
import { calendarQueryOptions, freeSlotsQueryOptions, moveAppointment } from '@/lib/activities'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { ApiError } from '@/lib/api'
import {
  addDays,
  isoWeek,
  monthLabel,
  shortDate,
  startOfWeek,
  todayInBerlin,
} from '@/lib/calendar-dates'
import { busyQueryOptions, googleConflictsQueryOptions } from '@/lib/google'
import { strings } from '@/lib/strings'

/**
 * Nothing personal in the URL: an anchor date, the view and the slot status.
 *
 * Which entry is selected is deliberately not in here, the same call D8 made
 * for its expanded row — a selection belongs to the visit, not to the address.
 */
const searchSchema = z.object({
  /** `YYYY-MM-DD` in Berlin — the day, or the day the week is taken from. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  view: z.enum(['day', 'workweek', 'week']).optional(),
  /** The slot's status. What became of the treatment is the activity's status
   *  and is filtered on the Vorgänge page, where the list is the record. */
  status: z.enum(appointmentStatuses).optional(),
})

export const Route = createFileRoute('/_app/appointments')({
  validateSearch: searchSchema,
  component: CalendarPage,
})

/**
 * Five days by default (D9).
 *
 * The seven-day view stays for the Saturdays a course falls on, but it is not
 * what a week looks like here — the design gives Saturday and Sunday 62 % of a
 * column and thereby says so itself. Five columns give each working day 40 %
 * more width, and width is the scarce thing: a block has to hold a time, a
 * name and a type.
 */
const DAY_COUNT: Record<CalendarView, number> = { day: 1, workweek: 5, week: 7 }

function CalendarPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()

  const view: CalendarView = search.view ?? 'workweek'
  const anchor = search.date ?? todayInBerlin()
  const dayCount = DAY_COUNT[view]
  const firstDay = view === 'day' ? anchor : startOfWeek(anchor)
  const days = Array.from({ length: dayCount }, (_, index) => addDays(firstDay, index))
  const lastDay = addDays(firstDay, dayCount)

  const from = fromBerlinDateTimeLocal(`${firstDay}T00:00`)
  const to = fromBerlinDateTimeLocal(`${lastDay}T00:00`)

  const calendarKey = calendarQueryOptions(from, to).queryKey
  const entries = useQuery(calendarQueryOptions(from, to))
  const types = useQuery(activityTypeListQueryOptions(true))

  /**
   * The practitioner's private calendars, as busy intervals and nothing else
   * — `freebusy.query` cannot answer with more, and the token's scope cannot
   * ask for more. Never stored: painted here and forgotten.
   *
   * It fails quietly. Without a connection or without a line the calendar
   * simply shows no foreign blocks, rather than covering a screen that
   * otherwise works with an error. The minute of `staleTime` is a cache and
   * not storage — it keeps paging through weeks with the arrow keys from
   * firing a request per keystroke.
   */
  const busy = useQuery(busyQueryOptions(from, to))
  const conflicts = useQuery(googleConflictsQueryOptions)
  const conflicted = new Set((conflicts.data ?? []).map((entry) => entry.appointmentId))

  /**
   * Filtered here rather than on the server: a week is fetched whole, so this
   * is instant and costs no round trip. The Vorgänge page does it the other
   * way round, because that list is paged.
   */
  const shown = (entries.data ?? []).filter(
    (entry) => search.status === undefined || entry.status === search.status,
  )
  const occupied = new Set(
    (entries.data ?? [])
      .filter((entry) => occupiesSlot(entry.status))
      .map((entry) => toBerlinDateTimeLocal(entry.startsAt).slice(0, 10)),
  )

  const [selection, setSelection] = useState<RailSelection>(null)

  /**
   * The slot finder (D9.5). Its range is the window on screen, so paging
   * forward is how one looks further — the answer stays in the grid, where a
   * time on a day is readable rather than merely describable.
   */
  const [slotSearch, setSlotSearch] = useState<SlotSearch | null>(null)
  const freeSlots = useQuery(
    freeSlotsQueryOptions(slotSearch ? { from, to, durationMin: slotSearch.durationMin } : null),
  )

  /**
   * Moving an entry, optimistically — **and put back on refusal.**
   *
   * The rollback is the point, not the speed. With a toast alone the block
   * would stay where it was dropped while the database held the old time, and
   * some later refetch would move it back at a moment nobody connected with
   * the drop. Springing back is the answer arriving where the question was
   * asked.
   */
  const move = useMutation({
    mutationFn: (target: DropTarget) =>
      moveAppointment(target.appointmentId, {
        startsAt: target.startsAt,
        endsAt: target.endsAt,
      }),
    onMutate: async (target) => {
      await queryClient.cancelQueries({ queryKey: calendarKey })
      const previous = queryClient.getQueryData<CalendarEntry[]>(calendarKey)
      queryClient.setQueryData<CalendarEntry[]>(calendarKey, (current) =>
        (current ?? []).map((entry) =>
          entry.id === target.appointmentId
            ? { ...entry, startsAt: target.startsAt, endsAt: target.endsAt }
            : entry,
        ),
      )
      return { previous }
    },
    onError: (error, _target, context) => {
      if (context?.previous) queryClient.setQueryData(calendarKey, context.previous)
      toast.error(error instanceof ApiError ? error.message : strings.appointment.moveFailed)
    },
    onSuccess: () => toast.success(strings.appointment.moved),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointments'] })
      // The activity moved with it (see `moveAppointment` in the domain), so
      // every list that shows a date of service is stale too.
      await queryClient.invalidateQueries({ queryKey: ['activities'] })
    },
  })

  /** Taking a suggestion: the finder closes and the form opens on that slot,
   *  with the length and the kind already set — the two things the search was
   *  about. */
  const pickSlot = (slot: FreeSlot) => {
    const chosen = slotSearch
    setSlotSearch(null)
    setSelection({
      kind: 'new',
      startsAtLocal: toBerlinDateTimeLocal(slot.startsAt).slice(0, 16),
      ...(chosen?.typeCode ? { typeCode: chosen.typeCode } : {}),
      ...(chosen ? { durationMin: chosen.durationMin } : {}),
    })
  }

  const setSearch = (change: Partial<z.infer<typeof searchSchema>>) =>
    void navigate({ search: (previous) => ({ ...previous, ...change }) })

  const title =
    view === 'day'
      ? `${strings.date.weekdays[(new Date(`${anchor}T12:00:00Z`).getUTCDay() + 6) % 7]}, ${shortDate(anchor)}${anchor.slice(0, 4)}`
      : `${shortDate(firstDay)} – ${shortDate(addDays(firstDay, dayCount - 1))} ${monthLabel(firstDay).slice(-4)}`

  return (
    <div className="-m-8 flex h-[calc(100svh-3.5rem)] min-w-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b bg-card px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => setSearch({ date: undefined })}>
            {strings.appointment.today}
          </Button>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={strings.appointment.previous}
              onClick={() => setSearch({ date: addDays(anchor, -dayCount) })}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={strings.appointment.next}
              onClick={() => setSearch({ date: addDays(anchor, dayCount) })}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
          <h1 className="whitespace-nowrap font-semibold text-lg">{title}</h1>
          <span className="text-muted-foreground text-sm tabular-nums">
            {strings.appointment.calendarWeek(isoWeek(anchor))}
          </span>

          <div className="ml-auto flex items-center gap-0.5 rounded-lg border p-0.5">
            {(['day', 'workweek', 'week'] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={view === value ? 'default' : 'ghost'}
                className="h-7"
                onClick={() => setSearch({ view: value === 'workweek' ? undefined : value })}
              >
                {strings.appointment.views[value]}
              </Button>
            ))}
          </div>

          <Button
            size="sm"
            variant={slotSearch ? 'default' : 'outline'}
            onClick={() => {
              setSelection(null)
              setSlotSearch((current) => (current ? null : { durationMin: 60, typeCode: null }))
            }}
          >
            <Search className="size-4" aria-hidden />
            {strings.slotFinder.open}
          </Button>

          <Button size="sm" onClick={() => setSelection({ kind: 'new' })}>
            <Plus className="size-4" aria-hidden />
            {strings.appointment.newAppointment}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-2">
          <div className="flex flex-wrap gap-1">
            {[undefined, ...appointmentStatuses].map((value) => (
              <Button
                key={value ?? 'all'}
                size="sm"
                variant={search.status === value ? 'default' : 'outline'}
                className="h-7 rounded-full"
                onClick={() => setSearch({ status: value })}
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
                  {activityTypeLabel(types.data, entry.code)}
                </span>
              ))}
            {(busy.data ?? []).length > 0 && (
              <span className="flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-full bg-muted-foreground/30"
                />
                {strings.google.busyLegend}
              </span>
            )}
          </div>
        </div>

        {conflicts.data && conflicts.data.length > 0 && (
          <div className="px-5 pt-3">
            <SyncConflictBanner conflicts={conflicts.data} />
          </div>
        )}

        <CalendarGrid
          days={days}
          view={view}
          entries={shown}
          busy={busy.data ?? []}
          types={types.data}
          conflicted={conflicted}
          selectedId={selection?.kind === 'activity' ? selection.appointmentId : null}
          onSelect={(entry) => {
            if (!entry.activityId) return
            setSelection({
              kind: 'activity',
              activityId: entry.activityId,
              appointmentId: entry.id,
            })
          }}
          onNewAt={(startsAtLocal) => setSelection({ kind: 'new', startsAtLocal })}
          onMove={(target) => move.mutate(target)}
          {...(slotSearch
            ? {
                freeSlots: freeSlots.data?.slots ?? [],
                freeSlotsAreComplete: freeSlots.data?.privateCalendarsChecked ?? true,
                onPickSlot: pickSlot,
              }
            : {})}
        />
      </section>

      <CalendarRail
        anchor={anchor}
        entries={shown}
        occupied={occupied}
        selection={selection}
        finder={
          slotSearch ? (
            <SlotFinder
              search={slotSearch}
              result={freeSlots.data}
              loading={freeSlots.isPending}
              onSearch={setSlotSearch}
              onClear={() => setSlotSearch(null)}
              onPick={pickSlot}
            />
          ) : null
        }
        onPickDay={(date) => setSearch({ date })}
        onSelectEntry={(entry) => {
          if (!entry.activityId) return
          setSelection({
            kind: 'activity',
            activityId: entry.activityId,
            appointmentId: entry.id,
          })
        }}
        onClose={() => setSelection(null)}
      />
    </div>
  )
}
