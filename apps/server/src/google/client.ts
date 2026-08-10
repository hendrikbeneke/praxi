import type { BusyInterval, GoogleCalendar } from '@praxi/shared'
import type { GoogleEventPayload } from './payload.js'

/**
 * The Google Calendar API, by hand over `fetch`.
 *
 * No `googleapis` package: it is enormous and brings its own auth stack, and
 * we need seven calls. The transport is a parameter, which is what lets every
 * test in this slice run offline and assert on the *request* rather than on
 * whatever a mock chose to answer.
 *
 * This is the only place in the software that talks to the network at all
 * (CLAUDE.md rule 12).
 */

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

export type Fetcher = typeof fetch

/**
 * A failed call, reduced to what the caller decides on.
 *
 * `permanent` separates "this will never work" from "try again later" — the
 * queue backs off on the second and stops on the first, instead of burning
 * through every pending row against a dead token.
 */
export class GoogleApiError extends Error {
  readonly status: number
  readonly reason: string
  readonly permanent: boolean

  constructor(status: number, reason: string, message: string) {
    super(message)
    this.name = 'GoogleApiError'
    this.status = status
    this.reason = reason
    // 408 and 429 are retryable despite being 4xx; so is anything from 500 up.
    this.permanent = status >= 400 && status < 500 && status !== 408 && status !== 429
  }
}

/** The token expired or was revoked. The worker stops on this one rather than
 *  retrying: no number of attempts fixes a revoked grant. */
export function isAuthFailure(error: unknown): boolean {
  return error instanceof GoogleApiError && (error.status === 401 || error.reason === 'authError')
}

/** The event id is already taken — our own insert that got through after the
 *  answer was lost. Not a failure: the event exists, which is the goal. */
export function isDuplicate(error: unknown): boolean {
  return error instanceof GoogleApiError && error.status === 409
}

export function isNotFound(error: unknown): boolean {
  return error instanceof GoogleApiError && (error.status === 404 || error.status === 410)
}

/** `events.list` refuses an expired `syncToken` with 410. The answer is a full
 *  pass, not an error. */
export function isSyncTokenExpired(error: unknown): boolean {
  return error instanceof GoogleApiError && error.status === 410
}

/** The subset of an event we read back. Everything else the API returns is
 *  read and dropped — a title typed in on a phone never gets past here. */
export type RemoteEvent = {
  id: string
  etag: string | null
  cancelled: boolean
  startsAt: Date | null
  endsAt: Date | null
}

export type EventPage = {
  events: RemoteEvent[]
  nextSyncToken: string | null
}

export interface GoogleApi {
  listCalendars(): Promise<GoogleCalendar[]>
  freeBusy(calendarIds: string[], from: Date, to: Date): Promise<BusyInterval[]>
  insertEvent(calendarId: string, event: GoogleEventPayload): Promise<{ etag: string | null }>
  updateEvent(calendarId: string, event: GoogleEventPayload): Promise<{ etag: string | null }>
  deleteEvent(calendarId: string, eventId: string): Promise<void>
  listEvents(calendarId: string, syncToken: string | null): Promise<EventPage>
}

type ErrorBody = { error?: { message?: unknown; errors?: { reason?: unknown }[] } }

async function readError(response: Response): Promise<GoogleApiError> {
  let reason = ''
  let message = `Google antwortete mit ${response.status}.`

  try {
    const body = (await response.json()) as ErrorBody
    const first = body.error?.errors?.[0]?.reason
    if (typeof first === 'string') reason = first
    if (typeof body.error?.message === 'string') message = body.error.message
  } catch {
    // A non-JSON body — a proxy, a captive portal. The status is the message.
  }

  return new GoogleApiError(response.status, reason, message)
}

/** Google returns `dateTime` for timed events and `date` for all-day ones. We
 *  only ever write timed events, but the practitioner's own calendar may hold
 *  all-day entries, and an all-day blocker is a real blocker. */
function readInstant(value: { dateTime?: unknown; date?: unknown } | undefined): Date | null {
  if (!value) return null
  if (typeof value.dateTime === 'string') return new Date(value.dateTime)
  if (typeof value.date === 'string') return new Date(`${value.date}T00:00:00Z`)
  return null
}

export function createGoogleApi(options: {
  accessToken: () => Promise<string>
  fetch?: Fetcher
}): GoogleApi {
  const doFetch = options.fetch ?? fetch

  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    const token = await options.accessToken()

    let response: Response
    try {
      response = await doFetch(`${CALENDAR_BASE}${path}`, {
        ...init,
        headers: {
          ...init.headers,
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
      })
    } catch {
      // No answer at all — the line is down. Status 0, and retryable.
      throw new GoogleApiError(0, 'network', 'Google ist nicht erreichbar.')
    }

    if (!response.ok) throw await readError(response)
    if (response.status === 204) return null
    return response.json()
  }

  return {
    async listCalendars() {
      const body = (await call('/users/me/calendarList?minAccessRole=freeBusyReader')) as {
        items?: {
          id?: unknown
          summary?: unknown
          primary?: unknown
          accessRole?: unknown
        }[]
      }

      return (body.items ?? []).flatMap((item): GoogleCalendar[] => {
        if (typeof item.id !== 'string') return []
        return [
          {
            id: item.id,
            summary: typeof item.summary === 'string' ? item.summary : item.id,
            primary: item.primary === true,
            accessRole: typeof item.accessRole === 'string' ? item.accessRole : 'reader',
          },
        ]
      })
    },

    /**
     * The read side, and the whole of it: busy intervals, nothing else. The
     * API cannot answer with more — the token carries `calendar.freebusy`.
     */
    async freeBusy(calendarIds, from, to) {
      if (calendarIds.length === 0) return []

      const body = (await call('/freeBusy', {
        method: 'POST',
        body: JSON.stringify({
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          items: calendarIds.map((id) => ({ id })),
        }),
      })) as { calendars?: Record<string, { busy?: { start?: unknown; end?: unknown }[] }> }

      const intervals: BusyInterval[] = []
      for (const calendar of Object.values(body.calendars ?? {})) {
        for (const slot of calendar.busy ?? []) {
          if (typeof slot.start !== 'string' || typeof slot.end !== 'string') continue
          intervals.push({
            startsAt: new Date(slot.start).toISOString(),
            endsAt: new Date(slot.end).toISOString(),
          })
        }
      }
      return intervals
    },

    async insertEvent(calendarId, event) {
      const body = (await call(`/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        body: JSON.stringify(event),
      })) as { etag?: unknown }

      return { etag: typeof body.etag === 'string' ? body.etag : null }
    },

    /**
     * PUT, not PATCH. The payload is the complete projection every time, so a
     * field someone added in Google — a description typed in on a phone — is
     * cleared rather than left standing next to a pseudonymous title.
     */
    async updateEvent(calendarId, event) {
      const body = (await call(
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}`,
        { method: 'PUT', body: JSON.stringify(event) },
      )) as { etag?: unknown }

      return { etag: typeof body.etag === 'string' ? body.etag : null }
    },

    async deleteEvent(calendarId, eventId) {
      await call(
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { method: 'DELETE' },
      )
    },

    /**
     * The return channel. Pages are followed to the end, because the sync
     * token only arrives with the last one.
     */
    async listEvents(calendarId, syncToken) {
      const events: RemoteEvent[] = []
      let pageToken: string | null = null
      let nextSyncToken: string | null = null

      do {
        const params = new URLSearchParams({ maxResults: '250', showDeleted: 'true' })
        if (syncToken) params.set('syncToken', syncToken)
        if (pageToken) params.set('pageToken', pageToken)

        const body = (await call(
          `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
        )) as {
          items?: {
            id?: unknown
            etag?: unknown
            status?: unknown
            start?: { dateTime?: unknown; date?: unknown }
            end?: { dateTime?: unknown; date?: unknown }
          }[]
          nextPageToken?: unknown
          nextSyncToken?: unknown
        }

        for (const item of body.items ?? []) {
          if (typeof item.id !== 'string') continue
          events.push({
            id: item.id,
            etag: typeof item.etag === 'string' ? item.etag : null,
            cancelled: item.status === 'cancelled',
            startsAt: readInstant(item.start),
            endsAt: readInstant(item.end),
          })
        }

        pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : null
        nextSyncToken = typeof body.nextSyncToken === 'string' ? body.nextSyncToken : nextSyncToken
      } while (pageToken)

      return { events, nextSyncToken }
    },
  }
}
