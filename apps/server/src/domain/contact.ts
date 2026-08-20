import type {
  Contact,
  ContactInput,
  ContactListItem,
  ContactListQuery,
  ContactRoleInput,
  ContactUpdate,
} from '@praxi/shared'
import type { AnyColumn, SQL } from 'drizzle-orm'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
import type { Database, DbReader, Transaction } from '../db/client.js'
import { appointment, contact, contactRole, contactRoleType } from '../db/schema.js'
import { newId } from '../id.js'
import { nextNumber } from './counter.js'

/** `kind` is structural and decides which fields apply, so it cannot change
 *  after creation (CLAUDE.md rule 4). */
export class ContactKindChangeError extends Error {
  constructor() {
    super('contact.kind cannot be changed')
    this.name = 'ContactKindChangeError'
  }
}

/**
 * The list-safe column set — every contact field except `diagnosis`. Every
 * list query is built on this, so a health datum under Art. 9 GDPR is never
 * even read for a list row; see `detailColumns` below.
 */
const listColumns = {
  id: contact.id,
  contactNumber: contact.contactNumber,
  kind: contact.kind,
  salutation: contact.salutation,
  title: contact.title,
  firstName: contact.firstName,
  lastName: contact.lastName,
  dateOfBirth: contact.dateOfBirth,
  birthPlace: contact.birthPlace,
  gender: contact.gender,
  companyName: contact.companyName,
  vatId: contact.vatId,
  contactPerson: contact.contactPerson,
  street: contact.street,
  houseNumber: contact.houseNumber,
  postalCode: contact.postalCode,
  city: contact.city,
  country: contact.country,
  email: contact.email,
  phoneMobile: contact.phoneMobile,
  phoneLandline: contact.phoneLandline,
  internalNote: contact.internalNote,
  archivedAt: contact.archivedAt,
}

/**
 * `listColumns` plus `diagnosis`, for the single-row reads only —
 * `getContact`, `createContact`, `updateContact`. Kept as its own column set
 * rather than merged back into `listColumns`, on purpose: before this split,
 * `listContacts` selected the exact same columns as a single-row read, so
 * adding `diagnosis` there would have put a health datum on every row of the
 * contact list (CLAUDE.md rule 12). Do not fold these back into one — a
 * future column belongs on `listColumns` by default and only moves here if
 * it is deliberately meant to reach the list too.
 */
const detailColumns = {
  ...listColumns,
  diagnosis: contact.diagnosis,
}

/** The detail row as Drizzle returns it: `archived_at` is a `timestamptz` and
 *  arrives as a `Date`, while the wire format is an ISO string. */
type ContactRow = Omit<Contact, 'archivedAt' | 'roles'> & { archivedAt: Date | null }

/** The list row — the same shape, minus `diagnosis`, which `listColumns`
 *  never selected in the first place. */
type ContactListRow = Omit<ContactListItem, 'archivedAt' | 'roles' | 'appointmentAt'> & {
  archivedAt: Date | null
}

function toContact(row: ContactRow, roles: Contact['roles']): Contact {
  return { ...row, archivedAt: row.archivedAt?.toISOString() ?? null, roles }
}

function toContactListItem(
  row: ContactListRow,
  roles: Contact['roles'],
  appointmentAt: Date | null,
): ContactListItem {
  return {
    ...row,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    roles,
    appointmentAt: appointmentAt?.toISOString() ?? null,
  }
}

/**
 * Maps the discriminated input onto the flat row, explicitly nulling the
 * fields of the other kind. The `contact_kind_fields` check constraint rejects
 * anything else, so this is where the two representations meet.
 */
function columnsFromInput(input: ContactUpdate) {
  const shared = {
    vatId: input.vatId,
    street: input.street,
    houseNumber: input.houseNumber,
    postalCode: input.postalCode,
    city: input.city,
    country: input.country,
    email: input.email,
    phoneMobile: input.phoneMobile,
    phoneLandline: input.phoneLandline,
    internalNote: input.internalNote,
    diagnosis: input.diagnosis,
  }

  if (input.kind === 'person') {
    return {
      kind: 'person' as const,
      salutation: input.salutation,
      title: input.title,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth,
      birthPlace: input.birthPlace,
      gender: input.gender,
      companyName: null,
      contactPerson: null,
      ...shared,
    }
  }

  return {
    kind: 'organization' as const,
    salutation: null,
    title: null,
    firstName: null,
    lastName: null,
    dateOfBirth: null,
    birthPlace: null,
    gender: null,
    companyName: input.companyName,
    contactPerson: input.contactPerson,
    ...shared,
  }
}

async function rolesFor(reader: DbReader, contactIds: string[]) {
  if (contactIds.length === 0) return new Map<string, Contact['roles']>()

  // Joined for the order alone: the roles of one contact read in the order the
  // catalogue is kept in, the same one every list and every checkbox grid
  // uses. Ordering by the id they point at would be a coin toss.
  const rows = await reader
    .select({
      contactId: contactRole.contactId,
      roleTypeId: contactRole.roleTypeId,
      since: contactRole.since,
    })
    .from(contactRole)
    .innerJoin(contactRoleType, eq(contactRoleType.id, contactRole.roleTypeId))
    .where(inArray(contactRole.contactId, contactIds))
    .orderBy(asc(contactRoleType.sortOrder), asc(contactRoleType.label))

  const byContact = new Map<string, Contact['roles']>()
  for (const row of rows) {
    const list = byContact.get(row.contactId) ?? []
    list.push({ roleTypeId: row.roleTypeId, since: row.since })
    byContact.set(row.contactId, list)
  }
  return byContact
}

/**
 * Brings the stored roles in line with the submitted set, in place.
 *
 * Existing rows are left alone rather than deleted and recreated, so `since`
 * survives an edit that does not touch it. Recreating them would silently
 * reset the date on every save.
 */
async function replaceRoles(
  tx: Transaction,
  tenantId: string,
  contactId: string,
  roles: ContactRoleInput[],
): Promise<void> {
  const existing = await tx
    .select({ id: contactRole.id, roleTypeId: contactRole.roleTypeId, since: contactRole.since })
    .from(contactRole)
    .where(eq(contactRole.contactId, contactId))

  const wanted = new Set(roles.map((entry) => entry.roleTypeId))
  const removed = existing.filter((row) => !wanted.has(row.roleTypeId)).map((row) => row.roleTypeId)

  if (removed.length > 0) {
    await tx
      .delete(contactRole)
      .where(and(eq(contactRole.contactId, contactId), inArray(contactRole.roleTypeId, removed)))
  }

  for (const entry of roles) {
    const current = existing.find((row) => row.roleTypeId === entry.roleTypeId)

    if (!current) {
      await tx.insert(contactRole).values({
        id: newId(),
        tenantId,
        contactId,
        roleTypeId: entry.roleTypeId,
        since: entry.since,
      })
    } else if (current.since !== entry.since) {
      await tx.update(contactRole).set({ since: entry.since }).where(eq(contactRole.id, current.id))
    }
  }
}

async function loadContact(
  reader: DbReader,
  tenantId: string,
  id: string,
): Promise<Contact | null> {
  const [row] = await reader
    .select(detailColumns)
    .from(contact)
    .where(and(eq(contact.tenantId, tenantId), eq(contact.id, id)))
    .limit(1)

  if (!row) return null

  const roles = await rolesFor(reader, [row.id])
  return toContact(row, roles.get(row.id) ?? [])
}

export function getContact(
  database: Database,
  tenantId: string,
  id: string,
): Promise<Contact | null> {
  return loadContact(database, tenantId, id)
}

/** `%` and `_` are wildcards in LIKE; a contact called "100_%" must not match
 *  everything. */
function escapeLikePattern(value: string): string {
  return value.replaceAll(/[\\%_]/g, (character) => `\\${character}`)
}

/**
 * How far either side of now the `current` order looks. Fourteen days covers
 * "was here last week" and "is coming next week", which is what the list is
 * asked for when the practitioner sits down to document.
 */
export const CURRENT_WINDOW_DAYS = 14

const DAY_MS = 86_400_000

/**
 * Seconds between an appointment and now, unsigned — the past and the future
 * are equally close.
 *
 * `abs()` has no interval form in Postgres (`@` does, but reads like a typo),
 * so the difference goes through `extract(epoch from …)` first. The cast on
 * the parameter is not decoration: without it `timestamptz - $1` has to pick
 * between subtracting a timestamp and subtracting an interval.
 */
function distanceToNow(column: SQL | AnyColumn, now: Date): SQL {
  return sql`abs(extract(epoch from ${column} - ${now.toISOString()}::timestamptz))`
}

/**
 * One row per contact with an appointment inside the window: the appointment
 * nearest to now. `distinct on` is what keeps a contact with three
 * appointments this week from appearing three times.
 *
 * Cancelled appointments do not count — the order answers "who is around",
 * and a cancellation is precisely the answer "not this one". A no-show does
 * count: it happened, it just happened without the patient, and it is a reason
 * to open the record.
 */
function nearestAppointments(database: Database, tenantId: string, now: Date) {
  const from = new Date(now.getTime() - CURRENT_WINDOW_DAYS * DAY_MS)
  const to = new Date(now.getTime() + CURRENT_WINDOW_DAYS * DAY_MS)

  return database
    .selectDistinctOn([appointment.contactId], {
      contactId: appointment.contactId,
      startsAt: appointment.startsAt,
    })
    .from(appointment)
    .where(
      and(
        eq(appointment.tenantId, tenantId),
        // An appointment that belongs to nobody (0034) is nobody's next one.
        // Without this the distinct-on would form a group for NULL and carry a
        // blocker into the list as if it were a contact's appointment.
        isNotNull(appointment.contactId),
        gte(appointment.startsAt, from),
        lte(appointment.startsAt, to),
        notInArray(appointment.status, ['cancelled', 'cancelled_late']),
      ),
    )
    .orderBy(appointment.contactId, distanceToNow(appointment.startsAt, now))
    .as('nearest')
}

type ListRow = ContactListRow & { appointmentAt: Date | null }
type Page = { rows: ListRow[]; total: number }

/**
 * The everyday order: whoever was here in the last two weeks or is coming in
 * the next, nearest to now first. Contacts without an appointment in the
 * window are not in this list at all — that is the filter, not a side effect
 * of the sort.
 */
async function currentPage(
  database: Database,
  tenantId: string,
  query: ContactListQuery,
  where: SQL | undefined,
  now: Date,
): Promise<Page> {
  const nearest = nearestAppointments(database, tenantId, now)

  const [rows, [totals]] = await Promise.all([
    database
      .select({ ...listColumns, appointmentAt: nearest.startsAt })
      .from(contact)
      .innerJoin(nearest, eq(nearest.contactId, contact.id))
      .where(where)
      .orderBy(distanceToNow(nearest.startsAt, now))
      .limit(query.limit)
      .offset(query.offset),
    database
      .select({ value: count() })
      .from(contact)
      .innerJoin(nearest, eq(nearest.contactId, contact.id))
      .where(where),
  ])

  return { rows, total: totals?.value ?? 0 }
}

/** The card index. `sort_name` puts the surname first and sorts in the
 *  database's ICU de-DE collation, so umlauts land where a card index would
 *  put them. */
async function alphabeticalPage(
  database: Database,
  query: ContactListQuery,
  where: SQL | undefined,
): Promise<Page> {
  const column = query.sort === 'number' ? contact.contactNumber : contact.sortName
  const direction = query.dir === 'desc' ? desc : asc

  const [rows, [totals]] = await Promise.all([
    database
      .select(listColumns)
      .from(contact)
      .where(where)
      .orderBy(direction(column))
      .limit(query.limit)
      .offset(query.offset),
    database.select({ value: count() }).from(contact).where(where),
  ])

  // No appointment is looked up here: the column that shows one exists only to
  // explain the `current` order.
  return { rows: rows.map((row) => ({ ...row, appointmentAt: null })), total: totals?.value ?? 0 }
}

export async function listContacts(
  database: Database,
  tenantId: string,
  query: ContactListQuery,
  now: Date = new Date(),
): Promise<{ items: ContactListItem[]; total: number }> {
  const filters = [eq(contact.tenantId, tenantId)]

  if (!query.includeArchived) filters.push(isNull(contact.archivedAt))

  if (query.q) {
    // Substring match on purpose — the practitioner types a fragment of a
    // surname. No index can serve a leading wildcard, and at this row count a
    // sequential scan is faster than maintaining one.
    const term = `%${escapeLikePattern(query.q)}%`
    const matches = or(
      ilike(contact.firstName, term),
      ilike(contact.lastName, term),
      ilike(contact.companyName, term),
      sql`${contact.contactNumber}::text like ${term}`,
    )
    if (matches) filters.push(matches)
  }

  if (query.roleTypeId) {
    filters.push(
      sql`exists (
        select 1 from ${contactRole}
         where ${contactRole.contactId} = ${contact.id}
           and ${contactRole.roleTypeId} = ${query.roleTypeId}
      )`,
    )
  }

  const where = and(...filters)

  const { rows, total } =
    query.order === 'current'
      ? await currentPage(database, tenantId, query, where, now)
      : await alphabeticalPage(database, query, where)

  const roles = await rolesFor(
    database,
    rows.map((row) => row.id),
  )

  return {
    items: rows.map((row) => toContactListItem(row, roles.get(row.id) ?? [], row.appointmentAt)),
    total,
  }
}

export async function createContact(
  database: Database,
  tenantId: string,
  input: ContactInput,
): Promise<Contact> {
  return database.transaction(async (tx) => {
    // Number and row are committed together, or neither is — see counter.ts.
    const contactNumber = await nextNumber(tx, tenantId, 'contact')
    const id = newId()

    await tx.insert(contact).values({ id, tenantId, contactNumber, ...columnsFromInput(input) })
    await replaceRoles(tx, tenantId, id, input.roles)

    const created = await loadContact(tx, tenantId, id)
    if (!created) throw new Error('contact vanished within its own transaction')
    return created
  })
}

/**
 * Master data only. Roles are not part of this payload and must not become
 * part of it again — see the note on `contactUpdateSchema`. They are ticked in
 * the page header, which saves immediately, and an open form would otherwise
 * write back the roles as they were when it was opened.
 */
export async function updateContact(
  database: Database,
  tenantId: string,
  id: string,
  input: ContactUpdate,
): Promise<Contact | null> {
  return database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ kind: contact.kind })
      .from(contact)
      .where(and(eq(contact.tenantId, tenantId), eq(contact.id, id)))
      .limit(1)

    if (!existing) return null
    if (existing.kind !== input.kind) throw new ContactKindChangeError()

    await tx
      .update(contact)
      .set(columnsFromInput(input))
      .where(and(eq(contact.tenantId, tenantId), eq(contact.id, id)))

    return loadContact(tx, tenantId, id)
  })
}

/** The one path that changes roles. `since` survives an edit that does not
 *  touch it, because `replaceRoles` updates in place. */
export async function setContactRoles(
  database: Database,
  tenantId: string,
  id: string,
  roles: ContactRoleInput[],
): Promise<Contact | null> {
  return database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: contact.id })
      .from(contact)
      .where(and(eq(contact.tenantId, tenantId), eq(contact.id, id)))
      .limit(1)

    if (!existing) return null

    await replaceRoles(tx, tenantId, id, roles)
    return loadContact(tx, tenantId, id)
  })
}

/**
 * Archiving is the only removal there is — a contact is referenced by
 * activities, notes and invoices that have to stay readable for the retention
 * period, so there is no delete path.
 */
export async function setContactArchived(
  database: Database,
  tenantId: string,
  id: string,
  archived: boolean,
): Promise<Contact | null> {
  const [row] = await database
    .update(contact)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(contact.tenantId, tenantId), eq(contact.id, id)))
    .returning({ id: contact.id })

  if (!row) return null
  return loadContact(database, tenantId, id)
}
