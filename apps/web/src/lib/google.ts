import type {
  BusyInterval,
  ConflictResolution,
  GoogleCalendar,
  GoogleDisconnectResult,
  GoogleStatus,
  GoogleSyncResult,
  SyncConflict,
} from '@praxi/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

/**
 * The Google Calendar projection (CLAUDE.md slice 9).
 *
 * The calendar page reads two of these on every view change — busy intervals
 * and conflicts — so both fail quietly: without a connection the answer is an
 * empty list, and a screen that otherwise works must not be covered by an
 * error about a calendar that is not configured.
 */

export const googleStatusQueryOptions = queryOptions({
  queryKey: ['google', 'status'],
  queryFn: async (): Promise<GoogleStatus> => {
    const res = await api.api.google.status.$get()
    if (!res.ok) throw await apiError(res)
    return res.json()
  },
})

export const googleCalendarsQueryOptions = queryOptions({
  queryKey: ['google', 'calendars'],
  queryFn: async (): Promise<GoogleCalendar[]> => {
    const res = await api.api.google.calendars.$get()
    if (!res.ok) throw await apiError(res)
    return res.json()
  },
  // The list changes about never; refetching it on every settings visit only
  // spends someone's quota.
  staleTime: 5 * 60_000,
})

/**
 * Busy intervals for the week on screen. Never stored anywhere, here or on the
 * server — they are painted and forgotten.
 */
export const busyQueryOptions = (from: string, to: string) =>
  queryOptions({
    queryKey: ['google', 'freebusy', from, to],
    queryFn: async (): Promise<BusyInterval[]> => {
      const res = await api.api.google.freebusy.$get({ query: { from, to } })
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 60_000,
    retry: false,
  })

export const googleConflictsQueryOptions = queryOptions({
  queryKey: ['google', 'conflicts'],
  queryFn: async (): Promise<SyncConflict[]> => {
    const res = await api.api.google.conflicts.$get()
    if (!res.ok) return []
    return res.json()
  },
  retry: false,
})

export async function connectGoogle(): Promise<{ authUrl: string }> {
  const res = await api.api.google.connect.$post()
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function disconnectGoogle(
  deleteRemoteEvents: boolean,
): Promise<GoogleDisconnectResult> {
  const res = await api.api.google.disconnect.$post({ json: { deleteRemoteEvents } })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function setGoogleCalendar(calendarId: string | null): Promise<void> {
  const res = await api.api.google.calendar.$put({ json: { calendarId } })
  if (!res.ok) throw await apiError(res)
}

export async function setFreebusyCalendars(calendarIds: string[]): Promise<void> {
  const res = await api.api.google['freebusy-calendars'].$put({ json: { calendarIds } })
  if (!res.ok) throw await apiError(res)
}

export async function syncGoogleNow(): Promise<GoogleSyncResult> {
  const res = await api.api.google.sync.$post()
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function resolveGoogleConflict(
  appointmentId: string,
  keep: ConflictResolution['keep'],
): Promise<void> {
  const res = await api.api.google.conflicts[':appointmentId'].resolve.$post({
    param: { appointmentId },
    json: { keep },
  })
  if (!res.ok) throw await apiError(res)
}
