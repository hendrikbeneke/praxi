import { createHash } from 'node:crypto'
import type { Invoice } from '@praxi/shared'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { LOAD_OPTIONS } from './overlay.js'
import { renderInvoicePdf } from './render.js'

/**
 * The PDF has to be a pure function of the invoice and the template.
 *
 * Both layers embed metadata that would otherwise vary per run —
 * `/CreationDate`, `/ModificationDate`, `/Producer`. All of them are pinned in
 * `render.ts` and `overlay.ts`, which is what lets this test compare two
 * complete renders instead of excluding bytes from the comparison. Excluding
 * them would have hidden any *other* source of variance, which is exactly what
 * a determinism test is supposed to find.
 */

const invoice: Invoice = {
  id: '019fe362-73c4-77e4-af42-33388a5b6c5d',
  contactId: '019fe362-73c4-77e4-af42-33388a5b6c5e',
  contactName: 'Erika Testperson',
  contactNumber: 1,
  type: 'invoice',
  status: 'finalized',
  number: 'RH-2026-001',
  numberPrefix: 'RH-2026-',
  numberValue: 1,
  invoiceDate: '2026-08-09',
  paymentTermDays: 14,
  cancelsInvoiceId: null,
  cancelsInvoiceNumber: null,
  cancelledByInvoiceId: null,
  cancelledByInvoiceNumber: null,
  recipientSnapshot: {
    contactNumber: 1,
    name: 'Erika Testperson',
    contactPerson: null,
    street: 'Teststraße',
    houseNumber: '1',
    postalCode: '12345',
    city: 'Teststadt',
    country: 'DE',
    vatId: null,
  },
  introText: 'für die erbrachten Leistungen erlaube ich mir zu berechnen:',
  outroText: 'Umsatzsteuerfrei nach § 4 Nr. 14 lit. a UStG.',
  diagnosis: null,
  totalCents: 27_000,
  // Not printed — the document says what is owed, not what has arrived.
  paidCents: 0,
  lastSentAt: null,
  lastSentTo: null,
  pdfHash: null,
  finalizedAt: '2026-08-09T10:00:00.000Z',
  lines: [
    {
      id: '019fe362-73c4-77e4-af42-33388a5b6c60',
      position: 0,
      activityItemId: null,
      description: 'Erstgespräch',
      feeCode: null,
      dateOfService: '2026-08-09',
      quantity: 1,
      unitPriceCents: 13_500,
      amountCents: 13_500,
    },
    {
      id: '019fe362-73c4-77e4-af42-33388a5b6c61',
      position: 1,
      activityItemId: null,
      description: 'Folgesitzung',
      feeCode: null,
      dateOfService: '2026-08-10',
      quantity: 1,
      unitPriceCents: 13_500,
      amountCents: 13_500,
    },
  ],
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** A minimal letterhead, built rather than checked in — a fixture PDF in the
 *  repository would be a binary nobody can review in a diff. */
async function makeTemplate(pageCount: number): Promise<Uint8Array> {
  const document = await PDFDocument.create({ updateMetadata: false })
  for (let index = 0; index < pageCount; index += 1) {
    const page = document.addPage([595.28, 841.89])
    page.drawText(index === 0 ? 'Briefkopf' : 'Folgeseite', { x: 40, y: 800, size: 12 })
  }
  document.setCreationDate(new Date('2026-01-01T00:00:00.000Z'))
  document.setModificationDate(new Date('2026-01-01T00:00:00.000Z'))
  return document.save({ useObjectStreams: false })
}

describe('renderInvoicePdf', () => {
  it('produces the same bytes twice', async () => {
    const first = await renderInvoicePdf(invoice, null)
    const second = await renderInvoicePdf(invoice, null)

    expect(sha256(first)).toBe(sha256(second))
  })

  it('produces a PDF', async () => {
    const bytes = await renderInvoicePdf(invoice, null)
    expect(Buffer.from(bytes.subarray(0, 5)).toString('utf8')).toBe('%PDF-')

    const document = await PDFDocument.load(bytes, LOAD_OPTIONS)
    expect(document.getPageCount()).toBeGreaterThanOrEqual(1)
    expect(document.getProducer()).toBe('praxi')
    // Pinned to the invoice date, never to the clock.
    expect(document.getCreationDate()?.toISOString()).toBe('2026-08-09T00:00:00.000Z')
  })

  it('stays deterministic with a template', async () => {
    const template = await makeTemplate(1)
    const first = await renderInvoicePdf(invoice, template)
    const second = await renderInvoicePdf(invoice, template)

    expect(sha256(first)).toBe(sha256(second))
    expect(sha256(first)).not.toBe(sha256(await renderInvoicePdf(invoice, null)))
  })

  it('changes when the invoice changes', async () => {
    const other = { ...invoice, totalCents: 1 }
    expect(sha256(await renderInvoicePdf(other, null))).not.toBe(
      sha256(await renderInvoicePdf(invoice, null)),
    )
  })

  /**
   * The diagnosis belongs on the document (CLAUDE.md rule 12 lists the PDF as
   * one of the two places it may appear). It was stored and editable from D1
   * on but never printed — the data model claimed otherwise, which is what
   * D7 found and closed.
   */
  it('prints the diagnosis', async () => {
    const withDiagnosis = { ...invoice, diagnosis: 'F43.2' }
    expect(sha256(await renderInvoicePdf(withDiagnosis, null))).not.toBe(
      sha256(await renderInvoicePdf(invoice, null)),
    )
  })

  /** A cancellation takes a document back rather than making a fresh claim,
   *  which is why it carries no intro text either. */
  it('leaves the diagnosis off a cancellation', async () => {
    const cancellation: Invoice = {
      ...invoice,
      type: 'cancellation_invoice',
      introText: null,
      outroText: null,
      diagnosis: null,
    }
    const withDiagnosis = { ...cancellation, diagnosis: 'F43.2' }

    expect(sha256(await renderInvoicePdf(withDiagnosis, null))).toBe(
      sha256(await renderInvoicePdf(cancellation, null)),
    )
  })

  /**
   * The address block prints the country's **name**, never its ISO code (K4).
   *
   * Proved without reading the text out of the PDF: a recipient stored as `AT`
   * and one stored as the literal `Österreich` must render to the same bytes,
   * because `countryName` resolves the first and leaves the second alone. If
   * the renderer printed the raw column, the two would differ — which is
   * exactly what it did before.
   */
  it('prints the country name, not its code', async () => {
    const at: Invoice = {
      ...invoice,
      recipientSnapshot: { ...invoice.recipientSnapshot, country: 'AT' },
    }
    const spelledOut: Invoice = {
      ...invoice,
      recipientSnapshot: { ...invoice.recipientSnapshot, country: 'Österreich' },
    }

    expect(sha256(await renderInvoicePdf(at, null))).toBe(
      sha256(await renderInvoicePdf(spelledOut, null)),
    )
    // And a foreign recipient is not the same document as a German one, which
    // is what makes the equality above worth anything.
    expect(sha256(await renderInvoicePdf(at, null))).not.toBe(
      sha256(await renderInvoicePdf(invoice, null)),
    )
  })

  /** Rule 11: one template page backs every page; two pages mean page 1 backs
   *  the first sheet and page 2 all following ones. */
  it('keeps the page count of the content, whatever the template has', async () => {
    const long: Invoice = {
      ...invoice,
      lines: Array.from({ length: 60 }, (_, index) => ({
        id: `019fe362-73c4-77e4-af42-${String(index).padStart(12, '0')}`,
        position: index,
        activityItemId: null,
        description: `Sitzung ${index + 1}`,
        feeCode: null,
        dateOfService: '2026-08-09',
        quantity: 1,
        unitPriceCents: 13_500,
        amountCents: 13_500,
      })),
    }

    const plain = await PDFDocument.load(await renderInvoicePdf(long, null), LOAD_OPTIONS)
    expect(plain.getPageCount()).toBeGreaterThan(1)

    for (const pages of [1, 2]) {
      const backed = await PDFDocument.load(
        await renderInvoicePdf(long, await makeTemplate(pages)),
        LOAD_OPTIONS,
      )
      expect(backed.getPageCount()).toBe(plain.getPageCount())
    }
  })
})
