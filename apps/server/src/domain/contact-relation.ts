import { type ContactRelation, type ContactRelationInput, formatContactName } from '@praxi/shared'
import { and, asc, eq, or, sql } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { contact, contactRelation, contactRelationType } from '../db/schema.js'
import { newId } from '../id.js'

/**
 * Relations between two contacts (CLAUDE.md rule 4).
 *
 * One fact, one row. Which end a contact is on decides what its record calls
 * the other one, so both records show the same row with different labels —
 * storing it twice would let the two copies drift apart.
 */

export class UnknownRelationTypeError extends Error {
  constructor() {
    super('unknown or inactive relation type')
    this.name = 'UnknownRelationTypeError'
  }
}

export class SelfRelationError extends Error {
  constructor() {
    super('a contact cannot be related to itself')
    this.name = 'SelfRelationError'
  }
}

/** The contact on the other end, whichever end this contact is on. */
function otherEnd(contactId: string) {
  return sql`case
    when ${contactRelation.fromContactId} = ${contactId} then ${contactRelation.toContactId}
    else ${contactRelation.fromContactId}
  end`
}

export async function listRelations(
  database: Database,
  tenantId: string,
  contactId: string,
): Promise<ContactRelation[]> {
  const rows = await database
    .select({
      id: contactRelation.id,
      relationCode: contactRelation.relationCode,
      since: contactRelation.since,
      isFrom: sql<boolean>`${contactRelation.fromContactId} = ${contactId}`,
      otherContactId: contact.id,
      otherContactNumber: contact.contactNumber,
      otherArchivedAt: contact.archivedAt,
      kind: contact.kind,
      title: contact.title,
      firstName: contact.firstName,
      lastName: contact.lastName,
      companyName: contact.companyName,
    })
    .from(contactRelation)
    .innerJoin(contact, sql`${contact.id} = ${otherEnd(contactId)}`)
    // Only for the order — the type's other columns are read by the client,
    // which has the catalogue loaded and resolves the label from it.
    .innerJoin(
      contactRelationType,
      and(
        eq(contactRelationType.tenantId, contactRelation.tenantId),
        eq(contactRelationType.code, contactRelation.relationCode),
      ),
    )
    .where(
      and(
        eq(contactRelation.tenantId, tenantId),
        or(
          eq(contactRelation.fromContactId, contactId),
          eq(contactRelation.toContactId, contactId),
        ),
      ),
    )
    .orderBy(asc(contactRelationType.sortOrder), asc(contact.sortName))

  return rows.map((row) => ({
    id: row.id,
    relationCode: row.relationCode,
    direction: row.isFrom ? 'forward' : 'inverse',
    otherContactId: row.otherContactId,
    otherContactName: formatContactName(row),
    otherContactNumber: row.otherContactNumber,
    otherContactArchived: row.otherArchivedAt !== null,
    since: row.since,
  }))
}

/**
 * Adds a relation as entered from `contactId`'s record.
 *
 * `direction` says which end that contact takes, so the same type can be
 * entered from either side and produces one row with the ends swapped. For a
 * symmetric type the direction carries no meaning, so the ends are put in a
 * fixed order — otherwise the same fact could be stored twice, once each way,
 * and `contact_relation_pair_key` would not notice.
 */
export async function addRelation(
  database: Database,
  tenantId: string,
  contactId: string,
  input: ContactRelationInput,
): Promise<ContactRelation | null> {
  if (input.otherContactId === contactId) throw new SelfRelationError()

  const [type] = await database
    .select({ isSymmetric: contactRelationType.isSymmetric })
    .from(contactRelationType)
    .where(
      and(
        eq(contactRelationType.tenantId, tenantId),
        eq(contactRelationType.code, input.relationCode),
        eq(contactRelationType.active, true),
      ),
    )
    .limit(1)

  if (!type) throw new UnknownRelationTypeError()

  let fromContactId = input.direction === 'forward' ? contactId : input.otherContactId
  let toContactId = input.direction === 'forward' ? input.otherContactId : contactId

  if (type.isSymmetric && fromContactId > toContactId) {
    ;[fromContactId, toContactId] = [toContactId, fromContactId]
  }

  const [row] = await database
    .insert(contactRelation)
    .values({
      id: newId(),
      tenantId,
      fromContactId,
      toContactId,
      relationCode: input.relationCode,
      since: input.since,
      // `exclusive` is left at its default on purpose — the
      // `contact_relation_exclusive` trigger fills it from the type.
    })
    .returning({ id: contactRelation.id })

  if (!row) return null

  const relations = await listRelations(database, tenantId, contactId)
  return relations.find((relation) => relation.id === row.id) ?? null
}

/** Either end may remove the relation — it is one fact, and both records show
 *  it. */
export async function deleteRelation(
  database: Database,
  tenantId: string,
  contactId: string,
  id: string,
): Promise<boolean> {
  const deleted = await database
    .delete(contactRelation)
    .where(
      and(
        eq(contactRelation.tenantId, tenantId),
        eq(contactRelation.id, id),
        or(
          eq(contactRelation.fromContactId, contactId),
          eq(contactRelation.toContactId, contactId),
        ),
      ),
    )
    .returning({ id: contactRelation.id })

  return deleted.length > 0
}
