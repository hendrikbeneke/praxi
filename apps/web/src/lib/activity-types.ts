import type { ActivityType, ActivityTypeCreate, ActivityTypeInput } from '@praxi/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

/**
 * The catalogue of activity types (CLAUDE.md rule 6).
 *
 * Loaded wherever an activity is shown, because label and colour are resolved
 * from it on the client — `activityTypeLabel` and `activityTypeColor` in
 * `packages/shared`. Inactive entries come along by default: a type that was
 * deactivated is still the type of every activity entered under it, and a list
 * showing the bare code instead of the label would be worse than one offering
 * a type that is no longer picked. The pickers filter to `active` themselves.
 */
export const activityTypeListQueryOptions = (includeInactive = true) =>
  queryOptions({
    queryKey: ['activity-types', { includeInactive }],
    queryFn: async (): Promise<ActivityType[]> => {
      const res = await api.api['activity-types'].$get({
        query: { includeInactive: includeInactive ? 'true' : 'false' },
      })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

export async function createActivityType(input: ActivityTypeCreate): Promise<ActivityType> {
  const res = await api.api['activity-types'].$post({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function updateActivityType(
  typeId: string,
  input: ActivityTypeInput,
): Promise<ActivityType> {
  const res = await api.api['activity-types'][':typeId'].$put({ param: { typeId }, json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deleteActivityType(typeId: string): Promise<void> {
  const res = await api.api['activity-types'][':typeId'].$delete({ param: { typeId } })
  if (!res.ok) throw await apiError(res)
}
