import type { PracticeSettings, PracticeSettingsPatch } from '@praxi/shared'
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

/**
 * A patch, not a form submission: `patch` carries only the fields the caller
 * owns (D4's Praxis and Rechnungsstellung panels each send a disjoint
 * subset), and the server writes only those columns. Sending a field this
 * screen does not render would resurrect the exact race the two-panel split
 * exists to avoid — see `updatePracticeSettings` on the server.
 */
export async function updatePracticeSettings(
  patch: PracticeSettingsPatch,
): Promise<PracticeSettings> {
  const res = await api.api.settings.$patch({ json: patch })
  if (!res.ok) throw await apiError(res)
  return res.json()
}
