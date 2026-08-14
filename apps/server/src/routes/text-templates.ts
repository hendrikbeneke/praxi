import { moveInputSchema, textTemplateInputSchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { uniqueViolationConstraint } from '../db/errors.js'
import { MoveTargetNotFoundError } from '../domain/reorder.js'
import {
  createTextTemplate,
  deleteTextTemplate,
  listTextTemplates,
  moveTextTemplate,
  updateTextTemplate,
} from '../domain/text-template.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'

const templateParam = z.object({ templateId: z.uuid() })
const listQuery = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

function translate(error: unknown): never {
  const constraint = uniqueViolationConstraint(error)
  if (constraint === 'text_template_tenant_kind_name_key') {
    throw new HTTPException(409, { message: messages.textTemplate.nameTaken })
  }
  if (constraint === 'text_template_default_key') {
    throw new HTTPException(409, { message: messages.textTemplate.defaultTaken })
  }
  if (constraint === 'text_template_paid_key') {
    throw new HTTPException(409, { message: messages.textTemplate.paidVariantTaken })
  }
  if (error instanceof MoveTargetNotFoundError) {
    throw new HTTPException(404, { message: messages.textTemplate.notFound })
  }
  throw error
}

export const textTemplatesRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', validate('query', listQuery), async (c) => {
    return c.json(await listTextTemplates(db(), tenantId(c), c.req.valid('query').includeInactive))
  })

  .post('/', validate('json', textTemplateInputSchema), async (c) => {
    const created = await createTextTemplate(db(), tenantId(c), c.req.valid('json')).catch(
      translate,
    )
    return c.json(created, 201)
  })

  .put(
    '/:templateId',
    validate('param', templateParam),
    validate('json', textTemplateInputSchema),
    async (c) => {
      const updated = await updateTextTemplate(
        db(),
        tenantId(c),
        c.req.valid('param').templateId,
        c.req.valid('json'),
      ).catch(translate)

      if (!updated) throw new HTTPException(404, { message: messages.textTemplate.notFound })
      return c.json(updated)
    },
  )

  .delete('/:templateId', validate('param', templateParam), async (c) => {
    const deleted = await deleteTextTemplate(db(), tenantId(c), c.req.valid('param').templateId)
    if (!deleted) throw new HTTPException(404, { message: messages.textTemplate.notFound })
    return c.body(null, 204)
  })

  /** A boundary — the button should already have disabled it — is a no-op
   *  and answers 204; an unknown id is a real error and answers 404, see
   *  `domain/reorder.ts`. */
  .post(
    '/:templateId/move',
    validate('param', templateParam),
    validate('json', moveInputSchema),
    async (c) => {
      await moveTextTemplate(
        db(),
        tenantId(c),
        c.req.valid('param').templateId,
        c.req.valid('json').delta,
      ).catch(translate)
      return c.body(null, 204)
    },
  )
