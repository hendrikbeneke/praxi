import type {
  AppointmentStatus,
  GoogleSyncResult,
  SyncConflict,
  SyncConflictReason,
} from '@praxi/shared'
import { formatContactName, occupiesSlot } from '@praxi/shared'
import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm'
import type { Database, Transaction } from '../db/client.js'
import {
  activity,
  appointment,
  appointmentSyncConflict,
  contact,
  googleConnection,
  googleSyncQueue,
} from '../db/schema.js'
import type { GoogleApi } from '../google/client.js'
import { isAuthFailure, isDuplicate, isNotFound, isSyncTokenExpired } from '../google/client.js'
import { buildEvent } from '../google/payload.js'
import { newId } from '../id.js'

/**
 * The outbox and the return channel (CLAUDE.md slice 9).
 *
 * The local database is the system of record; Google Calendar is a projection.
 * Everything here follows from that: a push that fails changes nothing local,
 * a pull applies three fields and drops the rest, and where the two sides
 * disagree the software asks instead of merging.
 */

type Writer = Database | Transaction

/**
 * How long to wait after the nth failure, in minutes. Beyond the list the last
 * value repeats: a row is never given up on and never deleted, it just stops
 * asking often. What makes it visible is `attempts` and `last_error` on the
 * row, which the settings show.
 */
const BACKOFF_MINUTES = [0.5, 1, 2, 5, 15, 60, 360]

/** From this many failures on, a row counts as stuck and is worth a look. */
export const STUCK_AFTER_ATTEMPTS = 5

function nextAttempt(attempts: number, now: Date): Date {
  const minutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1] ?? 0.5
  return new Date(now.getTime() + minutes * 60_000)
}

/**
 * Enqueue a push for an appointment. Called from inside the transaction that
 * writes the appointment, so the instruction and the change commit together or
 * not at all — that is the whole point of an outbox.
 *
 * Nothing is enqueued while no practice calendar is chosen: there would be
 * nowhere to put it, and a queue that fills up against a connection that does
 * not exist is just a leak.
 */
export async function enqueueUpsert(
  writer: Writer,
  tenantId: string,
  appointmentId: string,
): Promise<void> {
  const [connection] = await writer
    .select({ calendarId: googleConnection.calendarId })
    .from(googleConnection)
    .where(eq(googleConnection.tenantId, tenantId))
    .limit(1)

  if (!connection?.calendarId) return

  await writer
    .insert(googleSyncQueue)
    .values({
      id: newId(),
      tenantId,
      appointmentId,
      operation: 'upsert',
      calendarId: connection.calendarId,
    })
    .onConflictDoUpdate({
      target: googleSyncQueue.appointmentId,
      targetWhere: sql`"appointment_id" is not null`,
      // A fresh change deserves a fresh attempt, and it goes to whichever
      // calendar is configured now.
      set: {
        calendarId: connection.calendarId,
        attempts: 0,
        lastError: null,
        nextAttemptAt: sql`now()`,
      },
    })
}

/**
 * Enqueue the removal of the event belonging to an appointment that is about
 * to disappear. Must run *before* the appointment row is deleted — afterwards
 * there is nothing left to read the event id from, and the pending push has
 * been carried off by the cascade.
 */
export async function enqueueDelete(
  writer: Writer,
  tenantId: string,
  appointmentId: string,
): Promise<void> {
  const [row] = await writer
    .select({ eventId: appointment.googleEventId })
    .from(appointment)
    .where(and(eq(appointment.tenantId, tenantId), eq(appointment.id, appointmentId)))
    .limit(1)

  if (!row?.eventId) return

  const [connection] = await writer
    .select({ calendarId: googleConnection.calendarId })
    .from(googleConnection)
    .where(eq(googleConnection.tenantId, tenantId))
    .limit(1)

  if (!connection?.calendarId) return

  await writer.insert(googleSyncQueue).values({
    id: newId(),
    tenantId,
    appointmentId: null,
    operation: 'delete',
    calendarId: connection.calendarId,
    googleEventId: row.eventId,
  })
}

export type QueueCounts = { pending: number; stuck: number }

export async function countQueue(database: Database, tenantId: string): Promise<QueueCounts> {
  const [row] = await database
    .select({
      pending: sql<number>`count(*)::int`,
      stuck: sql<number>`count(*) filter (where ${googleSyncQueue.attempts} >= ${STUCK_AFTER_ATTEMPTS})::int`,
    })
    .from(googleSyncQueue)
    .where(eq(googleSyncQueue.tenantId, tenantId))

  return { pending: row?.pending ?? 0, stuck: row?.stuck ?? 0 }
}

/**
 * The rows that are due.
 *
 * Appointments with an open conflict are held back: their pending push is what
 * caused the conflict in the first place, and sending it would be "local wins"
 * decided by a timer rather than by the practitioner.
 */
async function claimDue(database: Database, tenantId: string, now: Date, limit: number) {
  return database
    .select()
    .from(googleSyncQueue)
    .where(
      and(
        eq(googleSyncQueue.tenantId, tenantId),
        lte(googleSyncQueue.nextAttemptAt, now),
        sql`not exists (
          select 1 from ${appointmentSyncConflict}
          where ${appointmentSyncConflict.appointmentId} = ${googleSyncQueue.appointmentId}
        )`,
      ),
    )
    .orderBy(asc(googleSyncQueue.nextAttemptAt))
    .limit(limit)
}

type QueueRow = Awaited<ReturnType<typeof claimDue>>[number]

/** One push. Throws only what the caller has to react to — an authentication
 *  failure — and records everything else on the row. */
async function pushRow(
  database: Database,
  tenantId: string,
  api: GoogleApi,
  row: QueueRow,
  now: Date,
  pseudonymize: boolean,
): Promise<boolean> {
  try {
    if (row.operation === 'delete') {
      if (row.googleEventId) {
        await api.deleteEvent(row.calendarId, row.googleEventId).catch((error: unknown) => {
          // Already gone is the outcome we wanted.
          if (!isNotFound(error)) throw error
        })
      }
    } else {
      await pushUpsert(database, tenantId, api, row, now, pseudonymize)
    }

    await database.delete(googleSyncQueue).where(eq(googleSyncQueue.id, row.id))
    return true
  } catch (error) {
    if (isAuthFailure(error)) throw error

    const attempts = row.attempts + 1
    await database
      .update(googleSyncQueue)
      .set({
        attempts,
        lastError: error instanceof Error ? error.message : 'Unbekannter Fehler.',
        nextAttemptAt: nextAttempt(attempts, now),
      })
      .where(eq(googleSyncQueue.id, row.id))
    return false
  }
}

async function pushUpsert(
  database: Database,
  tenantId: string,
  api: GoogleApi,
  row: QueueRow,
  now: Date,
  pseudonymize: boolean,
): Promise<void> {
  if (!row.appointmentId) return

  const [current] = await database
    .select({
      id: appointment.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      status: appointment.status,
      googleEventId: appointment.googleEventId,
      contactNumber: contact.contactNumber,
      // Only reaches the payload while `pseudonymize` is off; `buildEvent`
      // decides, in the one function that documents why.
      contactKind: contact.kind,
      firstName: contact.firstName,
      lastName: contact.lastName,
      companyName: contact.companyName,
    })
    .from(appointment)
    // Left, not inner: an appointment without a contact is projected like any
    // other — as a busy interval called "Belegt", see buildEvent.
    .leftJoin(contact, eq(contact.id, appointment.contactId))
    .where(and(eq(appointment.tenantId, tenantId), eq(appointment.id, row.appointmentId)))
    .limit(1)

  // Gone in the meantime; the cascade should have taken this row with it.
  if (!current) return

  /**
   * The appointment is read *now*, not when the row was written. Three edits
   * in a row are therefore one call, and an appointment cancelled in between
   * goes out as a cancelled event rather than as the move it once was.
   */
  const event = buildEvent({
    appointmentId: current.id,
    contactNumber: current.contactNumber,
    contactName:
      current.contactKind === null
        ? null
        : formatContactName({
            kind: current.contactKind,
            firstName: current.firstName,
            lastName: current.lastName,
            companyName: current.companyName,
          }),
    pseudonymize,
    startsAt: current.startsAt,
    endsAt: current.endsAt,
    status: current.status,
  })

  let etag: string | null = null

  if (current.googleEventId) {
    etag = await api
      .updateEvent(row.calendarId, event)
      .then((result) => result.etag)
      .catch(async (error: unknown) => {
        // Deleted in Google. Write it again rather than losing the slot.
        if (!isNotFound(error)) throw error
        return (await api.insertEvent(row.calendarId, event)).etag
      })
  } else {
    etag = await api
      .insertEvent(row.calendarId, event)
      .then((result) => result.etag)
      .catch(async (error: unknown) => {
        // Our own insert got through after the answer was lost — the whole
        // reason the id is derived from the appointment id.
        if (!isDuplicate(error)) throw error
        return (await api.updateEvent(row.calendarId, event)).etag
      })
  }

  await database
    .update(appointment)
    .set({ googleEventId: event.id, googleEtag: etag, lastPushedAt: now })
    .where(and(eq(appointment.tenantId, tenantId), eq(appointment.id, current.id)))
}

/**
 * Drains what is due. Returns how many went out and how many failed.
 *
 * The worker calls `runSync`, never this — it and `pullRemote` are exported so
 * the tests can drive one direction at a time, which is the only way the
 * backoff and the ETag comparison can be asserted separately.
 */
export async function pushQueue(
  database: Database,
  tenantId: string,
  api: GoogleApi,
  now: Date,
  limit = 50,
): Promise<{ pushed: number; failed: number }> {
  const rows = await claimDue(database, tenantId, now, limit)

  /**
   * Read once for the whole tick and handed down, rather than per row: it is
   * one setting for one account, and asking fifty times would say the same
   * thing fifty times. The *appointment* is still read fresh per push — that
   * is what "upsert reads the current state" is about, and it is a different
   * question from which name the connection is configured to send.
   */
  const [connection] = await database
    .select({ pseudonymize: googleConnection.pseudonymize })
    .from(googleConnection)
    .where(eq(googleConnection.tenantId, tenantId))
    .limit(1)
  const pseudonymize = connection?.pseudonymize ?? true

  let pushed = 0
  let failed = 0
  for (const row of rows) {
    if (await pushRow(database, tenantId, api, row, now, pseudonymize)) pushed += 1
    else failed += 1
  }

  return { pushed, failed }
}

async function recordConflict(
  database: Database,
  tenantId: string,
  appointmentId: string,
  remote: { startsAt: Date; endsAt: Date; cancelled: boolean },
  reason: SyncConflictReason,
  now: Date,
): Promise<void> {
  await database
    .insert(appointmentSyncConflict)
    .values({
      id: newId(),
      tenantId,
      appointmentId,
      detectedAt: now,
      remoteStartsAt: remote.startsAt,
      remoteEndsAt: remote.endsAt,
      remoteCancelled: remote.cancelled,
      reason,
    })
    .onConflictDoUpdate({
      target: appointmentSyncConflict.appointmentId,
      // A later remote change replaces the proposal rather than queueing a
      // second decision about the same slot.
      set: {
        detectedAt: now,
        remoteStartsAt: remote.startsAt,
        remoteEndsAt: remote.endsAt,
        remoteCancelled: remote.cancelled,
        reason,
      },
    })
}

/**
 * Writes the remote values onto the appointment.
 *
 * Deliberately a plain update and not `updateAppointment`: applying what came
 * from Google must not enqueue a push back to Google. Only three fields move,
 * and the status only as far as cancelled-or-not — a slot that was released
 * remotely and is confirmed again comes back as `planned`, because which of
 * the four occupied statuses it once had is not something Google knows.
 */
async function applyRemote(
  writer: Writer,
  tenantId: string,
  row: { id: string; status: AppointmentStatus },
  remote: { startsAt: Date; endsAt: Date; cancelled: boolean; etag: string | null },
): Promise<void> {
  const status: AppointmentStatus | undefined = remote.cancelled
    ? 'cancelled'
    : occupiesSlot(row.status)
      ? undefined
      : 'planned'

  await writer
    .update(appointment)
    .set({
      startsAt: remote.startsAt,
      endsAt: remote.endsAt,
      ...(status ? { status } : {}),
      googleEtag: remote.etag,
    })
    .where(and(eq(appointment.tenantId, tenantId), eq(appointment.id, row.id)))
}

/**
 * The return channel: `events.list` with a sync token, three fields applied,
 * everything else ignored — a title someone typed in on a phone included.
 *
 * Exported for the tests, like `pushQueue` above; `runSync` is the caller.
 */
export async function pullRemote(
  database: Database,
  tenantId: string,
  api: GoogleApi,
  now: Date,
): Promise<{ pulled: number; conflicts: number; ignored: number }> {
  const [connection] = await database
    .select({ calendarId: googleConnection.calendarId, syncToken: googleConnection.syncToken })
    .from(googleConnection)
    .where(eq(googleConnection.tenantId, tenantId))
    .limit(1)

  if (!connection?.calendarId) return { pulled: 0, conflicts: 0, ignored: 0 }
  const calendarId = connection.calendarId

  const page = await api.listEvents(calendarId, connection.syncToken).catch(async (error) => {
    // An expired sync token is answered with a full pass, which is what Google
    // asks for.
    if (!isSyncTokenExpired(error)) throw error
    return api.listEvents(calendarId, null)
  })

  let pulled = 0
  let conflicts = 0
  let ignored = 0

  for (const event of page.events) {
    const [row] = await database
      .select({
        id: appointment.id,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        status: appointment.status,
        etag: appointment.googleEtag,
      })
      .from(appointment)
      .where(and(eq(appointment.tenantId, tenantId), eq(appointment.googleEventId, event.id)))
      .limit(1)

    // An event created in Google directly. We cannot invent the contact it
    // would belong to, so it stays where it is and blocks nothing here.
    if (!row) {
      ignored += 1
      continue
    }

    // Our own write coming back. The ETag is what tells the echo apart.
    if (event.etag && event.etag === row.etag) continue

    const remote = {
      // A deleted event arrives as a stub with no times at all.
      startsAt: event.startsAt ?? row.startsAt,
      endsAt: event.endsAt ?? row.endsAt,
      cancelled: event.cancelled,
      etag: event.etag,
    }

    const unchanged =
      remote.startsAt.getTime() === row.startsAt.getTime() &&
      remote.endsAt.getTime() === row.endsAt.getTime() &&
      remote.cancelled === !occupiesSlot(row.status)

    if (unchanged) {
      await database
        .update(appointment)
        .set({ googleEtag: event.etag })
        .where(eq(appointment.id, row.id))
      continue
    }

    const [pending] = await database
      .select({ id: googleSyncQueue.id })
      .from(googleSyncQueue)
      .where(and(eq(googleSyncQueue.tenantId, tenantId), eq(googleSyncQueue.appointmentId, row.id)))
      .limit(1)

    if (pending) {
      // Changed on both sides. Not merged — and the pending push is dropped,
      // so nothing overwrites Google behind the practitioner's back. Keeping
      // the local version re-enqueues it.
      await database.delete(googleSyncQueue).where(eq(googleSyncQueue.id, pending.id))
      await recordConflict(database, tenantId, row.id, remote, 'both_changed', now)
      conflicts += 1
      continue
    }

    // Always applicable since migration 0034: the exclusion constraint that
    // could refuse these times is gone, so there is no second kind of conflict
    // left to record here.
    await applyRemote(database, tenantId, row, remote)
    pulled += 1
  }

  await database
    .update(googleConnection)
    .set({ syncToken: page.nextSyncToken, lastSyncAt: now, lastError: null })
    .where(eq(googleConnection.tenantId, tenantId))

  return { pulled, conflicts, ignored }
}

/** One full round: out first, then in. */
export async function runSync(
  database: Database,
  tenantId: string,
  api: GoogleApi,
  now: Date,
): Promise<GoogleSyncResult> {
  const push = await pushQueue(database, tenantId, api, now)
  const pull = await pullRemote(database, tenantId, api, now)

  return {
    pushed: push.pushed,
    failed: push.failed,
    pulled: pull.pulled,
    conflicts: pull.conflicts,
  }
}

/** Records why the last run did not work, so the settings can say it. */
export async function recordSyncError(
  database: Database,
  tenantId: string,
  message: string,
): Promise<void> {
  await database
    .update(googleConnection)
    .set({ lastError: message })
    .where(eq(googleConnection.tenantId, tenantId))
}

export async function listConflicts(database: Database, tenantId: string): Promise<SyncConflict[]> {
  const rows = await database
    .select({
      appointmentId: appointmentSyncConflict.appointmentId,
      detectedAt: appointmentSyncConflict.detectedAt,
      reason: appointmentSyncConflict.reason,
      remoteStartsAt: appointmentSyncConflict.remoteStartsAt,
      remoteEndsAt: appointmentSyncConflict.remoteEndsAt,
      remoteCancelled: appointmentSyncConflict.remoteCancelled,
      localStartsAt: appointment.startsAt,
      localEndsAt: appointment.endsAt,
      localStatus: appointment.status,
      contactId: appointment.contactId,
      contactNumber: contact.contactNumber,
      activityId: activity.id,
    })
    .from(appointmentSyncConflict)
    .innerJoin(appointment, eq(appointment.id, appointmentSyncConflict.appointmentId))
    // Left, for the same reason as everywhere else since 0034: a conflict over
    // an appointment that belongs to nobody is still a conflict to resolve.
    .leftJoin(contact, eq(contact.id, appointment.contactId))
    .leftJoin(activity, eq(activity.appointmentId, appointment.id))
    .where(eq(appointmentSyncConflict.tenantId, tenantId))
    .orderBy(asc(appointment.startsAt))

  return rows.map((row) => ({
    appointmentId: row.appointmentId,
    activityId: row.activityId,
    contactId: row.contactId,
    contactNumber: row.contactNumber,
    detectedAt: row.detectedAt.toISOString(),
    reason: row.reason,
    localStartsAt: row.localStartsAt.toISOString(),
    localEndsAt: row.localEndsAt.toISOString(),
    localStatus: row.localStatus,
    remoteStartsAt: row.remoteStartsAt.toISOString(),
    remoteEndsAt: row.remoteEndsAt.toISOString(),
    remoteCancelled: row.remoteCancelled,
  }))
}

/**
 * Resolving is a choice, never a merge: either Google's version is written
 * here, or ours is sent there again. Both end with the conflict row gone.
 */
export async function resolveConflict(
  database: Database,
  tenantId: string,
  appointmentId: string,
  keep: 'local' | 'remote',
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: appointment.id,
        status: appointment.status,
        remoteStartsAt: appointmentSyncConflict.remoteStartsAt,
        remoteEndsAt: appointmentSyncConflict.remoteEndsAt,
        remoteCancelled: appointmentSyncConflict.remoteCancelled,
      })
      .from(appointmentSyncConflict)
      .innerJoin(appointment, eq(appointment.id, appointmentSyncConflict.appointmentId))
      .where(
        and(
          eq(appointmentSyncConflict.tenantId, tenantId),
          eq(appointmentSyncConflict.appointmentId, appointmentId),
        ),
      )
      .limit(1)

    if (!row) return false

    if (keep === 'remote') {
      await applyRemote(tx, tenantId, row, {
        startsAt: row.remoteStartsAt,
        endsAt: row.remoteEndsAt,
        cancelled: row.remoteCancelled,
        // Unknown at this point; the next remote change delivers a differing
        // one, which is all the echo check needs.
        etag: null,
      })
    }

    await tx
      .delete(appointmentSyncConflict)
      .where(
        and(
          eq(appointmentSyncConflict.tenantId, tenantId),
          eq(appointmentSyncConflict.appointmentId, appointmentId),
        ),
      )

    if (keep === 'local') await enqueueUpsert(tx, tenantId, appointmentId)

    return true
  })
}

/**
 * Every event this software put into Google, for the deleting variant of
 * disconnecting. The times travel so the answer can name the ones that could
 * not be removed.
 */
export async function listPushedEvents(
  database: Database,
  tenantId: string,
): Promise<{ id: string; eventId: string; startsAt: Date; endsAt: Date }[]> {
  const rows = await database
    .select({
      id: appointment.id,
      eventId: appointment.googleEventId,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    })
    .from(appointment)
    .where(and(eq(appointment.tenantId, tenantId), isNotNull(appointment.googleEventId)))
    .orderBy(asc(appointment.startsAt))

  return rows.flatMap((row) => (row.eventId ? [{ ...row, eventId: row.eventId }] : []))
}
