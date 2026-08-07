import { type CurrentUser, loginSchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { login, logout } from '../domain/auth.js'
import { logger } from '../logger.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { clearSessionCookie, readSessionCookie, setSessionCookie } from '../session-cookie.js'

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
    logger().info({ userId: result.user.id }, 'login')

    return c.json(result.user satisfies CurrentUser)
  })

  .post('/logout', async (c) => {
    // Deliberately not behind requireAuth: logging out with an already dead
    // session must still clear the cookie instead of answering 401.
    const token = readSessionCookie(c)
    if (token) await logout(db(), token)
    clearSessionCookie(c)

    return c.body(null, 204)
  })

  .get('/me', requireAuth, (c) => c.json(c.get('user') satisfies CurrentUser))
