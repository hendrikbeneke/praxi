import { practiceSettingsInputSchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { getPracticeSettings, updatePracticeSettings } from '../domain/practice-settings.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'

export const settingsRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', async (c) => {
    const settings = await getPracticeSettings(db(), tenantId(c))
    if (!settings) throw new HTTPException(404, { message: messages.settings.missing })

    return c.json(settings)
  })

  .put('/', validate('json', practiceSettingsInputSchema), async (c) => {
    const settings = await updatePracticeSettings(db(), tenantId(c), c.req.valid('json'))
    if (!settings) throw new HTTPException(404, { message: messages.settings.missing })

    return c.json(settings)
  })
