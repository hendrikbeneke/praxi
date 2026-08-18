import {
  type ActivityType,
  activityTypeColor,
  activityTypeLabel,
  type BusyInterval,
  type CalendarEntry,
  type FreeSlot,
  formatBerlinTime,
  fromBerlinDateTimeLocal,
  minutesBetween,
  occupiesSlot,
  toBerlinDateTimeLocal,
} from '@praxi/shared'
import { useEffect, useRef, useState } from 'react'
import { minutesOfDay, minutesToClock, shortDate, todayInBerlin } from '@/lib/calendar-dates'
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
 * an hour later". Three things guard it, and only the last one decides:
 *
 * 1. Here, while dragging — the target is checked against the entries this
 *    week has loaded and painted red when it collides. Advice, not
 *    enforcement: the browser only knows what it fetched.
 * 2. `moveAppointment` in the domain, which lets the constraint fire.
 * 3. `appointment_no_overlap` in the database, which is the answer.
 *
 * **A Google busy block never refuses a drop.** It is painted, never stored
 * (rule 13), and the constraint knows nothing about it — so a rule that
 * blocked here would permit, whenever the line is down, exactly what it forbids
 * when the line is up. That is the worst kind of rule, so there is none.
 */

/** Pixels per minute, by view. A day column is wider, so it can afford to be
 *  taller too; a week has to fit five or seven of them side by side. */
const MINUTE_PX = { day: 56 / 30, workweek: 44 / 30, week: 44 / 30 } as const

/** Dropping snaps to this. Fifteen minutes is what a practice books in, and it
 *  is fine enough that the block lands where it was let go. */
const SNAP_MINUTES = 15

const DAY_MINUTES = 24 * 60
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
  types,
  conflicted,
  selectedId,
  freeSlots,
  freeSlotsAreComplete = true,
  onSelect,
  onNewAt,
  onMove,
  onPickSlot,
}: {
  days: readonly string[]
  view: CalendarView
  entries: readonly CalendarEntry[]
  busy: readonly BusyInterval[]
  types: readonly ActivityType[] | undefined
  conflicted: ReadonlySet<string>
  selectedId: string | null
  /** Suggestions from the slot finder (D9.5). Empty unless it is running. */
  freeSlots?: readonly FreeSlot[]
  /** False when the private calendars could not be consulted. The suggestions
   *  are then painted in the warning tone rather than the primary one —
   *  whoever clicks a slot without reading the rail still sees that the
   *  answer is the weaker kind. */
  freeSlotsAreComplete?: boolean
  onSelect: (entry: CalendarEntry) => void
  onNewAt: (startsAtLocal: string) => void
  onMove: (target: DropTarget) => void
  onPickSlot?: (slot: FreeSlot) => void
}) {
  const perMinute = MINUTE_PX[view]
  const height = DAY_MINUTES * perMinute
  const scroller = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const today = todayInBerlin()

  /** Opened at the morning rather than at midnight — the hours before are
   *  drawn so nothing can be misplaced, not because anyone reads them. */
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * 60 * perMinute
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

  return (
    <div ref={scroller} className="flex-1 overflow-auto">
      <div className="min-w-[560px]">
        <div className="sticky top-0 z-10 flex border-b bg-card">
          <div className="w-14 shrink-0" />
          {days.map((day) => (
            <div
              key={day}
              className={cn('min-w-0 flex-1 border-l px-2 py-2', day === today && 'bg-primary/5')}
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
                className={cn('relative min-w-0 flex-1 border-l', day === today && 'bg-primary/3')}
                style={{ height }}
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
                        freeSlotsAreComplete
                          ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
                          : 'border-warning/60 bg-warning/10 text-warning hover:bg-warning/20',
                      )}
                    >
                      <span className="block truncate font-semibold tabular-nums">
                        {formatBerlinTime(slot.startsAt)}–{formatBerlinTime(slot.endsAt)}
                      </span>
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
                    const paint = released
                      ? undefined
                      : {
                          backgroundColor: `color-mix(in oklab, ${color} ${
                            requested ? '9%' : '20%'
                          }, var(--card))`,
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
                          entry.activityType ? activityTypeLabel(types, entry.activityType) : null,
                          strings.appointment.status[entry.status],
                          entry.activityStatus && entry.activityStatus !== 'planned'
                            ? strings.activity.statuses[entry.activityStatus]
                            : null,
                          entry.contactName,
                        ]
                          .filter((part) => part !== null)
                          .join(' — ')}
                        style={{
                          top: startMinutesOf(entry.startsAt) * perMinute,
                          height: Math.max(MIN_BLOCK_PX, length * perMinute - 2),
                          ...paint,
                        }}
                        className={cn(
                          'absolute inset-x-0.5 z-[2] overflow-hidden rounded border px-1.5 py-0.5 text-left text-xs leading-tight',
                          released && 'border-dashed bg-muted text-muted-foreground line-through',
                          requested && 'border-dashed',
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
                        <span className="block truncate font-semibold">{entry.contactName}</span>
                        {length * perMinute >= 58 && (
                          <span className="block truncate text-muted-foreground">
                            {entry.activityStatus && entry.activityStatus !== 'planned'
                              ? strings.activity.statuses[entry.activityStatus]
                              : entry.activityType
                                ? activityTypeLabel(types, entry.activityType)
                                : ''}
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
