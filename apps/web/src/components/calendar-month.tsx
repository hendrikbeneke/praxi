import type { ActivityType, CalendarEntry } from '@praxi/shared'
import {
  activityTypeColor,
  formatBerlinTime,
  occupiesSlot,
  toBerlinDateTimeLocal,
} from '@praxi/shared'
import { todayInBerlin } from '@/lib/calendar-dates'
import { entryName } from '@/lib/calendar-entry'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/** Three, then a count. More would make a busy day a wall of text and a quiet
 *  one a stretch of white; the number carries the rest (design image 08). */
const SHOWN_PER_DAY = 3

/**
 * The month as six weeks of cells (D-K4).
 *
 * It answers a different question from the week grid, and that is why it draws
 * nothing to scale: not "when exactly", but "how full is October, and is the
 * 14th free at all". So a cell lists what is on that day in order, three of
 * them, and says how many more there are.
 *
 * Clicking an entry opens it in the panel; clicking anywhere else in a cell
 * goes to that day. The month is the coarse view one navigates *from*, and
 * losing that would make it a picture rather than a screen.
 */
export function CalendarMonth({
  days,
  month,
  entries,
  types,
  selectedId,
  onSelectEntry,
  onPickDay,
}: {
  /** Always 42 — six weeks from the Monday on or before the first. */
  days: readonly string[]
  /** `YYYY-MM` of the month being shown, so the days around it can be dimmed. */
  month: string
  entries: readonly CalendarEntry[]
  types: readonly ActivityType[] | undefined
  selectedId: string | null
  onSelectEntry: (entry: CalendarEntry) => void
  onPickDay: (date: string) => void
}) {
  const today = todayInBerlin()

  /** Grouped once rather than filtered per cell: 42 cells over a month of
   *  entries is 42 passes, and the answer is the same one. */
  const byDay = new Map<string, CalendarEntry[]>()
  for (const entry of entries) {
    const day = toBerlinDateTimeLocal(entry.startsAt).slice(0, 10)
    byDay.set(day, [...(byDay.get(day) ?? []), entry])
  }
  for (const list of byDay.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-7 bg-muted/40">
          {strings.date.weekdaysLong.map((name) => (
            <div
              key={name}
              className="border-b px-3 py-2 text-muted-foreground text-[11px] uppercase tracking-wide"
            >
              {name}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const inMonth = day.slice(0, 7) === month
            const isToday = day === today
            const ofDay = byDay.get(day) ?? []

            return (
              <div
                key={day}
                className={cn(
                  // The right-most column's border is clipped by the rounded
                  // container, so no per-column exception is needed.
                  'min-h-[116px] border-r border-b p-2',
                  !inMonth && 'bg-muted/20',
                )}
                style={
                  isToday
                    ? { backgroundColor: 'color-mix(in oklab, var(--primary) 6%, var(--card))' }
                    : undefined
                }
              >
                {/* The date itself is the way into the day. A button, so it is
                    reachable without a mouse. */}
                <button
                  type="button"
                  onClick={() => onPickDay(day)}
                  className={cn(
                    'mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular-nums hover:bg-accent',
                    isToday && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
                    !inMonth && !isToday && 'text-muted-foreground/60',
                  )}
                >
                  {Number(day.slice(8, 10))}
                </button>

                <div className="space-y-0.5">
                  {ofDay.slice(0, SHOWN_PER_DAY).map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => onSelectEntry(entry)}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-accent',
                        selectedId === entry.id && 'bg-accent',
                      )}
                    >
                      <span
                        aria-hidden
                        className="size-1.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: activityTypeColor(types, entry.activityType),
                        }}
                      />
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {formatBerlinTime(entry.startsAt)}
                      </span>
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate',
                          !occupiesSlot(entry.status) && 'text-muted-foreground line-through',
                        )}
                      >
                        {entryName(entry, types)}
                      </span>
                    </button>
                  ))}

                  {ofDay.length > SHOWN_PER_DAY && (
                    <button
                      type="button"
                      onClick={() => onPickDay(day)}
                      className="px-1 text-muted-foreground text-xs hover:text-foreground"
                    >
                      {strings.appointment.moreInDay(ofDay.length - SHOWN_PER_DAY)}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
