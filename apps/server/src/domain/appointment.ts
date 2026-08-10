import type { AppointmentDraft, CalendarEntry } from '@praxi/shared'
import { formatContactName } from '@praxi/shared'
import { and, asc, eq, gte, lt } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { activity, appointment, contact } from '../db/schema.js'

/**
 * Reading and moving calendar entries.
 *
 * Appointments are never created here — they come into being with their
 * activity (`domain/activity.ts`). What this file offers is what a calendar
 * needs: everything in a window, and moving or restatusing one entry.
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
 * Moves an entry or changes its status.
 *
 * The status says what became of the slot and does not gate billing. What it
 * does decide is whether the slot stays occupied — setting `cancelled` frees
 * it for someone else, every other status holds it. That is enforced by the
 * exclusion constraint, not here; a clash surfaces as SQLSTATE 23P01.
 *
 * Whether the session took place is `activity.status`, not this one, and is
 * changed through the activity.
 */
export async function updateAppointment(
  database: Database,
  tenantId: string,
  id: string,
  draft: AppointmentDraft,
): Promise<boolean> {
  const [row] = await database
    .update(appointment)
    .set({
      startsAt: new Date(draft.startsAt),
      endsAt: new Date(draft.endsAt),
      status: draft.status,
      title: draft.title,
      note: draft.note,
    })
    .where(and(eq(appointment.tenantId, tenantId), eq(appointment.id, id)))
    .returning({ id: appointment.id })

  return row !== undefined
}
