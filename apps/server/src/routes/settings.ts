import { practiceSettingsInputSchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { MAX_UPLOAD_BYTES } from '../domain/file-type.js'
import {
  getPracticeSettings,
  invoiceTemplatePath,
  loadInvoiceTemplate,
  setInvoiceTemplatePath,
  updatePracticeSettings,
} from '../domain/practice-settings.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'
import { assertUsableTemplate, InvalidTemplateError } from '../pdf/overlay.js'
import { fileStore } from '../storage.js'

export const settingsRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', async (c) => {
    const settings = await getPracticeSettings(db(), tenantId(c))
    if (!settings) throw new HTTPException(404, { message: messages.settings.missing })

    return c.json(settings)
  })

  .put('/', validate('json', practiceSettingsInputSchema), async (c) => {
    const settings = await updatePracticeSettings(db(), tenantId(c), c.req.valid('json'))
    if (!settings) throw new HTTPException(404, { message: messages.settings.missing })

    return c.json(settings)
  })

  /**
   * The letterhead the invoice content is overlaid onto (CLAUDE.md rule 11).
   *
   * One page backs every page of a document; two pages mean page 1 backs the
   * first sheet and page 2 all following ones. Anything else is rejected here
   * rather than when an invoice is being finalized, because here it can still
   * be replaced.
   *
   * Replacing the template changes nothing about invoices that already exist —
   * their PDFs are on disk and are never re-rendered.
   */
  .post('/invoice-template', async (c) => {
    const declaredLength = Number(c.req.header('content-length') ?? '0')
    if (declaredLength > MAX_UPLOAD_BYTES) {
      throw new HTTPException(413, { message: messages.note.fileTooLarge })
    }

    const body = await c.req.parseBody()
    const file = body.file
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: messages.note.fileMissing })
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    let pages: number
    try {
      pages = await assertUsableTemplate(bytes)
    } catch (error) {
      if (error instanceof InvalidTemplateError) {
        throw new HTTPException(415, {
          message:
            error.reason === 'too-many-pages'
              ? messages.invoice.templateTooManyPages
              : error.reason === 'empty'
                ? messages.invoice.templateEmpty
                : messages.invoice.templateNotAPdf,
        })
      }
      throw error
    }

    const tenant = tenantId(c)
    const path = invoiceTemplatePath(tenant)
    await fileStore().write(path, bytes)
    await setInvoiceTemplatePath(db(), tenant, path)

    return c.json({ pages }, 201)
  })

  .get('/invoice-template', async (c) => {
    const template = await loadInvoiceTemplate(db(), tenantId(c), fileStore()).catch(() => null)
    if (!template) throw new HTTPException(404, { message: messages.invoice.templateMissing })

    return new Response(template, {
      headers: {
        'Content-Type': 'application/pdf',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': "inline; filename*=UTF-8''Rechnungsvorlage.pdf",
      },
    })
  })
