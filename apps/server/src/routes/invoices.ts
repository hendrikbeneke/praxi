import type { Invoice } from '@praxi/shared'
import {
  billableQuerySchema,
  invoiceCollectSchema,
  invoiceCreateSchema,
  invoiceListQuerySchema,
  invoiceSummaryQuerySchema,
  invoiceUpdateSchema,
  toBerlinDate,
} from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import type { Database } from '../db/client.js'
import { uniqueViolationConstraint } from '../db/errors.js'
import { listBillableItems } from '../domain/billable.js'
import {
  CancellationNotCancellableError,
  cancelInvoice,
  InvoiceAlreadyCancelledError,
  InvoiceNotFinalizedError,
} from '../domain/cancel-invoice.js'
import { MissingNumberRangeError } from '../domain/counter.js'
import { finalizeInvoice } from '../domain/finalize-invoice.js'
import {
  billingRecipientsOf,
  collectBillableItems,
  createInvoice,
  deleteInvoice,
  getInvoice,
  getStoredPdfPath,
  InvoiceEmptyError,
  InvoiceNotADraftError,
  ItemAlreadyBilledError,
  invoiceSummary,
  listInvoices,
  UnknownRecipientError,
  updateInvoice,
} from '../domain/invoice.js'
import { NumberAlreadyIssuedError } from '../domain/number-range.js'
import { loadInvoiceTemplate } from '../domain/practice-settings.js'
import { logger } from '../logger.js'
import { messages } from '../messages.js'
import { tenantId } from '../middleware/tenant.js'
import { database } from '../middleware/tenant-db.js'
import { validate } from '../middleware/validate.js'
import { renderInvoicePdf } from '../pdf/render.js'
import { fileStore } from '../storage.js'

const invoiceParam = z.object({ invoiceId: z.uuid() })

/** "Betrag erhalten": finalize and record payment of the full amount by card,
 *  dated to the invoice, in one transaction. */
const finalizeQuery = z.object({
  settle: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

function notFound(): never {
  throw new HTTPException(404, { message: messages.invoice.notFound })
}

function translate(error: unknown): never {
  if (error instanceof InvoiceNotFinalizedError) {
    throw new HTTPException(409, { message: messages.invoice.notFinalized })
  }
  if (error instanceof InvoiceAlreadyCancelledError) {
    throw new HTTPException(409, { message: messages.invoice.alreadyCancelled })
  }
  if (error instanceof CancellationNotCancellableError) {
    throw new HTTPException(409, { message: messages.invoice.cancellationNotCancellable })
  }
  if (error instanceof InvoiceNotADraftError) {
    throw new HTTPException(409, { message: messages.invoice.notADraft })
  }
  if (error instanceof InvoiceEmptyError) {
    throw new HTTPException(409, { message: messages.invoice.empty })
  }
  if (error instanceof ItemAlreadyBilledError) {
    throw new HTTPException(409, { message: messages.invoice.itemAlreadyBilled })
  }
  if (error instanceof UnknownRecipientError) {
    throw new HTTPException(409, { message: messages.invoice.unknownRecipient })
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
async function render(db: Database, tenant: string, invoice: Invoice): Promise<Uint8Array> {
  return renderInvoicePdf(invoice, await loadInvoiceTemplate(db, tenant, fileStore()))
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
  .get('/', validate('query', invoiceListQuerySchema), async (c) => {
    return c.json(await listInvoices(database(c), tenantId(c), c.req.valid('query')))
  })

  /** Static segment before `/:invoiceId`, which is validated as a uuid. */
  .get('/billable', validate('query', billableQuerySchema), async (c) => {
    return c.json(await listBillableItems(database(c), tenantId(c), c.req.valid('query').contactId))
  })

  /**
   * The figures above the list — the chips and, on Zahlungen, the two tiles
   * (B3). Static segment, like `/billable` above.
   *
   * Its own request rather than a fold over the rows the list returned: that
   * list is capped, so every number drawn from it was the number in the first
   * page. It takes a contact and deliberately no filter — the counts describe
   * the selection and not the narrowing, so pressing a chip cannot change the
   * number written on it.
   */
  .get('/summary', validate('query', invoiceSummaryQuerySchema), async (c) => {
    const today = toBerlinDate(new Date().toISOString())
    return c.json(await invoiceSummary(database(c), tenantId(c), c.req.valid('query'), today))
  })

  /** Who an invoice for this contact may be addressed to — the contact's
   *  `billing_recipient` relations, and the same list the update validates
   *  against. Static segment, like `/billable` above. */
  .get('/recipients', validate('query', billableQuerySchema), async (c) => {
    const contactId = c.req.valid('query').contactId
    if (!contactId) return c.json([])
    return c.json(await billingRecipientsOf(database(c), tenantId(c), contactId))
  })

  .post('/', validate('json', invoiceCreateSchema), async (c) => {
    const created = await createInvoice(database(c), tenantId(c), c.req.valid('json')).catch(
      translate,
    )
    return c.json(created, 201)
  })

  /**
   * Billable items into drafts — one per contact, appended to the draft a
   * contact already has. The button on a single activity and the bulk action
   * on the billable list are the same call with a different number of ids.
   */
  .post('/collect', validate('json', invoiceCollectSchema), async (c) => {
    const results = await collectBillableItems(database(c), tenantId(c), c.req.valid('json')).catch(
      translate,
    )
    return c.json(results, 201)
  })

  .get('/:invoiceId', validate('param', invoiceParam), async (c) => {
    const found = await getInvoice(database(c), tenantId(c), c.req.valid('param').invoiceId)
    return found ? c.json(found) : notFound()
  })

  .put(
    '/:invoiceId',
    validate('param', invoiceParam),
    validate('json', invoiceUpdateSchema),
    async (c) => {
      const updated = await updateInvoice(
        database(c),
        tenantId(c),
        c.req.valid('param').invoiceId,
        c.req.valid('json'),
      ).catch(translate)

      return updated ? c.json(updated) : notFound()
    },
  )

  .delete('/:invoiceId', validate('param', invoiceParam), async (c) => {
    const deleted = await deleteInvoice(
      database(c),
      tenantId(c),
      c.req.valid('param').invoiceId,
    ).catch(translate)
    return deleted ? c.body(null, 204) : notFound()
  })

  /**
   * The preview. Renders into memory and hands the bytes over — no file under
   * `data/invoices/`, no path, no hash. Nothing here may leave a trace: the
   * only document that is ever written is the one created by finalizing.
   */
  .get('/:invoiceId/preview', validate('param', invoiceParam), async (c) => {
    const found = await getInvoice(database(c), tenantId(c), c.req.valid('param').invoiceId)
    if (!found) notFound()

    const bytes = await render(database(c), tenantId(c), found)
    return pdfResponse(bytes, `${found.number ?? 'Entwurf'}.pdf`, true)
  })

  /**
   * Finalizing, optionally settling in the same transaction — the card put
   * through right after the session (rule 9). `settle` is a query flag rather
   * than a second route, because it is the same operation with two extra
   * steps; see `finalizeInvoice`.
   *
   * The response carries `paidTemplateUsed` so the client can say when the
   * invoice was settled but no "already paid" outro block is configured — the
   * document then still asks for payment, and noticing that months later is
   * worse than a sentence now.
   */
  .post(
    '/:invoiceId/finalize',
    validate('param', invoiceParam),
    validate('query', finalizeQuery),
    async (c) => {
      const tenant = tenantId(c)
      const { settle } = c.req.valid('query')

      const finalized = await finalizeInvoice(
        database(c),
        tenant,
        fileStore(),
        c.req.valid('param').invoiceId,
        (invoice) => render(database(c), tenant, invoice),
        settle ? { method: 'card' } : undefined,
      ).catch(translate)

      if (!finalized) notFound()
      return c.json({ ...finalized.invoice, paidTemplateUsed: finalized.paidTemplateUsed })
    },
  )

  /**
   * Cancelling issues a second document; the original keeps its number and its
   * PDF and only gains a status and a reference (rule 9). What comes back is
   * the cancellation document, because that is what the practitioner wants to
   * look at next.
   */
  .post('/:invoiceId/cancel', validate('param', invoiceParam), async (c) => {
    const tenant = tenantId(c)
    const cancellation = await cancelInvoice(
      database(c),
      tenant,
      fileStore(),
      c.req.valid('param').invoiceId,
      (invoice) => render(database(c), tenant, invoice),
    ).catch(translate)

    return cancellation ? c.json(cancellation) : notFound()
  })

  /** The stored document, served from disk and never re-rendered (rule 9). */
  .get('/:invoiceId/pdf', validate('param', invoiceParam), async (c) => {
    const invoiceId = c.req.valid('param').invoiceId
    const found = await getInvoice(database(c), tenantId(c), invoiceId)
    if (!found) notFound()
    if (found.status === 'draft') {
      throw new HTTPException(409, { message: messages.invoice.notADraft })
    }

    const path = await getStoredPdfPath(database(c), tenantId(c), invoiceId)
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
