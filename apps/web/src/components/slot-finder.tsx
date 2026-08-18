import type { ActivityType, FreeSlot, FreeSlotsResponse } from '@praxi/shared'
import { formatBerlinDateLong, formatBerlinTime, toBerlinDateTimeLocal } from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/**
 * "Freien Termin finden" — the third state of the calendar rail (D9.5).
 *
 * **Not a third column.** The design puts the input in a left rail, and D9's
 * width arithmetic said no to that; nothing has changed since except that the
 * rail would now hold something substantial. It still does not earn a column,
 * for a reason the arithmetic only hints at: the *results* belong in the grid,
 * where a time on a day is readable rather than merely describable, and the
 * input is a mode one enters for twenty seconds — not a fixture that should
 * cost the day columns their width all day long.
 *
 * So: the input and a compact list here, the slots painted in the grid.
 */

/** Offered when no activity type carries a duration of its own, and beside
 *  them when some do. */
/** Three offers, as the design has them. Five turned the row into a keypad and
 *  made the choice look more consequential than it is — the length is a search
 *  parameter, not a decision about the appointment (K10). */
const FREE_DURATIONS = [15, 30, 60] as const

export type SlotSearch = { durationMin: number; typeCode: string | null }

export function SlotFinder({
  search,
  result,
  loading,
  onSearch,
  onClear,
  onPick,
}: {
  search: SlotSearch | null
  result: FreeSlotsResponse | undefined
  loading: boolean
  onSearch: (next: SlotSearch) => void
  onClear: () => void
  onPick: (slot: FreeSlot) => void
}) {
  const types = useQuery(activityTypeListQueryOptions(false))

  /** Only types that say how long they take. A type without a duration cannot
   *  answer "find me a slot for this", and inventing one for it would be a
   *  number the practitioner never entered. */
  const withDuration = (types.data ?? []).filter(
    (entry): entry is ActivityType & { defaultDurationMin: number } =>
      entry.defaultDurationMin !== null,
  )
  const someTypesLackDuration = (types.data ?? []).length > withDuration.length

  return (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="font-semibold">{strings.slotFinder.title}</p>
        {search && (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onClear}>
            {strings.slotFinder.clear}
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        {withDuration.map((entry) => (
          <button
            key={entry.code}
            type="button"
            onClick={() =>
              onSearch({ durationMin: entry.defaultDurationMin, typeCode: entry.code })
            }
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left',
              search?.typeCode === entry.code
                ? 'border-primary/45 bg-primary/10'
                : 'hover:bg-accent',
            )}
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="min-w-0 flex-1 truncate text-sm">{entry.label}</span>
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {strings.slotFinder.minutes(entry.defaultDurationMin)}
            </span>
          </button>
        ))}
      </div>

      {/* Why the list above is short or empty. Without this it reads as a bug
          rather than as an entry nobody has made yet. */}
      {someTypesLackDuration && (
        <p className="mt-2 text-muted-foreground text-xs">
          {strings.slotFinder.typesWithoutDuration}{' '}
          <Link
            to="/settings"
            search={{ section: 'activityTypes' }}
            className="underline underline-offset-2"
          >
            {strings.slotFinder.toActivityTypes}
          </Link>
        </p>
      )}

      <div className="mt-3 border-t pt-3">
        <p className="mb-1.5 text-muted-foreground text-xs">{strings.slotFinder.orDuration}</p>
        <div className="flex flex-wrap gap-1.5">
          {FREE_DURATIONS.map((minutes) => (
            <Button
              key={minutes}
              size="sm"
              variant={
                search && search.typeCode === null && search.durationMin === minutes
                  ? 'default'
                  : 'outline'
              }
              className="h-8 flex-1 tabular-nums"
              onClick={() => onSearch({ durationMin: minutes, typeCode: null })}
            >
              {minutes}
            </Button>
          ))}
        </div>
      </div>

      {search && <Results result={result} loading={loading} onPick={onPick} />}
    </>
  )
}

function Results({
  result,
  loading,
  onPick,
}: {
  result: FreeSlotsResponse | undefined
  loading: boolean
  onPick: (slot: FreeSlot) => void
}) {
  if (loading || !result) {
    return <p className="mt-4 text-muted-foreground text-sm">{strings.status.loading}</p>
  }

  /** Two different kinds of nothing, and they need two different sentences:
   *  one is "no room this week", the other is "you have not said when you are
   *  open". Only the second one is the practitioner's to fix. */
  if (!result.openingHoursSet) {
    return (
      <p className="mt-4 text-muted-foreground text-sm">
        {strings.slotFinder.noOpeningHours}{' '}
        <Link
          to="/settings"
          search={{ section: 'practice' }}
          className="underline underline-offset-2"
        >
          {strings.slotFinder.toOpeningHours}
        </Link>
      </p>
    )
  }

  const byDay = new Map<string, FreeSlot[]>()
  for (const slot of result.slots) {
    const day = toBerlinDateTimeLocal(slot.startsAt).slice(0, 10)
    byDay.set(day, [...(byDay.get(day) ?? []), slot])
  }

  return (
    <div className="mt-4">
      {/* Said here as well as painted on the slots themselves: whoever does
          not read this still sees that the suggestions are the weaker kind. */}
      {!result.privateCalendarsChecked && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 px-2.5 py-2 text-xs">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{strings.slotFinder.privateNotChecked}</span>
        </p>
      )}

      {result.slots.length === 0 ? (
        <p className="text-muted-foreground text-sm">{strings.slotFinder.empty}</p>
      ) : (
        <div className="space-y-3">
          {[...byDay].map(([day, slots]) => (
            <div key={day}>
              <p className="mb-1 font-medium text-xs">{formatBerlinDateLong(`${day}T12:00:00Z`)}</p>
              <div className="flex flex-wrap gap-1.5">
                {slots.map((slot) => (
                  <Button
                    key={slot.startsAt}
                    size="sm"
                    variant="outline"
                    className="h-7 tabular-nums"
                    onClick={() => onPick(slot)}
                  >
                    {formatBerlinTime(slot.startsAt)}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
