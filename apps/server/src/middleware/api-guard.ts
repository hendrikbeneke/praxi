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
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  readonly path: string
  readonly why: string
}

/**
 * The exceptions to "everything under `/api` needs a session".
 *
 * **Exact matches, never prefixes.** `/api/auth/*` would wave `GET
 * /api/auth/me` through, and that is exactly the shortcut that turns the test
 * over this list into a formality. Every path here is static; there is no
 * pattern matching and no `startsWith` anywhere below.
 */
export const PUBLIC_API_ROUTES: readonly PublicApiRoute[] = [
  {
    method: 'GET',
    path: '/api/health',
    why: 'The HEALTHCHECK in the Dockerfile fetches it, and Coolify decides from it whether the container came up. It answers a status and a timestamp and reads nothing.',
  },
  {
    method: 'POST',
    path: '/api/auth/login',
    why: 'Signing in is what produces the session; it cannot require one.',
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
    why: 'Signing out with an already dead session must clear the cookie rather than answer 401 — otherwise a browser holding an expired token can never get rid of it.',
  },
  {
    method: 'GET',
    path: '/api/google/oauth/callback',
    why: 'The OAuth redirect comes back on 127.0.0.1, which is a different origin than localhost, so the session cookie does not travel with it. It authenticates through the single-use `state` it issued instead (google/oauth.ts).',
  },
]

const publicKeys = new Set(PUBLIC_API_ROUTES.map((route) => `${route.method} ${route.path}`))

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
 * One consequence worth knowing: an unknown path under `/api` answers 401
 * rather than 404 now, because this runs before the router finds out that
 * nothing matches. That is the better answer — someone without a session
 * learns nothing about the route table — but it is a changed one.
 */
export const apiGuard = createMiddleware<AppEnv>(async (c, next) => {
  if (publicKeys.has(`${c.req.method} ${c.req.path}`)) return next()

  // Two middlewares rather than one call: `requireAuth` puts the session on the
  // context and `withTenant` is the checkpoint that says the tenant came from
  // it (CLAUDE.md rule 1). Both throw, so reaching `next()` means both passed.
  return requireAuth(c, async () => {
    await withTenant(c, next)
  })
})
