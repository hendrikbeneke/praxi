import {
  activityTypeColor,
  type CalendarEntry,
  type FreeSlot,
  formatBerlinTime,
  formatBerlinWeekdayLong,
  minutesBetween,
  occupiesSlot,
  toBerlinDateTimeLocal,
} from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useState } from 'react'
import { ActivityDetail } from '@/components/activity-detail'
import { ActivityForm } from '@/components/activity-form'
import { Button } from '@/components/ui/button'
import { activityQueryOptions } from '@/lib/activities'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { entryName } from '@/lib/calendar-entry'
import { strings } from '@/lib/strings'

/**
 * The calendar's right-hand column — the day's overview, and **the calendar's
 * container for `ActivityDetail`** (D9).
 *
 * It replaces the dialog D8 left here, on that package's own argument taken one
 * step further: the dialog existed because navigating away would take the week
 * grid with it, and a rail keeps the grid *and* drops the modal that covered
 * exactly the part of it one needs while moving something.
 *
 * So the three containers of D8 are still three — Vorgänge list, contact tab,
 * this — and none of them is the odd one out any more. Nothing about an
 * activity is decided here either; this only says where it sits.
 *
 * Since D-K2 it holds nothing else: the button, the month and the slot finder
 * moved to `calendar-sidebar.tsx` on the left, where the design has them, and
 * what is left here answers rather than asks.
 */
export type RailSelection =
  | { kind: 'activity'; activityId: string; appointmentId: string }
  /** `typeCode` and `durationMin` are set when the slot finder handed the slot
   *  over: they are what the search was about, and asking for them again would
   *  be asking twice (D9.5). */
  | { kind: 'new'; startsAtLocal?: string; typeCode?: string; durationMin?: number }
  | null

export function CalendarRail({
  anchor,
  entries,
  selection,
  nextFree,
  nextFreeDuration,
  onUseNextFree,
  onSelectEntry,
  onClose,
  onSaved,
}: {
  anchor: string
  /** Everything loaded for the visible window, for the day's schedule. */
  entries: readonly CalendarEntry[]
  selection: RailSelection
  /** The first gap on the overview day, or null when there is none. */
  nextFree: FreeSlot | null
  nextFreeDuration: number
  onUseNextFree: (slot: FreeSlot) => void
  onSelectEntry: (entry: CalendarEntry) => void
  onClose: () => void
  /** Saved, as opposed to merely closed — the slot finder ends on the first
   *  and not on the second. */
  onSaved: () => void
}) {
  return (
    <aside className="hidden w-[320px] shrink-0 flex-col overflow-auto border-l bg-card p-4 lg:flex">
      {selection === null ? (
        <DayOverview
          anchor={anchor}
          entries={entries}
          nextFree={nextFree}
          nextFreeDuration={nextFreeDuration}
          onUseNextFree={onUseNextFree}
          onSelectEntry={onSelectEntry}
        />
      ) : (
        <Selected selection={selection} onClose={onClose} onSaved={onSaved} />
      )}
    </aside>
  )
}

function Selected({
  selection,
  onClose,
  onSaved,
}: {
  selection: NonNullable<RailSelection>
  onClose: () => void
  onSaved: () => void
}) {
  /** Read mode first: an entry opens to be looked at. A new one has nothing to
   *  read, so it starts in the form. */
  const [editing, setEditing] = useState(false)
  const activity = useQuery({
    ...activityQueryOptions(selection.kind === 'activity' ? selection.activityId : ''),
    enabled: selection.kind === 'activity',
  })

  return (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="font-semibold">
          {selection.kind === 'new' ? strings.activity.createTitle : strings.activity.detailTitle}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          aria-label={strings.appointment.close}
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      {selection.kind === 'new' ? (
        <ActivityForm
          {...(selection.startsAtLocal ? { startsAtLocal: selection.startsAtLocal } : {})}
          {...(selection.typeCode ? { initialTypeCode: selection.typeCode } : {})}
          {...(selection.durationMin ? { initialDurationMin: selection.durationMin } : {})}
          onSaved={onSaved}
          onCancel={onClose}
        />
      ) : activity.data ? (
        <ActivityDetail
          key={activity.data.id}
          activity={activity.data}
          editing={editing}
          onStartEditing={() => setEditing(true)}
          onStopEditing={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onSaved()
          }}
        />
      ) : (
        <p className="text-muted-foreground text-sm">{strings.status.loading}</p>
      )}
    </>
  )
}

/** What the day looks like, when nothing is selected. */
function DayOverview({
  anchor,
  entries,
  nextFree,
  nextFreeDuration,
  onUseNextFree,
  onSelectEntry,
}: {
  anchor: string
  entries: readonly CalendarEntry[]
  nextFree: FreeSlot | null
  nextFreeDuration: number
  onUseNextFree: (slot: FreeSlot) => void
  onSelectEntry: (entry: CalendarEntry) => void
}) {
  const types = useQuery(activityTypeListQueryOptions(true))

  // The Berlin day, not the UTC one: an entry at 00:30 local starts on the
  // previous date in UTC.
  const ofDay = entries
    .filter((entry) => toBerlinDateTimeLocal(entry.startsAt).slice(0, 10) === anchor)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  const holding = ofDay.filter((entry) => occupiesSlot(entry.status))
  const minutes = holding.reduce(
    (total, entry) => total + minutesBetween(entry.startsAt, entry.endsAt),
    0,
  )

  return (
    <>
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        {strings.appointment.dayOverview}
      </p>
      {/* "Mittwoch, 12. August" — written out, and without the year: the year
          stands in the calendar's own header (K10). */}
      <p className="mt-[3px] font-semibold text-[17px] tracking-[-0.015em]">
        {formatBerlinWeekdayLong(`${anchor}T12:00:00Z`)}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Figure value={String(holding.length)} label={strings.appointment.countAppointments} />
        <Figure
          value={(minutes / 60).toLocaleString('de-DE', { maximumFractionDigits: 1 })}
          label={strings.appointment.countHours}
        />
        <Figure
          value={String(ofDay.length - holding.length)}
          label={strings.appointment.countCancelled}
        />
      </div>

      {/* Where the next treatment would still fit, and the way straight into
          it. Appears with the gap, not without: a card saying "no free time"
          with a dead button under it would be a control that leads nowhere. */}
      {/* Neutral, not primary-tinted (design): the next gap is a fact about
          the day, not an offer competing with the day itself. */}
      <div className="mt-4 rounded-lg border bg-muted/50 px-3 py-2.5">
        <p className="text-[12px] text-muted-foreground">{strings.appointment.nextFree}</p>
        <p className="mt-0.5 font-semibold tabular-nums">
          {nextFree
            ? strings.appointment.nextFreeSpan(
                formatBerlinTime(nextFree.startsAt),
                formatBerlinTime(nextFree.endsAt),
                minutesBetween(nextFree.startsAt, nextFree.endsAt),
              )
            : strings.appointment.nextFreeNone(nextFreeDuration)}
        </p>
        {nextFree && (
          <button
            type="button"
            className="mt-1.5 font-semibold text-[13px] text-primary hover:text-foreground"
            onClick={() => onUseNextFree(nextFree)}
          >
            {strings.appointment.nextFreeAction}
          </button>
        )}
      </div>

      <p className="mt-6 mb-1 font-semibold text-sm">{strings.appointment.daySchedule}</p>
      {ofDay.length === 0 ? (
        <p className="text-muted-foreground text-sm">{strings.appointment.dayEmpty}</p>
      ) : (
        <ul>
          {ofDay.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onSelectEntry(entry)}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left hover:bg-accent"
              >
                <span className="w-11 shrink-0 text-muted-foreground text-xs tabular-nums">
                  {formatBerlinTime(entry.startsAt)}
                </span>
                <span
                  aria-hidden
                  className="w-0.5 shrink-0 self-stretch rounded-full"
                  style={{ backgroundColor: activityTypeColor(types.data, entry.activityType) }}
                />
                <span
                  className={
                    occupiesSlot(entry.status)
                      ? 'min-w-0 flex-1 truncate text-sm'
                      : 'min-w-0 flex-1 truncate text-muted-foreground text-sm line-through'
                  }
                >
                  {entryName(entry, types.data)}
                </span>
                {/* How long it takes, not what kind it is (design). The kind is
                    already said by the colour to the left of the name, and the
                    length is the thing this list is read for — where the day
                    still has room. */}
                <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                  {strings.slotFinder.minutes(minutesBetween(entry.startsAt, entry.endsAt))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border px-2.5 py-2">
      <p className="font-semibold text-lg tabular-nums">{value}</p>
      <p className="text-muted-foreground text-[11px]">{label}</p>
    </div>
  )
}
