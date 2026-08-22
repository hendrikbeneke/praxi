import {
  type Activity,
  type AppointmentStatus,
  activityTypeColor,
  activityTypeLabel,
  formatBerlinDateLong,
  formatBerlinTime,
  formatEuro,
  occupiesSlot,
  readableTextOn,
  sumItems,
} from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ActivityDetail } from '@/components/activity-detail'
import { ActivityForm } from '@/components/activity-form'
import { InfiniteSentinel } from '@/components/infinite-sentinel'
import { useInlineDetail } from '@/components/inline-detail-row'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/** Red where the slot was given up late, quiet where it is settled, plain
 *  otherwise — the design's three variants. */
function appointmentVariant(status: AppointmentStatus): 'destructive' | 'secondary' | 'outline' {
  if (!occupiesSlot(status)) return 'destructive'
  return status === 'confirmed' ? 'secondary' : 'outline'
}

/**
 * The chronological list of what happened, on the Vorgänge page and on the
 * contact — with the detail opening **inside the card that was clicked** (D8).
 *
 * **Not a `<Table>`, and therefore no column picker.** A row carries a
 * position list of variable length, which is not a cell; the three badges are
 * already conditional, which reduces better than a preference could because it
 * is decided per row; and the one column a picker could sensibly hide is the
 * contact name, which depends on *where* the list stands rather than on
 * anything the practitioner should have to set. A setting that can make one of
 * the two lists wrong is worse than no setting.
 *
 * For the same reason `InlineDetailRow` from D2 is not used here — that one is
 * a `TableRow` spanning the columns above it. The hook beside it,
 * `useInlineDetail`, carries all the state and is shared unchanged.
 *
 * **Two sections, not one run of dates.** What is still ahead comes first and
 * ascending, what is behind follows descending. A pure chronology puts the
 * oldest thing at one end and the practitioner works from both.
 */
/**
 * The activity list, in its two halves (L3).
 *
 * **The halves arrive sorted and separated from the server**, and this
 * component only draws the line between them. Until L3 it received one array
 * and split it itself — fine while a single request returned everything, and
 * wrong the moment the past started paging: a second page would have carried
 * rows belonging above ones already drawn.
 */
export function ActivityList({
  upcoming,
  past,
  emptyText,
  showContact = true,
  contactId,
  creating = false,
  onCreated,
  onCancelCreate,
  hasMorePast = false,
  loadingMorePast = false,
  onLoadMorePast,
}: {
  /** Everything ahead, nearest first — fetched whole. */
  upcoming: readonly Activity[]
  /** Everything behind, newest first — one page at a time. */
  past: readonly Activity[]
  emptyText?: string
  /** False inside a contact, where the name would repeat on every row. */
  showContact?: boolean
  /** Fixed on the create form when the list stands inside a contact. */
  contactId?: string | undefined
  creating?: boolean
  onCreated?: () => void
  onCancelCreate?: () => void
  hasMorePast?: boolean
  loadingMorePast?: boolean
  onLoadMorePast?: () => void
}) {
  const types = useQuery(activityTypeListQueryOptions(true))
  const detail = useInlineDetail()

  /**
   * The activity just written, until it has been seen (L3).
   *
   * A new one can belong anywhere — an appointment next week, or a session
   * five years back that is being documented late. Where it lands is decided
   * here rather than asked of the server: everything ahead is loaded, so a
   * future one is always among the rows; a past one either falls inside what
   * has been fetched or it does not, and that is the whole question.
   */
  const [created, setCreated] = useState<Activity | null>(null)
  const placed = created !== null && [...upcoming, ...past].some((row) => row.id === created.id)
  const row = useRef<HTMLDivElement | null>(null)

  /**
   * Why it is not on screen — and the two answers are told apart without
   * asking the server, because everything needed is already here.
   *
   * Ahead of now, `upcoming` is complete, so missing means it does not belong
   * to this selection at all. Behind it, missing means either that or that it
   * lies past what has been fetched, and `hasMorePast` is exactly that
   * difference: with nothing left to fetch, the selection is complete too.
   */
  const belowTheLoaded =
    created !== null && !placed && Date.parse(created.occurredAt) < Date.now() && hasMorePast

  useEffect(() => {
    if (created && placed) row.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [created, placed])

  const sections = [
    { label: strings.activity.sectionUpcoming, rows: upcoming, past: false },
    { label: strings.activity.sectionPast, rows: past, past: true },
  ].filter((section) => section.rows.length > 0)

  const activities = [...upcoming, ...past]

  return (
    <div className="space-y-2">
      {creating && (
        <section className="rounded-[10px] border border-primary bg-card p-4">
          <p className="mb-4 font-semibold">{strings.activity.createTitle}</p>
          <ActivityForm
            {...(contactId ? { contactId } : {})}
            onSaved={(saved) => {
              setCreated(saved)
              onCreated?.()
            }}
            onCancel={() => onCancelCreate?.()}
          />
        </section>
      )}

      {activities.length === 0 && !creating && (
        <p className="text-muted-foreground text-sm">{emptyText ?? strings.activity.empty}</p>
      )}

      {/* Written, but not where it can be seen: the strip says where it went
          rather than leaving the impression that nothing was saved. */}
      {created && !placed && (
        <p className="mb-2 flex flex-wrap items-center gap-2 rounded-[10px] border border-primary bg-muted/45 px-4 py-3 text-sm">
          <span>
            {belowTheLoaded
              ? strings.activity.createdElsewhere(formatBerlinDateLong(created.occurredAt))
              : strings.activity.createdOutsideFilter(formatBerlinDateLong(created.occurredAt))}
          </span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setCreated(null)}>
            {strings.actions.close}
          </Button>
        </p>
      )}

      {sections.map((section) => (
        <div key={section.label}>
          <p className="mt-3 mb-2 font-semibold">{section.label}</p>

          {section.rows.map((activity) => {
            const open = detail.isOpen(activity.id)
            const color = activityTypeColor(types.data, activity.type)
            const typeLabel = activityTypeLabel(types.data, activity.type)
            const billable = sumItems(activity.items, { billableOnly: true })

            const isNew = created?.id === activity.id

            return (
              <div
                key={activity.id}
                ref={isNew ? row : null}
                className={cn(
                  'mb-2 overflow-hidden rounded-[10px] border bg-card',
                  open && 'border-primary',
                  isNew && 'ring-2 ring-primary',
                )}
              >
                <button
                  type="button"
                  onClick={() => detail.toggle(activity.id)}
                  className={cn(
                    'block w-full px-4 py-3 text-left transition-colors hover:bg-accent',
                    open && 'bg-muted/40',
                  )}
                >
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="w-[150px] shrink-0 text-muted-foreground tabular-nums">
                      {formatBerlinDateLong(activity.occurredAt)}
                    </span>
                    {showContact && <span className="font-semibold">{activity.contactName}</span>}
                    <span
                      className="rounded px-1.5 py-0.5 text-xs"
                      style={{ backgroundColor: color, color: readableTextOn(color) }}
                    >
                      {typeLabel}
                    </span>

                    {/*
                        What became of the slot, always — "Termin Bestätigt" is
                        as much worth reading as "Termin Kurzfristig abgesagt",
                        and until K7 only the cancelled ones showed at all, so
                        a row of sessions carried nothing but its type. The
                        word "Termin" is part of the badge because `Geplant`
                        alone would be indistinguishable from the activity
                        status beside it, which is a different statement (rule
                        6). A cancellation is red; a confirmed slot is settled
                        and reads quietly.
                      */}
                    {activity.appointment === null ? (
                      <span className="text-muted-foreground text-xs">
                        {strings.activity.noAppointmentShort}
                      </span>
                    ) : (
                      <Badge variant={appointmentVariant(activity.appointment.status)}>
                        {strings.activity.appointmentBadge(
                          strings.appointment.status[activity.appointment.status],
                        )}
                      </Badge>
                    )}
                    {activity.status !== 'planned' && (
                      <Badge variant={activity.status === 'no_show' ? 'secondary' : 'outline'}>
                        {strings.activity.statuses[activity.status]}
                      </Badge>
                    )}
                    {/* Derived on read from the invoice lines and never stored
                        — a cancelled invoice puts this back to "Offen" on its
                        own. `none` says there is nothing to bill here. */}
                    {activity.billingState !== 'none' && (
                      <Badge variant={activity.billingState === 'billed' ? 'secondary' : 'outline'}>
                        {activity.billingState === 'billed'
                          ? strings.billable.stateBilled
                          : strings.billable.stateOpen}
                      </Badge>
                    )}
                    {activity.title && (
                      <span className="text-muted-foreground text-sm">{activity.title}</span>
                    )}

                    <span className="ml-auto font-semibold tabular-nums">
                      {formatEuro(billable)}
                    </span>
                  </span>

                  <span className="mt-1 flex gap-3 text-muted-foreground text-xs">
                    <span className="w-[150px] shrink-0 tabular-nums">
                      {activity.appointment
                        ? `${formatBerlinTime(activity.appointment.startsAt)}–${formatBerlinTime(activity.appointment.endsAt)}`
                        : formatBerlinTime(activity.occurredAt)}
                    </span>
                    <span className="min-w-0">
                      {activity.items
                        .map((item) => `${item.quantity}× ${item.description}`)
                        .join(' · ')}
                    </span>
                  </span>
                </button>

                {open && (
                  <div className="border-t px-4 py-4">
                    <ActivityDetail
                      activity={activity}
                      editing={detail.editing}
                      onStartEditing={detail.startEditing}
                      onStopEditing={detail.stopEditing}
                      onSaved={detail.close}
                      showContact={showContact}
                    />
                  </div>
                )}
              </div>
            )
          })}

          {section.past && (
            <InfiniteSentinel
              hasMore={hasMorePast}
              loading={loadingMorePast}
              onReach={() => onLoadMorePast?.()}
            />
          )}
        </div>
      ))}
    </div>
  )
}
