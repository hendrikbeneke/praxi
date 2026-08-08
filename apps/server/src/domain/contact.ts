import type { Contact, ContactInput, ContactListQuery, ContactRoleInput } from '@praxi/shared'
import { and, asc, count, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Database, DbReader, Transaction } from '../db/client.js'
import { contact, contactRole } from '../db/schema.js'
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

const columns = {
  id: contact.id,
  contactNumber: contact.contactNumber,
  kind: contact.kind,
  salutation: contact.salutation,
  title: contact.title,
  firstName: contact.firstName,
  lastName: contact.lastName,
  dateOfBirth: contact.dateOfBirth,
  companyName: contact.companyName,
  vatId: contact.vatId,
  contactPerson: contact.contactPerson,
  street: contact.street,
  postalCode: contact.postalCode,
  city: contact.city,
  country: contact.country,
  email: contact.email,
  phone: contact.phone,
  internalNote: contact.internalNote,
  archivedAt: contact.archivedAt,
}

/** The row as Drizzle returns it: `archived_at` is a `timestamptz` and arrives
 *  as a `Date`, while the wire format is an ISO string. */
type ContactRow = Omit<Contact, 'archivedAt' | 'roles'> & { archivedAt: Date | null }

function toContact(row: ContactRow, roles: Contact['roles']): Contact {
  return { ...row, archivedAt: row.archivedAt?.toISOString() ?? null, roles }
}

/**
 * Maps the discriminated input onto the flat row, explicitly nulling the
 * fields of the other kind. The `contact_kind_fields` check constraint rejects
 * anything else, so this is where the two representations meet.
 */
function columnsFromInput(input: ContactInput) {
  const shared = {
    vatId: input.vatId,
    street: input.street,
    postalCode: input.postalCode,
    city: input.city,
    country: input.country,
    email: input.email,
    phone: input.phone,
    internalNote: input.internalNote,
  }

  if (input.kind === 'person') {
    return {
      kind: 'person' as const,
      salutation: input.salutation,
      title: input.title,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth,
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
    companyName: input.companyName,
    contactPerson: input.contactPerson,
    ...shared,
  }
}

async function rolesFor(reader: DbReader, contactIds: string[]) {
  if (contactIds.length === 0) return new Map<string, Contact['roles']>()

  const rows = await reader
    .select({
      contactId: contactRole.contactId,
      role: contactRole.role,
      since: contactRole.since,
    })
    .from(contactRole)
    .where(inArray(contactRole.contactId, contactIds))
    .orderBy(asc(contactRole.role))

  const byContact = new Map<string, Contact['roles']>()
  for (const row of rows) {
    const list = byContact.get(row.contactId) ?? []
    list.push({ role: row.role, since: row.since })
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
    .select({ id: contactRole.id, role: contactRole.role, since: contactRole.since })
    .from(contactRole)
    .where(eq(contactRole.contactId, contactId))

  const wanted = new Set(roles.map((entry) => entry.role))
  const removed = existing.filter((row) => !wanted.has(row.role)).map((row) => row.role)

  if (removed.length > 0) {
    await tx
      .delete(contactRole)
      .where(and(eq(contactRole.contactId, contactId), inArray(contactRole.role, removed)))
  }

  for (const entry of roles) {
    const current = existing.find((row) => row.role === entry.role)

    if (!current) {
      await tx.insert(contactRole).values({
        id: newId(),
        tenantId,
        contactId,
        role: entry.role,
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
    .select(columns)
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

export async function listContacts(
  database: Database,
  tenantId: string,
  query: ContactListQuery,
): Promise<{ items: Contact[]; total: number }> {
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

  if (query.role) {
    filters.push(
      sql`exists (
        select 1 from ${contactRole}
         where ${contactRole.contactId} = ${contact.id}
           and ${contactRole.role} = ${query.role}
      )`,
    )
  }

  const where = and(...filters)

  const [rows, [totals]] = await Promise.all([
    database
      .select(columns)
      .from(contact)
      .where(where)
      // sort_name puts the surname first and sorts in the database's ICU
      // de-DE collation, so umlauts land where a card index would put them.
      .orderBy(asc(contact.sortName))
      .limit(query.limit)
      .offset(query.offset),
    database.select({ value: count() }).from(contact).where(where),
  ])

  const roles = await rolesFor(
    database,
    rows.map((row) => row.id),
  )

  return {
    items: rows.map((row) => toContact(row, roles.get(row.id) ?? [])),
    total: totals?.value ?? 0,
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

export async function updateContact(
  database: Database,
  tenantId: string,
  id: string,
  input: ContactInput,
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

    await replaceRoles(tx, tenantId, id, input.roles)

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
