import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { auth } from '../auth.js'
import type { AppEnv } from '../context.js'
import { messages } from '../messages.js'

/**
 * Rejects anything without a valid session and puts the user on the context.
 *
 * Mounted once, on the `/api` group, through `middleware/api-guard.ts` — never
 * on an individual router. See the paragraph in CLAUDE.md under Architecture
 * for why the default has to point that way.
 *
 * Resolving the session is Better Auth's job since S-B; what this still does
 * is the part the library has no notion of. **A deactivated user is refused
 * here**, on every request, which is what keeps `active = false` taking effect
 * at once rather than whenever the session happens to expire.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth().api.getSession({ headers: c.req.raw.headers })

  if (!result) throw new HTTPException(401, { message: messages.auth.notSignedIn })

  if (!result.user.active) {
    throw new HTTPException(401, { message: messages.auth.notSignedIn })
  }

  c.set('sessionId', result.session.id)
  c.set('user', { id: result.user.id, email: result.user.email, name: result.user.name })
  // The tenant comes off the session ROW, written there when the session was
  // created (`databaseHooks.session.create.before`) and read back from the
  // database on every request — never from the token, and never from anything
  // the client sent. CLAUDE.md rule 1.
  c.set('tenantId', result.session.tenantId)

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
