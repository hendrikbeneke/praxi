import {
  appointmentCreateSchema,
  appointmentPatchSchema,
  appointmentRangeQuerySchema,
  freeSlotQuerySchema,
} from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { foreignKeyViolationConstraint } from '../db/errors.js'
import {
  AppointmentHasActivityError,
  createAppointment,
  deleteAppointment,
  listCalendarEntries,
  updateAppointment,
} from '../domain/appointment.js'
import { type BusyLookup, findFreeSlots } from '../domain/free-slots.js'
import { busyIntervals } from '../domain/google-connection.js'
import { openGoogleApi } from '../google/api.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'

const appointmentParam = z.object({ appointmentId: z.uuid() })

/**
 * The calendar entry as a resource of its own (D-K1).
 *
 * A Vorgang with a Termin is still one act and is created through
 * `POST /api/activities`; what is created here is the other kind — a blocker,
 * documentation time, a team meeting, which belongs to no activity and
 * possibly to no contact.
 *
 * **One PATCH**, where D9 had `/move`. That route was deliberately narrow
 * because status, title and note were edited through the activity, and a
 * second door here would have been a second way to change them. An appointment
 * without an activity has no such door, so this is it; a drag sends nothing
 * but the two instants and is the same call.
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

  .post('/', validate('json', appointmentCreateSchema), async (c) => {
    const created = await createAppointment(db(), tenantId(c), c.req.valid('json')).catch(
      (error: unknown) => {
        // A contact that was archived away or never belonged to this tenant.
        if (foreignKeyViolationConstraint(error) === 'appointment_contact_tenant_fk') {
          throw new HTTPException(409, { message: messages.appointment.unknownContact })
        }
        throw error
      },
    )

    return c.json(created, 201)
  })

  .patch(
    '/:appointmentId',
    validate('param', appointmentParam),
    validate('json', appointmentPatchSchema),
    async (c) => {
      const updated = await updateAppointment(
        db(),
        tenantId(c),
        c.req.valid('param').appointmentId,
        c.req.valid('json'),
      ).catch((error: unknown) => {
        if (foreignKeyViolationConstraint(error) === 'appointment_contact_tenant_fk') {
          throw new HTTPException(409, { message: messages.appointment.unknownContact })
        }
        throw error
      })

      if (!updated) throw new HTTPException(404, { message: messages.appointment.notFound })
      return c.json(updated)
    },
  )

  /** Only an appointment without a Vorgang; the domain says why. */
  .delete('/:appointmentId', validate('param', appointmentParam), async (c) => {
    const deleted = await deleteAppointment(
      db(),
      tenantId(c),
      c.req.valid('param').appointmentId,
    ).catch((error: unknown) => {
      if (error instanceof AppointmentHasActivityError) {
        throw new HTTPException(409, { message: messages.appointment.hasActivity })
      }
      throw error
    })

    if (!deleted) throw new HTTPException(404, { message: messages.appointment.notFound })
    return c.body(null, 204)
  })
