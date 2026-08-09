import { numberRangeCodeSchema, numberRangeInputSchema } from '@praxi/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { listNumberRanges, upsertNumberRange } from '../domain/number-range.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'

/**
 * Maintaining the number ranges by hand (CLAUDE.md rule 8).
 *
 * `PUT` creates the range if it does not exist, which is the only way the
 * `invoice` range ever comes into being — `domain/counter.ts` refuses to make
 * that one up, because it may continue a numbering from the previous system.
 * The code is restricted to a known set so a typo cannot create a third range
 * nothing reads.
 */
const rangeParam = z.object({ code: numberRangeCodeSchema })

export const numberRangesRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', async (c) => {
    return c.json(await listNumberRanges(db(), tenantId(c)))
  })

  .put(
    '/:code',
    validate('param', rangeParam),
    validate('json', numberRangeInputSchema),
    async (c) => {
      const saved = await upsertNumberRange(
        db(),
        tenantId(c),
        c.req.valid('param').code,
        c.req.valid('json'),
      )
      return c.json(saved)
    },
  )
