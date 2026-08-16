import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { addDays, monthLabel, startOfWeek, todayInBerlin } from '@/lib/calendar-dates'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/**
 * The month at a glance, for jumping — the navigation half of what the design's
 * month *view* was for (D9).
 *
 * The other half, "how full is October", the big month view answered badly: at
 * six sessions a day its cells show three entries and "+5 weitere". A dot per
 * occupied day says the same thing in a fortieth of the space, and this one
 * also fits beside the grid instead of replacing it.
 *
 * It walks its own month independently of the calendar's anchor, so paging
 * ahead to look does not move the grid; clicking a day does.
 */
export function MiniMonth({
  anchor,
  occupied,
  onPick,
}: {
  /** The day the calendar is showing. */
  anchor: string
  /** Days with at least one slot-holding entry, as `YYYY-MM-DD`. */
  occupied: ReadonlySet<string>
  onPick: (date: string) => void
}) {
  const [month, setMonth] = useState(() => `${anchor.slice(0, 7)}-01`)
  const today = todayInBerlin()

  const first = startOfWeek(month)
  const days = Array.from({ length: 42 }, (_, index) => addDays(first, index))
  const shownMonth = month.slice(0, 7)

  const shift = (months: number) => {
    const [year, monthNumber] = month.split('-').map(Number)
    const moved = new Date(Date.UTC(year ?? 1970, (monthNumber ?? 1) - 1 + months, 1))
    setMonth(moved.toISOString().slice(0, 10))
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={strings.appointment.previousMonth}
          onClick={() => shift(-1)}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <span className="font-semibold text-sm">{monthLabel(month)}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={strings.appointment.nextMonth}
          onClick={() => shift(1)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px">
        {strings.date.weekdays.map((name) => (
          <span key={name} className="pb-1 text-center text-[10px] text-muted-foreground">
            {name}
          </span>
        ))}

        {days.map((day) => {
          const inMonth = day.slice(0, 7) === shownMonth
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPick(day)}
              className={cn(
                'relative flex h-7 items-center justify-center rounded text-xs tabular-nums hover:outline hover:outline-border',
                inMonth ? '' : 'text-muted-foreground/50',
                day === anchor && 'bg-primary font-semibold text-primary-foreground',
                day !== anchor && day === today && 'font-semibold text-primary',
              )}
            >
              {Number(day.slice(8, 10))}
              {occupied.has(day) && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute bottom-0.5 size-1 rounded-full',
                    day === anchor ? 'bg-primary-foreground' : 'bg-muted-foreground',
                  )}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
