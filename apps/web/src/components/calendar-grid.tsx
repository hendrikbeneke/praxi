import {
  type ActivityType,
  activityTypeColor,
  activityTypeLabel,
  type BusyInterval,
  type CalendarEntry,
  clockToMinutes,
  type FreeSlot,
  formatBerlinTime,
  fromBerlinDateTimeLocal,
  minutesBetween,
  type OpeningHour,
  occupiesSlot,
  toBerlinDateTimeLocal,
} from '@praxi/shared'
import { useEffect, useRef, useState } from 'react'
import {
  minutesOfDay,
  minutesToClock,
  shortDate,
  todayInBerlin,
  weekdayIndex,
} from '@/lib/calendar-dates'
import { entryName, entrySubline } from '@/lib/calendar-entry'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/**
 * The week or the day as a grid of columns, one per day (D9).
 *
 * **The full 24 hours, scrolled to the morning.** The predecessor drew 07:00 to
 * 21:00 and clamped anything outside it to the edge — which was deliberate for
 * a Google blocker that starts at 00:00, and a lie for a real appointment: a
 * session at 06:00 was painted where 07:00 is, and looked correct. A grid that
 * shows every hour cannot misplace one.
 *
 * **Dragging moves an entry**, and unlike a sort order that is not a
 * convenience: a calendar is the spatial representation of time, so the
 * position *is* the datum and dropping is the shortest true statement of "half
 * an hour later".
 *
 * **Nothing refuses the drop.** It used to: `appointment_no_overlap` in the
 * database was the answer, `moveAppointment` let it fire, and the red preview
 * here was advice ahead of it. Migration 0034 dropped that constraint, because
 * a double booking is a decision and a constraint cannot be overruled at the
 * moment it matters. So the red preview is all that is left — it says the time
 * is taken, and letting go books it anyway.
 *
 * It is still only *advice*, and for the same reason as before: the browser
 * knows the entries this week has loaded and nothing else. A Google busy block
 * is not among them at all — it is painted and never stored (rule 13), so it
 * never coloured a drop even when refusals existed.
 */

/**
 * Pixels per minute, by view. A day column is wider, so it can afford to be
 * taller too; a week has to fit five or seven of them side by side.
 *
 * 44 px per half hour, measured in the design's own screenshots over five
 * consecutive hour lines — not taken from prose. A proposal of 36 px went back
 * with the measurement attached: at that height a 45-minute entry is 54 px and
 * loses its third line, which is the type, which is what the block is for.
 */
const MINUTE_PX = { day: 56 / 30, workweek: 44 / 30, week: 44 / 30 } as const

/** Dropping snaps to this. Fifteen minutes is what a practice books in, and it
 *  is fine enough that the block lands where it was let go. */
const SNAP_MINUTES = 15

const DAY_MINUTES = 24 * 60
/** Where the grid is scrolled to when it opens (design). */
const OPENS_AT_HOUR = 8

/**
 * The four tones of the grid itself, from the design's value list.
 *
 * Written as `color-mix` against the theme's own tokens rather than as fixed
 * colours, so all five themes — including the dark one — get a wash that sits
 * on their own ground instead of a grey that only works on the light one.
 */
const TODAY_HEADER = 'color-mix(in oklab, var(--primary) 8%, var(--card))'
const TODAY_COLUMN = 'color-mix(in oklab, var(--primary) 3%, var(--card))'
const HALF_HOUR_LINE = 'color-mix(in oklab, var(--border) 45%, transparent)'
const CLOSED_WASH = 'color-mix(in oklab, var(--muted) 55%, transparent)'
/** Enough for two lines of text — a five-minute entry must stay readable. */
const MIN_BLOCK_PX = 22

export type CalendarView = 'day' | 'workweek' | 'week'

export type DropTarget = { appointmentId: string; startsAt: string; endsAt: string }

type DragState = {
  entry: CalendarEntry
  /** Where inside the block it was grabbed, in minutes. Dropping positions the
   *  block's top, not the pointer, or every drag would jump by half a block. */
  grabOffset: number
  day: string
  startMinutes: number
}

export function CalendarGrid({
  days,
  view,
  entries,
  busy,
  openingHours,
  types,
  conflicted,
  selectedId,
  freeSlots,
  freeSlotsAreComplete = true,
  slotTypeLabel = null,
  onSelect,
  onNewAt,
  onMove,
  onPickSlot,
}: {
  days: readonly string[]
  view: CalendarView
  entries: readonly CalendarEntry[]
  busy: readonly BusyInterval[]
  /**
   * The weekly pattern, painted as a grey wash outside its windows (D-K2).
   *
   * **Optical only.** An appointment can be entered there like anywhere else —
   * a Saturday course and an evening call are exactly the cases a practice has
   * — and only the slot finder treats the hours as a rule. Empty while the
   * query is loading and when nothing is configured, which both come out as no
   * wash rather than as a day painted shut.
   */
  openingHours: readonly OpeningHour[]
  types: readonly ActivityType[] | undefined
  conflicted: ReadonlySet<string>
  selectedId: string | null
  /** Suggestions from the slot finder (D9.5). Empty unless it is running. */
  freeSlots?: readonly FreeSlot[]
  /** False when the private calendars could not be consulted. The suggestions
   *  are then painted in the warning tone rather than in grey — whoever clicks
   *  a slot without reading the rail still sees that the answer is the weaker
   *  kind. */
  freeSlotsAreComplete?: boolean
  /** What the search was for, printed under the time on every offer. Null when
   *  the finder was given a bare duration and there is nothing to name. */
  slotTypeLabel?: string | null
  onSelect: (entry: CalendarEntry) => void
  onNewAt: (startsAtLocal: string) => void
  onMove: (target: DropTarget) => void
  onPickSlot?: (slot: FreeSlot) => void
}) {
  const perMinute = MINUTE_PX[view]
  const height = DAY_MINUTES * perMinute
  /** The week steps back while the finder is offering times, so what the eye
   *  lands on is the offers (design). */
  const dimmed = freeSlots !== undefined
  const scroller = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const today = todayInBerlin()

  /**
   * Opened at eight rather than at midnight — the hours before are drawn so
   * nothing can be misplaced, not because anyone reads them.
   *
   * A few pixels short of eight, because the hour's label sits *on* its line
   * and scrolling exactly to it hides the label under the sticky header: the
   * grid would open with an unlabelled line at the top.
   */
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = OPENS_AT_HOUR * 60 * perMinute - 12
  }, [perMinute])

  const dayOf = (iso: string) => toBerlinDateTimeLocal(iso).slice(0, 10)
  const startMinutesOf = (iso: string) => minutesOfDay(toBerlinDateTimeLocal(iso))

  /** Where a drop would land, given the pointer inside a day column. */
  function targetOf(event: React.DragEvent<HTMLDivElement>, day: string): DragState | null {
    if (!drag) return null
    const bounds = event.currentTarget.getBoundingClientRect()
    const pointerMinutes = (event.clientY - bounds.top) / perMinute
    const raw = pointerMinutes - drag.grabOffset
    const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES
    const length = minutesBetween(drag.entry.startsAt, drag.entry.endsAt)
    return {
      ...drag,
      day,
      startMinutes: Math.max(0, Math.min(DAY_MINUTES - length, snapped)),
    }
  }

  /** Only against what is loaded, and never against a released slot or the
   *  entry being dragged. The database has the last word. */
  function collides(target: DragState): boolean {
    const length = minutesBetween(target.entry.startsAt, target.entry.endsAt)
    const from = target.startMinutes
    const to = from + length
    return entries.some(
      (other) =>
        other.id !== target.entry.id &&
        occupiesSlot(other.status) &&
        dayOf(other.startsAt) === target.day &&
        startMinutesOf(other.startsAt) < to &&
        startMinutesOf(other.startsAt) + minutesBetween(other.startsAt, other.endsAt) > from,
    )
  }

  const hours = Array.from({ length: 24 }, (_, hour) => hour)

  /**
   * The parts of a day that lie outside every opening window, as
   * `[from, to)` in minutes — the complement, computed once per day rather
   * than per hour cell.
   *
   * With no pattern configured the answer is *nothing shaded*, not a day
   * painted shut: an empty table means "not said yet", and a screen that
   * greys out the whole week because a form has never been filled in would be
   * claiming a state that does not exist.
   */
  function closedIntervals(day: string): Array<[number, number]> {
    if (openingHours.length === 0) return []

    const iso = weekdayIndex(day) + 1
    const windows = openingHours
      .filter((window) => window.weekday === iso)
      .map((window): [number, number] => [
        clockToMinutes(window.startsAt),
        clockToMinutes(window.endsAt),
      ])
      .sort((a, b) => a[0] - b[0])

    const closed: Array<[number, number]> = []
    let cursor = 0
    for (const [from, to] of windows) {
      if (from > cursor) closed.push([cursor, from])
      cursor = Math.max(cursor, to)
    }
    if (cursor < DAY_MINUTES) closed.push([cursor, DAY_MINUTES])
    return closed
  }

  return (
    <div ref={scroller} className="flex-1 overflow-auto">
      <div className="min-w-[560px]">
        <div className="sticky top-0 z-10 flex border-b bg-card">
          <div className="w-14 shrink-0" />
          {days.map((day) => (
            <div
              key={day}
              className="min-w-0 flex-1 border-l px-2 py-2"
              style={day === today ? { backgroundColor: TODAY_HEADER } : undefined}
            >
              <p
                className={cn(
                  'text-[11px] uppercase tracking-wide',
                  day === today ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {strings.date.weekdays[(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7]}
              </p>
              <p
                className={cn(
                  'tabular-nums',
                  day === today ? 'font-bold text-primary' : 'font-semibold',
                )}
              >
                {shortDate(day)}
              </p>
            </div>
          ))}
        </div>

        <div className="flex">
          <div className="w-14 shrink-0">
            {hours.map((hour) => (
              <div
                key={hour}
                className="relative"
                style={{ height: 60 * perMinute }}
                aria-hidden={hour === 0}
              >
                <span className="-top-2 absolute right-2 text-[11px] text-muted-foreground tabular-nums">
                  {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
                </span>
              </div>
            ))}
          </div>

          {days.map((day) => {
            const target = drag && drag.day === day ? drag : null
            const clash = target ? collides(target) : false

            /*
             * The drop zone is the whole column, because a drop has to be
             * accepted over an entry as much as over empty time. Everything
             * inside it that can be *operated* is a real button — every hour
             * opens a new activity, every entry opens itself — so the column
             * carries no affordance a keyboard misses.
             */
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: drop zone, see above
              <div
                key={day}
                className="relative min-w-0 flex-1 border-l"
                style={{ height, ...(day === today ? { backgroundColor: TODAY_COLUMN } : {}) }}
                onDragOver={(event) => {
                  if (!drag) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  const next = targetOf(event, day)
                  if (next && (next.day !== drag.day || next.startMinutes !== drag.startMinutes)) {
                    setDrag(next)
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const landed = targetOf(event, day)
                  setDrag(null)
                  if (!landed) return
                  const length = minutesBetween(landed.entry.startsAt, landed.entry.endsAt)
                  onMove({
                    appointmentId: landed.entry.id,
                    startsAt: fromBerlinDateTimeLocal(
                      `${landed.day}T${minutesToClock(landed.startMinutes)}`,
                    ),
                    endsAt: fromBerlinDateTimeLocal(
                      `${landed.day}T${minutesToClock(landed.startMinutes + length)}`,
                    ),
                  })
                }}
              >
                {hours.map((hour) => (
                  <button
                    type="button"
                    key={hour}
                    className="block w-full border-t transition-colors hover:bg-accent/50"
                    style={{ height: 60 * perMinute }}
                    aria-label={`${strings.appointment.newHere} ${shortDate(day)} ${String(hour).padStart(2, '0')}:00`}
                    onClick={() => onNewAt(`${day}T${String(hour).padStart(2, '0')}:00`)}
                  />
                ))}

                {/* The half hour, lighter than the hour above it (design).
                    Drawn rather than made into a second button per half hour:
                    that would be a change to where a click lands, and this
                    package is about how the grid reads. */}
                {hours.map((hour) => (
                  <div
                    key={`half-${hour}`}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 h-px"
                    style={{ top: (hour * 60 + 30) * perMinute, backgroundColor: HALF_HOUR_LINE }}
                  />
                ))}

                {/* Outside the opening hours. Behind everything, and it stops
                    no click: entering an appointment there is allowed and only
                    the finder treats the hours as a rule. */}
                {closedIntervals(day).map(([from, to]) => (
                  <div
                    key={`closed-${from}`}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0"
                    style={{
                      top: from * perMinute,
                      height: (to - from) * perMinute,
                      backgroundColor: CLOSED_WASH,
                    }}
                  />
                ))}

                {/* Where a treatment would fit (D9.5). Below the entries in
                    the stack, so an existing appointment always wins the
                    click. Dashed, because it is an offer and not a thing. */}
                {(freeSlots ?? [])
                  .filter((slot) => dayOf(slot.startsAt) === day)
                  .map((slot) => (
                    <button
                      type="button"
                      key={slot.startsAt}
                      onClick={() => onPickSlot?.(slot)}
                      style={{
                        top: startMinutesOf(slot.startsAt) * perMinute,
                        height: Math.max(
                          MIN_BLOCK_PX,
                          minutesBetween(slot.startsAt, slot.endsAt) * perMinute - 2,
                        ),
                      }}
                      className={cn(
                        'absolute inset-x-0.5 z-[1] overflow-hidden rounded border border-dashed px-1.5 py-0.5 text-left text-[11px] leading-tight',
                        // Grey and dashed, not primary-tinted (design): an
                        // offer is a shape in the grid, not a second kind of
                        // appointment. The warning tone stays for the one case
                        // that means something — private calendars unchecked,
                        // so the answer is the weaker kind.
                        freeSlotsAreComplete
                          ? 'border-border bg-muted/60 hover:bg-muted'
                          : 'border-warning/60 bg-warning/10 text-warning hover:bg-warning/20',
                      )}
                    >
                      <span className="block truncate font-semibold tabular-nums">
                        {formatBerlinTime(slot.startsAt)}–{formatBerlinTime(slot.endsAt)}
                      </span>
                      {/* What would be booked there, where the search named a
                          kind. Only if the block is tall enough to hold it. */}
                      {slotTypeLabel !== null &&
                        minutesBetween(slot.startsAt, slot.endsAt) * perMinute >= 40 && (
                          <span className="block truncate text-muted-foreground">
                            {slotTypeLabel}
                          </span>
                        )}
                    </button>
                  ))}

                {/* Somebody else's calendar. Behind the entries, not clickable,
                    and never in the way of a drop — see the note above. */}
                {busy
                  .filter((slot) => dayOf(slot.startsAt) === day)
                  .map((slot) => (
                    <div
                      key={`${slot.startsAt}-${slot.endsAt}`}
                      aria-hidden
                      title={strings.google.busyLegend}
                      style={{
                        top: startMinutesOf(slot.startsAt) * perMinute,
                        height: Math.max(
                          MIN_BLOCK_PX,
                          minutesBetween(slot.startsAt, slot.endsAt) * perMinute,
                        ),
                      }}
                      className="pointer-events-none absolute inset-x-0 rounded-sm bg-[repeating-linear-gradient(45deg,var(--color-muted-foreground)_0_2px,transparent_2px_8px)] opacity-20"
                    />
                  ))}

                {entries
                  .filter((entry) => dayOf(entry.startsAt) === day)
                  .map((entry) => {
                    const length = minutesBetween(entry.startsAt, entry.endsAt)
                    const released = !occupiesSlot(entry.status)
                    const requested = entry.status === 'requested'
                    /**
                     * **A tint of the type's colour over the card, with the
                     * colour itself as a stripe down the left edge** — the
                     * design's shape, and until K10 this was the full colour
                     * across the whole block, which made a week of sessions a
                     * wall of paint.
                     *
                     * The tint is what makes the text a *token* rather than a
                     * calculation: mixed with `--card` the surface is light in
                     * every light theme and dark in the dark one, so
                     * `--foreground` reads on all five. See the note on
                     * `readableTextOn` for why measuring the type colour would
                     * be worse than useless here.
                     *
                     * A released slot keeps the muted look: it is struck
                     * through, and painting it at all would make it as loud as
                     * a live entry. A requested one is dashed all round — the
                     * slot is asked for, not held.
                     */
                    const color = activityTypeColor(types, entry.activityType)
                    /**
                     * 20 % of the type's colour, 9 % while the slot is only
                     * asked for — and 12 % for an entry that carries no
                     * Vorgang, which is the practice's own time and has no
                     * type to take a colour from. It is painted in the neutral
                     * default, and at 20 % a neutral reads heavier than a
                     * session does.
                     */
                    const fill = requested ? '9%' : entry.activityId === null ? '12%' : '20%'
                    const paint = released
                      ? undefined
                      : {
                          backgroundColor: `color-mix(in oklab, ${color} ${fill}, var(--card))`,
                          borderColor: requested ? color : 'transparent',
                          borderLeftColor: color,
                          borderLeftWidth: requested ? 1 : 3,
                        }

                    return (
                      <button
                        type="button"
                        key={entry.id}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('text/plain', entry.id)
                          const bounds = event.currentTarget.getBoundingClientRect()
                          setDrag({
                            entry,
                            grabOffset: (event.clientY - bounds.top) / perMinute,
                            day,
                            startMinutes: startMinutesOf(entry.startsAt),
                          })
                        }}
                        onDragEnd={() => setDrag(null)}
                        onClick={() => onSelect(entry)}
                        title={[
                          entryName(entry, types),
                          entry.activityType ? activityTypeLabel(types, entry.activityType) : null,
                          strings.appointment.status[entry.status],
                          entry.activityStatus && entry.activityStatus !== 'planned'
                            ? strings.activity.statuses[entry.activityStatus]
                            : null,
                        ]
                          .filter((part) => part !== null)
                          .join(' — ')}
                        style={{
                          top: startMinutesOf(entry.startsAt) * perMinute,
                          height: Math.max(MIN_BLOCK_PX, length * perMinute - 2),
                          ...paint,
                        }}
                        className={cn(
                          'absolute inset-x-0.5 z-[2] overflow-hidden rounded border px-1.5 py-0.5 text-left text-xs leading-tight hover:brightness-[0.97]',
                          released && 'border-dashed bg-muted text-muted-foreground line-through',
                          requested && 'border-dashed',
                          // While the finder is running the week steps back, so
                          // the offers are what the eye lands on (design).
                          dimmed && 'opacity-45',
                          drag?.entry.id === entry.id && 'opacity-40',
                          selectedId === entry.id && 'ring-2 ring-ring',
                          // Changed here and in Google at the same time. The
                          // banner offers the decision; this says which slot.
                          conflicted.has(entry.id) && 'ring-2 ring-warning ring-offset-1',
                        )}
                      >
                        <span className="block truncate text-muted-foreground tabular-nums">
                          {formatBerlinTime(entry.startsAt)}–{formatBerlinTime(entry.endsAt)}
                        </span>
                        <span className="block truncate font-semibold">
                          {entryName(entry, types)}
                        </span>
                        {length * perMinute >= 58 && (
                          <span className="block truncate text-muted-foreground">
                            {entrySubline(entry, types)}
                          </span>
                        )}
                      </button>
                    )
                  })}

                {/* Where it would land. Red when it would clash — which the
                    database decides, not this, so the drop is still allowed
                    and answers with a sentence if it was wrong. */}
                {target && (
                  <div
                    aria-hidden
                    style={{
                      top: target.startMinutes * perMinute,
                      height: Math.max(
                        MIN_BLOCK_PX,
                        minutesBetween(target.entry.startsAt, target.entry.endsAt) * perMinute - 2,
                      ),
                    }}
                    className={cn(
                      'pointer-events-none absolute inset-x-0.5 z-[5] overflow-hidden rounded border-2 px-1.5 py-0.5 text-xs leading-tight',
                      clash
                        ? 'border-destructive bg-destructive/20 text-destructive'
                        : 'border-primary bg-primary/20 text-primary',
                    )}
                  >
                    <span className="block truncate font-semibold tabular-nums">
                      {minutesToClock(target.startMinutes)}–
                      {minutesToClock(
                        target.startMinutes +
                          minutesBetween(target.entry.startsAt, target.entry.endsAt),
                      )}
                    </span>
                    {clash && (
                      <span className="block truncate font-semibold">
                        {strings.appointment.dragOverlap}
                      </span>
                    )}
                  </div>
                )}

                {day === today && <NowLine perMinute={perMinute} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** The line across today. Its own component so the minute it re-renders on
 *  does not re-render the grid around it. */
function NowLine({ perMinute }: { perMinute: number }) {
  const [minutes, setMinutes] = useState(() =>
    minutesOfDay(toBerlinDateTimeLocal(new Date().toISOString())),
  )

  useEffect(() => {
    const timer = window.setInterval(
      () => setMinutes(minutesOfDay(toBerlinDateTimeLocal(new Date().toISOString()))),
      60_000,
    )
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-[3] h-px bg-destructive"
      style={{ top: minutes * perMinute }}
    >
      <span className="-left-1 -top-1 absolute size-2 rounded-full bg-destructive" />
    </div>
  )
}
