import type { Invoice } from '@praxi/shared'
import { renderToBuffer } from '@react-pdf/renderer'
import { messages } from '../messages.js'
import { InvoiceDocument, type PdfLabels } from './invoice.js'
import { overlayOnTemplate } from './overlay.js'

/**
 * Rendering an invoice to bytes.
 *
 * The result is a pure function of the invoice and the template: same input,
 * same bytes, every time. That takes deliberate work, because both layers
 * embed metadata that would otherwise vary per run — `/CreationDate`,
 * `/ModificationDate`, `/Producer`. All of them are pinned, and the timestamp
 * comes from the invoice's own date rather than from the clock.
 *
 * Two consequences, both wanted. The preview and the document that is later
 * written to disk are byte-identical, so what was checked on screen is what
 * gets filed. And a test can render twice and compare hashes instead of
 * excluding bytes from the comparison, which would have quietly hidden any
 * other source of variance.
 */

/** Midnight UTC on the invoice date. Never `new Date()`. */
export function pdfTimestamp(invoiceDate: string): Date {
  return new Date(`${invoiceDate}T00:00:00.000Z`)
}

const labels: PdfLabels = messages.pdf

export async function renderInvoicePdf(
  invoice: Invoice,
  template: Uint8Array | null,
): Promise<Uint8Array> {
  const timestamp = pdfTimestamp(invoice.invoiceDate)

  const content = await renderToBuffer(
    <InvoiceDocument invoice={invoice} labels={labels} timestamp={timestamp} />,
  )

  return overlayOnTemplate(new Uint8Array(content), template, timestamp)
}
