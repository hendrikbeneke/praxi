import type { Payment, PaymentInput } from '@praxi/shared'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { Database, DbReader, Transaction } from '../db/client.js'
import { invoice, payment } from '../db/schema.js'
import { newId } from '../id.js'

/**
 * Payments on an invoice (CLAUDE.md rule 9).
 *
 * Entered by hand, one row each — no import, no bank reconciliation, no
 * payment provider. The amount is free, so a partial payment is simply a
 * smaller number and an overpayment a larger one; neither needs a mechanism.
 *
 * **Nothing here computes a status.** What the sum means is
 * `invoicePaymentState()` in `packages/shared`, which the client, the
 * receivables view and the tests all go through. There is no stored status and
 * no cached total, because a second place saying what was received would
 * eventually say something else — and the invoice row is immutable after
 * finalization, so it could not even be corrected.
 */

/** A payment on a draft. The trigger refuses too; this exists so the message
 *  is a sentence rather than a raised exception from a migration. */
export class InvoiceNotPayableError extends Error {
  constructor() {
    super('a draft cannot be paid')
    this.name = 'InvoiceNotPayableError'
  }
}

const columns = {
  id: payment.id,
  invoiceId: payment.invoiceId,
  paidOn: payment.paidOn,
  amountCents: payment.amountCents,
  method: payment.method,
  note: payment.note,
}

export async function listPayments(
  reader: DbReader,
  tenantId: string,
  invoiceId: string,
): Promise<Payment[]> {
  return reader
    .select(columns)
    .from(payment)
    .where(and(eq(payment.tenantId, tenantId), eq(payment.invoiceId, invoiceId)))
    .orderBy(asc(payment.paidOn), asc(payment.createdAt))
}

/** What one invoice's payments add up to, and when the last of them arrived. */
export type PaymentSummary = { paidCents: number; lastPaidOn: string | null }

/**
 * What has been received per invoice, for a set of invoices.
 *
 * One grouped query rather than one per invoice: the invoice list and the
 * receivables view both need this for every row they show, and the n+1 version
 * would be the reason someone later caches a total on the invoice.
 *
 * `lastPaidOn` is the newest `paid_on` among them, so a list can say "bezahlt
 * 28.07.2026" rather than only "bezahlt" (K7). Derived on read like the sum
 * beside it — a column would be a second place saying when the money came in.
 */
export async function paymentSummaryByInvoice(
  reader: DbReader,
  tenantId: string,
  invoiceIds: readonly string[],
): Promise<Map<string, PaymentSummary>> {
  if (invoiceIds.length === 0) return new Map()

  const rows = await reader
    .select({
      invoiceId: payment.invoiceId,
      paidCents: sql<number>`sum(${payment.amountCents})::int`,
      lastPaidOn: sql<string | null>`max(${payment.paidOn})`,
    })
    .from(payment)
    .where(and(eq(payment.tenantId, tenantId), inArray(payment.invoiceId, [...invoiceIds])))
    .groupBy(payment.invoiceId)

  return new Map(
    rows.map((row) => [row.invoiceId, { paidCents: row.paidCents, lastPaidOn: row.lastPaidOn }]),
  )
}

/** Refuses a draft before the trigger does, so the client gets a sentence. */
async function assertPayable(
  tx: Transaction,
  tenantId: string,
  invoiceId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ status: invoice.status })
    .from(invoice)
    .where(and(eq(invoice.tenantId, tenantId), eq(invoice.id, invoiceId)))
    .limit(1)

  if (!row) return false
  if (row.status === 'draft') throw new InvoiceNotPayableError()
  return true
}

export async function addPayment(
  database: Database,
  tenantId: string,
  invoiceId: string,
  input: PaymentInput,
): Promise<Payment | null> {
  return database.transaction(async (tx) => {
    if (!(await assertPayable(tx, tenantId, invoiceId))) return null

    const [row] = await tx
      .insert(payment)
      .values({ id: newId(), tenantId, invoiceId, ...input })
      .returning(columns)

    if (!row) throw new Error('insert returned no row')
    return row
  })
}

/**
 * Deleting a payment. Correcting a mistyped entry is the everyday case, so
 * there is no guard beyond the tenant and the invoice it belongs to — unlike a
 * locked note, a payment carries no legal irreversibility. What it does change
 * is the derived status, which follows on the next read because it is derived.
 */
export async function deletePayment(
  database: Database,
  tenantId: string,
  invoiceId: string,
  paymentId: string,
): Promise<boolean> {
  const deleted = await database
    .delete(payment)
    .where(
      and(
        eq(payment.tenantId, tenantId),
        eq(payment.invoiceId, invoiceId),
        eq(payment.id, paymentId),
      ),
    )
    .returning({ id: payment.id })

  return deleted.length > 0
}
