import type { Appointment, AppointmentStatus } from '@praxi/shared'
import {
  addMinutesToLocal,
  appointmentStatuses,
  fromBerlinDateTimeLocal,
  minutesBetween,
  toBerlinDateTimeLocal,
} from '@praxi/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { ContactPicker } from '@/components/contact-picker'
import { DateField } from '@/components/date-field'
import { TimeField } from '@/components/time-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createAppointment, updateAppointment } from '@/lib/activities'
import { ApiError } from '@/lib/api'
import { strings } from '@/lib/strings'

/**
 * A calendar entry and nothing else — the "Nur Termin" tab (D-K3).
 *
 * Its own form rather than a mode of `ActivityForm`, and that is the opposite
 * call from the one made for the Vorgang next to it. The reason is that there
 * is nothing to reuse: no type, no positions, no billing, no contact
 * requirement — four of the five sections would have had to be switched off,
 * and a form that is mostly `hidden` is two forms wearing one name.
 *
 * What it carries is what a blocker needs: a title, a note, times, optionally
 * a contact. **The title is a field even though design image 06 has none** —
 * without it "Teambesprechung" would have no name in the grid and every
 * blocker would read as an unlabelled box.
 */
export function AppointmentForm({
  appointment,
  startsAtLocal,
  durationMin,
  submitLabel,
  warning,
  footerPortal,
  onDraftChange,
  onSaved,
  onCancel,
}: {
  /** Editing an existing entry; absent when creating one. */
  appointment?: Appointment | undefined
  /** Pre-filled when a slot in the calendar was clicked. */
  startsAtLocal?: string | undefined
  /** What the slot finder was searching for, where it searched by duration. */
  durationMin?: number | undefined
  submitLabel?: string | undefined
  warning?: React.ReactNode
  footerPortal?: HTMLElement | null
  onDraftChange?: (draft: { startsAt: string; endsAt: string; typeCode: string } | null) => void
  onSaved: () => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const formId = useId()

  const start = appointment
    ? toBerlinDateTimeLocal(appointment.startsAt)
    : (startsAtLocal ?? toBerlinDateTimeLocal(new Date().toISOString()))
  const initialMinutes = appointment
    ? minutesBetween(appointment.startsAt, appointment.endsAt)
    : (durationMin ?? 30)

  const [contactId, setContactId] = useState<string | null>(appointment?.contactId ?? null)
  const [title, setTitle] = useState(appointment?.title ?? '')
  const [date, setDate] = useState(start.slice(0, 10))
  const [from, setFrom] = useState(start.slice(11, 16))
  /**
   * Held as text, like every other number in a form here: a number input
   * cannot be empty, and whatever it falls back to is a value the record does
   * not have.
   */
  const [durationText, setDurationText] = useState(String(initialMinutes))
  const [status, setStatus] = useState<AppointmentStatus>(appointment?.status ?? 'planned')
  const [note, setNote] = useState(appointment?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const minutes = /^\d+$/.test(durationText.trim()) ? Number(durationText.trim()) : null
  const startsAtLocalValue = date === '' || from === '' ? '' : `${date}T${from}`
  const endsAtLocalValue =
    startsAtLocalValue === '' || minutes === null || minutes <= 0
      ? null
      : addMinutesToLocal(startsAtLocalValue, minutes)

  const canSave = startsAtLocalValue !== '' && endsAtLocalValue !== null

  const startsAt = startsAtLocalValue === '' ? null : fromBerlinDateTimeLocal(startsAtLocalValue)
  const endsAt = endsAtLocalValue === null ? null : fromBerlinDateTimeLocal(endsAtLocalValue)

  /** The block the grid draws while this is open. A bare appointment has no
   *  type, so it takes the neutral colour — an empty code is what
   *  `activityTypeColor` reads as "none". */
  useEffect(() => {
    if (!onDraftChange) return
    onDraftChange(startsAt !== null && endsAt !== null ? { startsAt, endsAt, typeCode: '' } : null)
  }, [onDraftChange, startsAt, endsAt])
  useEffect(() => () => onDraftChange?.(null), [onDraftChange])

  const mutation = useMutation({
    mutationFn: async () => {
      if (startsAt === null || endsAt === null) throw new Error('incomplete')
      const payload = {
        contactId,
        startsAt,
        endsAt,
        status,
        title: title.trim() === '' ? null : title.trim(),
        note: note.trim() === '' ? null : note.trim(),
      }
      return appointment
        ? await updateAppointment(appointment.id, payload)
        : await createAppointment(payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointments'] })
      await queryClient.invalidateQueries({ queryKey: ['contacts'] })
      onSaved()
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : strings.error.generic),
  })

  return (
    <>
      <div className="space-y-4">
        <div>
          <Label htmlFor={`${formId}-contact`}>
            {strings.activity.contact}{' '}
            <span className="font-normal text-muted-foreground">
              {strings.appointment.optionalSuffix}
            </span>
          </Label>
          <ContactPicker
            inputId={`${formId}-contact`}
            value={contactId}
            locked={false}
            onChange={setContactId}
          />
        </div>

        <div>
          <Label htmlFor={`${formId}-title`}>{strings.activity.activityTitle}</Label>
          <Input
            id={`${formId}-title`}
            className="mt-2"
            value={title}
            placeholder={strings.appointment.titlePlaceholder}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor={`${formId}-date`}>{strings.activity.occurredAt}</Label>
          <DateField
            id={`${formId}-date`}
            className="mt-2"
            value={date}
            onChange={(next) => setDate(next ?? '')}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor={`${formId}-from`}>{strings.appointment.fromLabel}</Label>
            <TimeField
              id={`${formId}-from`}
              className="mt-2"
              value={from}
              onChange={(next) => setFrom(next ?? '')}
            />
          </div>
          <div>
            <Label htmlFor={`${formId}-to`}>{strings.appointment.toLabel}</Label>
            {/* Derived, not entered: the length is the field, and two writable
                ends would need a rule for which of them wins. */}
            <p id={`${formId}-to`} className="mt-2 flex h-9 items-center text-sm tabular-nums">
              {endsAtLocalValue === null ? '—' : endsAtLocalValue.slice(11)}
            </p>
          </div>
          <div>
            <Label htmlFor={`${formId}-duration`}>{strings.appointment.durationLabel}</Label>
            <Input
              id={`${formId}-duration`}
              className="mt-2 tabular-nums"
              inputMode="numeric"
              value={durationText}
              onChange={(event) => setDurationText(event.target.value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor={`${formId}-status`}>{strings.activity.appointmentStatus}</Label>
          <Select value={status} onValueChange={(value) => setStatus(value as AppointmentStatus)}>
            <SelectTrigger id={`${formId}-status`} className="mt-2 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {appointmentStatuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {strings.appointment.status[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor={`${formId}-note`}>{strings.appointment.noteLabel}</Label>
          <Textarea
            id={`${formId}-note`}
            className="mt-2"
            rows={3}
            value={note}
            placeholder={strings.appointment.notePlaceholder}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        <p className="text-muted-foreground text-xs leading-snug">{strings.appointment.bareHint}</p>

        {error !== null && <p className="text-destructive text-sm">{error}</p>}
      </div>

      {warning}

      {footerPortal ? (
        createPortal(<Actions />, footerPortal)
      ) : (
        <div className="mt-6">
          <Actions />
        </div>
      )}
    </>
  )

  function Actions() {
    return (
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {strings.activity.cancel}
        </Button>
        <Button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !canSave}
        >
          {mutation.isPending ? strings.activity.saving : (submitLabel ?? strings.activity.save)}
        </Button>
      </div>
    )
  }
}
