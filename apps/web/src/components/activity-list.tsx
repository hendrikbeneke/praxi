import {
  type Activity,
  activityLabel,
  activityTypeColor,
  activityTypeLabel,
  formatBerlinDateTime,
  formatBerlinTime,
  formatEuro,
  occupiesSlot,
  readableTextOn,
  sumItems,
} from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { strings } from '@/lib/strings'

/**
 * The chronological list of what happened, used on the contact page and on the
 * Vorgänge page.
 *
 * Each row shows the billable sum, because that is the number the practitioner
 * checks against — a no-show shows the Ausfallhonorar, not the session that
 * did not take place.
 *
 * Two statuses appear, and they say different things: the activity's says what
 * became of the treatment, the appointment's what became of the slot. Only the
 * ones worth reading are shown — a planned activity in a planned slot is the
 * normal case and gets no badge at all.
 */
export function ActivityList({
  activities,
  onOpen,
  emptyText,
}: {
  activities: readonly Activity[]
  onOpen: (activity: Activity) => void
  emptyText?: string
}) {
  const types = useQuery(activityTypeListQueryOptions(true))

  if (activities.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyText ?? strings.activity.empty}</p>
  }

  return (
    <ul className="space-y-3">
      {activities.map((activity) => {
        const billable = sumItems(activity.items, { billableOnly: true })
        const total = sumItems(activity.items)
        const color = activityTypeColor(types.data, activity.type)
        const typeLabel = activityTypeLabel(types.data, activity.type)

        return (
          <li key={activity.id}>
            <button
              type="button"
              onClick={() => onOpen(activity)}
              className="w-full rounded-md border px-4 py-3 text-left transition-colors hover:bg-accent"
            >
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{formatBerlinDateTime(activity.occurredAt)}</span>
                <span
                  className="rounded px-1.5 py-0.5 text-xs"
                  style={{ backgroundColor: color, color: readableTextOn(color) }}
                >
                  {typeLabel}
                </span>

                {activity.status !== 'planned' && (
                  <Badge variant={activity.status === 'no_show' ? 'secondary' : 'outline'}>
                    {strings.activity.statuses[activity.status]}
                  </Badge>
                )}
                {activity.appointment && !occupiesSlot(activity.appointment.status) && (
                  <Badge variant="secondary">
                    {strings.appointment.status[activity.appointment.status]}
                  </Badge>
                )}

                {/* The title if there is one, otherwise the type's label is
                    already the name of this activity and stands above. */}
                {activity.title && (
                  <span className="text-muted-foreground text-sm">
                    {activityLabel(activity, typeLabel)}
                  </span>
                )}
                <span className="ml-auto font-medium tabular-nums">{formatEuro(billable)}</span>
              </span>

              {activity.appointment && (
                <span className="mt-1 block text-muted-foreground text-xs">
                  {formatBerlinTime(activity.appointment.startsAt)}–
                  {formatBerlinTime(activity.appointment.endsAt)}
                </span>
              )}

              {activity.items.length > 0 && (
                <span className="mt-2 block space-y-0.5 text-muted-foreground text-sm">
                  {activity.items.map((item) => (
                    <span key={item.id} className="block">
                      {item.quantity}× {item.description}
                      {!item.billable && (
                        <span className="ml-1 text-xs">({strings.activity.notBillableBadge})</span>
                      )}
                    </span>
                  ))}
                </span>
              )}

              {total !== billable && (
                <span className="mt-1 block text-muted-foreground text-xs">
                  {strings.activity.sumTotal}: {formatEuro(total)}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
