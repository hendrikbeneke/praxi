import { createHash } from 'node:crypto'
import type { Invoice, PaymentMethod } from '@praxi/shared'
import { formatNumber, sumLines } from '@praxi/shared'
import { and, asc, eq } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { invoice, invoiceLine, numberRange, payment, textTemplate } from '../db/schema.js'
import { newId } from '../id.js'
import { nextNumber } from './counter.js'
import type { FileStore } from './file-store.js'
import {
  getInvoice,
  InvoiceEmptyError,
  InvoiceNotADraftError,
  loadContactRow,
  recipientSnapshotOf,
} from './invoice.js'
import { assertNumberFree } from './number-range.js'

/**
 * Turning a draft into a document (CLAUDE.md rule 9).
 *
 * ## The order, and why the file is written inside the transaction
 *
 * 1. assign the number from `number_range`, under `FOR UPDATE`
 * 2. build the finished invoice — number, recipient snapshot, total
 * 3. render the PDF and write it to disk
 * 4. write everything to the row in one statement, `status = 'finalized'` last
 * 5. commit
 *
 * Step 3 is the only step that leaves the database, and it deliberately sits
 * *inside* the transaction. The file system knows no rollback, so one of the
 * two failure modes has to be accepted, and they are not equally bad:
 *
 * - In this order a crash can only leave an **orphaned file** — bytes on disk
 *   that no row points at. `pnpm invoices:verify` finds them and they can be
 *   deleted.
 * - The other way round — commit first, write afterwards — a crash leaves a
 *   **finalized invoice without a document**, and that cannot be repaired. A
 *   PDF rendered later is not the same document: the template, the fonts and
 *   this code may all have changed in the meantime, and the stored `pdf_hash`
 *   would no longer match. The only honest answer would be to cancel the
 *   invoice and issue a new one.
 *
 * The `catch` around the transaction unlinks the file it wrote and rethrows,
 * so the ordinary failure leaves nothing behind at all. The path is recorded
 * *before* the write, so even a half-written file is cleaned up.
 *
 * ## Why the row is written once and not twice
 *
 * The obvious shape is two updates — snapshot first, hash after the render.
 * The `invoice_draft_fields` check constraint forbids it, and rightly: it says
 * a draft carries no number and no document, and a row mid-finalization would
 * be exactly that. So the invoice that gets rendered is assembled in memory,
 * and the single statement that stores it is also the one that finalizes it.
 * There is no moment, not even inside the transaction, at which a
 * half-finalized row exists.
 *
 * That also settles a second problem: `status` has to move last anyway,
 * because once the row is finalized `protect_finalized_invoice` refuses every
 * further change — including writing its own hash.
 *
 * ## "Betrag erhalten"
 *
 * The card is put through right after the session and the invoice is handed
 * over settled. That is `settle`, and it is a parameter rather than a second
 * function beside this one: it is the *same* transaction with two extra steps,
 * and a copy of this file for two of them would be the copy that drifts.
 *
 * The order matters and is only correct in one place, which is the second
 * reason it lives here: the outro has to be replaced **before** the render, or
 * the stored text and the printed document say different things. The invoice
 * would then ask for payment by a date on a document that was paid on the
 * spot, and the PDF is never re-rendered.
 *
 * A missing `is_paid_variant` template does not stop it. An outro block is a
 * setting, and "card was taken, print the invoice" must not fail on one; the
 * route reports back whether the text was found so the client can say so.
 */

export const INVOICE_RANGE_CODE = 'invoice'

/** Finalize and record payment of the full amount in one transaction. */
export type SettleOptions = {
  method: PaymentMethod
  /** Dated to the invoice date, not to the clock: the money changed hands
   *  when the document says it did. */
  paidOn?: string
}

export type FinalizeResult = {
  invoice: Invoice
  /** False when `settle` was asked for and no `is_paid_variant` outro block is
   *  configured. The invoice is finalized and paid either way — this is what
   *  lets the client say that the document still asks for payment. */
  paidTemplateUsed: boolean
}

export async function finalizeInvoice(
  database: Database,
  tenantId: string,
  store: FileStore,
  invoiceId: string,
  renderPdf: (invoice: Invoice) => Promise<Uint8Array>,
  settle?: SettleOptions,
): Promise<FinalizeResult | null> {
  let writtenPath: string | null = null
  let paidTemplateUsed = false

  try {
    const finalized = await database.transaction(async (tx) => {
      const draft = await getInvoice(tx, tenantId, invoiceId)
      if (!draft) return false

      // Locked for the duration, so two finalizations of the same draft
      // cannot both get past the status check.
      const [locked] = await tx
        .select({ status: invoice.status })
        .from(invoice)
        .where(and(eq(invoice.tenantId, tenantId), eq(invoice.id, invoiceId)))
        .for('update')
        .limit(1)

      if (!locked) return false
      if (locked.status !== 'draft') throw new InvoiceNotADraftError()

      const lines = await tx
        .select()
        .from(invoiceLine)
        .where(eq(invoiceLine.invoiceId, invoiceId))
        .orderBy(asc(invoiceLine.position))

      if (lines.length === 0) throw new InvoiceEmptyError()

      // 1 — the number, and the check rule 8 asks for.
      const [range] = await tx
        .select({ prefix: numberRange.prefix, padding: numberRange.padding })
        .from(numberRange)
        .where(and(eq(numberRange.tenantId, tenantId), eq(numberRange.code, INVOICE_RANGE_CODE)))
        .limit(1)

      const value = await nextNumber(tx, tenantId, INVOICE_RANGE_CODE)
      const prefix = range?.prefix ?? ''
      const formatted = formatNumber(prefix, range?.padding ?? 1, value)
      await assertNumberFree(tx, tenantId, formatted)

      const contactRow = await loadContactRow(tx, tenantId, draft.contactId)
      if (!contactRow) throw new Error('invoice references a contact that does not exist')

      /**
       * 1b — the outro for an invoice that is being settled on the spot, if
       * one is configured. Before the render, or the document and the row
       * would disagree; missing is not an error, only reported back.
       */
      let outroText = draft.outroText
      if (settle) {
        const [paidVariant] = await tx
          .select({ body: textTemplate.body })
          .from(textTemplate)
          .where(
            and(
              eq(textTemplate.tenantId, tenantId),
              eq(textTemplate.isPaidVariant, true),
              eq(textTemplate.active, true),
            ),
          )
          .limit(1)

        if (paidVariant) {
          outroText = paidVariant.body
          paidTemplateUsed = true
        }
      }

      // 2 — the finished document, in memory. What is rendered is exactly
      // what is stored.
      const recipientSnapshot = recipientSnapshotOf(contactRow)
      const finalizedAt = new Date()
      const snapshot: Invoice = {
        ...draft,
        status: 'finalized',
        outroText,
        number: formatted,
        numberPrefix: prefix,
        numberValue: value,
        recipientSnapshot,
        contactName: recipientSnapshot.name,
        totalCents: sumLines(draft.lines),
        finalizedAt: finalizedAt.toISOString(),
      }

      // 3 — render and write. The only step outside the database.
      const path = pdfPathFor(snapshot.invoiceDate, formatted)
      const bytes = await renderPdf(snapshot)
      writtenPath = path
      await store.write(path, bytes)

      // 4 — one statement, and it is the one that finalizes the row.
      await tx
        .update(invoice)
        .set({
          number: formatted,
          numberPrefix: prefix,
          numberValue: value,
          recipientSnapshot,
          outroText,
          totalCents: snapshot.totalCents,
          finalizedAt,
          pdfPath: path,
          pdfHash: createHash('sha256').update(bytes).digest('hex'),
          status: 'finalized',
        })
        .where(eq(invoice.id, invoiceId))

      /**
       * 5 — the payment, and only now: `payment_requires_finalized_invoice`
       * refuses one against a draft, and until the statement above the row
       * still was one. Over the full amount, dated to the invoice — all of it
       * correctable afterwards, like any other payment.
       */
      if (settle) {
        await tx.insert(payment).values({
          id: newId(),
          tenantId,
          invoiceId,
          paidOn: settle.paidOn ?? snapshot.invoiceDate,
          amountCents: snapshot.totalCents,
          method: settle.method,
        })
      }

      return true
    })

    if (!finalized) return null
    const stored = await getInvoice(database, tenantId, invoiceId)
    return stored ? { invoice: stored, paidTemplateUsed } : null
  } catch (error) {
    // 6 — the transaction rolled back, so the file it wrote points at nothing.
    if (writtenPath) await store.remove(writtenPath).catch(() => {})
    throw error
  }
}

/** `invoices/{year}/{number}.pdf`, relative to the data root. The number is
 *  restricted to `[A-Za-z0-9._-]` by `number_range_prefix_shape`, so it is
 *  safe as a file name. */
export function pdfPathFor(invoiceDate: string, number: string): string {
  return `invoices/${invoiceDate.slice(0, 4)}/${number}.pdf`
}
