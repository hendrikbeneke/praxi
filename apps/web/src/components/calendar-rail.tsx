import {
  type ActivityType,
  activityTypeColor,
  activityTypeLabel,
  type CalendarEntry,
  type FreeSlot,
  formatBerlinDateLong,
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
import { AppointmentDetail } from '@/components/appointment-detail'
import { AppointmentForm } from '@/components/appointment-form'
import { Button } from '@/components/ui/button'
import { activityQueryOptions } from '@/lib/activities'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { entryName } from '@/lib/calendar-entry'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

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
  /** A calendar entry with no Vorgang behind it — a blocker, documentation
   *  time (D-K3). Its data comes from the week the grid has loaded; the id is
   *  what is held, so a refetch cannot leave a stale copy on screen. */
  | { kind: 'appointment'; appointmentId: string }
  /**
   * `typeCode` and `durationMin` are set when the slot finder handed the slot
   * over: they are what the search was about, and asking for them again would
   * be asking twice (D9.5). `mode` is which tab opens — a search by bare
   * duration means a Termin and not a Vorgang, so it opens on "Nur Termin".
   */
  | {
      kind: 'new'
      startsAtLocal?: string
      typeCode?: string
      durationMin?: number
      mode?: 'activity' | 'appointment'
    }
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
  draft,
  warning,
  onDraftChange,
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
  /** What the open form currently describes, for the panel's header. */
  draft?: { startsAt: string; endsAt: string; typeCode: string } | null
  /** The overlap sentence, worked out by the page: only it knows what else is
   *  in the week the grid has loaded. */
  warning?: React.ReactNode
  /** The interval currently in the open form, for the grid's draft block. */
  onDraftChange?: (draft: { startsAt: string; endsAt: string; typeCode: string } | null) => void
}) {
  return (
    /* `overflow-hidden` on the column and the scrolling inside it: the panel's
       footer is sticky, which means it has to sit outside whatever scrolls. */
    <aside className="hidden w-[320px] shrink-0 flex-col overflow-hidden border-l bg-card lg:flex">
      {selection === null ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <DayOverview
            anchor={anchor}
            entries={entries}
            nextFree={nextFree}
            nextFreeDuration={nextFreeDuration}
            onUseNextFree={onUseNextFree}
            onSelectEntry={onSelectEntry}
          />
        </div>
      ) : (
        <Selected
          selection={selection}
          entries={entries}
          draft={draft}
          warning={warning}
          onDraftChange={onDraftChange}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </aside>
  )
}

/**
 * The panel: what is being entered, or what was clicked (D-K3).
 *
 * Three things distinguish it from the pane it replaces, and all three come
 * from the design images. It has a **header** that says what one is looking at
 * — the kind, the name, the day and the time — rather than the word "Vorgang".
 * It has a **sticky footer**, so the action is reachable without scrolling a
 * form that is taller than the rail. And a new entry starts with **two tabs**,
 * because a Termin without a Vorgang became possible in D-K1 and there was no
 * way to reach it.
 *
 * The forms themselves are the ones every other screen uses. `ActivityForm`
 * renders its action row into the footer through a portal, which is what lets
 * the chrome differ while the form does not (V6).
 */
function Selected({
  selection,
  entries,
  draft,
  warning,
  onDraftChange,
  onClose,
  onSaved,
}: {
  selection: NonNullable<RailSelection>
  entries: readonly CalendarEntry[]
  /** What the open form currently describes — the header reads it. */
  draft?: { startsAt: string; endsAt: string; typeCode: string } | null
  warning?: React.ReactNode
  onDraftChange?: (draft: { startsAt: string; endsAt: string; typeCode: string } | null) => void
  onClose: () => void
  onSaved: () => void
}) {
  /** Read mode first: an entry opens to be looked at. A new one has nothing to
   *  read, so it starts in the form. */
  const [editing, setEditing] = useState(false)
  /** Which tab a new entry is on. The slot finder decides the first one: a
   *  search by bare duration was a search for a Termin. */
  const [tab, setTab] = useState<'activity' | 'appointment'>(
    selection.kind === 'new' ? (selection.mode ?? 'activity') : 'activity',
  )
  /**
   * The footer element itself, held as state rather than in a ref: a ref does
   * not re-render, and the form has to render *again* once the target exists
   * or its portal would have nowhere to go on the first pass.
   */
  const [footer, setFooter] = useState<HTMLDivElement | null>(null)

  const types = useQuery(activityTypeListQueryOptions(true))
  const activity = useQuery({
    ...activityQueryOptions(selection.kind === 'activity' ? selection.activityId : ''),
    enabled: selection.kind === 'activity',
  })

  /** The bare appointment is read from the week the grid already has — one
   *  request fewer, and it is the same row the block was drawn from. */
  const bare =
    selection.kind === 'appointment'
      ? entries.find((entry) => entry.id === selection.appointmentId)
      : undefined

  const header =
    selection.kind === 'new' ? (
      <>
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          {strings.activity.newEntry}
        </p>
        {/* The time the entry currently has, which is the form's answer and
            not the panel's: it follows the fields as they are edited, so the
            header and the block in the grid always say the same thing. Falls
            back to the plain title only while the form has no interval yet. */}
        <p className="mt-[3px] font-semibold text-[17px] tracking-[-0.015em]">
          {draft
            ? strings.activity.newEntryAt(
                formatBerlinDateLong(draft.startsAt),
                formatBerlinTime(draft.startsAt),
              )
            : strings.activity.createTitle}
        </p>
      </>
    ) : (
      <EntryHeader
        entry={selection.kind === 'appointment' ? bare : undefined}
        activityType={activity.data?.type ?? bare?.activityType ?? null}
        name={
          activity.data
            ? (activity.data.contactName ?? strings.appointment.untitled)
            : bare
              ? entryName(bare, types.data)
              : ''
        }
        startsAt={activity.data?.appointment?.startsAt ?? bare?.startsAt ?? null}
        endsAt={activity.data?.appointment?.endsAt ?? bare?.endsAt ?? null}
        types={types.data}
      />
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">{header}</div>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-1 size-7 shrink-0"
          aria-label={strings.appointment.close}
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      {selection.kind === 'new' && (
        <div className="px-4 pt-3">
          <div className="flex rounded-lg bg-muted p-0.5">
            {(['activity', 'appointment'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  'flex-1 rounded-md px-2 py-1.5 font-medium text-sm',
                  tab === value
                    ? 'bg-card shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {strings.activity.tabs[value]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {selection.kind === 'new' ? (
          tab === 'activity' ? (
            <ActivityForm
              {...(selection.startsAtLocal ? { startsAtLocal: selection.startsAtLocal } : {})}
              {...(selection.typeCode ? { initialTypeCode: selection.typeCode } : {})}
              {...(selection.durationMin ? { initialDurationMin: selection.durationMin } : {})}
              appointmentFixed
              submitLabel={strings.activity.createSubmit}
              warning={warning}
              footerPortal={footer}
              onDraftChange={onDraftChange}
              onSaved={onSaved}
              onCancel={onClose}
            />
          ) : (
            <AppointmentForm
              {...(selection.startsAtLocal ? { startsAtLocal: selection.startsAtLocal } : {})}
              {...(selection.durationMin ? { durationMin: selection.durationMin } : {})}
              submitLabel={strings.appointment.createSubmit}
              warning={warning}
              footerPortal={footer}
              onDraftChange={onDraftChange}
              onSaved={onSaved}
              onCancel={onClose}
            />
          )
        ) : selection.kind === 'appointment' ? (
          bare === undefined ? (
            <p className="text-muted-foreground text-sm">{strings.status.loading}</p>
          ) : editing ? (
            <AppointmentForm
              appointment={bare}
              warning={warning}
              footerPortal={footer}
              onDraftChange={onDraftChange}
              onSaved={() => {
                setEditing(false)
                onSaved()
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <AppointmentDetail
              entry={bare}
              footerPortal={footer}
              onEdit={() => setEditing(true)}
              onDone={onSaved}
            />
          )
        ) : activity.data ? (
          <ActivityDetail
            key={activity.data.id}
            activity={activity.data}
            editing={editing}
            footerPortal={footer}
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
      </div>

      {/* The sticky footer. Empty until a form or a detail portals its actions
          into it, and it keeps its border either way so the panel does not
          shift when the mode changes. */}
      <div ref={setFooter} className="border-t px-4 py-3" />
    </div>
  )
}

/** The two lines above an entry: its kind in the type's colour, then what it
 *  is called, then the day and the span. */
function EntryHeader({
  activityType,
  name,
  startsAt,
  endsAt,
  types,
}: {
  entry: CalendarEntry | undefined
  activityType: string | null
  name: string
  startsAt: string | null
  endsAt: string | null
  types: readonly ActivityType[] | undefined
}) {
  return (
    <>
      <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-sm"
          style={{ backgroundColor: activityTypeColor(types, activityType) }}
        />
        <span className="truncate">
          {activityType ? activityTypeLabel(types, activityType) : strings.appointment.untitled}
        </span>
      </p>
      <p className="mt-[3px] truncate font-semibold text-[17px] tracking-[-0.015em]">{name}</p>
      {startsAt !== null && endsAt !== null && (
        <p className="mt-0.5 text-muted-foreground text-xs tabular-nums">
          {strings.appointment.headerSpan(
            formatBerlinDateLong(startsAt),
            formatBerlinTime(startsAt),
            formatBerlinTime(endsAt),
          )}
        </p>
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
