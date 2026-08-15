import {
  activityInputSchema,
  activityListQuerySchema,
  activitySummaryQuerySchema,
} from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { foreignKeyViolationConstraint, isOverlapViolation } from '../db/errors.js'
import {
  ActivityHasNotesError,
  activitySummary,
  BilledItemError,
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
  if (error instanceof BilledItemError) {
    throw new HTTPException(409, {
      message: messages.invoice.billedItemBlocksDelete(error.itemDescription, error.invoiceNumber),
    })
  }
  if (error instanceof ActivityHasNotesError) {
    throw new HTTPException(409, { message: messages.note.activityHasNotes })
  }
  if (error instanceof UnknownServiceError) {
    throw new HTTPException(409, { message: messages.activity.unknownService })
  }
  if (error instanceof UnknownServiceGroupError) {
    throw new HTTPException(409, { message: messages.activity.unknownServiceGroup })
  }
  if (isOverlapViolation(error)) {
    throw new HTTPException(409, { message: messages.appointment.overlap })
  }
  // An activity type that was deleted or deactivated between loading the form
  // and saving it. The catalogue is the only place a type can come from.
  if (foreignKeyViolationConstraint(error) === 'activity_type_fk') {
    throw new HTTPException(409, { message: messages.activity.unknownType })
  }
  throw error
}

export const activitiesRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', validate('query', activityListQuerySchema), async (c) => {
    return c.json(await listActivities(db(), tenantId(c), c.req.valid('query')))
  })

  /** Registered before `/:activityId`, which is validated as a uuid — so the
   *  two cannot be confused either way. */
  .get('/summary', validate('query', activitySummaryQuerySchema), async (c) => {
    return c.json(await activitySummary(db(), tenantId(c), c.req.valid('query'), new Date()))
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
    const deleted = await deleteActivity(db(), tenantId(c), c.req.valid('param').activityId).catch(
      translate,
    )
    return deleted ? c.body(null, 204) : notFound()
  })
