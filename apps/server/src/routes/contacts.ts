import {
  contactInputSchema,
  contactListQuerySchema,
  contactRelationInputSchema,
  contactRolesInputSchema,
  contactUpdateSchema,
} from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { foreignKeyViolationConstraint, uniqueViolationConstraint } from '../db/errors.js'
import { listContactAppointments, nextContactAppointment } from '../domain/appointment.js'
import {
  ContactKindChangeError,
  createContact,
  getContact,
  listContacts,
  setContactArchived,
  setContactRoles,
  updateContact,
} from '../domain/contact.js'
import {
  addRelation,
  deleteRelation,
  listRelations,
  SelfRelationError,
  UnknownRelationTypeError,
  updateRelation,
} from '../domain/contact-relation.js'
import { MissingNumberRangeError } from '../domain/counter.js'
import { InvalidCursorError } from '../domain/keyset.js'
import { messages } from '../messages.js'
import { tenantId } from '../middleware/tenant.js'
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
  if (error instanceof InvalidCursorError) {
    throw new HTTPException(400, { message: messages.list.badCursor })
  }
  if (error instanceof ContactKindChangeError) {
    throw new HTTPException(409, { message: messages.contact.kindImmutable })
  }
  if (error instanceof MissingNumberRangeError) {
    throw new HTTPException(409, { message: messages.numberRange.missing })
  }
  if (error instanceof UnknownRelationTypeError) {
    throw new HTTPException(409, { message: messages.contact.unknownRelationType })
  }
  if (error instanceof SelfRelationError) {
    throw new HTTPException(409, { message: messages.contact.selfRelation })
  }

  const unique = uniqueViolationConstraint(error)
  if (unique === 'contact_relation_pair_key') {
    throw new HTTPException(409, { message: messages.contact.relationExists })
  }
  if (unique === 'contact_relation_exclusive_key') {
    throw new HTTPException(409, { message: messages.contact.relationExclusive })
  }

  const foreignKey = foreignKeyViolationConstraint(error)
  // A role code that does not name a role type of this tenant.
  if (foreignKey === 'contact_role_type_fk') {
    throw new HTTPException(409, { message: messages.contact.unknownRole })
  }
  if (foreignKey === 'contact_relation_from_fk' || foreignKey === 'contact_relation_to_fk') {
    throw new HTTPException(409, { message: messages.contact.relationContactMissing })
  }
  throw error
}

export const contactsRoute = new Hono<AppEnv>()
  .get('/', validate('query', contactListQuerySchema), async (c) => {
    const result = await listContacts(db(), tenantId(c), c.req.valid('query')).catch(translate)
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
    validate('json', contactUpdateSchema),
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
   * Roles have their own endpoint because they have their own control: the
   * header saves the moment one is ticked, while the master data form saves on
   * a button. Sharing one payload would let the form write back stale roles —
   * see the note on `contactUpdateSchema`.
   */
  .put(
    '/:contactId/roles',
    validate('param', contactParam),
    validate('json', contactRolesInputSchema),
    async (c) => {
      const updated = await setContactRoles(
        db(),
        tenantId(c),
        c.req.valid('param').contactId,
        c.req.valid('json').roles,
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

  /**
   * Relations hang off the contact rather than travelling in its payload: they
   * involve a second contact and act immediately, and the record they are
   * entered from may be either end. The same reasoning as the note
   * attachments in slice 5.
   */
  .get('/:contactId/relations', validate('param', contactParam), async (c) => {
    return c.json(await listRelations(db(), tenantId(c), c.req.valid('param').contactId))
  })

  .post(
    '/:contactId/relations',
    validate('param', contactParam),
    validate('json', contactRelationInputSchema),
    async (c) => {
      const created = await addRelation(
        db(),
        tenantId(c),
        c.req.valid('param').contactId,
        c.req.valid('json'),
      ).catch(translate)

      if (!created) throw new HTTPException(404, { message: messages.contact.notFound })
      return c.json(created, 201)
    },
  )

  /**
   * Change an existing relation — another kind, another counterpart, or both.
   *
   * A `PUT` and not a `PATCH`: the kind and the counterpart together *are* the
   * relation, so what is sent is the complete statement, exactly what the
   * `POST` above takes. `domain/contact-relation.ts` rewrites the row in one
   * transaction.
   */
  .put(
    '/:contactId/relations/:relationId',
    validate('param', contactParam.extend({ relationId: z.uuid() })),
    validate('json', contactRelationInputSchema),
    async (c) => {
      const param = c.req.valid('param')
      const saved = await updateRelation(
        db(),
        tenantId(c),
        param.contactId,
        param.relationId,
        c.req.valid('json'),
      ).catch(translate)

      if (!saved) throw new HTTPException(404, { message: messages.contact.relationNotFound })
      return c.json(saved)
    },
  )

  .delete(
    '/:contactId/relations/:relationId',
    validate('param', contactParam.extend({ relationId: z.uuid() })),
    async (c) => {
      const param = c.req.valid('param')
      const deleted = await deleteRelation(db(), tenantId(c), param.contactId, param.relationId)
      if (!deleted) throw new HTTPException(404, { message: messages.contact.relationNotFound })
      return c.body(null, 204)
    },
  )

  /**
   * The contact's calendar entries — every one of them, including the ones
   * that belong to no Vorgang (L5). Hangs off the contact for the same reason
   * the relations do: it is a question asked *of a record*, and the calendar's
   * own route answers by date range.
   */
  .get('/:contactId/appointments', validate('param', contactParam), async (c) => {
    const entries = await listContactAppointments(
      db(),
      tenantId(c),
      c.req.valid('param').contactId,
      new Date(),
    )
    return c.json(entries)
  })

  /** The one entry the record's overview names, or null. Its own route rather
   *  than the first row of the list above — see the domain function. */
  .get('/:contactId/appointments/next', validate('param', contactParam), async (c) => {
    const entry = await nextContactAppointment(
      db(),
      tenantId(c),
      c.req.valid('param').contactId,
      new Date(),
    )
    return c.json(entry)
  })
