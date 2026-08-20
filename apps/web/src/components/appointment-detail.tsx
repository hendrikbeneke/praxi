import type { CalendarEntry } from '@praxi/shared'
import { formatBerlinTime, minutesBetween, occupiesSlot } from '@praxi/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { UserRound } from 'lucide-react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { ReadValue } from '@/components/read-value'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { deleteAppointment, updateAppointment } from '@/lib/activities'
import { ApiError } from '@/lib/api'
import { strings } from '@/lib/strings'

/** Label above value, the shape read mode has everywhere: the `<Label>` is
 *  identical in both modes, so switching to edit moves no line. */
function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <ReadValue>{children}</ReadValue>
    </div>
  )
}

/**
 * A calendar entry with no Vorgang behind it, in read mode (D-K3).
 *
 * The two actions in its footer are **not** the two an appointment with a
 * Vorgang gets, and the difference is the point. A blocker entered by mistake
 * is *deleted*: cancelling would leave it standing on the calendar and counted
 * among the day's cancellations. Where a Vorgang hangs on the appointment,
 * cancelling is the right gesture and the server refuses the other one — see
 * `deleteAppointment` in the domain.
 */
export function AppointmentDetail({
  entry,
  footerPortal,
  onEdit,
  onDone,
}: {
  entry: CalendarEntry
  footerPortal?: HTMLElement | null
  onEdit: () => void
  /** Cancelled or deleted — either way this entry is finished with. */
  onDone: () => void
}) {
  const queryClient = useQueryClient()

  const settled = async () => {
    await queryClient.invalidateQueries({ queryKey: ['appointments'] })
    await queryClient.invalidateQueries({ queryKey: ['contacts'] })
    onDone()
  }

  const cancel = useMutation({
    mutationFn: () => updateAppointment(entry.id, { status: 'cancelled' }),
    onSuccess: settled,
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : strings.error.generic),
  })

  const remove = useMutation({
    mutationFn: () => deleteAppointment(entry.id),
    onSuccess: settled,
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : strings.error.generic),
  })

  const busy = cancel.isPending || remove.isPending

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label={strings.appointment.fromLabel}>{formatBerlinTime(entry.startsAt)}</Field>
          <Field label={strings.appointment.toLabel}>{formatBerlinTime(entry.endsAt)}</Field>
          <Field label={strings.appointment.durationLabel}>
            {strings.slotFinder.minutes(minutesBetween(entry.startsAt, entry.endsAt))}
          </Field>
        </div>

        <Field label={strings.activity.appointmentStatus}>
          {strings.appointment.status[entry.status]}
        </Field>

        <Field label={strings.activity.contact}>
          {entry.contactId === null ? null : (
            <Link
              to="/contacts/$contactId"
              params={{ contactId: entry.contactId }}
              className="inline-flex items-center gap-1.5 font-medium underline underline-offset-2"
            >
              <UserRound className="size-3.5" aria-hidden />
              {entry.contactName}
            </Link>
          )}
        </Field>

        <Field label={strings.appointment.noteLabel}>{entry.note}</Field>
      </div>

      {footerPortal &&
        createPortal(
          <div className="flex items-center justify-between gap-2">
            {/* Deleting, not cancelling — see the note at the top. It is the
                destructive of the two, so it sits away from "Bearbeiten". */}
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => remove.mutate()}
            >
              {strings.appointment.deleteAction}
            </Button>

            <div className="flex gap-2">
              {occupiesSlot(entry.status) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => cancel.mutate()}
                >
                  {strings.appointment.cancelAction}
                </Button>
              )}
              <Button type="button" disabled={busy} onClick={onEdit}>
                {strings.actions.edit}
              </Button>
            </div>
          </div>,
          footerPortal,
        )}
    </>
  )
}
