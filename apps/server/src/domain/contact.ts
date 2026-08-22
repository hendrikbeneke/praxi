import type {
  Contact,
  ContactInput,
  ContactListItem,
  ContactListQuery,
  ContactRoleInput,
  ContactSortField,
  ContactUpdate,
  Page,
} from '@praxi/shared'
import { and, asc, count, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Database, DbReader, Transaction } from '../db/client.js'
import { contact, contactRole, contactRoleType } from '../db/schema.js'
import { newId } from '../id.js'
import { nextNumber } from './counter.js'
import type { SortExpression } from './keyset.js'
import { afterCursor, cursorOrder, decodeCursor, InvalidCursorError, takePage } from './keyset.js'

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
  salutationId: contact.salutationId,
  title: contact.title,
  firstName: contact.firstName,
  lastName: contact.lastName,
  dateOfBirth: contact.dateOfBirth,
  birthPlace: contact.birthPlace,
  genderId: contact.genderId,
  companyName: contact.companyName,
  vatId: contact.vatId,
  contactPerson: contact.contactPerson,
  street: contact.street,
  houseNumber: contact.houseNumber,
  postalCode: contact.postalCode,
  city: contact.city,
  countryId: contact.countryId,
  email: contact.email,
  phoneMobile: contact.phoneMobile,
  phoneLandline: contact.phoneLandline,
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
  internalNote: contact.internalNote,
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

function toContactListItem(row: ContactListRow, roles: Contact['roles']): ContactListItem {
  return {
    ...row,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    roles,
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
    countryId: input.countryId,
    // Shared, not person-only: an organization is addressed as "Firma …" too.
    salutationId: input.salutationId,
    email: input.email,
    phoneMobile: input.phoneMobile,
    phoneLandline: input.phoneLandline,
    internalNote: input.internalNote,
    diagnosis: input.diagnosis,
  }

  if (input.kind === 'person') {
    return {
      kind: 'person' as const,
      title: input.title,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth,
      birthPlace: input.birthPlace,
      genderId: input.genderId,
      companyName: null,
      contactPerson: null,
      ...shared,
    }
  }

  return {
    kind: 'organization' as const,
    title: null,
    firstName: null,
    lastName: null,
    dateOfBirth: null,
    birthPlace: null,
    genderId: null,
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
 * Which column each sort field means. Adding one is this line plus the entry
 * in `contactSortFields` — which columns the list *offers* is the screen's
 * decision, not this map's.
 *
 * `sort_name` puts the surname first and sorts in the database's ICU de-DE
 * collation, so umlauts land where a card index would put them.
 */
const SORT_COLUMNS = {
  name: contact.sortName,
  number: contact.contactNumber,
  street: contact.street,
  houseNumber: contact.houseNumber,
  postalCode: contact.postalCode,
  city: contact.city,
  email: contact.email,
  phoneMobile: contact.phoneMobile,
  phoneLandline: contact.phoneLandline,
  dateOfBirth: contact.dateOfBirth,
  /**
   * Cast, and not for tidiness: a `pgEnum` sorts by the order its values were
   * *declared*, so `kind` would come back person-then-organization however the
   * arrow points. As text it sorts by the stored words — and those happen to
   * carry the same order as the German labels on screen ("Organisation" before
   * "Person"), which is the whole requirement: the arrow must not visibly do
   * something other than what the column shows.
   */
  kind: sql`${contact.kind}::text`,
  archived: contact.archivedAt,
} as const satisfies Record<ContactSortField, SortExpression>

/** The same value, read off the fetched row for the cursor. Kept beside the
 *  map above so a new sort field cannot be added to one and forgotten in the
 *  other. */
function sortValueOf(row: ContactListRow, field: ContactSortField): string | number | null {
  if (field === 'number') return row.contactNumber
  // A timestamp, unlike every other key here — sent as the ISO string the
  // column compares against.
  if (field === 'archived') return row.archivedAt?.toISOString() ?? null
  if (field === 'name') {
    // `sort_name` is generated, so it is not among the selected columns —
    // recomposed here exactly as the database defines it.
    return row.companyName ?? `${row.lastName ?? ''} ${row.firstName ?? ''}`.trim()
  }
  return row[field]
}

/**
 * The contact list: one page of it, in the order the screen asked for.
 *
 * **One order, sorted the way any list is sorted.** Until L3 there were two —
 * an alphabetical one and a `current` one that ordered by nearness to now and
 * *filtered* to fourteen days either side while doing it, so "Aktuell" showed
 * five contacts where "Alle" showed a hundred. The switch, the window and the
 * filtering are gone together, and with them the join that fetched each
 * contact's nearest appointment on every read.
 *
 * **Paged by cursor** (`domain/keyset.ts`), so scrolling cannot skip a row,
 * and sorted by the chosen column *and then by id*, because none of these
 * columns is unique and a keyset needs a total order.
 *
 * `total` is counted only for the first page: it does not change while
 * scrolling, and counting it again on every fetch pays for an answer already
 * given.
 */
export async function listContacts(
  database: Database,
  tenantId: string,
  query: ContactListQuery,
): Promise<Page<ContactListItem>> {
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

  const column = SORT_COLUMNS[query.sort]

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor)
    if (!cursor) throw new InvalidCursorError()
    filters.push(afterCursor(column, contact.id, query.dir, cursor))
  }

  const where = and(...filters)

  // One row more than asked for: that is how "is there another page" is
  // answered without a second count — see `takePage`.
  const rows = await database
    .select(listColumns)
    .from(contact)
    .where(where)
    .orderBy(...cursorOrder(column, contact.id, query.dir))
    .limit(query.limit + 1)

  const page = takePage(rows, query.limit, (row) => ({
    k: sortValueOf(row, query.sort),
    i: row.id,
  }))

  const roles = await rolesFor(
    database,
    page.items.map((row) => row.id),
  )

  const items = page.items.map((row) => toContactListItem(row, roles.get(row.id) ?? []))

  if (query.cursor) return { items, nextCursor: page.nextCursor }

  // First page only — and reached only when no cursor was given, so `where`
  // carries the filters alone and counts the whole selection.
  const [totals] = await database.select({ value: count() }).from(contact).where(where)

  return { items, nextCursor: page.nextCursor, total: totals?.value ?? 0 }
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
