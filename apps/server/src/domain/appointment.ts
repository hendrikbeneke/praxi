import type { Appointment, AppointmentCreate, AppointmentPatch, CalendarEntry } from '@praxi/shared'
import { formatContactName } from '@praxi/shared'
import { and, asc, eq, gte, lt } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { activity, appointment, contact } from '../db/schema.js'
import { newId } from '../id.js'
import { enqueueDelete, enqueueUpsert } from './google-sync.js'

/**
 * Calendar entries in their own right (D-K1).
 *
 * Appointments used to come into being here only through their activity, and
 * `domain/activity.ts` still creates one that way — a Vorgang with a Termin is
 * one act and stays one. What this file adds is the other half: an appointment
 * that belongs to no activity and possibly to no contact, which is what a
 * blocker, documentation time or a team meeting is.
 *
 * The asymmetry between the two halves is deliberate and sits in the schema
 * rather than here: an activity always has a contact, the composite key
 * carries it through, and so an appointment created without one can never be
 * picked up by an activity afterwards.
 */

/**
 * Everything in `[from, to)`, with just enough of the contact to paint a
 * calendar without a second round trip.
 *
 * Cancelled entries come along: the calendar has to be able to show them
 * greyed out, and hiding them would make a slot look free while the record of
 * the cancellation is what the practitioner is looking for.
 */
export async function listCalendarEntries(
  database: Database,
  tenantId: string,
  range: { from: string; to: string },
): Promise<CalendarEntry[]> {
  const rows = await database
    .select({
      id: appointment.id,
      contactId: appointment.contactId,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      status: appointment.status,
      title: appointment.title,
      note: appointment.note,
      activityId: activity.id,
      activityType: activity.type,
      activityStatus: activity.status,
      contactNumber: contact.contactNumber,
      kind: contact.kind,
      title_: contact.title,
      firstName: contact.firstName,
      lastName: contact.lastName,
      companyName: contact.companyName,
    })
    .from(appointment)
    // Left, not inner: an appointment without a contact is a calendar entry
    // like any other, and an inner join would drop every blocker from the
    // calendar silently — the worst kind of wrong, because the time still
    // looks free.
    .leftJoin(contact, eq(contact.id, appointment.contactId))
    .leftJoin(activity, eq(activity.appointmentId, appointment.id))
    .where(
      and(
        eq(appointment.tenantId, tenantId),
        gte(appointment.startsAt, new Date(range.from)),
        lt(appointment.startsAt, new Date(range.to)),
      ),
    )
    .orderBy(asc(appointment.startsAt))

  return rows.map((row) => ({
    id: row.id,
    contactId: row.contactId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    title: row.title,
    note: row.note,
    activityId: row.activityId,
    // The type travels as its code and the calendar resolves label and colour
    // from the catalogue it has loaded anyway.
    activityType: row.activityType,
    activityStatus: row.activityStatus,
    contactNumber: row.contactNumber,
    // One implementation of the name, shared with the client and with the
    // invoice snapshot in slice 6. Null where there is nobody to name — the
    // block then shows the appointment's own title.
    contactName:
      row.kind === null
        ? null
        : formatContactName({
            kind: row.kind,
            title: row.title_,
            firstName: row.firstName,
            lastName: row.lastName,
            companyName: row.companyName,
          }),
  }))
}

/** The appointment as it is stored — what the create and patch calls answer
 *  with, so the caller never has to re-read what it just wrote. */
const appointmentColumns = {
  id: appointment.id,
  contactId: appointment.contactId,
  startsAt: appointment.startsAt,
  endsAt: appointment.endsAt,
  status: appointment.status,
  title: appointment.title,
  note: appointment.note,
}

function toAppointment(row: {
  id: string
  contactId: string | null
  startsAt: Date
  endsAt: Date
  status: Appointment['status']
  title: string | null
  note: string | null
}): Appointment {
  return {
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
  }
}

/**
 * An appointment of its own — no activity, and possibly no contact.
 *
 * Nothing is derived and nothing is checked against the rest of the calendar:
 * since migration 0034 an overlapping time is allowed, and whether it is a
 * good idea is the practitioner's question, asked by the form before it gets
 * here. What this does check is what only the database knows — a contact of
 * another tenant is refused by the composite foreign key.
 */
export async function createAppointment(
  database: Database,
  tenantId: string,
  input: AppointmentCreate,
): Promise<Appointment> {
  return database.transaction(async (tx) => {
    const [row] = await tx
      .insert(appointment)
      .values({
        id: newId(),
        tenantId,
        contactId: input.contactId,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        status: input.status,
        title: input.title,
        note: input.note,
      })
      .returning(appointmentColumns)

    if (!row) throw new Error('insert returned no row')

    // In the same transaction as the change, so the instruction and the change
    // commit together or not at all (slice 9).
    await enqueueUpsert(tx, tenantId, row.id)
    return toAppointment(row)
  })
}

/**
 * Editing one — dragging it, renaming it, cancelling it.
 *
 * **One function for all three**, where D9 had `moveAppointment` and nothing
 * else. Its narrowness was an argument about doors: status, title and note
 * were edited through the activity, and a second way in would have been a
 * second way to change them. An appointment without an activity has no such
 * door, so this is it — and a drag still sends nothing but the two instants.
 *
 * **The times move both rows.** `activity.occurred_at` is the record of *when
 * it happened*, the appointment is the slot it happened in, and the editor has
 * always written the two from one value. Letting a drag touch only the
 * appointment would be the first thing to pull them apart, and it would do it
 * silently: the calendar would show the new time while the Vorgänge list,
 * every invoice line's date of service and the note attached to the session
 * kept the old one. `duration_min` follows for the same reason.
 *
 * Whether the time is free is nobody's decision here any more (0034). A
 * cancelled entry does not hold its slot; a no-show does, because that is
 * `activity.status` and the time really was occupied.
 */
export async function updateAppointment(
  database: Database,
  tenantId: string,
  id: string,
  patch: AppointmentPatch,
): Promise<Appointment | null> {
  return database.transaction(async (tx) => {
    const times =
      patch.startsAt !== undefined && patch.endsAt !== undefined
        ? { startsAt: new Date(patch.startsAt), endsAt: new Date(patch.endsAt) }
        : null

    const [row] = await tx
      .update(appointment)
      .set({
        ...(times ?? {}),
        // Only what the patch mentions. An absent key means "leave alone",
        // which is why the schema does not default these to null.
        ...(patch.contactId !== undefined ? { contactId: patch.contactId } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
      })
      .where(and(eq(appointment.tenantId, tenantId), eq(appointment.id, id)))
      .returning(appointmentColumns)

    if (!row) return null

    if (times) {
      await tx
        .update(activity)
        .set({
          occurredAt: times.startsAt,
          durationMin: Math.round((times.endsAt.getTime() - times.startsAt.getTime()) / 60_000),
        })
        .where(and(eq(activity.tenantId, tenantId), eq(activity.appointmentId, id)))
    }

    // Moving or cancelling an entry is a change Google has to learn about, and
    // it is enqueued in the same transaction so a dead line cannot stop the
    // edit (slice 9). Neither title nor note travel — only the times and the
    // one bit of the status.
    await enqueueUpsert(tx, tenantId, id)
    return toAppointment(row)
  })
}

/** An appointment that carries a Vorgang cannot be deleted on its own. */
export class AppointmentHasActivityError extends Error {
  constructor() {
    super('appointment carries an activity')
    this.name = 'AppointmentHasActivityError'
  }
}

/**
 * Deleting one — **only where there is no activity behind it.**
 *
 * A blocker entered by mistake has to go, and cancelling would be the wrong
 * gesture for it: it would stay on the calendar as a cancelled entry and count
 * towards the day's cancellations. Where an activity hangs on the appointment,
 * cancelling *is* the right gesture, because what happened — or did not — is
 * meant to stay documented; so this refuses rather than reaching through.
 *
 * Deleting the appointment of an activity while keeping the activity is a
 * third thing, and nobody has defined what it should mean yet. It is a line in
 * WORKPLAN.md, not a branch here.
 */
export async function deleteAppointment(
  database: Database,
  tenantId: string,
  id: string,
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: appointment.id })
      .from(appointment)
      .where(and(eq(appointment.tenantId, tenantId), eq(appointment.id, id)))
      .limit(1)

    if (!row) return false

    const [carried] = await tx
      .select({ id: activity.id })
      .from(activity)
      .where(and(eq(activity.tenantId, tenantId), eq(activity.appointmentId, id)))
      .limit(1)

    if (carried) throw new AppointmentHasActivityError()

    // Before the row goes, or there is nothing left to read the event id from
    // and the pending push has been carried off by the cascade (slice 9).
    await enqueueDelete(tx, tenantId, id)
    await tx
      .delete(appointment)
      .where(and(eq(appointment.tenantId, tenantId), eq(appointment.id, id)))
    return true
  })
}
