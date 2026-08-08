import { contactInputSchema, contactListQuerySchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import {
  ContactKindChangeError,
  createContact,
  getContact,
  listContacts,
  setContactArchived,
  updateContact,
} from '../domain/contact.js'
import { MissingNumberRangeError } from '../domain/counter.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'

const contactParam = z.object({ contactId: z.uuid() })

function notFound(): never {
  throw new HTTPException(404, { message: messages.contact.notFound })
}

/**
 * Translates the domain's errors into status codes. The rules themselves live
 * in `domain/contact.ts` and `domain/counter.ts`; this only decides how they
 * reach the client.
 */
function translate(error: unknown): never {
  if (error instanceof ContactKindChangeError) {
    throw new HTTPException(409, { message: messages.contact.kindImmutable })
  }
  if (error instanceof MissingNumberRangeError) {
    throw new HTTPException(409, { message: messages.numberRange.missing })
  }
  throw error
}

export const contactsRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', validate('query', contactListQuerySchema), async (c) => {
    const result = await listContacts(db(), tenantId(c), c.req.valid('query'))
    return c.json(result)
  })

  .post('/', validate('json', contactInputSchema), async (c) => {
    const created = await createContact(db(), tenantId(c), c.req.valid('json')).catch(translate)
    return c.json(created, 201)
  })

  .get('/:contactId', validate('param', contactParam), async (c) => {
    const found = await getContact(db(), tenantId(c), c.req.valid('param').contactId)
    return found ? c.json(found) : notFound()
  })

  .put(
    '/:contactId',
    validate('param', contactParam),
    validate('json', contactInputSchema),
    async (c) => {
      const updated = await updateContact(
        db(),
        tenantId(c),
        c.req.valid('param').contactId,
        c.req.valid('json'),
      ).catch(translate)

      return updated ? c.json(updated) : notFound()
    },
  )

  /**
   * Archiving rather than deleting: a contact is referenced by activities,
   * notes and invoices that stay readable for the whole retention period.
   */
  .post('/:contactId/archive', validate('param', contactParam), async (c) => {
    const archived = await setContactArchived(
      db(),
      tenantId(c),
      c.req.valid('param').contactId,
      true,
    )
    return archived ? c.json(archived) : notFound()
  })

  .post('/:contactId/unarchive', validate('param', contactParam), async (c) => {
    const restored = await setContactArchived(
      db(),
      tenantId(c),
      c.req.valid('param').contactId,
      false,
    )
    return restored ? c.json(restored) : notFound()
  })
