import { paymentInputSchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { raisedMessage } from '../db/errors.js'
import {
  addPayment,
  deletePayment,
  InvoiceNotPayableError,
  listPayments,
} from '../domain/payment.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'

/**
 * Payments hang under the invoice they belong to, because without one they do
 * not exist — the same shape as a contact's relations.
 *
 * There was a second resource here until D7, `/api/receivables`: the same
 * invoices, narrowed server-side to what was still owed. It went when the
 * Bezahlübersicht merged into the invoice list, which needs drafts as well
 * and so reads `/api/invoices` — leaving `listReceivables` with no caller.
 * The rule it carried survives as `matchesInvoiceListFilter` in
 * `packages/shared`, applied in the client now.
 */

const invoiceParam = z.object({ invoiceId: z.uuid() })
const paymentParam = z.object({ invoiceId: z.uuid(), paymentId: z.uuid() })

function translate(error: unknown): never {
  if (error instanceof InvoiceNotPayableError) {
    throw new HTTPException(409, { message: messages.payment.draftNotPayable })
  }
  // The trigger, for anything that got past the domain check.
  if (raisedMessage(error) === 'a draft cannot be paid') {
    throw new HTTPException(409, { message: messages.payment.draftNotPayable })
  }
  throw error
}

export const paymentsRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/:invoiceId/payments', validate('param', invoiceParam), async (c) => {
    return c.json(await listPayments(db(), tenantId(c), c.req.valid('param').invoiceId))
  })

  .post(
    '/:invoiceId/payments',
    validate('param', invoiceParam),
    validate('json', paymentInputSchema),
    async (c) => {
      const created = await addPayment(
        db(),
        tenantId(c),
        c.req.valid('param').invoiceId,
        c.req.valid('json'),
      ).catch(translate)

      if (!created) throw new HTTPException(404, { message: messages.invoice.notFound })
      return c.json(created, 201)
    },
  )

  .delete('/:invoiceId/payments/:paymentId', validate('param', paymentParam), async (c) => {
    const { invoiceId, paymentId } = c.req.valid('param')
    const deleted = await deletePayment(db(), tenantId(c), invoiceId, paymentId)
    if (!deleted) throw new HTTPException(404, { message: messages.payment.notFound })
    return c.body(null, 204)
  })
