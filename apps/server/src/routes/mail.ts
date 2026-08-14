import { emailTemplateInputSchema, moveInputSchema, smtpSettingsInputSchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { uniqueViolationConstraint } from '../db/errors.js'
import {
  createEmailTemplate,
  deleteEmailTemplate,
  listEmailTemplates,
  moveEmailTemplate,
  updateEmailTemplate,
} from '../domain/email-template.js'
import { sendTestMail } from '../domain/invoice-send.js'
import {
  deleteSmtpSettings,
  getSmtpSettings,
  loadSmtpConfig,
  saveSmtpSettings,
} from '../domain/smtp-settings.js'
import { createSmtpTransport } from '../mail/transport.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'
import { EncryptionKeyMismatchError, MissingEncryptionKeyError } from '../secrets.js'

const templateParam = z.object({ templateId: z.uuid() })

/** The two secret-store failures deserve a sentence rather than a 500. */
function translate(error: unknown): never {
  if (error instanceof MissingEncryptionKeyError) {
    throw new HTTPException(409, { message: messages.smtp.encryptionKeyMissing })
  }
  if (error instanceof EncryptionKeyMismatchError) {
    throw new HTTPException(409, { message: messages.smtp.keyMismatch })
  }
  if (uniqueViolationConstraint(error) === 'email_template_tenant_name_key') {
    throw new HTTPException(409, { message: messages.emailTemplate.nameTaken })
  }
  throw error
}

export const smtpRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  /** Never carries a password, in any shape — only whether one is stored. */
  .get('/', async (c) => c.json(await getSmtpSettings(db(), tenantId(c))))

  .put('/', validate('json', smtpSettingsInputSchema), async (c) => {
    const saved = await saveSmtpSettings(db(), tenantId(c), c.req.valid('json')).catch(translate)
    return c.json(saved)
  })

  .delete('/', async (c) => {
    await deleteSmtpSettings(db(), tenantId(c))
    return c.body(null, 204)
  })

  /**
   * The test send.
   *
   * It takes **no body**. The recipient is the configured sender address and
   * cannot be influenced from outside — a button that exists to check the
   * configuration must not double as a way to send something to a mistyped
   * address (CLAUDE.md rule 14).
   *
   * A refused send is not an error of this request: the answer says `ok:
   * false` with the server's message, because "it did not work, and here is
   * what the server said" is the result the practitioner asked for.
   */
  .post('/test', async (c) => {
    const smtp = await loadSmtpConfig(db(), tenantId(c)).catch(translate)
    if (!smtp) throw new HTTPException(409, { message: messages.smtp.notConfigured })

    return c.json(
      await sendTestMail({ transport: createSmtpTransport(smtp.config), from: smtp.from }),
    )
  })

export const emailTemplatesRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', async (c) => c.json(await listEmailTemplates(db(), tenantId(c))))

  .post('/', validate('json', emailTemplateInputSchema), async (c) => {
    const created = await createEmailTemplate(db(), tenantId(c), c.req.valid('json')).catch(
      translate,
    )
    return c.json(created, 201)
  })

  .put(
    '/:templateId',
    validate('param', templateParam),
    validate('json', emailTemplateInputSchema),
    async (c) => {
      const updated = await updateEmailTemplate(
        db(),
        tenantId(c),
        c.req.valid('param').templateId,
        c.req.valid('json'),
      ).catch(translate)

      if (!updated) throw new HTTPException(404, { message: messages.emailTemplate.notFound })
      return c.json(updated)
    },
  )

  .delete('/:templateId', validate('param', templateParam), async (c) => {
    const deleted = await deleteEmailTemplate(db(), tenantId(c), c.req.valid('param').templateId)
    if (!deleted) throw new HTTPException(404, { message: messages.emailTemplate.notFound })
    return c.body(null, 204)
  })

  /** `false` covers an unknown id and a boundary the button should already
   *  have disabled alike — 204 either way, see `contact-types.ts`. */
  .post(
    '/:templateId/move',
    validate('param', templateParam),
    validate('json', moveInputSchema),
    async (c) => {
      await moveEmailTemplate(
        db(),
        tenantId(c),
        c.req.valid('param').templateId,
        c.req.valid('json').delta,
      )
      return c.body(null, 204)
    },
  )
