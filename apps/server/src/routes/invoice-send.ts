import { invoiceSendInputSchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import {
  InvoiceNotSendableError,
  listSends,
  prepareSend,
  sendInvoice,
} from '../domain/invoice-send.js'
import { loadSmtpConfig } from '../domain/smtp-settings.js'
import { logger } from '../logger.js'
import { createSmtpTransport } from '../mail/transport.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'
import { SecretKeyMismatchError } from '../secrets.js'
import { fileStore } from '../storage.js'

const invoiceParam = z.object({ invoiceId: z.uuid() })

/**
 * Sending an invoice. Hangs under `/api/invoices` next to the payments, so the
 * two chains share the prefix.
 *
 * Synchronous on purpose (see `domain/invoice-send.ts`): sending is an act,
 * and the answer to "did it go out" is wanted at the moment the button is
 * pressed. The attempt is written to the log before this route answers, so a
 * client that navigated away loses only its response — the record is there.
 */
export const invoiceSendRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  /** What the dialog opens with: recipient, subject and body with the
   *  placeholders already filled, plus why it cannot be sent if it cannot. */
  .get('/:invoiceId/send-draft', validate('param', invoiceParam), async (c) => {
    const draft = await prepareSend(db(), tenantId(c), c.req.valid('param').invoiceId)
    if (!draft) throw new HTTPException(404, { message: messages.invoice.notFound })
    return c.json(draft)
  })

  .get('/:invoiceId/sends', validate('param', invoiceParam), async (c) => {
    return c.json(await listSends(db(), tenantId(c), c.req.valid('param').invoiceId))
  })

  .post(
    '/:invoiceId/send',
    validate('param', invoiceParam),
    validate('json', invoiceSendInputSchema),
    async (c) => {
      const tenant = tenantId(c)
      const invoiceId = c.req.valid('param').invoiceId

      const smtp = await loadSmtpConfig(db(), tenant).catch((error: unknown) => {
        if (error instanceof SecretKeyMismatchError) {
          throw new HTTPException(409, { message: messages.smtp.keyMismatch })
        }
        throw error
      })
      if (!smtp) throw new HTTPException(409, { message: messages.smtp.notConfigured })

      const result = await sendInvoice(
        db(),
        tenant,
        c.get('user').id,
        invoiceId,
        c.req.valid('json'),
        {
          transport: createSmtpTransport(smtp.config),
          from: smtp.from,
          store: fileStore(),
        },
      ).catch((error: unknown) => {
        if (error instanceof InvoiceNotSendableError) {
          throw new HTTPException(409, { message: error.reason })
        }
        throw error
      })

      // Ids and the outcome only. The recipient, the subject and the server's
      // answer stay in `invoice_send` (CLAUDE.md rule 12).
      logger().info({ invoiceId, ok: result.ok }, 'invoice mail attempted')

      /**
       * A refused delivery is not a failure of this request: the attempt ran,
       * it is recorded, and the answer carries what the server said. The
       * screen decides how to show it — 502 here would lose the log entry's id
       * on the way through the error envelope.
       */
      return c.json(result)
    },
  )
