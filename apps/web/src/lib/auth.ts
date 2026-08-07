import type { CurrentUser, LoginInput } from '@praxi/shared'
import { type QueryClient, queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

export const currentUserQueryKey = ['auth', 'me'] as const

/**
 * Who is signed in, or `null`.
 *
 * A 401 is a normal answer here, not a failure — it is how the server says
 * "nobody". Mapping it to `null` keeps the route guard a plain value check,
 * and `retry: false` stops React Query from hammering the endpoint while
 * signed out.
 */
export const currentUserQueryOptions = queryOptions({
  queryKey: currentUserQueryKey,
  queryFn: async (): Promise<CurrentUser | null> => {
    const res = await api.api.auth.me.$get()
    if (res.status === 401) return null
    if (!res.ok) throw await apiError(res)
    return res.json()
  },
  retry: false,
  staleTime: 5 * 60_000,
})

export async function signIn(input: LoginInput): Promise<CurrentUser> {
  const res = await api.api.auth.login.$post({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function signOut(): Promise<void> {
  const res = await api.api.auth.logout.$post()
  if (!res.ok) throw await apiError(res)
}

/**
 * Everything in this application is tenant-scoped and only meaningful for the
 * signed-in user, so a change of user invalidates the whole cache rather than
 * a curated list of keys.
 */
export async function resetCache(queryClient: QueryClient): Promise<void> {
  queryClient.clear()
  await queryClient.invalidateQueries()
}
