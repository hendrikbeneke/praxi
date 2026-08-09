import { z } from 'zod'
import { optionalText } from './field.js'

/**
 * The calendar entry. Separate from the activity and optional: the foreign key
 * sits on `activity`, because the appointment knows nothing about business
 * logic — it is ultimately a projection towards a calendar (CLAUDE.md rule 6).
 *
 * The status is **descriptive only**. It does not gate billing; anything in the
 * past can be billed. What it does affect is the overlap constraint: a
 * cancelled slot is free again, a no-show is not, because it really did occupy
 * the time.
 *
 * `text` with a named check constraint rather than an enum — CLAUDE.md marks
 * this set as expected to change.
 */
export const appointmentStatuses = [
  'planned',
  'confirmed',
  'attended',
  'cancelled',
  'cancelled_late',
  'no_show',
] as const
export const appointmentStatusSchema = z.enum(appointmentStatuses)
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>

/** The statuses that release the slot for someone else. Kept next to the list
 *  it belongs to, because the exclusion constraint in migration 0009 repeats
 *  it in SQL and the two must not drift. */
export const SLOT_RELEASING_STATUSES: readonly AppointmentStatus[] = ['cancelled', 'cancelled_late']

export function occupiesSlot(status: AppointmentStatus): boolean {
  return !SLOT_RELEASING_STATUSES.includes(status)
}

/**
 * An appointment runs within a day. Anything longer is a typo, and a typo here
 * is expensive: the exclusion constraint takes the slot literally, so a single
 * mistyped end date blocks the calendar for every day it covers and every
 * later booking fails with "there is already an appointment".
 */
export const MAX_APPOINTMENT_MINUTES = 24 * 60

/** What is sent alongside an activity to create or move its calendar entry. */
export const appointmentDraftSchema = z
  .object({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    status: appointmentStatusSchema.default('planned'),
    title: optionalText(200),
    note: optionalText(2000),
  })
  .refine((draft) => new Date(draft.endsAt) > new Date(draft.startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  })
  .refine(
    (draft) =>
      new Date(draft.endsAt).getTime() - new Date(draft.startsAt).getTime() <=
      MAX_APPOINTMENT_MINUTES * 60_000,
    { message: 'appointment is longer than a day', path: ['endsAt'] },
  )

export type AppointmentDraft = z.infer<typeof appointmentDraftSchema>

export const appointmentSchema = z.object({
  id: z.uuid(),
  contactId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  status: appointmentStatusSchema,
  title: z.string().nullable(),
  note: z.string().nullable(),
})

export type Appointment = z.infer<typeof appointmentSchema>

/** An appointment in a list, with just enough of its contact and activity to
 *  paint a calendar without a second round trip. */
export const calendarEntrySchema = appointmentSchema.extend({
  activityId: z.uuid().nullable(),
  contactNumber: z.number().int(),
  contactName: z.string(),
})

export type CalendarEntry = z.infer<typeof calendarEntrySchema>

export const appointmentRangeQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
})

export type AppointmentRangeQuery = z.infer<typeof appointmentRangeQuerySchema>
