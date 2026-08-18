import {
  type CalendarEntry,
  type FreeSlot,
  formatBerlinDayMonth,
  formatBerlinWeekdayLong,
  fromBerlinDateTimeLocal,
  occupiesSlot,
  toBerlinDateTimeLocal,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
import { addDays, isoWeek, startOfWeek, todayInBerlin } from '@/lib/calendar-dates'
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
/** What the rail's "next free time" asks for before the finder has been given
 *  a length of its own — the middle of the design's three offers. */
const DEFAULT_FREE_MINUTES = 60

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

  /* Everything in the window. The status chip row that used to narrow this is
     gone with K10 — the design has none, and a calendar hiding half its
     entries behind a filter is a calendar one cannot trust at a glance. */
  const shown = entries.data ?? []
  /**
   * Which day the rail describes: the one that was picked, if it is in view;
   * otherwise today, if *that* is in view; otherwise the first day of the
   * range (design). Without the last two steps the overview described a day
   * nobody was looking at — paging a week forward left it on the anchor, which
   * is no longer on screen.
   */
  const overviewDay =
    view === 'day' || days.includes(anchor)
      ? anchor
      : days.includes(todayInBerlin())
        ? todayInBerlin()
        : (days[0] ?? anchor)

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
   * The first gap on the overview day long enough for what the finder is set
   * to — the card in the rail. Asked of the server like every other question
   * about free time: `findFreeSlots` in the domain knows the opening hours and
   * the private busy intervals, and a second answer computed in the browser
   * would eventually disagree with the suggestions in the grid.
   */
  const nextFreeDuration = slotSearch?.durationMin ?? DEFAULT_FREE_MINUTES
  const nextFree = useQuery(
    freeSlotsQueryOptions({
      from: fromBerlinDateTimeLocal(`${overviewDay}T00:00`),
      to: fromBerlinDateTimeLocal(`${addDays(overviewDay, 1)}T00:00`),
      durationMin: nextFreeDuration,
    }),
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

  /**
   * What the header says about the range, in the design's three forms:
   * `Mittwoch, 12. August` with `2026` beside it for a day, and
   * `10. – 14. August 2026` with `KW 33` for a week. The long weekday, not the
   * two-letter one from `strings.date.weekdays` — that list belongs to column
   * headings and the date picker, and reading it as prose is what produced
   * "Mi, 12.08.2026" (K9/K10).
   */
  const lastDayInView = addDays(firstDay, dayCount - 1)
  const title =
    view === 'day'
      ? formatBerlinWeekdayLong(`${anchor}T12:00:00Z`)
      : `${Number(firstDay.slice(8, 10))}. – ${formatBerlinDayMonth(
          `${lastDayInView}T12:00:00Z`,
        )} ${lastDayInView.slice(0, 4)}`
  const subtitle =
    view === 'day' ? anchor.slice(0, 4) : strings.appointment.calendarWeek(isoWeek(anchor))

  return (
    /* `h-full`, not a viewport calculation, and no negative margin: the shell
       gives this route no padding (`lib/page-chrome.ts`) and `main` is now a
       bounded flex child, so the calendar simply fills it. The `-m-8` dated
       from before K1 took the padding away and had been pulling the toolbar
       32px off the top-left corner ever since; the `100svh − 3.5rem` was the
       same sum written out by hand, and it had to be wrong the moment anything
       above it changed height. Found in K6, when the shell started owning the
       scroll. */
    <div className="flex h-full min-w-0">
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
          <h1 className="whitespace-nowrap font-semibold text-[19px] tracking-[-0.015em]">
            {title}
          </h1>
          <span className="whitespace-nowrap text-[13px] text-muted-foreground tabular-nums">
            {subtitle}
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
        anchor={overviewDay}
        onNew={() => {
          setSlotSearch(null)
          setSelection({ kind: 'new' })
        }}
        finderOpen={slotSearch !== null}
        nextFree={(nextFree.data?.slots ?? [])[0] ?? null}
        nextFreeDuration={nextFreeDuration}
        onUseNextFree={(slot) => {
          setSlotSearch(null)
          setSelection({
            kind: 'new',
            startsAtLocal: toBerlinDateTimeLocal(slot.startsAt).slice(0, 16),
            durationMin: nextFreeDuration,
          })
        }}
        onToggleFinder={() => {
          setSelection(null)
          setSlotSearch((current) =>
            current ? null : { durationMin: DEFAULT_FREE_MINUTES, typeCode: null },
          )
        }}
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
