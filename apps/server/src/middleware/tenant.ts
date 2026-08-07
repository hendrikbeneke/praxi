import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../context.js'
import { messages } from '../messages.js'

/**
 * CLAUDE.md rule 1: the tenant id comes from the session and from nowhere
 * else. `requireAuth` sets it; this middleware is the checkpoint that says so
 * out loud, and the single place a later multi-tenant switch would touch.
 *
 * It deliberately does *not* look at the request. If a body or query string
 * ever carries a `tenantId`, it is ignored here and must be ignored in the
 * route as well.
 */
export const withTenant = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('tenantId')) {
    throw new HTTPException(401, { message: messages.auth.notSignedIn })
  }
  await next()
})

/** The only sanctioned way for a route handler to learn its tenant. */
export function tenantId(c: Context<AppEnv>): string {
  const id = c.get('tenantId')
  if (!id) throw new HTTPException(401, { message: messages.auth.notSignedIn })
  return id
}
