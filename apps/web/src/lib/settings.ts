import type { PracticeSettings } from '@praxi/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

/** The one practice settings row. Its key is the prefix of everything else
 *  under the settings, so invalidating `['settings']` refreshes the lot. */
export const practiceSettingsQueryOptions = queryOptions({
  queryKey: ['settings'],
  queryFn: async (): Promise<PracticeSettings> => {
    const res = await api.api.settings.$get()
    if (!res.ok) throw await apiError(res)
    return res.json()
  },
})
