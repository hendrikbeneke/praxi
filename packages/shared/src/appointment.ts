import { z } from 'zod'
import { optionalText } from './field.js'

/**
 * The calendar entry. Separate from the activity and optional: the foreign key
 * sits on `activity`, because the appointment knows nothing about business
 * logic — it is ultimately a projection towards a calendar (CLAUDE.md rule 6).
 *
 * The status says what became of the **slot**, and nothing else. What became
 * of the treatment is `activity.status`: `attended` and `no_show` used to live
 * here and moved there in slice 7.5, because a no-show is an activity that did
 * not happen in a slot that stayed occupied, and one column could not say
 * both.
 *
 * It is **descriptive only** in the same sense as before — it does not gate
 * billing; anything in the past can be billed. What it does affect is the
 * overlap constraint: a cancelled slot is free again, every other status holds
 * the time.
 *
 * `text` with a named check constraint rather than an enum — CLAUDE.md marks
 * this set as expected to change, and slice 7.5 is the proof.
 */
export const appointmentStatuses = [
  'requested',
  'planned',
  'confirmed',
  'cancelled',
  'cancelled_late',
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

export const appointmentRangeQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
})

export type AppointmentRangeQuery = z.infer<typeof appointmentRangeQuerySchema>
