import { userPreferencesSchema } from '@praxi/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../context.js'
import { setThemeCookie } from '../cookies.js'
import { db } from '../db/client.js'
import { getUserPreferences, updateUserPreferences } from '../domain/user-preferences.js'
import { requireAuth, userId } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'

export const userPreferencesRoute = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/', async (c) => c.json(await getUserPreferences(db(), userId(c))))

  .patch('/', validate('json', userPreferencesSchema), async (c) => {
    const preferences = await updateUserPreferences(db(), userId(c), c.req.valid('json'))
    // The cache the inline script reads before first paint, kept in step with
    // what was just stored — see `cookies.ts`.
    setThemeCookie(c, preferences.theme)
    return c.json(preferences)
  })
