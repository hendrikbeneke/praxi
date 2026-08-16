import type {
  Activity,
  ActivityInput,
  ActivityListQuery,
  ActivitySummary,
  ActivitySummaryQuery,
  AppointmentMove,
  CalendarEntry,
  FreeSlotQuery,
  FreeSlotsResponse,
} from '@praxi/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

type ListParams = Pick<Partial<ActivityListQuery>, 'contactId' | 'from' | 'to' | 'status' | 'type'>

export const activityListQueryOptions = (params: ListParams) =>
  queryOptions({
    queryKey: ['activities', 'list', params],
    queryFn: async (): Promise<Activity[]> => {
      const res = await api.api.activities.$get({
        query: {
          ...(params.contactId ? { contactId: params.contactId } : {}),
          ...(params.from ? { from: params.from } : {}),
          ...(params.to ? { to: params.to } : {}),
          ...(params.status ? { status: params.status } : {}),
          ...(params.type ? { type: params.type } : {}),
        },
      })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

/** The figures above the Vorgänge list. Its own request because the window is
 *  larger than a page — see `activitySummary` in the domain. */
export const activitySummaryQueryOptions = (params: ActivitySummaryQuery) =>
  queryOptions({
    queryKey: ['activities', 'summary', params],
    queryFn: async (): Promise<ActivitySummary> => {
      const res = await api.api.activities.summary.$get({
        query: {
          from: params.from,
          to: params.to,
          ...(params.type ? { type: params.type } : {}),
        },
      })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

export const activityQueryOptions = (activityId: string) =>
  queryOptions({
    queryKey: ['activities', 'detail', activityId],
    queryFn: async (): Promise<Activity> => {
      const res = await api.api.activities[':activityId'].$get({ param: { activityId } })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

/** `from` inclusive, `to` exclusive — the same half-open window the exclusion
 *  constraint works with. */
export const calendarQueryOptions = (from: string, to: string) =>
  queryOptions({
    queryKey: ['appointments', 'range', { from, to }],
    queryFn: async (): Promise<CalendarEntry[]> => {
      const res = await api.api.appointments.$get({ query: { from, to } })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

export async function createActivity(input: ActivityInput): Promise<Activity> {
  const res = await api.api.activities.$post({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function updateActivity(activityId: string, input: ActivityInput): Promise<Activity> {
  const res = await api.api.activities[':activityId'].$put({
    param: { activityId },
    json: input,
  })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deleteActivity(activityId: string): Promise<void> {
  const res = await api.api.activities[':activityId'].$delete({ param: { activityId } })
  if (!res.ok) throw await apiError(res)
}

/** Dragging an entry to another time. Moves the activity with it — see
 *  `moveAppointment` in the domain, which is why this is not a plain update. */
export async function moveAppointment(appointmentId: string, move: AppointmentMove): Promise<void> {
  const res = await api.api.appointments[':appointmentId'].move.$post({
    param: { appointmentId },
    json: move,
  })
  if (!res.ok) throw await apiError(res)
}

/**
 * Where a treatment of a given length would still fit (D9.5).
 *
 * The busy times behind this never reach the browser — the server computes
 * with them and answers with free windows and two flags. See `findFreeSlots`
 * in the domain.
 */
export const freeSlotsQueryOptions = (params: FreeSlotQuery | null) =>
  queryOptions({
    queryKey: ['appointments', 'free-slots', params],
    enabled: params !== null,
    queryFn: async (): Promise<FreeSlotsResponse> => {
      if (!params) throw new Error('no query')
      const res = await api.api.appointments['free-slots'].$get({
        query: {
          from: params.from,
          to: params.to,
          durationMin: String(params.durationMin),
        },
      })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })
