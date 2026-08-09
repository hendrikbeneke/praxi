import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { validateSession } from '../domain/auth.js'
import { messages } from '../messages.js'
import { clearSessionCookie, readSessionCookie } from '../session-cookie.js'

/**
 * Rejects anything without a valid session cookie and puts the user on the
 * context. Mount it on every route group except `/api/auth/login` and
 * `/api/health`.
 *
 * A cookie that no longer resolves is cleared on the way out, so a browser
 * holding an expired token stops sending it instead of retrying forever.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = readSessionCookie(c)
  if (!token) throw new HTTPException(401, { message: messages.auth.notSignedIn })

  const validated = await validateSession(db(), token)
  if (!validated) {
    clearSessionCookie(c)
    throw new HTTPException(401, { message: messages.auth.sessionExpired })
  }

  c.set('sessionId', validated.sessionId)
  c.set('user', validated.user)
  // The tenant middleware reads this; see middleware/tenant.ts.
  c.set('tenantId', validated.tenantId)

  await next()
})

/** The signed-in user's id, for the columns that record who wrote something —
 *  `note.created_by` and `note.locked_by`. Same reasoning as `tenantId()`: it
 *  comes from the session, never from the request. */
export function userId(c: Context<AppEnv>): string {
  const user = c.get('user')
  if (!user) throw new HTTPException(401, { message: messages.auth.notSignedIn })
  return user.id
}
