import { countryEntryInputSchema, moveInputSchema, valueListEntryInputSchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { foreignKeyViolationConstraint, uniqueViolationConstraint } from '../db/errors.js'
import { MoveTargetNotFoundError } from '../domain/reorder.js'
import {
  createCountryEntry,
  createLabelEntry,
  deleteEntry,
  listCountries,
  listGenders,
  listSalutations,
  moveEntry,
  updateLabelEntry,
  ValueInUseError,
} from '../domain/value-list.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'

/**
 * The three value lists behind a contact's own fields (D-R3). The rules live
 * in `domain/value-list.ts` and in the constraints; this decides how they
 * reach the client.
 */

const entryParam = z.object({ entryId: z.uuid() })

function translate(error: unknown): never {
  if (error instanceof ValueInUseError) {
    throw new HTTPException(409, { message: messages.valueList.inUse(error.list, error.count) })
  }
  const unique = uniqueViolationConstraint(error)
  if (unique === 'salutation_tenant_label_key' || unique === 'gender_tenant_label_key') {
    throw new HTTPException(409, { message: messages.valueList.labelTaken })
  }
  if (unique === 'country_tenant_iso_key') {
    throw new HTTPException(409, { message: messages.valueList.countryTaken })
  }
  // The backstop behind the count above, reachable only past `deleteEntry`.
  const foreignKey = foreignKeyViolationConstraint(error)
  if (foreignKey?.startsWith('contact_') && foreignKey.endsWith('_fk')) {
    throw new HTTPException(409, { message: messages.valueList.inUseUnknown })
  }
  if (error instanceof MoveTargetNotFoundError) {
    throw new HTTPException(404, { message: messages.valueList.notFound })
  }
  throw error
}

function labelRoute(list: 'salutation' | 'gender') {
  return (
    new Hono<AppEnv>()
      .use('*', requireAuth, withTenant)

      .get('/', async (c) => {
        const rows =
          list === 'salutation'
            ? await listSalutations(db(), tenantId(c))
            : await listGenders(db(), tenantId(c))
        return c.json(rows)
      })

      .post('/', validate('json', valueListEntryInputSchema), async (c) => {
        const created = await createLabelEntry(db(), tenantId(c), list, c.req.valid('json')).catch(
          translate,
        )
        return c.json(created, 201)
      })

      .put(
        '/:entryId',
        validate('param', entryParam),
        validate('json', valueListEntryInputSchema),
        async (c) => {
          const updated = await updateLabelEntry(
            db(),
            tenantId(c),
            list,
            c.req.valid('param').entryId,
            c.req.valid('json'),
          ).catch(translate)

          if (!updated) throw new HTTPException(404, { message: messages.valueList.notFound })
          return c.json(updated)
        },
      )

      .delete('/:entryId', validate('param', entryParam), async (c) => {
        const deleted = await deleteEntry(
          db(),
          tenantId(c),
          list,
          c.req.valid('param').entryId,
        ).catch(translate)
        if (!deleted) throw new HTTPException(404, { message: messages.valueList.notFound })
        return c.body(null, 204)
      })

      /** A boundary is a no-op and answers 204; an unknown id answers 404 — see
       *  `domain/reorder.ts`. */
      .post(
        '/:entryId/move',
        validate('param', entryParam),
        validate('json', moveInputSchema),
        async (c) => {
          await moveEntry(
            db(),
            tenantId(c),
            list,
            c.req.valid('param').entryId,
            c.req.valid('json').delta,
          ).catch(translate)
          return c.body(null, 204)
        },
      )
  )
}

export const salutationsRoute = labelRoute('salutation')
export const gendersRoute = labelRoute('gender')

/**
 * Countries have no `PUT`: adding one is choosing from the ISO list, and there
 * is nothing about the chosen entry to edit afterwards. What the practitioner
 * maintains here is which countries the contact form offers, and in what order.
 */
export const countriesRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', async (c) => c.json(await listCountries(db(), tenantId(c))))

  .post('/', validate('json', countryEntryInputSchema), async (c) => {
    const created = await createCountryEntry(db(), tenantId(c), c.req.valid('json')).catch(
      translate,
    )
    return c.json(created, 201)
  })

  .delete('/:entryId', validate('param', entryParam), async (c) => {
    const deleted = await deleteEntry(
      db(),
      tenantId(c),
      'country',
      c.req.valid('param').entryId,
    ).catch(translate)
    if (!deleted) throw new HTTPException(404, { message: messages.valueList.notFound })
    return c.body(null, 204)
  })

  .post(
    '/:entryId/move',
    validate('param', entryParam),
    validate('json', moveInputSchema),
    async (c) => {
      await moveEntry(
        db(),
        tenantId(c),
        'country',
        c.req.valid('param').entryId,
        c.req.valid('json').delta,
      ).catch(translate)
      return c.body(null, 204)
    },
  )
