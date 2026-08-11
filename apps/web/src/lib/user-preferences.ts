import type { UserPreferences } from '@praxi/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

export const userPreferencesQueryKey = ['user-preferences'] as const

export const userPreferencesQueryOptions = queryOptions({
  queryKey: userPreferencesQueryKey,
  queryFn: async (): Promise<UserPreferences> => {
    const res = await api.api['user-preferences'].$get()
    if (!res.ok) throw await apiError(res)
    return res.json()
  },
})

/** A partial patch — only the keys being changed, never the whole object; see
 *  the comment on `updateUserPreferences` in the server domain for why. */
export async function updateUserPreferences(
  input: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const res = await api.api['user-preferences'].$patch({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}
