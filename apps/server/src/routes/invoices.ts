import type { Invoice } from '@praxi/shared'
import {
  billableQuerySchema,
  invoiceCreateSchema,
  invoiceListQuerySchema,
  invoiceUpdateSchema,
} from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { uniqueViolationConstraint } from '../db/errors.js'
import { listBillableItems } from '../domain/billable.js'
import { MissingNumberRangeError } from '../domain/counter.js'
import { finalizeInvoice } from '../domain/finalize-invoice.js'
import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  getStoredPdfPath,
  InvoiceEmptyError,
  InvoiceNotADraftError,
  ItemAlreadyBilledError,
  listInvoices,
  updateInvoice,
} from '../domain/invoice.js'
import { NumberAlreadyIssuedError } from '../domain/number-range.js'
import { loadInvoiceTemplate } from '../domain/practice-settings.js'
import { logger } from '../logger.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'
import { renderInvoicePdf } from '../pdf/render.js'
import { fileStore } from '../storage.js'

const invoiceParam = z.object({ invoiceId: z.uuid() })

function notFound(): never {
  throw new HTTPException(404, { message: messages.invoice.notFound })
}

function translate(error: unknown): never {
  if (error instanceof InvoiceNotADraftError) {
    throw new HTTPException(409, { message: messages.invoice.notADraft })
  }
  if (error instanceof InvoiceEmptyError) {
    throw new HTTPException(409, { message: messages.invoice.empty })
  }
  if (error instanceof ItemAlreadyBilledError) {
    throw new HTTPException(409, { message: messages.invoice.itemAlreadyBilled })
  }
  if (error instanceof NumberAlreadyIssuedError) {
    throw new HTTPException(409, { message: messages.invoice.numberTaken })
  }
  if (error instanceof MissingNumberRangeError) {
    throw new HTTPException(409, { message: messages.numberRange.missing })
  }
  // Two finalizations racing for the same number, or a range edited backwards.
  const constraint = uniqueViolationConstraint(error)
  if (constraint === 'invoice_number_key' || constraint === 'invoice_number_value_key') {
    throw new HTTPException(409, { message: messages.invoice.numberTaken })
  }
  throw error
}

/** The bytes of an invoice, rendered against the current template. */
async function render(tenant: string, invoice: Invoice): Promise<Uint8Array> {
  return renderInvoicePdf(invoice, await loadInvoiceTemplate(db(), tenant, fileStore()))
}

function pdfResponse(bytes: Uint8Array, fileName: string, inline: boolean): Response {
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}

export const invoicesRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', validate('query', invoiceListQuerySchema), async (c) => {
    return c.json(await listInvoices(db(), tenantId(c), c.req.valid('query')))
  })

  /** Static segment before `/:invoiceId`, which is validated as a uuid. */
  .get('/billable', validate('query', billableQuerySchema), async (c) => {
    return c.json(await listBillableItems(db(), tenantId(c), c.req.valid('query').contactId))
  })

  .post('/', validate('json', invoiceCreateSchema), async (c) => {
    const created = await createInvoice(db(), tenantId(c), c.req.valid('json')).catch(translate)
    return c.json(created, 201)
  })

  .get('/:invoiceId', validate('param', invoiceParam), async (c) => {
    const found = await getInvoice(db(), tenantId(c), c.req.valid('param').invoiceId)
    return found ? c.json(found) : notFound()
  })

  .put(
    '/:invoiceId',
    validate('param', invoiceParam),
    validate('json', invoiceUpdateSchema),
    async (c) => {
      const updated = await updateInvoice(
        db(),
        tenantId(c),
        c.req.valid('param').invoiceId,
        c.req.valid('json'),
      ).catch(translate)

      return updated ? c.json(updated) : notFound()
    },
  )

  .delete('/:invoiceId', validate('param', invoiceParam), async (c) => {
    const deleted = await deleteInvoice(db(), tenantId(c), c.req.valid('param').invoiceId).catch(
      translate,
    )
    return deleted ? c.body(null, 204) : notFound()
  })

  /**
   * The preview. Renders into memory and hands the bytes over — no file under
   * `data/invoices/`, no path, no hash. Nothing here may leave a trace: the
   * only document that is ever written is the one created by finalizing.
   */
  .get('/:invoiceId/preview', validate('param', invoiceParam), async (c) => {
    const found = await getInvoice(db(), tenantId(c), c.req.valid('param').invoiceId)
    if (!found) notFound()

    const bytes = await render(tenantId(c), found)
    return pdfResponse(bytes, `${found.number ?? 'Entwurf'}.pdf`, true)
  })

  .post('/:invoiceId/finalize', validate('param', invoiceParam), async (c) => {
    const tenant = tenantId(c)
    const finalized = await finalizeInvoice(
      db(),
      tenant,
      fileStore(),
      c.req.valid('param').invoiceId,
      (invoice) => render(tenant, invoice),
    ).catch(translate)

    return finalized ? c.json(finalized) : notFound()
  })

  /** The stored document, served from disk and never re-rendered (rule 9). */
  .get('/:invoiceId/pdf', validate('param', invoiceParam), async (c) => {
    const invoiceId = c.req.valid('param').invoiceId
    const found = await getInvoice(db(), tenantId(c), invoiceId)
    if (!found) notFound()
    if (found.status === 'draft') {
      throw new HTTPException(409, { message: messages.invoice.notADraft })
    }

    const path = await getStoredPdfPath(db(), tenantId(c), invoiceId)
    if (!path) notFound()

    let bytes: Uint8Array
    try {
      bytes = await fileStore().read(path)
    } catch {
      logger().error({ invoiceId }, 'invoice pdf missing on disk')
      throw new HTTPException(410, { message: messages.invoice.pdfMissing })
    }

    return pdfResponse(bytes, `${found.number}.pdf`, true)
  })
