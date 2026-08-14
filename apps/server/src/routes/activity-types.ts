import { activityTypeCreateSchema, activityTypeInputSchema, moveInputSchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { foreignKeyViolationConstraint, uniqueViolationConstraint } from '../db/errors.js'
import {
  createActivityType,
  deleteActivityType,
  listActivityTypes,
  moveActivityType,
  updateActivityType,
} from '../domain/activity-type.js'
import { MoveTargetNotFoundError } from '../domain/reorder.js'
import { UnknownServiceError } from '../domain/service.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'

const typeParam = z.object({ typeId: z.uuid() })
const listQuery = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

/** The rules live in `domain/activity-type.ts` and in the constraints; this
 *  only decides how they reach the client. */
function translate(error: unknown): never {
  if (uniqueViolationConstraint(error) === 'activity_type_tenant_code_key') {
    throw new HTTPException(409, { message: messages.activityType.codeTaken })
  }

  const foreignKey = foreignKeyViolationConstraint(error)
  if (foreignKey === 'activity_type_fk') {
    throw new HTTPException(409, { message: messages.activityType.inUse })
  }

  // A preset item pointing at a service of another tenant, or at one that was
  // deleted in between — checked in the domain, not left to the foreign key.
  if (error instanceof UnknownServiceError) {
    throw new HTTPException(409, { message: messages.activityType.presetMissing })
  }
  if (error instanceof MoveTargetNotFoundError) {
    throw new HTTPException(404, { message: messages.activityType.notFound })
  }
  throw error
}

export const activityTypesRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', validate('query', listQuery), async (c) => {
    return c.json(await listActivityTypes(db(), tenantId(c), c.req.valid('query').includeInactive))
  })

  .post('/', validate('json', activityTypeCreateSchema), async (c) => {
    const created = await createActivityType(db(), tenantId(c), c.req.valid('json')).catch(
      translate,
    )
    return c.json(created, 201)
  })

  .put(
    '/:typeId',
    validate('param', typeParam),
    validate('json', activityTypeInputSchema),
    async (c) => {
      const updated = await updateActivityType(
        db(),
        tenantId(c),
        c.req.valid('param').typeId,
        c.req.valid('json'),
      ).catch(translate)

      if (!updated) throw new HTTPException(404, { message: messages.activityType.notFound })
      return c.json(updated)
    },
  )

  .delete('/:typeId', validate('param', typeParam), async (c) => {
    const deleted = await deleteActivityType(db(), tenantId(c), c.req.valid('param').typeId).catch(
      translate,
    )
    if (!deleted) throw new HTTPException(404, { message: messages.activityType.notFound })
    return c.body(null, 204)
  })

  /** A boundary — the button should already have disabled it — is a no-op
   *  and answers 204; an unknown id is a real error and answers 404, see
   *  `domain/reorder.ts`. */
  .post(
    '/:typeId/move',
    validate('param', typeParam),
    validate('json', moveInputSchema),
    async (c) => {
      await moveActivityType(
        db(),
        tenantId(c),
        c.req.valid('param').typeId,
        c.req.valid('json').delta,
      ).catch(translate)
      return c.body(null, 204)
    },
  )
