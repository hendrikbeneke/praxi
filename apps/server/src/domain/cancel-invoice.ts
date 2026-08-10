import { createHash } from 'node:crypto'
import type { Invoice } from '@praxi/shared'
import { formatNumber, sumLines, toBerlinDate } from '@praxi/shared'
import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { invoice, invoiceLine, numberRange } from '../db/schema.js'
import { newId } from '../id.js'
import { nextNumber } from './counter.js'
import type { FileStore } from './file-store.js'
import { INVOICE_RANGE_CODE, pdfPathFor } from './finalize-invoice.js'
import { getInvoice, loadContactRow, recipientSnapshotOf } from './invoice.js'
import { assertNumberFree } from './number-range.js'

/**
 * Cancelling an invoice (CLAUDE.md rule 9).
 *
 * A cancellation is not an edit. The original stays exactly as it was printed,
 * apart from its status and the reference to the document that took it back;
 * what is issued is a **second document** with its own number from the same
 * range, carrying the same lines at negated prices.
 *
 * ## The shape, and why it is the same as finalizeInvoice
 *
 * The document cannot be inserted finished. `protect_finalized_invoice_line`
 * refuses a line under anything that is not a draft, and `invoice_draft_fields`
 * refuses a draft that carries a number — so there is no order in which a
 * finished cancellation invoice can be written row by row. It is therefore
 * built the way a finalization is built: rows first as a draft, the document
 * assembled in memory, rendered, and one statement that stores it and moves it
 * to `finalized` at the same time.
 *
 * The file is written inside the transaction, and the `catch` unlinks it. The
 * reasoning is spelled out at `finalizeInvoice` and holds here without change:
 * an orphaned file can be found and deleted, a finalized document that was
 * never rendered cannot be repaired.
 *
 * ## What happens to the items
 *
 * Nothing, directly. The cancellation's lines repeat the original's
 * `activity_item_id` so the document shows what it takes back, and the
 * billable query excludes both cancelled invoices and cancellation documents —
 * which is exactly what puts the items back in the pool. No replacement draft
 * is created; rule 9 leaves that decision to the practitioner.
 *
 * ## Intro and outro stay empty
 *
 * Neither the original's texts nor templates of their own. The original's
 * outro asks for payment by a date, which is wrong on a document that takes
 * the demand back, and its intro announces services being charged. The VAT
 * note that rule 10 puts in the outro is the strongest case against copying:
 * carrying a tax statement over to a document it was not written for is closer
 * to inventing one than leaving it out is, and rule 10 says the software does
 * not write tax statements.
 *
 * What the document does carry is a generated line naming the invoice it
 * cancels. That is part of the document, like the title, and lives in
 * `messages.pdf` rather than in a text template.
 */

export class InvoiceNotFinalizedError extends Error {
  constructor() {
    super('only a finalized invoice can be cancelled')
    this.name = 'InvoiceNotFinalizedError'
  }
}

export class InvoiceAlreadyCancelledError extends Error {
  constructor() {
    super('invoice is already cancelled')
    this.name = 'InvoiceAlreadyCancelledError'
  }
}

export class CancellationNotCancellableError extends Error {
  constructor() {
    super('a cancellation invoice cannot be cancelled')
    this.name = 'CancellationNotCancellableError'
  }
}

export async function cancelInvoice(
  database: Database,
  tenantId: string,
  store: FileStore,
  invoiceId: string,
  renderPdf: (invoice: Invoice) => Promise<Uint8Array>,
  now: Date = new Date(),
): Promise<Invoice | null> {
  let writtenPath: string | null = null

  try {
    const cancellationId = await database.transaction(async (tx) => {
      const original = await getInvoice(tx, tenantId, invoiceId)
      if (!original) return null

      // Locked for the duration, so two cancellations of the same invoice
      // cannot both get past the checks below.
      const [locked] = await tx
        .select({
          status: invoice.status,
          type: invoice.type,
          cancelledByInvoiceId: invoice.cancelledByInvoiceId,
        })
        .from(invoice)
        .where(and(eq(invoice.tenantId, tenantId), eq(invoice.id, invoiceId)))
        .for('update')
        .limit(1)

      if (!locked) return null
      if (locked.type === 'cancellation_invoice') throw new CancellationNotCancellableError()
      if (locked.cancelledByInvoiceId !== null) throw new InvoiceAlreadyCancelledError()
      if (locked.status !== 'finalized') throw new InvoiceNotFinalizedError()

      const id = newId()
      const invoiceDate = toBerlinDate(now.toISOString())

      // 1 — the number, from the same range as the invoices (rule 8). No
      // separate range: the two document types are one sequence.
      const [range] = await tx
        .select({ prefix: numberRange.prefix, padding: numberRange.padding })
        .from(numberRange)
        .where(and(eq(numberRange.tenantId, tenantId), eq(numberRange.code, INVOICE_RANGE_CODE)))
        .limit(1)

      const value = await nextNumber(tx, tenantId, INVOICE_RANGE_CODE)
      const prefix = range?.prefix ?? ''
      const formatted = formatNumber(prefix, range?.padding ?? 1, value)
      await assertNumberFree(tx, tenantId, formatted)

      // 2 — the document as a draft, so its lines may be written at all.
      await tx.insert(invoice).values({
        id,
        tenantId,
        contactId: original.contactId,
        type: 'cancellation_invoice',
        status: 'draft',
        invoiceDate,
        paymentTermDays: original.paymentTermDays,
        cancelsInvoiceId: invoiceId,
      })

      /**
       * The lines, with the **unit price** negated rather than the quantity:
       * `invoice_line_quantity_positive` forbids a negative quantity, while
       * the unit price deliberately has no sign restriction, and `amount_cents`
       * is generated from the two.
       */
      const lines = original.lines.map((line) => ({
        id: newId(),
        tenantId,
        invoiceId: id,
        position: line.position,
        activityItemId: line.activityItemId,
        description: line.description,
        feeCode: line.feeCode,
        dateOfService: line.dateOfService,
        quantity: line.quantity,
        unitPriceCents: -line.unitPriceCents,
      }))

      if (lines.length > 0) await tx.insert(invoiceLine).values(lines)

      const contactRow = await loadContactRow(tx, tenantId, original.contactId)
      if (!contactRow) throw new Error('invoice references a contact that does not exist')

      // 3 — the finished document, in memory. What is rendered is what is
      // stored, down to the recipient.
      const recipientSnapshot = recipientSnapshotOf(contactRow)
      const finalizedAt = now
      const snapshot: Invoice = {
        id,
        contactId: original.contactId,
        contactName: recipientSnapshot.name,
        contactNumber: recipientSnapshot.contactNumber,
        type: 'cancellation_invoice',
        status: 'finalized',
        number: formatted,
        numberPrefix: prefix,
        numberValue: value,
        invoiceDate,
        paymentTermDays: original.paymentTermDays,
        recipientSnapshot,
        introText: null,
        outroText: null,
        totalCents: sumLines(lines),
        pdfHash: null,
        finalizedAt: finalizedAt.toISOString(),
        cancelsInvoiceId: invoiceId,
        cancelsInvoiceNumber: original.number,
        cancelledByInvoiceId: null,
        cancelledByInvoiceNumber: null,
        lines: lines.map((line) => ({
          id: line.id,
          position: line.position,
          activityItemId: line.activityItemId,
          description: line.description,
          feeCode: line.feeCode,
          dateOfService: line.dateOfService,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          amountCents: line.quantity * line.unitPriceCents,
        })),
      }

      // 4 — render and write. The only step outside the database.
      const path = pdfPathFor(invoiceDate, formatted)
      const bytes = await renderPdf(snapshot)
      writtenPath = path
      await store.write(path, bytes)

      // 5 — one statement, and it is the one that finalizes the document.
      await tx
        .update(invoice)
        .set({
          number: formatted,
          numberPrefix: prefix,
          numberValue: value,
          recipientSnapshot,
          totalCents: snapshot.totalCents,
          finalizedAt,
          pdfPath: path,
          pdfHash: createHash('sha256').update(bytes).digest('hex'),
          status: 'finalized',
        })
        .where(eq(invoice.id, id))

      /**
       * 6 — the original. Status and reference in one statement, because
       * `invoice_cancelled_state` ties them together and would reject either
       * on its own. The deferred trigger `invoice_cancellation_pair` checks at
       * COMMIT that both ends name each other.
       */
      await tx
        .update(invoice)
        .set({ status: 'cancelled', cancelledByInvoiceId: id })
        .where(and(eq(invoice.tenantId, tenantId), eq(invoice.id, invoiceId)))

      return id
    })

    return cancellationId ? getInvoice(database, tenantId, cancellationId) : null
  } catch (error) {
    // The transaction rolled back, so the file it wrote points at nothing.
    if (writtenPath) await store.remove(writtenPath).catch(() => {})
    throw error
  }
}
