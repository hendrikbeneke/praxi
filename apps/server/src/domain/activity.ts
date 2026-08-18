import type {
  Activity,
  ActivityInput,
  ActivityItem,
  ActivityItemInput,
  ActivityListQuery,
  ActivitySummary,
  ActivitySummaryQuery,
  Appointment,
  AppointmentDraft,
} from '@praxi/shared'
import { formatContactNameSorted } from '@praxi/shared'
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import type { Database, DbReader, Transaction } from '../db/client.js'
import {
  activity,
  activityItem,
  appointment,
  contact,
  note,
  service,
  serviceGroupItem,
} from '../db/schema.js'
import { newId } from '../id.js'
import { billingStateOf, blockingInvoiceLines, unbilledCentsInRange } from './billable.js'
import { enqueueDelete, enqueueUpsert } from './google-sync.js'

/**
 * Activities, their positions, and the calendar entry that usually comes with
 * them.
 *
 * The rule this file exists to enforce is CLAUDE.md rule 5: a service is a
 * template. Description, fee code and price are copied out of the catalogue
 * when an item is created, and nothing reads the catalogue again afterwards. A
 * service group is resolved into individual items at the same moment and its
 * id is stored nowhere.
 *
 * The same holds one level up for `activity_type`: its default duration and
 * default service or group prefill a *new* activity in the dialog and are
 * never re-read. Changing the type of an activity that already exists
 * therefore changes nothing here — the client sends what it wants stored, and
 * taking a preset over is an explicit action there, not a side effect of the
 * type travelling in this payload.
 */

export class UnknownServiceError extends Error {
  constructor() {
    super('activity references a service that does not exist in this tenant')
    this.name = 'UnknownServiceError'
  }
}

/**
 * Removing an activity item that is already on an invoice.
 *
 * Carries the invoice number so the message can say which document is in the
 * way. A draft counts too: its line would go with the cascade and the draft
 * would quietly lose a position.
 */
export class BilledItemError extends Error {
  readonly itemDescription: string
  readonly invoiceNumber: string | null

  constructor(itemDescription: string, invoiceNumber: string | null) {
    super(`activity item "${itemDescription}" is on invoice ${invoiceNumber ?? '(draft)'}`)
    this.name = 'BilledItemError'
    this.itemDescription = itemDescription
    this.invoiceNumber = invoiceNumber
  }
}

async function assertNotBilled(
  tx: Transaction,
  tenantId: string,
  activityItemIds: readonly string[],
): Promise<void> {
  const blocking = await blockingInvoiceLines(tx, tenantId, activityItemIds)
  const first = blocking[0]
  if (first) throw new BilledItemError(first.description, first.invoiceNumber)
}

/** Deleting an activity that documentation hangs on. See the note at
 *  `deleteActivity` for why this is a refusal rather than a detach. */
export class ActivityHasNotesError extends Error {
  constructor() {
    super('activity still has notes attached')
    this.name = 'ActivityHasNotesError'
  }
}

export class UnknownServiceGroupError extends Error {
  constructor() {
    super('activity references a service group that does not exist in this tenant')
    this.name = 'UnknownServiceGroupError'
  }
}

const itemColumns = {
  id: activityItem.id,
  position: activityItem.position,
  serviceId: activityItem.serviceId,
  description: activityItem.description,
  feeCode: activityItem.feeCode,
  quantity: activityItem.quantity,
  unitPriceCents: activityItem.unitPriceCents,
  billable: activityItem.billable,
}

const appointmentColumns = {
  id: appointment.id,
  contactId: appointment.contactId,
  startsAt: appointment.startsAt,
  endsAt: appointment.endsAt,
  status: appointment.status,
  title: appointment.title,
  note: appointment.note,
}

type AppointmentRow = Omit<Appointment, 'startsAt' | 'endsAt'> & {
  startsAt: Date
  endsAt: Date
}

function toAppointment(row: AppointmentRow): Appointment {
  return { ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() }
}

/** The shape an item takes once every reference has been resolved. */
type ResolvedItem = Omit<ActivityItem, 'id' | 'position'> & { id?: string | undefined }

/**
 * Turns the submitted union into concrete rows, copying out of the catalogue
 * where a service or a group was named.
 *
 * This is the copy in "services are templates, never live references". After
 * it runs, nothing in the result points back at a price the catalogue could
 * still change — and no group id survives at all, which is why editing or
 * emptying a group later cannot reach an activity entered from it.
 */
async function resolveItems(
  tx: Transaction,
  tenantId: string,
  inputs: readonly ActivityItemInput[],
): Promise<ResolvedItem[]> {
  const serviceIds = new Set<string>()
  const groupIds = new Set<string>()

  for (const input of inputs) {
    if (input.kind === 'service') serviceIds.add(input.serviceId)
    if (input.kind === 'group') groupIds.add(input.serviceGroupId)
  }

  const catalogue = new Map<string, typeof service.$inferSelect>()
  if (serviceIds.size > 0) {
    const rows = await tx
      .select()
      .from(service)
      .where(and(eq(service.tenantId, tenantId), inArray(service.id, [...serviceIds])))
    for (const row of rows) catalogue.set(row.id, row)
    if (catalogue.size !== serviceIds.size) throw new UnknownServiceError()
  }

  // Group members come with their service joined, in the group's own order.
  const groupMembers = new Map<
    string,
    { quantity: number; service: typeof service.$inferSelect }[]
  >()
  if (groupIds.size > 0) {
    const rows = await tx
      .select({
        groupId: serviceGroupItem.serviceGroupId,
        quantity: serviceGroupItem.quantity,
        service,
      })
      .from(serviceGroupItem)
      .innerJoin(service, eq(service.id, serviceGroupItem.serviceId))
      .where(
        and(
          eq(serviceGroupItem.tenantId, tenantId),
          inArray(serviceGroupItem.serviceGroupId, [...groupIds]),
        ),
      )
      .orderBy(asc(serviceGroupItem.position))

    for (const row of rows) {
      const list = groupMembers.get(row.groupId) ?? []
      list.push({ quantity: row.quantity, service: row.service })
      groupMembers.set(row.groupId, list)
    }
  }

  const resolved: ResolvedItem[] = []

  for (const input of inputs) {
    if (input.kind === 'custom') {
      resolved.push({
        id: input.id,
        serviceId: input.serviceId,
        description: input.description,
        feeCode: input.feeCode,
        quantity: input.quantity,
        unitPriceCents: input.unitPriceCents,
        billable: input.billable,
      })
      continue
    }

    if (input.kind === 'service') {
      const entry = catalogue.get(input.serviceId)
      if (!entry) throw new UnknownServiceError()
      resolved.push({
        serviceId: entry.id,
        description: entry.description,
        feeCode: entry.feeCode,
        quantity: input.quantity,
        unitPriceCents: entry.defaultPriceCents,
        billable: input.billable,
      })
      continue
    }

    // A group. An empty one is an error rather than a silent no-op: it almost
    // certainly means the group was emptied and the practitioner expected
    // something to appear.
    const members = groupMembers.get(input.serviceGroupId)
    if (!members || members.length === 0) throw new UnknownServiceGroupError()

    for (const member of members) {
      resolved.push({
        serviceId: member.service.id,
        description: member.service.description,
        feeCode: member.service.feeCode,
        quantity: member.quantity,
        unitPriceCents: member.service.defaultPriceCents,
        billable: true,
      })
    }
  }

  return resolved
}

/**
 * Brings the stored positions in line with the submitted ones, in place.
 *
 * Rows are updated, not replaced: `invoice_line.activity_item_id` points at
 * exactly these ids, and delete-and-insert would cut an invoice off from what
 * it was raised for.
 *
 * Removing a position is checked against that first. An item on an invoice
 * must not vanish — the invoice would lose its record of origin and rule 6
 * (billed items are immutable) would be undercut. The `ON DELETE RESTRICT` on
 * `invoice_line.activity_item_id` refuses it in the database as well, even
 * from psql; this check exists so the answer names what is in the way instead
 * of being a foreign key violation.
 */
async function syncItems(
  tx: Transaction,
  tenantId: string,
  activityId: string,
  resolved: readonly ResolvedItem[],
): Promise<void> {
  const existing = await tx
    .select({ id: activityItem.id })
    .from(activityItem)
    .where(eq(activityItem.activityId, activityId))

  const existingIds = new Set(existing.map((row) => row.id))
  const keptIds = new Set(
    resolved.map((item) => item.id).filter((id): id is string => id !== undefined),
  )

  for (const id of keptIds) {
    if (!existingIds.has(id))
      throw new Error(`activity item ${id} does not belong to this activity`)
  }

  const removed = [...existingIds].filter((id) => !keptIds.has(id))
  if (removed.length > 0) {
    await assertNotBilled(tx, tenantId, removed)
    await tx.delete(activityItem).where(inArray(activityItem.id, removed))
  }

  // Position comes from the array index, so the order is gapless without a
  // unique constraint to work around.
  for (const [position, item] of resolved.entries()) {
    const values = {
      position,
      serviceId: item.serviceId,
      description: item.description,
      feeCode: item.feeCode,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      billable: item.billable,
    }

    if (item.id) {
      await tx.update(activityItem).set(values).where(eq(activityItem.id, item.id))
    } else {
      await tx.insert(activityItem).values({ id: newId(), tenantId, activityId, ...values })
    }
  }
}

async function loadActivity(
  reader: DbReader,
  tenantId: string,
  id: string,
): Promise<Activity | null> {
  const [row] = await reader
    .select({
      id: activity.id,
      contactId: activity.contactId,
      contactNumber: contact.contactNumber,
      contactKind: contact.kind,
      contactTitle: contact.title,
      contactFirstName: contact.firstName,
      contactLastName: contact.lastName,
      contactCompanyName: contact.companyName,
      type: activity.type,
      status: activity.status,
      occurredAt: activity.occurredAt,
      durationMin: activity.durationMin,
      title: activity.title,
      internalNote: activity.internalNote,
      appointmentId: activity.appointmentId,
    })
    .from(activity)
    // A join on a row that is being fetched anyway, not a fifth query: the
    // practice-wide list needs the name in every row (D8), and the four
    // queries below are already one per activity.
    .innerJoin(contact, eq(contact.id, activity.contactId))
    .where(and(eq(activity.tenantId, tenantId), eq(activity.id, id)))
    .limit(1)

  if (!row) return null

  const items = await reader
    .select(itemColumns)
    .from(activityItem)
    .where(eq(activityItem.activityId, row.id))
    .orderBy(asc(activityItem.position))

  let entry: Appointment | null = null
  if (row.appointmentId) {
    const [found] = await reader
      .select(appointmentColumns)
      .from(appointment)
      .where(eq(appointment.id, row.appointmentId))
      .limit(1)
    entry = found ? toAppointment(found) : null
  }

  /**
   * A fourth query per activity, which makes the list an N+1 — deliberately.
   * It has been one since slice 4 (items and appointment are loaded per row
   * too), and this is not the moment to optimize something nobody asked for.
   * When the list is felt to be slow, all four go at once.
   */
  const billingState = await billingStateOf(reader, tenantId, row.id)

  return {
    id: row.id,
    contactId: row.contactId,
    // Surname first, because this list is sorted by date and read by name —
    // see the rule on `formatContactNameSorted` in packages/shared.
    contactName: formatContactNameSorted({
      kind: row.contactKind,
      title: row.contactTitle,
      firstName: row.contactFirstName,
      lastName: row.contactLastName,
      companyName: row.contactCompanyName,
    }),
    contactNumber: row.contactNumber,
    type: row.type,
    status: row.status,
    occurredAt: row.occurredAt.toISOString(),
    durationMin: row.durationMin,
    title: row.title,
    internalNote: row.internalNote,
    appointment: entry,
    items,
    billingState,
  }
}

export function getActivity(
  database: Database,
  tenantId: string,
  id: string,
): Promise<Activity | null> {
  return loadActivity(database, tenantId, id)
}

async function upsertAppointment(
  tx: Transaction,
  tenantId: string,
  contactId: string,
  draft: AppointmentDraft,
  existingId: string | null,
): Promise<string> {
  const values = {
    startsAt: new Date(draft.startsAt),
    endsAt: new Date(draft.endsAt),
    status: draft.status,
    title: draft.title,
    note: draft.note,
  }

  if (existingId) {
    await tx.update(appointment).set(values).where(eq(appointment.id, existingId))
    // In the same transaction as the change, so the instruction and the change
    // commit together or not at all (slice 9). It reaches nothing when no
    // practice calendar is configured.
    await enqueueUpsert(tx, tenantId, existingId)
    return existingId
  }

  const id = newId()
  await tx.insert(appointment).values({ id, tenantId, contactId, ...values })
  await enqueueUpsert(tx, tenantId, id)
  return id
}

export async function createActivity(
  database: Database,
  tenantId: string,
  input: ActivityInput,
): Promise<Activity> {
  return database.transaction(async (tx) => {
    const resolved = await resolveItems(tx, tenantId, input.items)

    const appointmentId = input.appointment
      ? await upsertAppointment(tx, tenantId, input.contactId, input.appointment, null)
      : null

    const id = newId()
    await tx.insert(activity).values({
      id,
      tenantId,
      contactId: input.contactId,
      type: input.type,
      status: input.status,
      occurredAt: new Date(input.occurredAt),
      durationMin: input.durationMin,
      title: input.title,
      internalNote: input.internalNote,
      appointmentId,
    })

    await syncItems(tx, tenantId, id, resolved)

    const created = await loadActivity(tx, tenantId, id)
    if (!created) throw new Error('activity vanished within its own transaction')
    return created
  })
}

export async function updateActivity(
  database: Database,
  tenantId: string,
  id: string,
  input: ActivityInput,
): Promise<Activity | null> {
  return database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ appointmentId: activity.appointmentId, contactId: activity.contactId })
      .from(activity)
      .where(and(eq(activity.tenantId, tenantId), eq(activity.id, id)))
      .limit(1)

    if (!existing) return null

    const resolved = await resolveItems(tx, tenantId, input.items)

    let appointmentId = existing.appointmentId
    if (input.appointment) {
      appointmentId = await upsertAppointment(
        tx,
        tenantId,
        input.contactId,
        input.appointment,
        existing.appointmentId,
      )
    } else if (existing.appointmentId) {
      // Dropping the calendar entry: detach first, because the foreign key
      // would otherwise null the column for us and we would lose the id.
      await tx.update(activity).set({ appointmentId: null }).where(eq(activity.id, id))
      // Before the delete: afterwards there is nothing left to read the event
      // id from, and the pending push has gone with the cascade.
      await enqueueDelete(tx, tenantId, existing.appointmentId)
      await tx.delete(appointment).where(eq(appointment.id, existing.appointmentId))
      appointmentId = null
    }

    await tx
      .update(activity)
      .set({
        contactId: input.contactId,
        type: input.type,
        status: input.status,
        occurredAt: new Date(input.occurredAt),
        durationMin: input.durationMin,
        title: input.title,
        internalNote: input.internalNote,
        appointmentId,
      })
      .where(and(eq(activity.tenantId, tenantId), eq(activity.id, id)))

    await syncItems(tx, tenantId, id, resolved)

    return loadActivity(tx, tenantId, id)
  })
}

/**
 * Deletes an activity and, with it, its calendar entry.
 *
 * From slice 6 this needs the same guard as `syncItems`: an activity whose
 * items appear on a finalized invoice must not be removable.
 */
export async function deleteActivity(
  database: Database,
  tenantId: string,
  id: string,
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ appointmentId: activity.appointmentId })
      .from(activity)
      .where(and(eq(activity.tenantId, tenantId), eq(activity.id, id)))
      .limit(1)

    if (!existing) return false

    /**
     * Notes hold the activity with `ON DELETE RESTRICT`, so the database would
     * refuse anyway — but with a foreign key violation rather than something
     * readable. Restrict rather than set null on purpose: nulling the column
     * is an UPDATE, and on a locked note that would come back as "locked note
     * is immutable", which describes neither the cause nor the way out.
     */
    const [attached] = await tx
      .select({ id: note.id })
      .from(note)
      .where(and(eq(note.tenantId, tenantId), eq(note.activityId, id)))
      .limit(1)

    if (attached) throw new ActivityHasNotesError()

    // Same reasoning as in `syncItems`: the cascade below would take the items
    // with it, and an item on an invoice must not disappear.
    const items = await tx
      .select({ id: activityItem.id })
      .from(activityItem)
      .where(eq(activityItem.activityId, id))
    await assertNotBilled(
      tx,
      tenantId,
      items.map((row) => row.id),
    )

    // Items go with it through `on delete cascade`.
    await tx.delete(activity).where(and(eq(activity.tenantId, tenantId), eq(activity.id, id)))
    if (existing.appointmentId) {
      await enqueueDelete(tx, tenantId, existing.appointmentId)
      await tx.delete(appointment).where(eq(appointment.id, existing.appointmentId))
    }
    return true
  })
}

export async function listActivities(
  database: Database,
  tenantId: string,
  query: ActivityListQuery,
): Promise<Activity[]> {
  const filters = [eq(activity.tenantId, tenantId)]
  if (query.contactId) filters.push(eq(activity.contactId, query.contactId))
  if (query.from) filters.push(gte(activity.occurredAt, new Date(query.from)))
  if (query.to) filters.push(lt(activity.occurredAt, new Date(query.to)))
  if (query.status) filters.push(eq(activity.status, query.status))
  if (query.type) filters.push(eq(activity.type, query.type))

  const rows = await database
    .select({ id: activity.id })
    .from(activity)
    .where(and(...filters))
    .orderBy(desc(activity.occurredAt))
    .limit(query.limit)
    .offset(query.offset)

  const loaded = await Promise.all(rows.map((row) => loadActivity(database, tenantId, row.id)))
  return loaded.filter((item): item is Activity => item !== null)
}

/**
 * The figures above the Vorgänge list: how many activities the window holds,
 * how they split by status, how many are still ahead, and what is rendered and
 * unclaimed.
 *
 * **Why this is an endpoint at all, when D7's invoice list counts in the
 * browser.** There the whole window fits in one page of 200 rows, so filtering
 * client-side hands the counts over for free. Here it does not: the default
 * window is 120 days, and a practice with six sessions a day puts some 700
 * activities in it. The list is therefore paged and filtered on the server, and
 * a browser cannot count what it never fetched. The two screens differ because
 * their data does, not because one of them was built carelessly.
 *
 * The counts describe the **window, not the selection** — they are what the
 * filter chips carry, so picking a chip must not change the number written on
 * it. Only `type` narrows them, because that filter sits above the chips.
 */
export async function activitySummary(
  database: Database,
  tenantId: string,
  query: ActivitySummaryQuery,
  now: Date,
): Promise<ActivitySummary> {
  const from = new Date(query.from)
  const to = new Date(query.to)

  const filters = [
    eq(activity.tenantId, tenantId),
    gte(activity.occurredAt, from),
    lt(activity.occurredAt, to),
  ]
  if (query.type) filters.push(eq(activity.type, query.type))

  const counted = database
    .select({
      total: sql<number>`count(*)::int`.mapWith(Number),
      planned: sql<number>`count(*) filter (where ${activity.status} = 'planned')::int`.mapWith(
        Number,
      ),
      rendered: sql<number>`count(*) filter (where ${activity.status} = 'rendered')::int`.mapWith(
        Number,
      ),
      noShow: sql<number>`count(*) filter (where ${activity.status} = 'no_show')::int`.mapWith(
        Number,
      ),
      // Built with the operator rather than by interpolating `now` into the
      // template: a bare Date in a `sql` chunk is bound without the column's
      // type, and postgres refuses it.
      upcoming: sql<number>`count(*) filter (where ${gte(activity.occurredAt, now)})::int`.mapWith(
        Number,
      ),
    })
    .from(activity)
    .where(and(...filters))

  const [counts, unbilledCents] = await Promise.all([
    counted,
    unbilledCentsInRange(database, tenantId, { from, to, type: query.type }),
  ])

  return {
    total: counts[0]?.total ?? 0,
    planned: counts[0]?.planned ?? 0,
    rendered: counts[0]?.rendered ?? 0,
    noShow: counts[0]?.noShow ?? 0,
    upcoming: counts[0]?.upcoming ?? 0,
    unbilledCents,
  }
}
