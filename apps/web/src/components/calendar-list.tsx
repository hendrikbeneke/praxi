import type { ActivityType, CalendarEntry } from '@praxi/shared'
import {
  activityTypeColor,
  activityTypeLabel,
  formatBerlinTime,
  occupiesSlot,
  toBerlinDateTimeLocal,
} from '@praxi/shared'
import { Badge } from '@/components/ui/badge'
import { shortDate, weekdayIndex } from '@/lib/calendar-dates'
import { entryName } from '@/lib/calendar-entry'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/**
 * The week as a list, one card per day (D-K4, design image 09).
 *
 * The third way of asking, next to the grid and the month: not "when in the
 * day" and not "how full is the month", but simply *what is coming*, in order,
 * with room for the words the grid has to truncate. A day with nothing in it
 * is left out entirely — an empty card per closed Saturday would be six lines
 * of nothing in a view whose whole point is that it is short.
 */
export function CalendarList({
  days,
  entries,
  types,
  selectedId,
  onSelectEntry,
}: {
  days: readonly string[]
  entries: readonly CalendarEntry[]
  types: readonly ActivityType[] | undefined
  selectedId: string | null
  onSelectEntry: (entry: CalendarEntry) => void
}) {
  const byDay = new Map<string, CalendarEntry[]>()
  for (const entry of entries) {
    const day = toBerlinDateTimeLocal(entry.startsAt).slice(0, 10)
    byDay.set(day, [...(byDay.get(day) ?? []), entry])
  }
  for (const list of byDay.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  const filled = days.filter((day) => (byDay.get(day) ?? []).length > 0)

  if (filled.length === 0) {
    return (
      <div className="flex-1 overflow-auto p-4">
        <p className="text-muted-foreground text-sm">{strings.appointment.listEmpty}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      {/* Capped rather than stretched, measured off the design image: at the
          full width of a 2560 px screen the name and the status chip end up at
          opposite ends of a mostly empty line, and the eye has to travel the
          whole way to pair them. */}
      <div className="max-w-[820px] space-y-5">
        {filled.map((day) => (
          <div key={day} className="flex gap-4">
            {/* The day stands beside its card, not above it: the eye runs down
                one column of dates and across only where it stops. */}
            <div className="w-24 shrink-0 pt-2">
              <p className="text-muted-foreground text-[11px] uppercase tracking-wide">
                {strings.date.weekdaysLong[weekdayIndex(day)]}
              </p>
              <p className="font-semibold tabular-nums">{shortDate(day)}</p>
            </div>

            <div className="min-w-0 flex-1 overflow-hidden rounded-lg border">
              {(byDay.get(day) ?? []).map((entry, index) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onSelectEntry(entry)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50',
                    index > 0 && 'border-t',
                    selectedId === entry.id && 'bg-accent',
                  )}
                >
                  <span className="w-24 shrink-0 text-muted-foreground text-xs tabular-nums">
                    {formatBerlinTime(entry.startsAt)}–{formatBerlinTime(entry.endsAt)}
                  </span>
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: activityTypeColor(types, entry.activityType) }}
                  />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate font-medium text-sm',
                      !occupiesSlot(entry.status) && 'text-muted-foreground line-through',
                    )}
                  >
                    {entryName(entry, types)}
                  </span>
                  <span className="shrink-0 text-muted-foreground text-sm">
                    {entry.activityType ? activityTypeLabel(types, entry.activityType) : ''}
                  </span>
                  {/* The status as a chip, which the grid has no room for and
                      this view does. */}
                  <Badge variant="outline" className="shrink-0">
                    {strings.appointment.status[entry.status]}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
