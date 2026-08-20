/**
 * The role and relation types every tenant starts with (CLAUDE.md rule 4).
 *
 * The **relation** entries marked `isSystem` are the ones the software itself
 * depends on: `guardian` and `billing_recipient` are what other parts resolve
 * when they need a counterpart. They cannot be deleted and their code cannot
 * change; everything about how they read can.
 *
 * **The roles carry no such entry.** `patient` is a starting point like the
 * other two and nothing more — it is deletable and renamable, and no code
 * anywhere looks for it. Who is pseudonymized towards Google is decided by a
 * switch on the Google connection, not by a role (migration 0035).
 *
 * The rest are a starting point, editable and deletable like anything the
 * practitioner adds.
 *
 * Idempotent: an entry that already exists keeps what it has. Migrations 0017
 * and 0035 carry the history for the tenant that existed when they ran — this
 * file is the living definition.
 */
import { newId } from '../../id.js'
import type { Database } from '../client.js'
import { contactRelationType, contactRoleType } from '../schema.js'

const ROLE_TYPES = [
  { label: 'Patient', showAsTab: true, sortOrder: 10 },
  { label: 'Interessent', showAsTab: false, sortOrder: 20 },
  { label: 'Teilnehmer', showAsTab: false, sortOrder: 30 },
] as const

const RELATION_TYPES = [
  {
    code: 'guardian',
    labelForward: 'Sorgeberechtigt',
    labelInverse: 'Sorgeberechtigt für',
    isSymmetric: false,
    isExclusive: false,
    isSystem: true,
    sortOrder: 10,
  },
  {
    code: 'billing_recipient',
    labelForward: 'Rechnungsempfänger',
    labelInverse: 'Rechnungsempfänger für',
    isSymmetric: false,
    // A contact has at most one billing recipient. The direction follows the
    // convention on `contact_relation_type`: `from` is the contact the fact
    // belongs to, which is also the side exclusivity is enforced on.
    isExclusive: true,
    isSystem: true,
    sortOrder: 20,
  },
  {
    code: 'parent_of',
    labelForward: 'Elternteil von',
    labelInverse: 'Kind von',
    isSymmetric: false,
    isExclusive: false,
    isSystem: false,
    sortOrder: 30,
  },
  {
    code: 'spouse_of',
    labelForward: 'Ehepartner von',
    labelInverse: null,
    isSymmetric: true,
    isExclusive: false,
    isSystem: false,
    sortOrder: 40,
  },
] as const

export async function seedContactTypes(database: Database, tenantId: string): Promise<void> {
  for (const type of ROLE_TYPES) {
    await database
      .insert(contactRoleType)
      .values({ id: newId(), tenantId, ...type })
      // The label is the anchor now; there is no code to key off.
      .onConflictDoNothing({ target: [contactRoleType.tenantId, contactRoleType.label] })
  }

  for (const type of RELATION_TYPES) {
    await database
      .insert(contactRelationType)
      .values({ id: newId(), tenantId, ...type })
      .onConflictDoNothing({ target: [contactRelationType.tenantId, contactRelationType.code] })
  }
}
