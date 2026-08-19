import type { ActivityType, FreeSlotsResponse } from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/**
 * "Freien Termin finden" — a fixture of the left rail (D-K2).
 *
 * It used to be a *mode*: a button opened it, and while it was open it stood
 * where the day's schedule stands, so looking for a gap meant giving up the
 * view of the day one was looking at. The design keeps it in the rail all the
 * time, which costs nothing there and makes the answer to "when could I see
 * her" one click rather than three.
 *
 * **The offers live in the grid, not here.** A list of times grouped by day is
 * a description of something the calendar can simply show — and it showed both,
 * which meant reading the same answer twice in two shapes. What stays here is
 * the question and the way out of it.
 *
 * Clicking the entry that is already chosen clears the search, so the same
 * gesture that starts it ends it.
 */

/** Three offers, as the design has them. Five turned the row into a keypad and
 *  made the choice look more consequential than it is — the length is a search
 *  parameter, not a decision about the appointment (K10). */
const FREE_DURATIONS = [15, 30, 60] as const

export type SlotSearch = { durationMin: number; typeCode: string | null }

export function SlotFinder({
  search,
  result,
  onSearch,
  onClear,
}: {
  search: SlotSearch | null
  result: FreeSlotsResponse | undefined
  onSearch: (next: SlotSearch) => void
  onClear: () => void
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

  /** The same click twice means "never mind" — the way out that does not
   *  require finding the link below. */
  const toggle = (next: SlotSearch) => {
    const same = search?.typeCode === next.typeCode && search?.durationMin === next.durationMin
    if (same) onClear()
    else onSearch(next)
  }

  return (
    <div>
      <p className="mb-2 font-semibold text-sm">{strings.slotFinder.title}</p>

      <div className="space-y-1.5">
        {withDuration.map((entry) => (
          <button
            key={entry.code}
            type="button"
            onClick={() => toggle({ durationMin: entry.defaultDurationMin, typeCode: entry.code })}
            /* Chosen, in the type's own colour rather than in the accent —
               the same tint the grid paints its entries with, so the card and
               what it will produce read as one thing (design). */
            style={
              search?.typeCode === entry.code
                ? {
                    backgroundColor: `color-mix(in oklab, ${entry.color} 12%, var(--card))`,
                    borderColor: `color-mix(in oklab, ${entry.color} 45%, transparent)`,
                  }
                : undefined
            }
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left',
              search?.typeCode !== entry.code && 'hover:bg-accent',
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

      <p className="mt-3 mb-1.5 text-muted-foreground text-xs">{strings.slotFinder.orDuration}</p>
      <div className="flex gap-1.5">
        {FREE_DURATIONS.map((minutes) => (
          <Button
            key={minutes}
            size="sm"
            variant={
              search && search.typeCode === null && search.durationMin === minutes
                ? 'default'
                : 'outline'
            }
            className="h-8 flex-1 px-1 text-xs tabular-nums"
            onClick={() => toggle({ durationMin: minutes, typeCode: null })}
          >
            {strings.slotFinder.minutes(minutes)}
          </Button>
        ))}
      </div>

      {/* What the state of the finder means, in a sentence — and the way out
          of it. The design has both, and the second one is why the first can
          stay this short. */}
      <p className="mt-3 text-muted-foreground text-xs leading-snug">
        {search ? strings.slotFinder.hintChoosing : strings.slotFinder.hintIdle}
      </p>

      {search && (
        <>
          <button
            type="button"
            onClick={onClear}
            className="mt-3 font-semibold text-sm hover:underline"
          >
            {strings.slotFinder.clear}
          </button>

          {/* The one thing the grid cannot say by staying empty. Two kinds of
              nothing need two sentences, and only this one is the
              practitioner's to fix. */}
          {result && !result.openingHoursSet && (
            <p className="mt-3 text-muted-foreground text-xs leading-snug">
              {strings.slotFinder.noOpeningHours}{' '}
              <Link
                to="/settings"
                search={{ section: 'practice' }}
                className="underline underline-offset-2"
              >
                {strings.slotFinder.toOpeningHours}
              </Link>
            </p>
          )}

          {result?.openingHoursSet && result.slots.length === 0 && (
            <p className="mt-3 text-muted-foreground text-xs">{strings.slotFinder.empty}</p>
          )}

          {result && !result.privateCalendarsChecked && (
            <p className="mt-3 flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 px-2.5 py-2 text-xs">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>{strings.slotFinder.privateNotChecked}</span>
            </p>
          )}
        </>
      )}
    </div>
  )
}
