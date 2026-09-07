import { userPreferencesSchema } from '@praxi/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../context.js'
import { setThemeCookie } from '../cookies.js'
import { getUserPreferences, updateUserPreferences } from '../domain/user-preferences.js'
import { userId } from '../middleware/auth.js'
import { database } from '../middleware/tenant-db.js'
import { validate } from '../middleware/validate.js'

export const userPreferencesRoute = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await getUserPreferences(database(c), userId(c))))

  .patch('/', validate('json', userPreferencesSchema), async (c) => {
    const preferences = await updateUserPreferences(database(c), userId(c), c.req.valid('json'))
    // The cache the inline script reads before first paint, kept in step with
    // what was just stored — see `cookies.ts`.
    setThemeCookie(c, preferences.theme)
    return c.json(preferences)
  })
