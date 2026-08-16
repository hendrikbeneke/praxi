import type { AppointmentMove, CalendarEntry } from '@praxi/shared'
import { formatContactName } from '@praxi/shared'
import { and, asc, eq, gte, lt } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { activity, appointment, contact } from '../db/schema.js'
import { enqueueUpsert } from './google-sync.js'

/**
 * Reading and moving calendar entries.
 *
 * Appointments are never created here — they come into being with their
 * activity (`domain/activity.ts`). What this file offers is what a calendar
 * needs: everything in a window, and dragging one entry to another time.
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
    .innerJoin(contact, eq(contact.id, appointment.contactId))
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
    // invoice snapshot in slice 6.
    contactName: formatContactName({
      kind: row.kind,
      title: row.title_,
      firstName: row.firstName,
      lastName: row.lastName,
      companyName: row.companyName,
    }),
  }))
}

/**
 * Drags an entry to another time — **both ends of it** (D9).
 *
 * The appointment and its activity are moved in one transaction, and that is
 * the whole reason this function exists rather than a plain update of the
 * appointment row. `activity.occurred_at` is the record of *when it happened*;
 * the appointment is the slot it happened in. The editor has always written
 * the two from one value, so nothing had pulled them apart yet — a drag that
 * touched only the appointment would have been the first thing to do it, and
 * silently: the calendar would show the new time while the Vorgänge list,
 * every invoice line's date of service and the note attached to the session
 * kept the old one.
 *
 * `duration_min` follows for the same reason. Where the activity has no
 * calendar entry there is nothing to drag, so this cannot reach it.
 *
 * Only the times. Status, title and note are edited through the activity, and
 * a payload here that could carry them would be a second way to change them.
 *
 * Whether the slot may be taken at all is the exclusion constraint's decision,
 * not this one — a clash surfaces as SQLSTATE 23P01 and the route turns it
 * into a sentence. Cancelled entries do not hold their slot; a no-show does,
 * because that is `activity.status` and the time really was occupied.
 */
export async function moveAppointment(
  database: Database,
  tenantId: string,
  id: string,
  move: AppointmentMove,
): Promise<boolean> {
  const startsAt = new Date(move.startsAt)
  const endsAt = new Date(move.endsAt)

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(appointment)
      .set({ startsAt, endsAt })
      .where(and(eq(appointment.tenantId, tenantId), eq(appointment.id, id)))
      .returning({ id: appointment.id })

    if (!row) return false

    await tx
      .update(activity)
      .set({
        occurredAt: startsAt,
        durationMin: Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000),
      })
      .where(and(eq(activity.tenantId, tenantId), eq(activity.appointmentId, id)))

    // Moving an entry is a change Google has to learn about, and it is
    // enqueued in the same transaction so a dead line cannot stop the move
    // (slice 9). Neither title nor note travel — only the times and the one
    // bit of the status.
    await enqueueUpsert(tx, tenantId, id)
    return true
  })
}
