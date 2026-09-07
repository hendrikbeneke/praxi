import type { CurrentUser, LoginInput } from '@praxi/shared'
import { type QueryClient, queryOptions } from '@tanstack/react-query'
import { createAuthClient } from 'better-auth/client'
import { ApiError } from './api'
import { strings } from './strings'
import { applyTheme } from './theme'

/**
 * The Better Auth browser client.
 *
 * `basePath` matches where the handler is mounted on the server, and the base
 * URL is the page's own origin — the client always calls a relative path, so
 * nothing here branches on dev versus production, exactly as `lib/api.ts` does
 * for the rest of the API.
 *
 * This is the second client beside `hc<AppType>`, and the reason is that the
 * auth endpoints are the library's router rather than a typed Hono chain. The
 * three functions below keep that contained: everything else in this
 * application still goes through `api`.
 */
const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: '/api/auth',
})

export const currentUserQueryKey = ['auth', 'me'] as const

/**
 * Who is signed in, or `null`.
 *
 * Nobody signed in is a normal answer, not a failure — mapping it to `null`
 * keeps the route guard a plain value check, and `retry: false` stops React
 * Query from hammering the endpoint while signed out.
 */
export const currentUserQueryOptions = queryOptions({
  queryKey: currentUserQueryKey,
  queryFn: async (): Promise<CurrentUser | null> => {
    const { data } = await authClient.getSession()
    if (!data) return null
    const { id, email, name } = data.user
    return { id, email, name }
  },
  retry: false,
  staleTime: 5 * 60_000,
})

export async function signIn(input: LoginInput): Promise<CurrentUser> {
  const { data, error } = await authClient.signIn.email({
    email: input.email,
    password: input.password,
  })

  if (error || !data) throw new ApiError(error?.status ?? 500, signInMessage(error?.status))

  const { id, email, name } = data.user
  return { id, email, name }
}

/**
 * The two failures worth telling apart, in German, from the status alone.
 *
 * Better Auth's own message is English and says which of "unknown address" and
 * "wrong password" it was; neither belongs in front of the user — the first
 * because it discloses whether an account exists, the second because it is not
 * this application's language.
 */
function signInMessage(status: number | undefined): string {
  if (status === 429) return strings.login.tooManyAttempts
  return strings.login.failed
}

/**
 * Ends the session and takes the theme off the document with it.
 *
 * The server clears `praxi_theme` in the same response — but that cookie only
 * decides the *next* full page load, and signing out navigates to `/login`
 * client-side without one. `applyTheme` runs in `_app.beforeLoad`, and `/login`
 * lives outside `_app`, so nothing else would reset `data-theme`: the login
 * screen kept the colours of whoever just left.
 *
 * Both halves of "the theme goes" therefore sit in the function named for the
 * act, one on each side — the server the cookie, the client the attribute.
 */
export async function signOut(): Promise<void> {
  await authClient.signOut()
  applyTheme(undefined)
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
