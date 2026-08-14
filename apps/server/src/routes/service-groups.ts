import { catalogueListQuerySchema, moveInputSchema, serviceGroupInputSchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { uniqueViolationConstraint } from '../db/errors.js'
import {
  createServiceGroup,
  deleteServiceGroup,
  getServiceGroup,
  listServiceGroups,
  moveServiceGroup,
  ServiceGroupInUseError,
  UnknownServiceError,
  updateServiceGroup,
} from '../domain/service.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'

const groupParam = z.object({ groupId: z.uuid() })

function notFound(): never {
  throw new HTTPException(404, { message: messages.service.groupNotFound })
}

function translate(error: unknown): never {
  if (error instanceof UnknownServiceError) {
    throw new HTTPException(409, { message: messages.service.unknownService })
  }
  if (error instanceof ServiceGroupInUseError) {
    throw new HTTPException(409, { message: messages.service.groupInUse })
  }
  if (uniqueViolationConstraint(error) === 'service_group_tenant_name_key') {
    throw new HTTPException(409, { message: messages.service.groupNameTaken })
  }
  throw error
}

export const serviceGroupsRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', validate('query', catalogueListQuerySchema), async (c) => {
    return c.json(await listServiceGroups(db(), tenantId(c), c.req.valid('query')))
  })

  .post('/', validate('json', serviceGroupInputSchema), async (c) => {
    const created = await createServiceGroup(db(), tenantId(c), c.req.valid('json')).catch(
      translate,
    )
    return c.json(created, 201)
  })

  .get('/:groupId', validate('param', groupParam), async (c) => {
    const found = await getServiceGroup(db(), tenantId(c), c.req.valid('param').groupId)
    return found ? c.json(found) : notFound()
  })

  .put(
    '/:groupId',
    validate('param', groupParam),
    validate('json', serviceGroupInputSchema),
    async (c) => {
      const updated = await updateServiceGroup(
        db(),
        tenantId(c),
        c.req.valid('param').groupId,
        c.req.valid('json'),
      ).catch(translate)

      return updated ? c.json(updated) : notFound()
    },
  )

  .delete('/:groupId', validate('param', groupParam), async (c) => {
    const deleted = await deleteServiceGroup(db(), tenantId(c), c.req.valid('param').groupId).catch(
      translate,
    )
    if (!deleted) notFound()
    return c.body(null, 204)
  })

  /** `false` covers an unknown id and a boundary the button should already
   *  have disabled alike — 204 either way, see `contact-types.ts`. */
  .post(
    '/:groupId/move',
    validate('param', groupParam),
    validate('json', moveInputSchema),
    async (c) => {
      await moveServiceGroup(
        db(),
        tenantId(c),
        c.req.valid('param').groupId,
        c.req.valid('json').delta,
      )
      return c.body(null, 204)
    },
  )
