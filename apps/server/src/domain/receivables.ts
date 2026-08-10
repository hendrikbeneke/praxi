import type { Receivable, ReceivableFilter } from '@praxi/shared'
import {
  formatContactName,
  invoicePaymentState,
  matchesReceivableFilter,
  toBerlinDate,
} from '@praxi/shared'
import { and, asc, eq, ne } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { contact, invoice } from '../db/schema.js'
import { paidCentsByInvoice } from './payment.js'

/**
 * "Who still owes what" — the Bezahlübersicht (CLAUDE.md rule 9).
 *
 * Every row is an invoice plus what its payments make of it. The status is
 * computed by `invoicePaymentState()`, the same function the invoice screen
 * and the contact record use, and the filter is applied to that result **in
 * memory** rather than in SQL.
 *
 * That is deliberate. Rewriting the status rule as a `WHERE` clause would be a
 * second definition of it, and the two would eventually disagree — the one
 * failure this view must not have, since it is the answer to "what is still
 * open". A single practice's invoices fit in memory many times over; when they
 * no longer do, the right fix is a materialized view, not a copy of the rule.
 *
 * Cancelled invoices and cancellation documents fall out on their own: the
 * status function answers `cancelled` and `cancellation` for them, and neither
 * matches an open filter.
 */
export async function listReceivables(
  database: Database,
  tenantId: string,
  options: { filter?: ReceivableFilter | undefined; today?: string } = {},
): Promise<Receivable[]> {
  const today = options.today ?? toBerlinDate(new Date().toISOString())

  const rows = await database
    .select({
      id: invoice.id,
      contactId: invoice.contactId,
      type: invoice.type,
      status: invoice.status,
      number: invoice.number,
      invoiceDate: invoice.invoiceDate,
      paymentTermDays: invoice.paymentTermDays,
      totalCents: invoice.totalCents,
      recipientSnapshot: invoice.recipientSnapshot,
      kind: contact.kind,
      title: contact.title,
      firstName: contact.firstName,
      lastName: contact.lastName,
      companyName: contact.companyName,
    })
    .from(invoice)
    .innerJoin(contact, eq(contact.id, invoice.contactId))
    /**
     * Drafts and nothing else are excluded here. A draft is not a claim —
     * nothing is owed until the invoice exists as a document — and it is the
     * one case the status function cannot distinguish, since it answers `open`
     * for a draft too.
     *
     * Cancelled invoices deliberately *are* loaded. That they do not show up
     * among the open items is then a property of the status rule rather than
     * of a `WHERE` clause, which is what the test can actually check.
     */
    .where(and(eq(invoice.tenantId, tenantId), ne(invoice.status, 'draft')))
    .orderBy(asc(invoice.invoiceDate))

  const paid = await paidCentsByInvoice(
    database,
    tenantId,
    rows.map((row) => row.id),
  )

  const receivables = rows.map((row): Receivable => {
    const state = invoicePaymentState(row, paid.get(row.id) ?? 0, today)
    return {
      id: row.id,
      contactId: row.contactId,
      // The snapshot wins: a finalized invoice is addressed to who it was
      // addressed to, whatever the contact is called today.
      contactName:
        row.recipientSnapshot?.name ??
        formatContactName({
          kind: row.kind,
          title: row.title,
          firstName: row.firstName,
          lastName: row.lastName,
          companyName: row.companyName,
        }),
      number: row.number,
      invoiceDate: row.invoiceDate,
      dueDate: state.dueDate,
      totalCents: row.totalCents,
      paidCents: state.paidCents,
      openCents: state.openCents,
      status: state.status,
      daysOverdue: state.daysOverdue,
    }
  })

  return options.filter
    ? receivables.filter((row) => matchesReceivableFilter(row, options.filter as ReceivableFilter))
    : receivables
}
