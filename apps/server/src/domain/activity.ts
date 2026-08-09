import type {
  Activity,
  ActivityInput,
  ActivityItem,
  ActivityItemInput,
  ActivityListQuery,
  Appointment,
  AppointmentDraft,
} from '@praxi/shared'
import { and, asc, desc, eq, gte, inArray, lt } from 'drizzle-orm'
import type { Database, DbReader, Transaction } from '../db/client.js'
import { activity, activityItem, appointment, service, serviceGroupItem } from '../db/schema.js'
import { newId } from '../id.js'

/**
 * Activities, their positions, and the calendar entry that usually comes with
 * them.
 *
 * The rule this file exists to enforce is CLAUDE.md rule 5: a service is a
 * template. Description, fee code, price and duration are copied out of the
 * catalogue when an item is created, and nothing reads the catalogue again
 * afterwards. A service group is resolved into individual items at the same
 * moment and its id is stored nowhere.
 */

export class UnknownServiceError extends Error {
  constructor() {
    super('activity references a service that does not exist in this tenant')
    this.name = 'UnknownServiceError'
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
  durationMin: activityItem.durationMin,
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
        durationMin: input.durationMin,
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
        durationMin: entry.defaultDurationMin,
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
        durationMin: member.service.defaultDurationMin,
        billable: true,
      })
    }
  }

  return resolved
}

/**
 * Brings the stored positions in line with the submitted ones, in place.
 *
 * Rows are updated, not replaced: from slice 6 `invoice_line.activity_item_id`
 * points at exactly these ids, and delete-and-insert would cut an invoice off
 * from what it was raised for.
 *
 * The deletion below is the part that needs guarding once invoices exist. A
 * position that appears on a finalized, non-cancelled invoice must not vanish
 * — that would take away the invoice's record of origin and undercut rule 6.
 * Slice 6 gives `invoice_line.activity_item_id` an `ON DELETE RESTRICT` and
 * adds a check here that refuses with a readable message before deleting. See
 * WORKPLAN.md, slice 6.
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
      durationMin: item.durationMin,
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
      type: activity.type,
      occurredAt: activity.occurredAt,
      durationMin: activity.durationMin,
      title: activity.title,
      internalNote: activity.internalNote,
      appointmentId: activity.appointmentId,
    })
    .from(activity)
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

  return {
    id: row.id,
    contactId: row.contactId,
    type: row.type,
    occurredAt: row.occurredAt.toISOString(),
    durationMin: row.durationMin,
    title: row.title,
    internalNote: row.internalNote,
    appointment: entry,
    items,
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
    return existingId
  }

  const id = newId()
  await tx.insert(appointment).values({ id, tenantId, contactId, ...values })
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
      await tx.delete(appointment).where(eq(appointment.id, existing.appointmentId))
      appointmentId = null
    }

    await tx
      .update(activity)
      .set({
        contactId: input.contactId,
        type: input.type,
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

    // Items go with it through `on delete cascade`.
    await tx.delete(activity).where(and(eq(activity.tenantId, tenantId), eq(activity.id, id)))
    if (existing.appointmentId) {
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
