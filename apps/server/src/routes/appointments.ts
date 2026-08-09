import { appointmentDraftSchema, appointmentRangeQuerySchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { isOverlapViolation } from '../db/errors.js'
import { listCalendarEntries, updateAppointment } from '../domain/appointment.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'

const appointmentParam = z.object({ appointmentId: z.uuid() })

/**
 * Reading and moving only. Appointments come into being with their activity
 * (`POST /api/activities`), because every one of them belongs to one —
 * see the note on `appointment.contact_id` in the schema.
 */
export const appointmentsRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', validate('query', appointmentRangeQuerySchema), async (c) => {
    return c.json(await listCalendarEntries(db(), tenantId(c), c.req.valid('query')))
  })

  .put(
    '/:appointmentId',
    validate('param', appointmentParam),
    validate('json', appointmentDraftSchema),
    async (c) => {
      const moved = await updateAppointment(
        db(),
        tenantId(c),
        c.req.valid('param').appointmentId,
        c.req.valid('json'),
      ).catch((error: unknown) => {
        if (isOverlapViolation(error)) {
          throw new HTTPException(409, { message: messages.appointment.overlap })
        }
        throw error
      })

      if (!moved) throw new HTTPException(404, { message: messages.appointment.notFound })
      return c.body(null, 204)
    },
  )
