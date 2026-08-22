import { moveInputSchema, noteTypeInputSchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { foreignKeyViolationConstraint, uniqueViolationConstraint } from '../db/errors.js'
import {
  createNoteType,
  deleteNoteType,
  listNoteTypes,
  moveNoteType,
  NoteTypeInUseError,
  updateNoteType,
} from '../domain/note-type.js'
import { MoveTargetNotFoundError } from '../domain/reorder.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'

/** The rules live in `domain/note-type.ts` and in the constraints; this only
 *  decides how they reach the client. */

const typeParam = z.object({ typeId: z.uuid() })

function translate(error: unknown): never {
  if (error instanceof NoteTypeInUseError) {
    throw new HTTPException(409, { message: messages.noteType.inUse(error.count) })
  }
  if (uniqueViolationConstraint(error) === 'note_type_tenant_label_key') {
    throw new HTTPException(409, { message: messages.noteType.labelTaken })
  }
  // The backstop behind the count above, reachable only past `deleteNoteType`.
  if (foreignKeyViolationConstraint(error) === 'note_type_fk') {
    throw new HTTPException(409, { message: messages.noteType.inUseUnknown })
  }
  if (error instanceof MoveTargetNotFoundError) {
    throw new HTTPException(404, { message: messages.noteType.notFound })
  }
  throw error
}

export const noteTypesRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', async (c) => c.json(await listNoteTypes(db(), tenantId(c))))

  .post('/', validate('json', noteTypeInputSchema), async (c) => {
    const created = await createNoteType(db(), tenantId(c), c.req.valid('json')).catch(translate)
    return c.json(created, 201)
  })

  .put(
    '/:typeId',
    validate('param', typeParam),
    validate('json', noteTypeInputSchema),
    async (c) => {
      const updated = await updateNoteType(
        db(),
        tenantId(c),
        c.req.valid('param').typeId,
        c.req.valid('json'),
      ).catch(translate)

      if (!updated) throw new HTTPException(404, { message: messages.noteType.notFound })
      return c.json(updated)
    },
  )

  .delete('/:typeId', validate('param', typeParam), async (c) => {
    const deleted = await deleteNoteType(db(), tenantId(c), c.req.valid('param').typeId).catch(
      translate,
    )
    if (!deleted) throw new HTTPException(404, { message: messages.noteType.notFound })
    return c.body(null, 204)
  })

  /** A boundary is a no-op and answers 204; an unknown id answers 404 — see
   *  `domain/reorder.ts`. */
  .post(
    '/:typeId/move',
    validate('param', typeParam),
    validate('json', moveInputSchema),
    async (c) => {
      await moveNoteType(
        db(),
        tenantId(c),
        c.req.valid('param').typeId,
        c.req.valid('json').delta,
      ).catch(translate)
      return c.body(null, 204)
    },
  )
