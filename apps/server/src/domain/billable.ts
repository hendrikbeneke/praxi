import type { ActivityBillingState, BillableItem } from '@praxi/shared'
import { formatContactNameSorted } from '@praxi/shared'
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm'
import type { DbReader } from '../db/client.js'
import { activity, activityItem, contact, invoice, invoiceLine } from '../db/schema.js'

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

/**
 * Everything still open, for one contact or across all of them.
 *
 * The activity's **status travels with each row and cannot be filtered on**:
 * there is no status parameter here and none in `billableQuerySchema`. That is
 * the point rather than an omission — billability does not depend on a status
 * (rule 6), so a filter over it could only hide work that is still owed, and a
 * past activity still standing on "planned" is exactly the row worth seeing.
 * Not expressible beats not allowed: nobody has to remember the rule.
 */
export async function listBillableItems(
  reader: DbReader,
  tenantId: string,
  contactId?: string,
): Promise<BillableItem[]> {
  const filters = [
    eq(activityItem.tenantId, tenantId),
    eq(activityItem.billable, true),
    sql`not ${claimedByAnActiveInvoice}`,
  ]
  if (contactId) filters.push(eq(activity.contactId, contactId))

  const rows = await reader
    .select({
      id: activityItem.id,
      activityId: activityItem.activityId,
      contactId: activity.contactId,
      contactNumber: contact.contactNumber,
      contactKind: contact.kind,
      contactTitle: contact.title,
      contactFirstName: contact.firstName,
      contactLastName: contact.lastName,
      contactCompanyName: contact.companyName,
      occurredAt: activity.occurredAt,
      activityTitle: activity.title,
      /** So the picker can fall back to the type's label where the activity
       *  has no title of its own. */
      activityType: activity.type,
      activityStatus: activity.status,
      description: activityItem.description,
      feeCode: activityItem.feeCode,
      quantity: activityItem.quantity,
      unitPriceCents: activityItem.unitPriceCents,
    })
    .from(activityItem)
    .innerJoin(activity, eq(activity.id, activityItem.activityId))
    .innerJoin(contact, eq(contact.id, activity.contactId))
    .where(and(...filters))
    .orderBy(asc(contact.sortName), asc(activity.occurredAt), asc(activityItem.position))

  return rows.map(
    ({
      contactKind,
      contactTitle,
      contactFirstName,
      contactLastName,
      contactCompanyName,
      ...row
    }) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
      // Surname first: this list is grouped by contact and scanned by name —
      // see the rule on `formatContactNameSorted` in packages/shared.
      contactName: formatContactNameSorted({
        kind: contactKind,
        title: contactTitle,
        firstName: contactFirstName,
        lastName: contactLastName,
        companyName: contactCompanyName,
      }),
    }),
  )
}

/**
 * Whether an activity's work has been claimed yet — `none` when there is
 * nothing to claim, `billed` when every billable item sits on an active
 * invoice, `open` while one does not.
 *
 * **This shares `claimedByAnActiveInvoice` with the list above, and that is
 * the whole design.** The two answers have to agree in every case, cancellation
 * included: cancelling an invoice returns its items to the pool, so an activity
 * has to fall back from `billed` to `open` without anything being kept in step.
 * A stored column or a second, "simpler" query would pass the easy tests and
 * break exactly there — which is what `invoice.test.ts` guards.
 */
export async function billingStateOf(
  reader: DbReader,
  tenantId: string,
  activityId: string,
): Promise<ActivityBillingState> {
  const [counts] = await reader
    .select({
      billable: sql<number>`count(*) filter (where ${activityItem.billable})`.mapWith(Number),
      open: sql<number>`count(*) filter (
        where ${activityItem.billable} and not ${claimedByAnActiveInvoice}
      )`.mapWith(Number),
    })
    .from(activityItem)
    .where(and(eq(activityItem.tenantId, tenantId), eq(activityItem.activityId, activityId)))

  if (!counts || counts.billable === 0) return 'none'
  return counts.open > 0 ? 'open' : 'billed'
}

/**
 * What the activities in a window still carry unclaimed — the money figure in
 * the Vorgänge summary line (D8).
 *
 * It lives here rather than in `activity.ts` for the reason the docstring above
 * gives: `claimedByAnActiveInvoice` is the one definition of "already claimed",
 * and every answer that depends on it is written next to it. A copy of the
 * condition in another file would pass the easy cases and disagree on a
 * cancelled invoice.
 *
 * **No status and no cut-off at today**, deliberately. This is exactly the sum
 * of the rows the list badges "Offen", so the practitioner can add the column
 * up by hand and land on the same number — which somebody eventually will. A
 * cut-off would have been a second rule about what counts as owed, sitting
 * beside `billingStateOf`, and rule 6 already refused to let a status decide
 * that.
 */
export async function unbilledCentsInRange(
  reader: DbReader,
  tenantId: string,
  range: { from: Date; to: Date; type?: string | undefined },
): Promise<number> {
  const filters = [
    eq(activityItem.tenantId, tenantId),
    eq(activityItem.billable, true),
    gte(activity.occurredAt, range.from),
    lt(activity.occurredAt, range.to),
    sql`not ${claimedByAnActiveInvoice}`,
  ]
  if (range.type) filters.push(eq(activity.type, range.type))

  const [row] = await reader
    .select({
      cents: sql<number>`coalesce(sum(
        ${activityItem.quantity} * ${activityItem.unitPriceCents}
      ), 0)::int`.mapWith(Number),
    })
    .from(activityItem)
    .innerJoin(activity, eq(activity.id, activityItem.activityId))
    .where(and(...filters))

  return row?.cents ?? 0
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
