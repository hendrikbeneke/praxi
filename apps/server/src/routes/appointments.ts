import {
  appointmentMoveSchema,
  appointmentRangeQuerySchema,
  freeSlotQuerySchema,
} from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { isOverlapViolation } from '../db/errors.js'
import { listCalendarEntries, moveAppointment } from '../domain/appointment.js'
import { type BusyLookup, findFreeSlots } from '../domain/free-slots.js'
import { busyIntervals } from '../domain/google-connection.js'
import { openGoogleApi } from '../google/api.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'

const appointmentParam = z.object({ appointmentId: z.uuid() })

/**
 * Reading and moving only. Appointments come into being with their activity
 * (`POST /api/activities`), because every one of them belongs to one —
 * see the note on `appointment.contact_id` in the schema.
 *
 * `/move` rather than a general `PUT` (D9): dragging says *when*, and status,
 * title and note are edited through the activity. A route that accepted them
 * here would be a second way to change them, and the general PUT this replaces
 * had no caller in the client at all.
 */
export const appointmentsRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', validate('query', appointmentRangeQuerySchema), async (c) => {
    return c.json(await listCalendarEntries(db(), tenantId(c), c.req.valid('query')))
  })

  /**
   * Where a treatment of a given length would still fit (D9.5).
   *
   * The Google handle is opened here and handed to the domain as a parameter,
   * the shape `google/client.ts` established — and the busy intervals it
   * returns are used for the search and **never sent on**. The answer is free
   * windows and two flags; rule 13 comes out stricter here than in the
   * calendar view, where the intervals have to travel because they are painted.
   */
  .get('/free-slots', validate('query', freeSlotQuerySchema), async (c) => {
    const tenant = tenantId(c)

    /** Throws when there is no connection, which `findFreeSlots` reads as
     *  "not checked" — the same answer a failed query gives, because to the
     *  practitioner the two mean the same thing. */
    const lookup: BusyLookup = async (from, to) => {
      const api = await openGoogleApi(db(), tenant)
      if (!api) throw new Error('google is not connected')
      return busyIntervals(db(), tenant, api, from, to)
    }

    return c.json(await findFreeSlots(db(), tenant, c.req.valid('query'), lookup, new Date()))
  })

  .post(
    '/:appointmentId/move',
    validate('param', appointmentParam),
    validate('json', appointmentMoveSchema),
    async (c) => {
      const moved = await moveAppointment(
        db(),
        tenantId(c),
        c.req.valid('param').appointmentId,
        c.req.valid('json'),
      ).catch((error: unknown) => {
        // SQLSTATE 23P01 from `appointment_no_overlap`. The screen puts the
        // block back where it was and shows this; without the sentence the
        // move would just fail silently.
        if (isOverlapViolation(error)) {
          throw new HTTPException(409, { message: messages.appointment.overlap })
        }
        throw error
      })

      if (!moved) throw new HTTPException(404, { message: messages.appointment.notFound })
      return c.body(null, 204)
    },
  )
