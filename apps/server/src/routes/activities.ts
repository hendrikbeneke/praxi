import { activityInputSchema, activityListQuerySchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { isOverlapViolation } from '../db/errors.js'
import {
  createActivity,
  deleteActivity,
  getActivity,
  listActivities,
  UnknownServiceError,
  UnknownServiceGroupError,
  updateActivity,
} from '../domain/activity.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'

const activityParam = z.object({ activityId: z.uuid() })

function notFound(): never {
  throw new HTTPException(404, { message: messages.activity.notFound })
}

/** The rules live in `domain/activity.ts`; this only decides how they reach
 *  the client. */
function translate(error: unknown): never {
  if (error instanceof UnknownServiceError) {
    throw new HTTPException(409, { message: messages.activity.unknownService })
  }
  if (error instanceof UnknownServiceGroupError) {
    throw new HTTPException(409, { message: messages.activity.unknownServiceGroup })
  }
  if (isOverlapViolation(error)) {
    throw new HTTPException(409, { message: messages.appointment.overlap })
  }
  throw error
}

export const activitiesRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', validate('query', activityListQuerySchema), async (c) => {
    return c.json(await listActivities(db(), tenantId(c), c.req.valid('query')))
  })

  .post('/', validate('json', activityInputSchema), async (c) => {
    const created = await createActivity(db(), tenantId(c), c.req.valid('json')).catch(translate)
    return c.json(created, 201)
  })

  .get('/:activityId', validate('param', activityParam), async (c) => {
    const found = await getActivity(db(), tenantId(c), c.req.valid('param').activityId)
    return found ? c.json(found) : notFound()
  })

  .put(
    '/:activityId',
    validate('param', activityParam),
    validate('json', activityInputSchema),
    async (c) => {
      const updated = await updateActivity(
        db(),
        tenantId(c),
        c.req.valid('param').activityId,
        c.req.valid('json'),
      ).catch(translate)

      return updated ? c.json(updated) : notFound()
    },
  )

  .delete('/:activityId', validate('param', activityParam), async (c) => {
    const deleted = await deleteActivity(db(), tenantId(c), c.req.valid('param').activityId)
    return deleted ? c.body(null, 204) : notFound()
  })
