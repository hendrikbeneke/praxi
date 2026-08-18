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
import { ActivityDetail } from '@/components/activity-detail'
import { ActivityForm } from '@/components/activity-form'
import { useInlineDetail } from '@/components/inline-detail-row'
import { Badge } from '@/components/ui/badge'
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
export function ActivityList({
  activities,
  emptyText,
  showContact = true,
  contactId,
  creating = false,
  onCreated,
  onCancelCreate,
}: {
  activities: readonly Activity[]
  emptyText?: string
  /** False inside a contact, where the name would repeat on every row. */
  showContact?: boolean
  /** Fixed on the create form when the list stands inside a contact. */
  contactId?: string | undefined
  creating?: boolean
  onCreated?: () => void
  onCancelCreate?: () => void
}) {
  const types = useQuery(activityTypeListQueryOptions(true))
  const detail = useInlineDetail()

  const now = Date.now()
  const upcoming = activities
    .filter((entry) => Date.parse(entry.occurredAt) >= now)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const past = activities
    .filter((entry) => Date.parse(entry.occurredAt) < now)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))

  const sections = [
    { label: strings.activity.sectionUpcoming, rows: upcoming },
    { label: strings.activity.sectionPast, rows: past },
  ].filter((section) => section.rows.length > 0)

  return (
    <div className="space-y-2">
      {creating && (
        <section className="rounded-[10px] border border-primary bg-card p-4">
          <p className="mb-4 font-semibold">{strings.activity.createTitle}</p>
          <ActivityForm
            {...(contactId ? { contactId } : {})}
            onSaved={() => onCreated?.()}
            onCancel={() => onCancelCreate?.()}
          />
        </section>
      )}

      {activities.length === 0 && !creating && (
        <p className="text-muted-foreground text-sm">{emptyText ?? strings.activity.empty}</p>
      )}

      {sections.map((section) => (
        <div key={section.label}>
          <p className="mt-3 mb-2 font-semibold">{section.label}</p>

          {section.rows.map((activity) => {
            const open = detail.isOpen(activity.id)
            const color = activityTypeColor(types.data, activity.type)
            const typeLabel = activityTypeLabel(types.data, activity.type)
            const billable = sumItems(activity.items, { billableOnly: true })

            return (
              <div
                key={activity.id}
                className={cn(
                  'mb-2 overflow-hidden rounded-[10px] border bg-card',
                  open && 'border-primary',
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
        </div>
      ))}
    </div>
  )
}
