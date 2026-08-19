import { z } from 'zod'
import { optionalText, optionalTextPatch } from './field.js'

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

/**
 * The statuses that release the slot for someone else.
 *
 * Until migration 0034 this list was repeated in SQL — the exclusion
 * constraint named the same two values, and a test compared the two so they
 * could not drift. The constraint is gone and nothing enforces occupancy any
 * more, so the list has exactly two readers left, and both of them only
 * *describe*: `findFreeSlots`, which refuses to suggest a time that is taken,
 * and the calendar, which counts cancellations, sums the hours held and
 * strikes a released entry through.
 */
export const SLOT_RELEASING_STATUSES: readonly AppointmentStatus[] = ['cancelled', 'cancelled_late']

export function occupiesSlot(status: AppointmentStatus): boolean {
  return !SLOT_RELEASING_STATUSES.includes(status)
}

/**
 * An appointment runs within a day. Anything longer is a typo — and one worth
 * refusing even now that overlaps are allowed: an entry spanning a fortnight
 * is painted across every column it touches and makes the weeks it covers
 * unreadable. Until 0034 the argument was sharper still, because the exclusion
 * constraint took the slot literally and every later booking in those days
 * failed.
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

/**
 * A calendar entry of its own — the "Nur Termin" tab (D-K2).
 *
 * The contact is optional here and nowhere else: a blocker, documentation
 * time, a team meeting are appointments that belong to nobody, and until this
 * package they could not be entered at all. An **activity** still always has a
 * contact, so an appointment created without one cannot later carry a Vorgang
 * — the composite foreign key sees to that, and it stays that way on purpose.
 *
 * It has no type and no colour: colours come from the activity type, and a
 * bare appointment has none. The grid paints it in the neutral default.
 */
export const appointmentCreateSchema = z
  .object({
    contactId: z.uuid().nullable().default(null),
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

export type AppointmentCreate = z.infer<typeof appointmentCreateSchema>

/**
 * Editing one — dragging it, renaming it, cancelling it.
 *
 * **One shape for all three**, which replaces the `/move` payload D9 kept
 * deliberately narrow. Its argument was that status, title and note are edited
 * through the activity, so a second door here would be a second way to change
 * them; an appointment without an activity has no such door, and this is it.
 * A drag still sends nothing but the two instants.
 *
 * The two times travel **together or not at all**: half a move is not a
 * shorter move, it is an interval whose end may precede its start, and the
 * checks below can only be made when both are known.
 */
export const appointmentPatchSchema = z
  .object({
    contactId: z.uuid().nullable().optional(),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().optional(),
    status: appointmentStatusSchema.optional(),
    title: optionalTextPatch(200),
    note: optionalTextPatch(2000),
  })
  .superRefine((patch, ctx) => {
    if ((patch.startsAt === undefined) !== (patch.endsAt === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'startsAt and endsAt must be given together',
        path: [patch.startsAt === undefined ? 'startsAt' : 'endsAt'],
      })
      return
    }
    if (patch.startsAt === undefined || patch.endsAt === undefined) return

    const span = new Date(patch.endsAt).getTime() - new Date(patch.startsAt).getTime()
    if (span <= 0) {
      ctx.addIssue({ code: 'custom', message: 'endsAt must be after startsAt', path: ['endsAt'] })
    } else if (span > MAX_APPOINTMENT_MINUTES * 60_000) {
      ctx.addIssue({
        code: 'custom',
        message: 'appointment is longer than a day',
        path: ['endsAt'],
      })
    }
  })

export type AppointmentPatch = z.infer<typeof appointmentPatchSchema>

export const appointmentSchema = z.object({
  id: z.uuid(),
  /** Null on an appointment that belongs to nobody — see
   *  `appointmentCreateSchema`. */
  contactId: z.uuid().nullable(),
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
