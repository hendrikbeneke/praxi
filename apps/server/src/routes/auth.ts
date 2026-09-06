import { type CurrentUser, loginSchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../context.js'
import {
  clearSessionCookie,
  clearThemeCookie,
  readSessionCookie,
  setSessionCookie,
  setThemeCookie,
} from '../cookies.js'
import { db } from '../db/client.js'
import { login, logout } from '../domain/auth.js'
import { logger } from '../logger.js'
import { messages } from '../messages.js'
import { validate } from '../middleware/validate.js'

export const authRoute = new Hono<AppEnv>()
  .post('/login', validate('json', loginSchema), async (c) => {
    const input = c.req.valid('json')
    const result = await login(db(), input)

    if (!result) {
      // No email in the log — see CLAUDE.md rule 12.
      logger().warn('login rejected')
      throw new HTTPException(401, { message: messages.auth.invalidCredentials })
    }

    setSessionCookie(c, result.token, result.expiresAt)
    // In the same response as the session, so the next load of the page is
    // painted in the right scheme before anything is fetched (`cookies.ts`).
    setThemeCookie(c, result.theme)
    logger().info({ userId: result.user.id }, 'login')

    return c.json(result.user satisfies CurrentUser)
  })

  .post('/logout', async (c) => {
    // In PUBLIC_API_ROUTES on purpose: logging out with an already dead
    // session must still clear the cookie instead of answering 401.
    const token = readSessionCookie(c)
    if (token) await logout(db(), token)
    clearSessionCookie(c)
    // Or the next person's login screen would wear the last one's colours.
    clearThemeCookie(c)

    return c.body(null, 204)
  })

  /** Guarded by `apiGuard` like everything else — being under `/api/auth` is
   *  not what decides it; not being in `PUBLIC_API_ROUTES` is. */
  .get('/me', (c) => c.json(c.get('user') satisfies CurrentUser))
