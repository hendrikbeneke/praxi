import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { addDays, monthLabel, startOfWeek, todayInBerlin } from '@/lib/calendar-dates'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/**
 * The month at a glance, for jumping.
 *
 * It walks its own month independently of the calendar's anchor, so paging
 * ahead to look does not move the grid; clicking a day does.
 *
 * **Three marks, and they say three different things** (D-K2): today is filled
 * with the primary colour, the *selected* day sits on a fifth of it, and the
 * days the grid is currently showing carry a band of `--accent` behind them.
 * Until this package there were two, and one of them was wrong: the anchor was
 * painted like today and today was merely coloured text, so on any week but
 * this one the month showed a filled square for a day nobody was looking at
 * and no sign at all of the week on screen.
 */
export function MiniMonth({
  anchor,
  visible,
  occupied,
  onPick,
}: {
  /** The day the calendar is describing — the selected one. */
  anchor: string
  /** Every day the grid is showing, so the month can band them. One day in the
   *  day view, five or seven in the others. */
  visible: ReadonlySet<string>
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
          const isToday = day === today
          const isAnchor = day === anchor && !isToday

          /* The band first, then the day's own mark on top of it: a selected
             day inside the visible week has to read as both. */
          const background = isToday
            ? 'var(--primary)'
            : isAnchor
              ? 'color-mix(in oklab, var(--primary) 20%, var(--card))'
              : visible.has(day)
                ? 'var(--accent)'
                : undefined

          return (
            <button
              key={day}
              type="button"
              onClick={() => onPick(day)}
              style={background ? { backgroundColor: background } : undefined}
              className={cn(
                'relative flex h-7 items-center justify-center rounded text-xs tabular-nums hover:outline hover:outline-border',
                inMonth ? '' : 'text-muted-foreground/50',
                isToday && 'font-semibold text-primary-foreground',
                (isAnchor || visible.has(day)) && 'font-semibold',
              )}
            >
              {Number(day.slice(8, 10))}
              {occupied.has(day) && (
                <span
                  aria-hidden
                  style={
                    isToday
                      ? undefined
                      : { backgroundColor: 'color-mix(in oklab, var(--primary) 70%, transparent)' }
                  }
                  className={cn(
                    'absolute bottom-0.5 size-1 rounded-full',
                    isToday && 'bg-primary-foreground',
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
