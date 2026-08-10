import type { BillableItem } from '@praxi/shared'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { DbReader } from '../db/client.js'
import { activity, activityItem, invoice, invoiceLine } from '../db/schema.js'

/**
 * Which of a contact's activity items may still be put on an invoice
 * (CLAUDE.md rule 6).
 *
 * An item is billable when `billable = true` and no invoice line on an
 * **active, real** invoice references it. Three things make up "active, real",
 * and each of them loses money or breaks a rule if left out:
 *
 * - **status <> 'cancelled'** — cancelling an invoice has to return its items
 *   to the pool. The lines of the cancelled invoice stay where they are,
 *   because a finalized invoice is immutable; it is this condition that frees
 *   the items rather than any deletion.
 * - **type <> 'cancellation_invoice'** — a cancellation invoice repeats the
 *   original's `activity_item_id` values so the document shows what it takes
 *   back. It is itself finalized and not cancelled, so without this condition
 *   it would claim the items all over again and they would never return.
 *   Rule 9 asks for the opposite.
 * - **drafts count as claimed** — `status <> 'cancelled'` deliberately
 *   includes `draft`. An item already sitting on someone's draft must not be
 *   offered a second time, or it ends up on two invoices.
 *
 * `protect_billed_activity_item` in migration 0014 repeats the first two
 * conditions in SQL. Keep the two in step.
 */
const claimedByAnActiveInvoice = sql`exists (
  select 1
    from ${invoiceLine}
    join ${invoice} on ${invoice.id} = ${invoiceLine.invoiceId}
   where ${invoiceLine.activityItemId} = ${activityItem.id}
     and ${invoice.status} <> 'cancelled'
     and ${invoice.type} <> 'cancellation_invoice'
)`

export async function listBillableItems(
  reader: DbReader,
  tenantId: string,
  contactId: string,
): Promise<BillableItem[]> {
  const rows = await reader
    .select({
      id: activityItem.id,
      activityId: activityItem.activityId,
      occurredAt: activity.occurredAt,
      activityTitle: activity.title,
      /** So the picker can fall back to the type's label where the activity
       *  has no title of its own. The activity's *status* is deliberately not
       *  here: it does not gate billing (rule 6), and offering it would invite
       *  a filter that quietly loses revenue. */
      activityType: activity.type,
      description: activityItem.description,
      feeCode: activityItem.feeCode,
      quantity: activityItem.quantity,
      unitPriceCents: activityItem.unitPriceCents,
    })
    .from(activityItem)
    .innerJoin(activity, eq(activity.id, activityItem.activityId))
    .where(
      and(
        eq(activityItem.tenantId, tenantId),
        eq(activity.contactId, contactId),
        eq(activityItem.billable, true),
        sql`not ${claimedByAnActiveInvoice}`,
      ),
    )
    .orderBy(asc(activity.occurredAt), asc(activityItem.position))

  return rows.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() }))
}

/**
 * The invoice lines that stand in the way of deleting these activity items,
 * with the number of the invoice they sit on.
 *
 * Used by `syncItems` and `deleteActivity` to refuse before the foreign key
 * does, so the message can name what is in the way. Every non-cancelled
 * invoice counts here, drafts included — a draft line would be deleted by the
 * cascade and the draft would silently lose a position.
 */
export async function blockingInvoiceLines(
  reader: DbReader,
  tenantId: string,
  activityItemIds: readonly string[],
): Promise<{ description: string; invoiceNumber: string | null; status: string }[]> {
  if (activityItemIds.length === 0) return []

  return reader
    .select({
      description: invoiceLine.description,
      invoiceNumber: invoice.number,
      status: invoice.status,
    })
    .from(invoiceLine)
    .innerJoin(invoice, eq(invoice.id, invoiceLine.invoiceId))
    .where(
      and(
        eq(invoiceLine.tenantId, tenantId),
        sql`${invoiceLine.activityItemId} = any(${sql.param(activityItemIds)}::uuid[])`,
      ),
    )
}
