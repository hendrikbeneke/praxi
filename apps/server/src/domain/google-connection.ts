import type { BusyInterval, GoogleDisconnectResult, GoogleStatus } from '@praxi/shared'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import {
  appointment,
  appointmentSyncConflict,
  googleConnection,
  googleSyncQueue,
} from '../db/schema.js'
import { forgetAccessToken } from '../google/api.js'
import type { GoogleApi } from '../google/client.js'
import { isNotFound } from '../google/client.js'
import { decryptToken, encryptToken, keyFingerprint, tokenKeyConfigured } from '../google/crypto.js'
import { oauthConfigured, revokeToken } from '../google/oauth.js'
import { newId } from '../id.js'
import { countQueue, listPushedEvents } from './google-sync.js'

/**
 * The connection to the Google account: making it, describing it, and taking
 * it apart again.
 *
 * There is no `connected` flag anywhere — the row exists or it does not, and
 * disconnecting is deleting it. A second place saying whether we are connected
 * would eventually disagree with whether a token is there.
 */

export async function saveConnection(
  database: Database,
  tenantId: string,
  input: { refreshToken: string; accountEmail: string | null },
): Promise<void> {
  const { cipher, fingerprint } = encryptToken(input.refreshToken)

  await database
    .insert(googleConnection)
    .values({
      id: newId(),
      tenantId,
      accountEmail: input.accountEmail,
      refreshTokenCipher: cipher,
      keyFingerprint: fingerprint,
    })
    .onConflictDoUpdate({
      target: googleConnection.tenantId,
      /**
       * Reconnecting keeps the chosen calendars — that is configuration, and
       * losing it on every reconnect would be a small daily annoyance. The
       * sync token goes, because it belongs to the grant that just ended and
       * a stale one would silently skip everything that changed meanwhile.
       */
      set: {
        accountEmail: input.accountEmail,
        refreshTokenCipher: cipher,
        keyFingerprint: fingerprint,
        syncToken: null,
        lastError: null,
      },
    })

  forgetAccessToken(tenantId)
}

export async function getStatus(database: Database, tenantId: string): Promise<GoogleStatus> {
  const configured = oauthConfigured() && tokenKeyConfigured()

  const [row] = await database
    .select()
    .from(googleConnection)
    .where(eq(googleConnection.tenantId, tenantId))
    .limit(1)

  const queue = await countQueue(database, tenantId)

  const [conflicts] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(appointmentSyncConflict)
    .where(eq(appointmentSyncConflict.tenantId, tenantId))

  return {
    configured,
    connected: row !== undefined,
    // A stored token encrypted with a different key than the one configured
    // now. Named rather than left to fail at an authentication tag.
    keyMismatch:
      row !== undefined && tokenKeyConfigured() && row.keyFingerprint !== keyFingerprint(),
    accountEmail: row?.accountEmail ?? null,
    calendarId: row?.calendarId ?? null,
    freebusyCalendarIds: row?.freebusyCalendarIds ?? [],
    lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
    lastError: row?.lastError ?? null,
    queuePending: queue.pending,
    queueStuck: queue.stuck,
    conflicts: conflicts?.count ?? 0,
  }
}

export async function setCalendar(
  database: Database,
  tenantId: string,
  calendarId: string | null,
): Promise<boolean> {
  const [row] = await database
    .update(googleConnection)
    // The sync token belongs to one calendar's event stream; pointing at
    // another calendar with the old token would ask for changes to a stream
    // that no longer applies.
    .set({ calendarId, syncToken: null })
    .where(eq(googleConnection.tenantId, tenantId))
    .returning({ id: googleConnection.id })

  return row !== undefined
}

export async function setFreebusyCalendars(
  database: Database,
  tenantId: string,
  calendarIds: string[],
): Promise<boolean> {
  const [row] = await database
    .update(googleConnection)
    .set({ freebusyCalendarIds: calendarIds })
    .where(eq(googleConnection.tenantId, tenantId))
    .returning({ id: googleConnection.id })

  return row !== undefined
}

/** The calendars queried for busy intervals, or an empty list when none are
 *  configured — in which case nothing is asked at all. */
export async function busyIntervals(
  database: Database,
  tenantId: string,
  api: GoogleApi,
  from: Date,
  to: Date,
): Promise<BusyInterval[]> {
  const [row] = await database
    .select({ ids: googleConnection.freebusyCalendarIds })
    .from(googleConnection)
    .where(eq(googleConnection.tenantId, tenantId))
    .limit(1)

  const ids = row?.ids ?? []
  if (ids.length === 0) return []

  return api.freeBusy(ids, from, to)
}

/**
 * Disconnecting.
 *
 * Whether the events in Google go with it is asked, not assumed. The local
 * cleanup is identical either way and total: after this there is no trace of
 * Google left in the database, so reconnecting starts from a clean sheet
 * rather than from event ids pointing into an account nobody is signed in to.
 *
 * `remaining` names the appointments whose event could not be removed, with
 * their time — "47 of 49 deleted" without saying which two leaves the
 * practitioner scrolling a year of calendar looking for them.
 */
export async function disconnect(
  database: Database,
  tenantId: string,
  options: { deleteRemoteEvents: boolean; api: GoogleApi | null },
): Promise<GoogleDisconnectResult> {
  const [row] = await database
    .select({
      cipher: googleConnection.refreshTokenCipher,
      fingerprint: googleConnection.keyFingerprint,
      calendarId: googleConnection.calendarId,
    })
    .from(googleConnection)
    .where(eq(googleConnection.tenantId, tenantId))
    .limit(1)

  let deleted = 0
  let attempted = 0
  const remaining: BusyInterval[] = []

  if (options.deleteRemoteEvents && options.api && row?.calendarId) {
    const events = await listPushedEvents(database, tenantId)
    attempted = events.length

    for (const event of events) {
      try {
        await options.api.deleteEvent(row.calendarId, event.eventId)
        deleted += 1
      } catch (error) {
        // Already gone counts as removed — the goal was its absence.
        if (isNotFound(error)) {
          deleted += 1
          continue
        }
        remaining.push({
          startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt.toISOString(),
        })
      }
    }
  }

  // Best effort, and after the deletions: without the grant they would fail.
  const token = row ? decryptTokenSafely(row.cipher, row.fingerprint) : ''
  if (token) await revokeToken(token)

  await database.delete(googleSyncQueue).where(eq(googleSyncQueue.tenantId, tenantId))
  await database
    .delete(appointmentSyncConflict)
    .where(eq(appointmentSyncConflict.tenantId, tenantId))
  await database
    .update(appointment)
    .set({ googleEventId: null, googleEtag: null, lastPushedAt: null })
    .where(and(eq(appointment.tenantId, tenantId), isNotNull(appointment.googleEventId)))
  await database.delete(googleConnection).where(eq(googleConnection.tenantId, tenantId))

  forgetAccessToken(tenantId)

  return { deleted, attempted, remaining }
}

/** A token that cannot be decrypted — a changed key — must not stop the local
 *  cleanup. Revoking is then simply skipped. */
function decryptTokenSafely(cipher: string, fingerprint: string): string {
  try {
    return decryptToken(cipher, fingerprint)
  } catch {
    return ''
  }
}
