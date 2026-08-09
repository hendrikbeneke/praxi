import {
  type Activity,
  formatBerlinDateTime,
  formatBerlinTime,
  formatEuro,
  sumItems,
} from '@praxi/shared'
import { Badge } from '@/components/ui/badge'
import { strings } from '@/lib/strings'

/**
 * The chronological list of what happened, used on the contact page and on the
 * Vorgänge page.
 *
 * Each row shows the billable sum, because that is the number the practitioner
 * checks against — a no-show shows the Ausfallhonorar, not the session that
 * did not take place.
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
  if (activities.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyText ?? strings.activity.empty}</p>
  }

  return (
    <ul className="space-y-3">
      {activities.map((activity) => {
        const billable = sumItems(activity.items, { billableOnly: true })
        const total = sumItems(activity.items)

        return (
          <li key={activity.id}>
            <button
              type="button"
              onClick={() => onOpen(activity)}
              className="w-full rounded-md border px-4 py-3 text-left transition-colors hover:bg-accent"
            >
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{formatBerlinDateTime(activity.occurredAt)}</span>
                <Badge variant="outline">{strings.activity.types[activity.type]}</Badge>
                {activity.appointment && (
                  <Badge
                    variant={
                      activity.appointment.status === 'no_show' ||
                      activity.appointment.status.startsWith('cancelled')
                        ? 'secondary'
                        : 'outline'
                    }
                  >
                    {strings.appointment.status[activity.appointment.status]}
                  </Badge>
                )}
                {activity.title && (
                  <span className="text-muted-foreground text-sm">{activity.title}</span>
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
