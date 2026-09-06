import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../context.js'
import { requireAuth } from './auth.js'
import { withTenant } from './tenant.js'

/**
 * One route that is reachable without a session, and why.
 *
 * The `why` is a field rather than a comment because the test reads it: an
 * entry without a reason does not compile past the assertion, and an entry
 * whose route no longer exists fails too. A list nobody can add to silently is
 * the whole point of this file.
 */
export type PublicApiRoute = {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'ALL'
  readonly path: string
  readonly why: string
}

/**
 * The exceptions to "everything under `/api` needs a session".
 *
 * **Exact matches, never prefixes — with exactly one exception, and it is
 * fenced.** A prefix would wave through whatever is mounted under it, which is
 * the shortcut that turns the test over this list into a formality. Every
 * entry below is a static path except `/api/auth/*`, which cannot be anything
 * else: Better Auth is one Hono route with its own router behind it, so its
 * sub-paths never appear in Hono's table and cannot be enumerated here.
 *
 * What fences it is an assertion in `routes/api-guard.test.ts`: **no route of
 * ours may be mounted under `/api/auth/`.** The prefix therefore covers the
 * library and nothing else, which is a property that is checked rather than
 * remembered.
 */
export const PUBLIC_API_ROUTES: readonly PublicApiRoute[] = [
  {
    method: 'GET',
    path: '/api/health',
    why: 'The HEALTHCHECK in the Dockerfile fetches it, and Coolify decides from it whether the container came up. It answers a status and a timestamp and reads nothing.',
  },
  {
    method: 'ALL',
    path: '/api/auth/*',
    why: "Better Auth's own surface: signing in cannot require a session, signing out with a dead one must still clear the cookie, and the library guards the rest itself. The one prefix in this list, and the only one there will be — a test asserts that nothing of ours is mounted under it.",
  },
  {
    method: 'GET',
    path: '/api/google/oauth/callback',
    why: 'The OAuth redirect comes back on 127.0.0.1, which is a different origin than localhost, so the session cookie does not travel with it. It authenticates through the single-use `state` it issued instead (google/oauth.ts).',
  },
]

const publicKeys = new Set(
  PUBLIC_API_ROUTES.filter((route) => route.method !== 'ALL').map(
    (route) => `${route.method} ${route.path}`,
  ),
)

/** The prefixes of the `ALL` entries — see the note on `PUBLIC_API_ROUTES`. */
const publicPrefixes = PUBLIC_API_ROUTES.filter((route) => route.path.endsWith('/*')).map((route) =>
  route.path.slice(0, -1),
)

/**
 * The auth boundary of the whole application, in one place.
 *
 * It sits on the `/api` group rather than on each router, so a route added
 * tomorrow is protected without anyone remembering to protect it. That is the
 * direction the default has to point: forgetting the middleware used to
 * produce no error, no warning and no failing test, only an open endpoint.
 *
 * Mounted in `app.ts` **before** the `route()` chain — Hono runs middleware in
 * registration order, so a `use()` after the routes would run after their
 * handlers and guard nothing.
 *
 * **A 401 under `/api` does not necessarily mean "not signed in". It can also
 * mean "there is no such route."** This middleware matches on the path before
 * the router finds out that nothing does, so a typo in a URL answers 401 just
 * as a real endpoint would without a session. That is a side effect and not a
 * goal — a welcome one, because a mistyped URL then reveals nothing about
 * which endpoints exist — but it is the thing to know first when debugging an
 * unexpected 401: check the path before checking the session.
 */
export const apiGuard = createMiddleware<AppEnv>(async (c, next) => {
  if (publicKeys.has(`${c.req.method} ${c.req.path}`)) return next()
  if (publicPrefixes.some((prefix) => c.req.path.startsWith(prefix))) return next()

  // Two middlewares rather than one call: `requireAuth` puts the session on the
  // context and `withTenant` is the checkpoint that says the tenant came from
  // it (CLAUDE.md rule 1). Both throw, so reaching `next()` means both passed.
  return requireAuth(c, async () => {
    await withTenant(c, next)
  })
})
