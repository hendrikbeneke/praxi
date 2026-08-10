import type { ActivityInput, BusyInterval, ContactInput, GoogleCalendar } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import {
  appointment,
  appointmentSyncConflict,
  googleConnection,
  googleSyncQueue,
} from '../db/schema.js'
import { type EventPage, type GoogleApi, GoogleApiError } from '../google/client.js'
import type { GoogleEventPayload } from '../google/payload.js'
import { googleEventId } from '../google/payload.js'
import { newId } from '../id.js'
import { createTenant } from '../test/fixtures.js'
import { createActivity, deleteActivity, updateActivity } from './activity.js'
import { updateAppointment } from './appointment.js'
import { createContact } from './contact.js'
import { disconnect } from './google-connection.js'
import {
  listConflicts,
  pullRemote,
  pushQueue,
  resolveConflict,
  STUCK_AFTER_ATTEMPTS,
} from './google-sync.js'

/**
 * The Google projection against a real database and a fake transport.
 *
 * The fake records every request, which is what lets the pseudonymization be
 * asserted on what would go over the wire rather than on what a mock decided
 * to answer — the same reason `google/payload.test.ts` exists one level down.
 */

const CALENDAR_ID = 'praxis@praxi.invalid'

let tenantId: string
let contactId: string

/** Requests the fake saw, and what it should do with the next one. */
type Recorder = {
  inserted: GoogleEventPayload[]
  updated: GoogleEventPayload[]
  deleted: string[]
  /** Set to make the next calls fail — the network being down, a 500, a 401. */
  fail: GoogleApiError | null
  page: EventPage
  api: GoogleApi
}

function fakeApi(): Recorder {
  const recorder: Recorder = {
    inserted: [],
    updated: [],
    deleted: [],
    fail: null,
    page: { events: [], nextSyncToken: 'token-1' },
    api: {
      listCalendars: async (): Promise<GoogleCalendar[]> => [],
      freeBusy: async (): Promise<BusyInterval[]> => [],
      insertEvent: async (_calendarId, event) => {
        if (recorder.fail) throw recorder.fail
        recorder.inserted.push(event)
        return { etag: `etag-${recorder.inserted.length}` }
      },
      updateEvent: async (_calendarId, event) => {
        if (recorder.fail) throw recorder.fail
        recorder.updated.push(event)
        return { etag: `etag-u${recorder.updated.length}` }
      },
      deleteEvent: async (_calendarId, eventId) => {
        if (recorder.fail) throw recorder.fail
        recorder.deleted.push(eventId)
      },
      listEvents: async () => {
        if (recorder.fail) throw recorder.fail
        return recorder.page
      },
    },
  }
  return recorder
}

function person(): ContactInput {
  return {
    kind: 'person',
    salutation: null,
    title: null,
    firstName: 'Erika',
    lastName: 'Testperson',
    dateOfBirth: null,
    vatId: null,
    street: null,
    postalCode: null,
    city: null,
    country: 'DE',
    email: null,
    phone: null,
    internalNote: null,
    roles: [],
  }
}

function booking(startsAt: string, endsAt: string): ActivityInput {
  return {
    contactId,
    type: 'session',
    status: 'planned',
    occurredAt: startsAt,
    durationMin: null,
    // A title in German, so a leak of it would be caught by the assertions.
    title: 'Erstgespräch',
    internalNote: null,
    items: [],
    appointment: {
      startsAt,
      endsAt,
      status: 'planned',
      title: 'Erstgespräch',
      note: 'Nur intern',
    },
  }
}

/** A connection with a chosen calendar. The token is never decrypted in these
 *  tests — every one of them injects the API handle directly. */
async function connect(): Promise<void> {
  await db().insert(googleConnection).values({
    id: newId(),
    tenantId,
    accountEmail: 'praxis@praxi.invalid',
    refreshTokenCipher: 'not-a-real-token',
    keyFingerprint: '0123456789abcdef',
    calendarId: CALENDAR_ID,
  })
}

async function queueRows() {
  return db().select().from(googleSyncQueue).where(eq(googleSyncQueue.tenantId, tenantId))
}

async function appointmentRow(id: string) {
  const [row] = await db().select().from(appointment).where(eq(appointment.id, id))
  return row
}

async function onlyAppointmentId(): Promise<string> {
  const [row] = await db().select().from(appointment).where(eq(appointment.tenantId, tenantId))
  if (!row) throw new Error('no appointment')
  return row.id
}

const NOW = new Date('2026-09-01T10:00:00.000Z')

beforeEach(async () => {
  tenantId = await createTenant(db())
  contactId = (await createContact(db(), tenantId, person())).id
})

describe('enqueueing', () => {
  it('does not enqueue while no practice calendar is chosen', async () => {
    await createActivity(
      db(),
      tenantId,
      booking('2026-09-02T08:00:00.000Z', '2026-09-02T09:00:00.000Z'),
    )
    expect(await queueRows()).toHaveLength(0)
  })

  it('lets an appointment be created and changed while the API is unreachable', async () => {
    await connect()
    const recorder = fakeApi()
    recorder.fail = new GoogleApiError(0, 'network', 'Google ist nicht erreichbar.')

    const created = await createActivity(
      db(),
      tenantId,
      booking('2026-09-02T08:00:00.000Z', '2026-09-02T09:00:00.000Z'),
    )
    await pushQueue(db(), tenantId, recorder.api, NOW)

    // The change is in the database regardless of Google.
    const stored = await appointmentRow(created.appointment?.id ?? '')
    expect(stored?.startsAt.toISOString()).toBe('2026-09-02T08:00:00.000Z')
    expect(stored?.googleEventId).toBeNull()

    // And it can be moved, still offline.
    await updateActivity(db(), tenantId, created.id, {
      ...booking('2026-09-02T10:00:00.000Z', '2026-09-02T11:00:00.000Z'),
    })
    await updateAppointment(db(), tenantId, created.appointment?.id ?? '', {
      startsAt: '2026-09-02T11:00:00.000Z',
      endsAt: '2026-09-02T12:00:00.000Z',
      status: 'planned',
      title: null,
      note: null,
    })

    // Three changes, one instruction: the push reads the appointment fresh.
    const rows = await queueRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.operation).toBe('upsert')
    expect(rows[0]?.attempts).toBe(0)
  })
})

describe('pushing', () => {
  it('sends the contact number and nothing else', async () => {
    await connect()
    const recorder = fakeApi()

    const created = await createActivity(
      db(),
      tenantId,
      booking('2026-09-02T08:00:00.000Z', '2026-09-02T09:00:00.000Z'),
    )
    const result = await pushQueue(db(), tenantId, recorder.api, NOW)

    expect(result).toEqual({ pushed: 1, failed: 0 })
    expect(recorder.inserted).toHaveLength(1)

    // The promise, checked on the assembled request.
    const serialized = JSON.stringify(recorder.inserted[0])
    expect(serialized).not.toContain('Testperson')
    expect(serialized).not.toContain('Erika')
    expect(serialized).not.toContain('Erstgespräch')
    expect(serialized).not.toContain('Nur intern')
    expect(serialized).not.toContain('session')
    expect(recorder.inserted[0]?.summary).toBe('1')

    const stored = await appointmentRow(created.appointment?.id ?? '')
    expect(stored?.googleEventId).toBe(googleEventId(created.appointment?.id ?? ''))
    expect(stored?.googleEtag).toBe('etag-1')
    expect(stored?.lastPushedAt).not.toBeNull()
    expect(await queueRows()).toHaveLength(0)
  })

  it('sends a released slot as a cancelled event, not as a deletion', async () => {
    await connect()
    const recorder = fakeApi()

    await createActivity(
      db(),
      tenantId,
      booking('2026-09-02T08:00:00.000Z', '2026-09-02T09:00:00.000Z'),
    )
    await pushQueue(db(), tenantId, recorder.api, NOW)

    const appointmentId = await onlyAppointmentId()
    await updateAppointment(db(), tenantId, appointmentId, {
      startsAt: '2026-09-02T08:00:00.000Z',
      endsAt: '2026-09-02T09:00:00.000Z',
      status: 'cancelled',
      title: null,
      note: null,
    })
    await pushQueue(db(), tenantId, recorder.api, NOW)

    expect(recorder.deleted).toHaveLength(0)
    expect(recorder.updated).toHaveLength(1)
    expect(recorder.updated[0]?.status).toBe('cancelled')
  })

  it('deletes the event when the appointment itself is gone', async () => {
    await connect()
    const recorder = fakeApi()

    const created = await createActivity(
      db(),
      tenantId,
      booking('2026-09-02T08:00:00.000Z', '2026-09-02T09:00:00.000Z'),
    )
    await pushQueue(db(), tenantId, recorder.api, NOW)
    const eventId = googleEventId(created.appointment?.id ?? '')

    await deleteActivity(db(), tenantId, created.id)

    // The instruction outlives its appointment: it carries the event id.
    const rows = await queueRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.operation).toBe('delete')
    expect(rows[0]?.appointmentId).toBeNull()
    expect(rows[0]?.googleEventId).toBe(eventId)

    await pushQueue(db(), tenantId, recorder.api, NOW)
    expect(recorder.deleted).toEqual([eventId])
    expect(await queueRows()).toHaveLength(0)
  })

  it('retries with a growing distance and keeps the last error on the row', async () => {
    await connect()
    const recorder = fakeApi()
    recorder.fail = new GoogleApiError(500, 'backendError', 'Google antwortete mit 500.')

    await createActivity(
      db(),
      tenantId,
      booking('2026-09-02T08:00:00.000Z', '2026-09-02T09:00:00.000Z'),
    )

    const first = await pushQueue(db(), tenantId, recorder.api, NOW)
    expect(first).toEqual({ pushed: 0, failed: 1 })

    const [afterFirst] = await queueRows()
    expect(afterFirst?.attempts).toBe(1)
    expect(afterFirst?.lastError).toBe('Google antwortete mit 500.')
    const firstDue = afterFirst?.nextAttemptAt.getTime() ?? 0
    expect(firstDue).toBeGreaterThan(NOW.getTime())

    // Not due yet: a second pass at the same instant leaves it alone.
    expect(await pushQueue(db(), tenantId, recorder.api, NOW)).toEqual({ pushed: 0, failed: 0 })

    const later = new Date(firstDue)
    await pushQueue(db(), tenantId, recorder.api, later)
    const [afterSecond] = await queueRows()
    expect(afterSecond?.attempts).toBe(2)
    // The distance grows.
    expect((afterSecond?.nextAttemptAt.getTime() ?? 0) - later.getTime()).toBeGreaterThan(
      firstDue - NOW.getTime(),
    )

    // And once it goes through, the row is gone rather than lingering.
    recorder.fail = null
    await pushQueue(db(), tenantId, recorder.api, new Date(afterSecond?.nextAttemptAt ?? later))
    expect(await queueRows()).toHaveLength(0)
  })

  it('gives up on nothing — a row stays until it goes through', async () => {
    await connect()
    const recorder = fakeApi()
    recorder.fail = new GoogleApiError(500, 'backendError', 'Google antwortete mit 500.')

    await createActivity(
      db(),
      tenantId,
      booking('2026-09-02T08:00:00.000Z', '2026-09-02T09:00:00.000Z'),
    )

    let at = NOW
    for (let pass = 0; pass < STUCK_AFTER_ATTEMPTS + 3; pass += 1) {
      await pushQueue(db(), tenantId, recorder.api, at)
      const [row] = await queueRows()
      at = new Date(row?.nextAttemptAt ?? at)
    }

    const [row] = await queueRows()
    expect(row?.attempts).toBeGreaterThanOrEqual(STUCK_AFTER_ATTEMPTS)
    expect(row?.lastError).toBe('Google antwortete mit 500.')
  })

  it('treats a duplicate id as success — the lost answer case', async () => {
    await connect()
    const recorder = fakeApi()
    recorder.fail = new GoogleApiError(409, 'duplicate', 'The requested identifier already exists.')

    const created = await createActivity(
      db(),
      tenantId,
      booking('2026-09-02T08:00:00.000Z', '2026-09-02T09:00:00.000Z'),
    )

    // The insert 409s, the update goes through. No second event anywhere.
    const failingInsert = recorder.api.insertEvent
    recorder.api.insertEvent = async (calendarId, event) => {
      recorder.fail = new GoogleApiError(409, 'duplicate', 'exists')
      const result = failingInsert(calendarId, event)
      recorder.fail = null
      return result
    }

    await pushQueue(db(), tenantId, recorder.api, NOW)

    expect(recorder.inserted).toHaveLength(0)
    expect(recorder.updated).toHaveLength(1)
    expect((await appointmentRow(created.appointment?.id ?? ''))?.googleEventId).toBe(
      googleEventId(created.appointment?.id ?? ''),
    )
  })
})

describe('pulling', () => {
  async function pushed(): Promise<{ appointmentId: string; eventId: string }> {
    await connect()
    const recorder = fakeApi()
    const created = await createActivity(
      db(),
      tenantId,
      booking('2026-09-02T08:00:00.000Z', '2026-09-02T09:00:00.000Z'),
    )
    await pushQueue(db(), tenantId, recorder.api, NOW)
    const appointmentId = created.appointment?.id ?? ''
    return { appointmentId, eventId: googleEventId(appointmentId) }
  }

  it('applies the times and nothing else', async () => {
    const { appointmentId, eventId } = await pushed()
    const recorder = fakeApi()
    recorder.page = {
      events: [
        {
          id: eventId,
          etag: 'etag-remote',
          cancelled: false,
          startsAt: new Date('2026-09-02T14:00:00.000Z'),
          endsAt: new Date('2026-09-02T15:00:00.000Z'),
        },
      ],
      nextSyncToken: 'token-2',
    }

    const result = await pullRemote(db(), tenantId, recorder.api, NOW)
    expect(result.pulled).toBe(1)

    const row = await appointmentRow(appointmentId)
    expect(row?.startsAt.toISOString()).toBe('2026-09-02T14:00:00.000Z')
    expect(row?.endsAt.toISOString()).toBe('2026-09-02T15:00:00.000Z')
    // Everything else stays: a title typed in on a phone never gets this far.
    expect(row?.title).toBe('Erstgespräch')
    expect(row?.note).toBe('Nur intern')
    expect(row?.status).toBe('planned')

    const [connection] = await db()
      .select()
      .from(googleConnection)
      .where(eq(googleConnection.tenantId, tenantId))
    expect(connection?.syncToken).toBe('token-2')
  })

  it('takes a remote cancellation as a released slot', async () => {
    const { appointmentId, eventId } = await pushed()
    const recorder = fakeApi()
    recorder.page = {
      // A deleted event arrives as a stub, with no times at all.
      events: [{ id: eventId, etag: 'etag-remote', cancelled: true, startsAt: null, endsAt: null }],
      nextSyncToken: 'token-2',
    }

    await pullRemote(db(), tenantId, recorder.api, NOW)
    expect((await appointmentRow(appointmentId))?.status).toBe('cancelled')
  })

  it('ignores our own write coming back', async () => {
    const { appointmentId, eventId } = await pushed()
    const stored = await appointmentRow(appointmentId)
    const recorder = fakeApi()
    recorder.page = {
      events: [
        {
          id: eventId,
          etag: stored?.googleEtag ?? '',
          cancelled: false,
          startsAt: new Date('2026-09-09T08:00:00.000Z'),
          endsAt: new Date('2026-09-09T09:00:00.000Z'),
        },
      ],
      nextSyncToken: 'token-2',
    }

    const result = await pullRemote(db(), tenantId, recorder.api, NOW)
    expect(result.pulled).toBe(0)
    // Unchanged, because the ETag says this is the echo of our own push.
    expect((await appointmentRow(appointmentId))?.startsAt.toISOString()).toBe(
      '2026-09-02T08:00:00.000Z',
    )
  })

  it('ignores an event nobody here created', async () => {
    await pushed()
    const recorder = fakeApi()
    recorder.page = {
      events: [
        {
          id: 'someone-elses-event',
          etag: 'etag-x',
          cancelled: false,
          startsAt: new Date('2026-09-03T08:00:00.000Z'),
          endsAt: new Date('2026-09-03T09:00:00.000Z'),
        },
      ],
      nextSyncToken: 'token-2',
    }

    expect(await pullRemote(db(), tenantId, recorder.api, NOW)).toMatchObject({
      pulled: 0,
      ignored: 1,
    })
  })
})

describe('conflicts', () => {
  async function bothSidesChanged(): Promise<string> {
    await connect()
    const recorder = fakeApi()
    const created = await createActivity(
      db(),
      tenantId,
      booking('2026-09-02T08:00:00.000Z', '2026-09-02T09:00:00.000Z'),
    )
    await pushQueue(db(), tenantId, recorder.api, NOW)
    const appointmentId = created.appointment?.id ?? ''

    // Changed here, not out yet.
    await updateAppointment(db(), tenantId, appointmentId, {
      startsAt: '2026-09-02T12:00:00.000Z',
      endsAt: '2026-09-02T13:00:00.000Z',
      status: 'planned',
      title: null,
      note: null,
    })

    // And changed in Google meanwhile.
    const puller = fakeApi()
    puller.page = {
      events: [
        {
          id: googleEventId(appointmentId),
          etag: 'etag-remote',
          cancelled: false,
          startsAt: new Date('2026-09-02T16:00:00.000Z'),
          endsAt: new Date('2026-09-02T17:00:00.000Z'),
        },
      ],
      nextSyncToken: 'token-2',
    }
    const result = await pullRemote(db(), tenantId, puller.api, NOW)
    expect(result).toMatchObject({ pulled: 0, conflicts: 1 })

    return appointmentId
  }

  it('marks the appointment instead of merging the two sides', async () => {
    const appointmentId = await bothSidesChanged()

    const row = await appointmentRow(appointmentId)
    // Neither side won: the local version stands untouched.
    expect(row?.startsAt.toISOString()).toBe('2026-09-02T12:00:00.000Z')

    const conflicts = await listConflicts(db(), tenantId)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({
      appointmentId,
      reason: 'both_changed',
      localStartsAt: '2026-09-02T12:00:00.000Z',
      remoteStartsAt: '2026-09-02T16:00:00.000Z',
      remoteCancelled: false,
    })

    // And the pending push is held back, so nothing overwrites Google behind
    // the practitioner's back.
    expect(await queueRows()).toHaveLength(0)
  })

  it('holds back a push that is enqueued again while the conflict is open', async () => {
    const appointmentId = await bothSidesChanged()

    await updateAppointment(db(), tenantId, appointmentId, {
      startsAt: '2026-09-02T18:00:00.000Z',
      endsAt: '2026-09-02T19:00:00.000Z',
      status: 'planned',
      title: null,
      note: null,
    })
    expect(await queueRows()).toHaveLength(1)

    const recorder = fakeApi()
    expect(await pushQueue(db(), tenantId, recorder.api, NOW)).toEqual({ pushed: 0, failed: 0 })
    expect(recorder.updated).toHaveLength(0)
  })

  it('writes Google’s version when that is the answer', async () => {
    const appointmentId = await bothSidesChanged()

    expect(await resolveConflict(db(), tenantId, appointmentId, 'remote')).toBe(true)
    expect((await appointmentRow(appointmentId))?.startsAt.toISOString()).toBe(
      '2026-09-02T16:00:00.000Z',
    )
    expect(await listConflicts(db(), tenantId)).toHaveLength(0)
    // Keeping the remote version needs no push back.
    expect(await queueRows()).toHaveLength(0)
  })

  it('sends ours again when that is the answer', async () => {
    const appointmentId = await bothSidesChanged()

    expect(await resolveConflict(db(), tenantId, appointmentId, 'local')).toBe(true)
    expect((await appointmentRow(appointmentId))?.startsAt.toISOString()).toBe(
      '2026-09-02T12:00:00.000Z',
    )
    expect(await listConflicts(db(), tenantId)).toHaveLength(0)

    const rows = await queueRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.operation).toBe('upsert')

    const recorder = fakeApi()
    await pushQueue(db(), tenantId, recorder.api, NOW)
    expect(recorder.updated[0]?.start.dateTime).toBe('2026-09-02T12:00:00.000Z')
  })

  it('reports remote times that cannot be applied at all', async () => {
    await connect()
    const recorder = fakeApi()

    const first = await createActivity(
      db(),
      tenantId,
      booking('2026-09-02T08:00:00.000Z', '2026-09-02T09:00:00.000Z'),
    )
    await createActivity(
      db(),
      tenantId,
      booking('2026-09-02T10:00:00.000Z', '2026-09-02T11:00:00.000Z'),
    )
    await pushQueue(db(), tenantId, recorder.api, NOW)

    const appointmentId = first.appointment?.id ?? ''
    const puller = fakeApi()
    puller.page = {
      events: [
        {
          id: googleEventId(appointmentId),
          etag: 'etag-remote',
          cancelled: false,
          // Straight into the slot the second appointment holds.
          startsAt: new Date('2026-09-02T10:15:00.000Z'),
          endsAt: new Date('2026-09-02T10:45:00.000Z'),
        },
      ],
      nextSyncToken: 'token-2',
    }

    expect(await pullRemote(db(), tenantId, puller.api, NOW)).toMatchObject({
      pulled: 0,
      conflicts: 1,
    })
    expect((await listConflicts(db(), tenantId))[0]?.reason).toBe('overlap')
    // Untouched, because the exclusion constraint refused.
    expect((await appointmentRow(appointmentId))?.startsAt.toISOString()).toBe(
      '2026-09-02T08:00:00.000Z',
    )
  })
})

describe('disconnecting', () => {
  it('leaves the events standing and still clears every local trace', async () => {
    await connect()
    const recorder = fakeApi()
    const created = await createActivity(
      db(),
      tenantId,
      booking('2026-09-02T08:00:00.000Z', '2026-09-02T09:00:00.000Z'),
    )
    await pushQueue(db(), tenantId, recorder.api, NOW)

    const result = await disconnect(db(), tenantId, {
      deleteRemoteEvents: false,
      api: recorder.api,
    })

    expect(result).toEqual({ deleted: 0, attempted: 0, remaining: [] })
    expect(recorder.deleted).toHaveLength(0)

    const row = await appointmentRow(created.appointment?.id ?? '')
    expect(row?.googleEventId).toBeNull()
    expect(row?.googleEtag).toBeNull()
    expect(row?.lastPushedAt).toBeNull()
    expect(await queueRows()).toHaveLength(0)
    expect(
      await db().select().from(googleConnection).where(eq(googleConnection.tenantId, tenantId)),
    ).toHaveLength(0)
    expect(
      await db()
        .select()
        .from(appointmentSyncConflict)
        .where(eq(appointmentSyncConflict.tenantId, tenantId)),
    ).toHaveLength(0)
  })

  it('names the events it could not delete, so they can be found by hand', async () => {
    await connect()
    const recorder = fakeApi()
    await createActivity(
      db(),
      tenantId,
      booking('2026-09-02T08:00:00.000Z', '2026-09-02T09:00:00.000Z'),
    )
    await createActivity(
      db(),
      tenantId,
      booking('2026-09-03T08:00:00.000Z', '2026-09-03T09:00:00.000Z'),
    )
    await pushQueue(db(), tenantId, recorder.api, NOW)

    // The second deletion fails.
    let call = 0
    recorder.api.deleteEvent = async () => {
      call += 1
      if (call === 2) throw new GoogleApiError(500, 'backendError', 'Google antwortete mit 500.')
    }

    const result = await disconnect(db(), tenantId, {
      deleteRemoteEvents: true,
      api: recorder.api,
    })

    expect(result.attempted).toBe(2)
    expect(result.deleted).toBe(1)
    expect(result.remaining).toEqual([
      { startsAt: '2026-09-03T08:00:00.000Z', endsAt: '2026-09-03T09:00:00.000Z' },
    ])
  })
})
