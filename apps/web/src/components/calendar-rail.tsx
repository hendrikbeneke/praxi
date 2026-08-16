import {
  activityTypeColor,
  activityTypeLabel,
  type CalendarEntry,
  formatBerlinDateLong,
  formatBerlinTime,
  minutesBetween,
  occupiesSlot,
  toBerlinDateTimeLocal,
} from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useState } from 'react'
import { ActivityDetail } from '@/components/activity-detail'
import { ActivityForm } from '@/components/activity-form'
import { MiniMonth } from '@/components/mini-month'
import { Button } from '@/components/ui/button'
import { activityQueryOptions } from '@/lib/activities'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { strings } from '@/lib/strings'

/**
 * The calendar's right-hand column — and **the calendar's container for
 * `ActivityDetail`** (D9).
 *
 * It replaces the dialog D8 left here, on that package's own argument taken one
 * step further: the dialog existed because navigating away would take the week
 * grid with it, and a rail keeps the grid *and* drops the modal that covered
 * exactly the part of it one needs while moving something.
 *
 * So the three containers of D8 are still three — Vorgänge list, contact tab,
 * this — and none of them is the odd one out any more. Nothing about an
 * activity is decided here either; this only says where it sits.
 */
export type RailSelection =
  | { kind: 'activity'; activityId: string; appointmentId: string }
  | { kind: 'new'; startsAtLocal?: string }
  | null

export function CalendarRail({
  anchor,
  entries,
  occupied,
  selection,
  onPickDay,
  onSelectEntry,
  onClose,
}: {
  anchor: string
  /** Everything loaded for the visible window, for the day's schedule. */
  entries: readonly CalendarEntry[]
  occupied: ReadonlySet<string>
  selection: RailSelection
  onPickDay: (date: string) => void
  onSelectEntry: (entry: CalendarEntry) => void
  onClose: () => void
}) {
  return (
    <aside className="hidden w-[380px] shrink-0 overflow-auto border-l bg-card p-4 lg:block">
      <MiniMonth anchor={anchor} occupied={occupied} onPick={onPickDay} />

      <div className="mt-6">
        {selection === null ? (
          <DayOverview anchor={anchor} entries={entries} onSelectEntry={onSelectEntry} />
        ) : (
          <Selected selection={selection} onClose={onClose} />
        )}
      </div>
    </aside>
  )
}

function Selected({
  selection,
  onClose,
}: {
  selection: NonNullable<RailSelection>
  onClose: () => void
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
          onSaved={onClose}
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
            onClose()
          }}
        />
      ) : (
        <p className="text-muted-foreground text-sm">{strings.status.loading}</p>
      )}
    </>
  )
}

/**
 * What the day looks like, when nothing is selected.
 *
 * Three figures the data can actually answer. The design also shows free time
 * and the next gap; both need opening hours, which the schema does not have —
 * that is D9.5, and inventing a working day here to fill the box would be the
 * kind of claim the "a form never claims a state that does not exist" rule is
 * about.
 */
function DayOverview({
  anchor,
  entries,
  onSelectEntry,
}: {
  anchor: string
  entries: readonly CalendarEntry[]
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
      <p className="mt-1 font-semibold text-lg">{formatBerlinDateLong(`${anchor}T12:00:00Z`)}</p>

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
                  {entry.contactName}
                </span>
                <span className="shrink-0 text-muted-foreground text-xs">
                  {entry.activityType ? activityTypeLabel(types.data, entry.activityType) : ''}
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
