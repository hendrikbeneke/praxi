import { type NewTenantInput, newTenantSchema } from '@praxi/shared'
import { count, eq } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { appUser, contactRelationType, practiceSettings, tenant } from '../db/schema.js'
import { newId } from '../id.js'
import { type CreatedUser, createUser } from './user.js'

/**
 * Bringing a tenant into being — the one place it happens, after three.
 *
 * **What is here is only what a tenant structurally IS**: the row, its practice
 * settings, its first user, and the two system relation types below. The
 * starting catalogues — roles, salutations, genders, countries, note types,
 * activity types — are not a property of a tenant but an initial fitting-out,
 * and they are applied by the CLI afterwards through the same domain functions
 * the settings screens call. That way the tool walks the paths a user walks,
 * and a path that has broken is noticed at the next tenant rather than at the
 * first customer.
 */

/**
 * `guardian` and `billing_recipient`, and they are here rather than in a seed
 * file for a reason the schema already states: `contactRelationTypeInputSchema`
 * has no `isSystem` and no `code`, and `contact_relation_type_system_needs_code`
 * refuses a system entry without one — so `createRelationType` cannot produce
 * these two at all, deliberately, because only entries logic depends on may
 * carry a code.
 *
 * Which makes them the opposite of a starting value: `finalizeInvoice` resolves
 * `billing_recipient` by its code, and the reminder about a minor without a
 * guardian looks for `guardian`. A tenant without them is not a tenant with a
 * shorter list; it is one where two features silently do nothing.
 *
 * The labels are the practitioner's to change — `protect_system_type` freezes
 * the code and nothing else.
 */
const SYSTEM_RELATION_TYPES = [
  {
    code: 'guardian',
    labelForward: 'Sorgeberechtigt',
    labelInverse: 'Sorgeberechtigt für',
    isSymmetric: false,
    isExclusive: false,
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
    sortOrder: 20,
  },
] as const

export type CreatedTenant = {
  tenantId: string
  user: CreatedUser
}

/**
 * The tenant id is a **parameter**, not something this generates.
 *
 * The caller needs it before the first statement runs: the CLI sets
 * `app.tenant_id` to it and creates the tenant under row-level security, where
 * the policy on `tenant` (`id = app.tenant_id`, WITH CHECK) then permits this
 * one tenant and no other. Generating the id in here would force every caller
 * to the owner's connection, which is the thing worth not doing.
 *
 * One transaction: a tenant without a user is a practice nobody can sign into,
 * and a half-created one is worse than none.
 */
export async function createTenant(
  database: Database,
  tenantId: string,
  input: NewTenantInput,
): Promise<CreatedTenant> {
  const { practiceName, user } = newTenantSchema.parse(input)

  return database.transaction(async (tx) => {
    await tx.insert(tenant).values({ id: tenantId })

    // The name, and nothing else. Address, tax number and bank details stay
    // empty because a placeholder in a real practice's settings is read as a
    // record that exists.
    await tx.insert(practiceSettings).values({ id: newId(), tenantId, practiceName })

    await tx.insert(contactRelationType).values(
      SYSTEM_RELATION_TYPES.map((type) => ({
        id: newId(),
        tenantId,
        isSystem: true,
        ...type,
      })),
    )

    return { tenantId, user: await createUser(tx, tenantId, user) }
  })
}

export type TenantDirectoryEntry = {
  id: string
  practiceName: string
  userCount: number
}

/**
 * **The one read in this software that legitimately looks across tenants**,
 * besides `google_connection_tenant_ids()`, and it is named here so that using
 * it is a decision.
 *
 * A command that takes a tenant has to find it before it can scope to itself:
 * under row-level security, "is there already a practice of this name" and "let
 * me pick one from a list" both answer with nothing. So the CLI resolves the
 * tenant through this — and writes nothing here. What it hands out is an id and
 * a practice name, which is practice identity and not patient data.
 *
 * It must be given the **owner's** handle (`ownerDb()`); `cli/tenant-lookup.ts`
 * is the only place that does, and a test says so.
 */
export async function tenantsForSelection(database: Database): Promise<TenantDirectoryEntry[]> {
  const rows = await database
    .select({
      id: tenant.id,
      practiceName: practiceSettings.practiceName,
      userCount: count(appUser.id),
    })
    .from(tenant)
    .leftJoin(practiceSettings, eq(practiceSettings.tenantId, tenant.id))
    .leftJoin(appUser, eq(appUser.tenantId, tenant.id))
    .groupBy(tenant.id, practiceSettings.practiceName)

  return rows
    .map((row) => ({
      id: row.id,
      practiceName: row.practiceName ?? '',
      userCount: row.userCount,
    }))
    .sort((left, right) => left.practiceName.localeCompare(right.practiceName, 'de-DE'))
}
