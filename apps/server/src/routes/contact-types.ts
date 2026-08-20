import {
  contactRelationTypeCreateSchema,
  contactRelationTypeInputSchema,
  contactRoleTypeInputSchema,
  moveInputSchema,
} from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { foreignKeyViolationConstraint, uniqueViolationConstraint } from '../db/errors.js'
import {
  createRelationType,
  createRoleType,
  deleteRelationType,
  deleteRoleType,
  listRelationTypes,
  listRoleTypes,
  moveRelationType,
  moveRoleType,
  RoleTypeInUseError,
  SystemTypeError,
  updateRelationType,
  updateRoleType,
} from '../domain/contact-type.js'
import { MoveTargetNotFoundError } from '../domain/reorder.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'

const typeParam = z.object({ typeId: z.uuid() })
/** Relations only. A role type has no `active` flag to leave out — see
 *  `domain/contact-type.ts`. */
const relationListQuery = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

/** The rules live in `domain/contact-type.ts` and in the constraints; this
 *  only decides how they reach the client. */
function translate(error: unknown): never {
  if (error instanceof SystemTypeError) {
    throw new HTTPException(409, { message: messages.contactType.systemNotDeletable })
  }
  if (error instanceof RoleTypeInUseError) {
    throw new HTTPException(409, { message: messages.contactType.roleInUse(error.count) })
  }
  if (uniqueViolationConstraint(error) === 'contact_role_type_tenant_label_key') {
    throw new HTTPException(409, { message: messages.contactType.labelTaken })
  }
  if (uniqueViolationConstraint(error)?.endsWith('_tenant_code_key')) {
    throw new HTTPException(409, { message: messages.contactType.codeTaken })
  }

  const foreignKey = foreignKeyViolationConstraint(error)
  if (foreignKey === 'contact_role_type_fk') {
    // The backstop: `deleteRoleType` counts first and refuses with a number.
    throw new HTTPException(409, { message: messages.contactType.roleInUseUnknown })
  }
  if (foreignKey === 'contact_relation_type_fk') {
    throw new HTTPException(409, { message: messages.contactType.relationInUse })
  }
  /**
   * Switching a type to exclusive while a contact already holds two relations
   * of it. The index refuses and the whole edit rolls back — see
   * `updateRelationType`.
   */
  if (uniqueViolationConstraint(error) === 'contact_relation_exclusive_key') {
    throw new HTTPException(409, { message: messages.contactType.exclusiveConflict })
  }
  if (error instanceof MoveTargetNotFoundError) {
    throw new HTTPException(404, { message: messages.contactType.notFound })
  }
  throw error
}

export const contactRoleTypesRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', async (c) => {
    return c.json(await listRoleTypes(db(), tenantId(c)))
  })

  .post('/', validate('json', contactRoleTypeInputSchema), async (c) => {
    const created = await createRoleType(db(), tenantId(c), c.req.valid('json')).catch(translate)
    return c.json(created, 201)
  })

  .put(
    '/:typeId',
    validate('param', typeParam),
    validate('json', contactRoleTypeInputSchema),
    async (c) => {
      const updated = await updateRoleType(
        db(),
        tenantId(c),
        c.req.valid('param').typeId,
        c.req.valid('json'),
      ).catch(translate)

      if (!updated) throw new HTTPException(404, { message: messages.contactType.notFound })
      return c.json(updated)
    },
  )

  .delete('/:typeId', validate('param', typeParam), async (c) => {
    const deleted = await deleteRoleType(db(), tenantId(c), c.req.valid('param').typeId).catch(
      translate,
    )
    if (!deleted) throw new HTTPException(404, { message: messages.contactType.notFound })
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
      await moveRoleType(
        db(),
        tenantId(c),
        c.req.valid('param').typeId,
        c.req.valid('json').delta,
      ).catch(translate)
      return c.body(null, 204)
    },
  )

export const contactRelationTypesRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', validate('query', relationListQuery), async (c) => {
    return c.json(await listRelationTypes(db(), tenantId(c), c.req.valid('query').includeInactive))
  })

  .post('/', validate('json', contactRelationTypeCreateSchema), async (c) => {
    const created = await createRelationType(db(), tenantId(c), c.req.valid('json')).catch(
      translate,
    )
    return c.json(created, 201)
  })

  .put(
    '/:typeId',
    validate('param', typeParam),
    validate('json', contactRelationTypeInputSchema),
    async (c) => {
      const updated = await updateRelationType(
        db(),
        tenantId(c),
        c.req.valid('param').typeId,
        c.req.valid('json'),
      ).catch(translate)

      if (!updated) throw new HTTPException(404, { message: messages.contactType.notFound })
      return c.json(updated)
    },
  )

  .delete('/:typeId', validate('param', typeParam), async (c) => {
    const deleted = await deleteRelationType(db(), tenantId(c), c.req.valid('param').typeId).catch(
      translate,
    )
    if (!deleted) throw new HTTPException(404, { message: messages.contactType.notFound })
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
      await moveRelationType(
        db(),
        tenantId(c),
        c.req.valid('param').typeId,
        c.req.valid('json').delta,
      ).catch(translate)
      return c.body(null, 204)
    },
  )
