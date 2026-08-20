import {
  type Activity,
  activityTypeColor,
  activityTypeLabel,
  formatBerlinDate,
  formatBerlinDateTime,
  formatBerlinTime,
  formatEuro,
  invoicePaymentState,
  occupiesSlot,
  plainNoteText,
  sumItems,
  toBerlinDate,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { ActivityForm } from '@/components/activity-form'
import { CollectDialog, type CollectPlanEntry } from '@/components/collect-dialog'
import { PaymentStatusBadge } from '@/components/payment-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { updateAppointment } from '@/lib/activities'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { ApiError } from '@/lib/api'
import { billableQueryOptions, invoiceListQueryOptions } from '@/lib/invoices'
import { noteListQueryOptions } from '@/lib/notes'
import { strings } from '@/lib/strings'

/**
 * One activity, read or edited, inline (D8).
 *
 * **One component, three containers.** The Vorgänge list and the contact's
 * Vorgänge tab expand it inside the card that was clicked; the calendar wraps
 * it in a dialog, because navigating away there would take the week grid with
 * it. The containers differ in where the thing sits, never in what it can do —
 * that was the whole argument for not giving the activity a screen of its own.
 *
 * `showContact` is the only thing the containers vary: inside a contact the
 * name would be the same on every row and the link would lead back to the page
 * it is on.
 */
export function ActivityDetail({
  activity,
  editing,
  footerPortal,
  onStartEditing,
  onStopEditing,
  onSaved,
  showContact = true,
}: {
  activity: Activity
  editing: boolean
  /**
   * The calendar's sticky footer (D-K3). Where it is given, the actions render
   * into it instead of into the flow — the same portal the form uses, so read
   * mode and edit mode put their buttons in the same place rather than one of
   * them jumping.
   */
  footerPortal?: HTMLElement | null
  onStartEditing: () => void
  onStopEditing: () => void
  onSaved: () => void
  showContact?: boolean
}) {
  const types = useQuery(activityTypeListQueryOptions(true))

  if (editing) {
    return (
      <ActivityForm
        key={activity.id}
        activity={activity}
        {...(showContact ? {} : { contactId: activity.contactId })}
        {...(footerPortal ? { footerPortal } : {})}
        onSaved={onSaved}
        onCancel={onStopEditing}
      />
    )
  }

  const billable = sumItems(activity.items, { billableOnly: true })
  const total = sumItems(activity.items)
  const color = activityTypeColor(types.data, activity.type)
  const typeLabel = activityTypeLabel(types.data, activity.type)

  return (
    /*
     * A **container** query, not a viewport one (D9). This was `lg:` until the
     * calendar rail became the third container: `lg:` asks how wide the window
     * is, and in a rail of a few hundred pixels on a 1512 px screen it answered
     * "wide", so the two columns were forced into the rail and printed on top
     * of each other. (The rail was 380 px then and is 320 since D-K2, which is
     * exactly the kind of number a viewport query cannot see.)
     * The component has to measure the space it was actually given — which is
     * also the honest reading of "one component, three containers".
     */
    <div className="@container">
      {/* The calendar's footer: "Absagen" on the left because it acts on the
          slot rather than on the record, "Bearbeiten" on the right where every
          primary action sits. Deleting is deliberately not offered — a Vorgang
          hangs on this appointment, and the server refuses it with a sentence
          about cancelling instead (D-K1). */}
      {footerPortal &&
        createPortal(
          <div className="flex items-center justify-between gap-2">
            {activity.appointment && occupiesSlot(activity.appointment.status) ? (
              <CancelAppointment appointmentId={activity.appointment.id} onDone={onSaved} />
            ) : (
              <span />
            )}
            <Button type="button" onClick={onStartEditing}>
              {strings.actions.edit}
            </Button>
          </div>,
          footerPortal,
        )}

      <div className="grid gap-8 @2xl:grid-cols-[minmax(0,1fr)_250px]">
        <div>
          {activity.title && <p className="mb-3 font-semibold text-lg">{activity.title}</p>}

          {activity.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">{strings.activity.itemsEmpty}</p>
          ) : (
            <ul>
              {activity.items.map((item) => (
                <li
                  key={item.id}
                  className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-baseline gap-3 border-t py-2"
                >
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {item.quantity}×
                  </span>
                  <span className="min-w-0">
                    {item.description}
                    {item.feeCode && (
                      <span className="ml-2 text-muted-foreground text-xs">{item.feeCode}</span>
                    )}
                    {!item.billable && (
                      <span className="ml-2 text-muted-foreground text-xs">
                        {strings.activity.notBillableBadge}
                      </span>
                    )}
                  </span>
                  <span className="text-right tabular-nums">
                    {formatEuro(item.quantity * item.unitPriceCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-1 flex items-baseline justify-between gap-4 border-t pt-3">
            <span className="font-medium">{strings.activity.sumBillable}</span>
            <span className="font-medium text-lg tabular-nums">{formatEuro(billable)}</span>
          </div>
          {total !== billable && (
            <div className="mt-1 flex items-baseline justify-between gap-4 text-muted-foreground text-xs">
              <span>{strings.activity.sumTotalLong}</span>
              <span className="tabular-nums">{formatEuro(total)}</span>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {footerPortal === undefined || footerPortal === null ? (
              <Button type="button" variant="outline" size="sm" onClick={onStartEditing}>
                {strings.actions.edit}
              </Button>
            ) : null}
            {/* Acts on what is stored, not on what is on screen — which is why
                it is only offered while the activity is open for billing. */}
            {activity.billingState === 'open' && <BillActivity activity={activity} />}
          </div>

          <ActivityNotes activityId={activity.id} />
        </div>

        <div className="flex flex-col gap-4 @2xl:border-l @2xl:pl-6">
          {showContact && (
            <Rail label={strings.activity.contact}>
              <Link
                to="/contacts/$contactId"
                params={{ contactId: activity.contactId }}
                className="underline underline-offset-4"
              >
                {activity.contactName}
              </Link>
              <span className="text-muted-foreground text-sm tabular-nums">
                {strings.contact.contactNumber} {activity.contactNumber}
              </span>
            </Rail>
          )}

          <Rail label={strings.activity.appointmentSection}>
            {activity.appointment ? (
              <>
                <span className="tabular-nums">
                  {formatBerlinDateTime(activity.appointment.startsAt)}
                </span>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {formatBerlinTime(activity.appointment.startsAt)}–
                  {formatBerlinTime(activity.appointment.endsAt)} ·{' '}
                  {strings.appointment.status[activity.appointment.status]}
                </span>
                {/* The way back out of the activity and into the week it sits
                  in. The other direction — a calendar entry opening this — is
                  the dialog in `appointments.tsx`. */}
                <Link
                  to="/appointments"
                  search={{ date: toBerlinDate(activity.appointment.startsAt), view: 'day' }}
                  className="mt-1 text-sm underline underline-offset-4"
                >
                  {strings.activity.openInCalendar}
                </Link>
              </>
            ) : (
              <span className="text-muted-foreground">{strings.activity.noAppointment}</span>
            )}
          </Rail>

          <Rail label={strings.activity.section}>
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              {typeLabel}
            </span>
            <span>{strings.activity.statuses[activity.status]}</span>
          </Rail>

          <ActivityInvoices activity={activity} />
        </div>
      </div>
    </div>
  )
}

/** One labelled block of the right-hand rail. */
function Rail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      {children}
    </div>
  )
}

/**
 * "Rechnung erstellen" on a single activity.
 *
 * The same call the billable list makes, with the items of this one activity:
 * one draft for the contact, appended to the draft they already have. Which of
 * the two it will be is said before it happens, by the dialog both ways share.
 */
function BillActivity({ activity }: { activity: Activity }) {
  const billable = useQuery(billableQueryOptions(activity.contactId))
  const drafts = useQuery(
    invoiceListQueryOptions({ contactId: activity.contactId, status: 'draft' }),
  )
  const [confirming, setConfirming] = useState(false)

  const mine = (billable.data ?? []).filter((item) => item.activityId === activity.id)
  if (mine.length === 0) return null

  const existing = (drafts.data ?? []).find((entry) => entry.type === 'invoice')

  const plan: CollectPlanEntry[] = [
    {
      contactId: activity.contactId,
      contactName: mine[0]?.contactName ?? '',
      itemIds: mine.map((item) => item.id),
      totalCents: mine.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0),
      existingDraft: existing ? { id: existing.id, invoiceDate: existing.invoiceDate } : null,
    },
  ]

  return (
    <>
      <Button type="button" size="sm" onClick={() => setConfirming(true)}>
        <FileText className="size-4" aria-hidden />
        {strings.billable.fromActivity}
      </Button>

      <CollectDialog plan={plan} open={confirming} onOpenChange={setConfirming} jumpToInvoice />
    </>
  )
}

/**
 * The invoices this activity's positions ended up on — the shortcut from the
 * treatment to the money (CLAUDE.md rule 9).
 *
 * It is a link and nothing else: recording a payment happens on the invoice,
 * so there is exactly one way into it and no second path through the model.
 *
 * Resolved on the client from the contact's invoices, by matching
 * `invoice_line.activity_item_id` against this activity's positions. No new
 * endpoint for it: that reference is already in the payload, and it is the
 * same record of origin the billable query reasons about.
 */
function ActivityInvoices({ activity }: { activity: Activity }) {
  const invoices = useQuery(invoiceListQueryOptions({ contactId: activity.contactId }))
  const today = toBerlinDate(new Date().toISOString())

  const itemIds = new Set(activity.items.map((item) => item.id))
  const related = (invoices.data ?? []).filter((entry) =>
    entry.lines.some((line) => line.activityItemId !== null && itemIds.has(line.activityItemId)),
  )

  if (related.length === 0) return null

  return (
    <Rail label={strings.invoice.title}>
      {related.map((entry) => {
        const state = invoicePaymentState(entry, entry.paidCents, today)
        return (
          <div key={entry.id} className="flex flex-col gap-1">
            <Link
              to="/invoices/$invoiceId"
              params={{ invoiceId: entry.id }}
              className="underline underline-offset-4"
            >
              {entry.number ?? strings.invoice.statuses.draft}
            </Link>
            <span className="flex items-center gap-2 text-muted-foreground text-sm">
              <span className="tabular-nums">{formatEuro(entry.totalCents)}</span>
              <PaymentStatusBadge state={state} />
            </span>
          </div>
        )
      })}
    </Rail>
  )
}

/**
 * The documentation written for this activity, read-only.
 *
 * Notes are written and locked on the contact's Notizen tab — this is here so
 * that opening a session shows what was recorded for it without hunting for
 * it. The D8 prototype offers "Notiz hinzufügen" here; that is deliberately
 * not built, because a note editor inside a record that is itself editable is
 * the rich-text question, and that is D10.
 */
function ActivityNotes({ activityId }: { activityId: string }) {
  const notes = useQuery(noteListQueryOptions({ activityId }))
  const rows = notes.data ?? []

  if (rows.length === 0) return null

  return (
    <section className="mt-6">
      <p className="font-medium text-sm">{strings.note.title}</p>
      <ul className="mt-2 space-y-2">
        {rows.map((entry) => (
          <li key={entry.id} className="rounded-md border px-3 py-2">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-sm">{formatBerlinDate(`${entry.noteDate}T12:00:00Z`)}</span>
              <Badge variant="outline">{strings.note.types[entry.type]}</Badge>
              {entry.lockedAt !== null && (
                <Badge variant="secondary">{strings.note.lockedBadge}</Badge>
              )}
              {entry.files.length > 0 && (
                <span className="text-muted-foreground text-xs">
                  {entry.files.length} {strings.note.files}
                </span>
              )}
            </div>
            {/* An excerpt, so the markers come off rather than being
                rendered — two clamped lines are no place for a heading, and
                showing `**Befund**` would be worse than either. */}
            <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-muted-foreground text-sm">
              {plainNoteText(entry.text)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** "Absagen" — the slot is released, the Vorgang stays documented. Its own
 *  component so the mutation is not declared above an early return. */
function CancelAppointment({
  appointmentId,
  onDone,
}: {
  appointmentId: string
  onDone: () => void
}) {
  const queryClient = useQueryClient()

  const cancel = useMutation({
    mutationFn: () => updateAppointment(appointmentId, { status: 'cancelled' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointments'] })
      await queryClient.invalidateQueries({ queryKey: ['activities'] })
      onDone()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : strings.error.generic),
  })

  return (
    <Button
      type="button"
      variant="outline"
      disabled={cancel.isPending}
      onClick={() => cancel.mutate()}
    >
      {strings.appointment.cancelAction}
    </Button>
  )
}
