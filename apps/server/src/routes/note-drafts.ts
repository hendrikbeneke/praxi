import { noteDraftInputSchema, noteDraftQuerySchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import {
  DraftNoteLockedError,
  deleteNoteDraft,
  getNoteDraft,
  saveNoteDraft,
} from '../domain/note-draft.js'
import { messages } from '../messages.js'
import { userId } from '../middleware/auth.js'
import { tenantId } from '../middleware/tenant.js'
import { database } from '../middleware/tenant-db.js'
import { validate } from '../middleware/validate.js'

/**
 * The unsaved state of a note being written (L2).
 *
 * Its own prefix rather than a branch of `/api/notes`, because half of all
 * drafts belong to no note at all — a note being newly written does not exist
 * yet. Payments hang under their invoice because there is no payment without
 * one; here it is the other way round.
 *
 * The user is the caller. It comes from the session, never from the payload:
 * one practitioner's unfinished documentation is not reachable through
 * another's request.
 */

const draftParam = z.object({ draftId: z.uuid() })

function translate(error: unknown): never {
  if (error instanceof DraftNoteLockedError) {
    throw new HTTPException(409, { message: messages.noteDraft.noteLocked })
  }
  throw error
}

export const noteDraftsRoute = new Hono<AppEnv>()
  /** Answers `null` rather than 404 when there is none: "is there a draft" is
   *  the question, and having none is an ordinary answer to it. */
  .get('/', validate('query', noteDraftQuerySchema), async (c) => {
    const draft = await getNoteDraft(database(c), tenantId(c), userId(c), c.req.valid('query'))
    return c.json(draft)
  })

  /** Upsert. There is no id in the URL because the client never invents one:
   *  the key is `(user, note)` or `(user, contact)` and the server resolves
   *  it. */
  .put('/', validate('json', noteDraftInputSchema), async (c) => {
    const saved = await saveNoteDraft(
      database(c),
      tenantId(c),
      userId(c),
      c.req.valid('json'),
    ).catch(translate)
    return c.json(saved)
  })

  .delete('/:draftId', validate('param', draftParam), async (c) => {
    const deleted = await deleteNoteDraft(
      database(c),
      tenantId(c),
      userId(c),
      c.req.valid('param').draftId,
    )
    if (!deleted) throw new HTTPException(404, { message: messages.noteDraft.notFound })
    return c.body(null, 204)
  })
