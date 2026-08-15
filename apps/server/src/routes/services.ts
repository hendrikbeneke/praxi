import { catalogueListQuerySchema, moveInputSchema, serviceInputSchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { uniqueViolationConstraint } from '../db/errors.js'
import { MoveTargetNotFoundError } from '../domain/reorder.js'
import {
  createService,
  deleteService,
  listServices,
  moveService,
  ServiceInUseError,
  updateService,
} from '../domain/service.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'

const serviceParam = z.object({ serviceId: z.uuid() })

function notFound(): never {
  throw new HTTPException(404, { message: messages.service.notFound })
}

function translate(error: unknown): never {
  if (uniqueViolationConstraint(error) === 'service_tenant_short_code_key') {
    throw new HTTPException(409, { message: messages.service.shortCodeTaken })
  }
  if (error instanceof ServiceInUseError) {
    throw new HTTPException(409, { message: messages.service.inUse(error.usage) })
  }
  if (error instanceof MoveTargetNotFoundError) notFound()
  throw error
}

/**
 * `active` is part of the payload rather than its own endpoint. That differs
 * from archiving a contact, which is a guarded action with a confirmation;
 * deactivating a catalogue entry is a checkbox in the form, and two routes to
 * one outcome would be worse than the inconsistency.
 */
export const servicesRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', validate('query', catalogueListQuerySchema), async (c) => {
    return c.json(await listServices(db(), tenantId(c), c.req.valid('query')))
  })

  .post('/', validate('json', serviceInputSchema), async (c) => {
    const created = await createService(db(), tenantId(c), c.req.valid('json')).catch(translate)
    return c.json(created, 201)
  })

  .put(
    '/:serviceId',
    validate('param', serviceParam),
    validate('json', serviceInputSchema),
    async (c) => {
      const updated = await updateService(
        db(),
        tenantId(c),
        c.req.valid('param').serviceId,
        c.req.valid('json'),
      ).catch(translate)

      return updated ? c.json(updated) : notFound()
    },
  )

  .delete('/:serviceId', validate('param', serviceParam), async (c) => {
    const deleted = await deleteService(db(), tenantId(c), c.req.valid('param').serviceId).catch(
      translate,
    )
    if (!deleted) notFound()
    return c.body(null, 204)
  })

  /** A boundary — the button should already have disabled it — is a no-op
   *  and answers 204; an unknown id is a real error and answers 404, see
   *  `domain/reorder.ts`. */
  .post(
    '/:serviceId/move',
    validate('param', serviceParam),
    validate('json', moveInputSchema),
    async (c) => {
      await moveService(
        db(),
        tenantId(c),
        c.req.valid('param').serviceId,
        c.req.valid('json').delta,
      ).catch(translate)
      return c.body(null, 204)
    },
  )
