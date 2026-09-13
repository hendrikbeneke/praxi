import type { Invoice } from '@praxi/shared'
import { and, eq } from 'drizzle-orm'
import { applyCatalogues, type CataloguePart } from '../cli/catalogues.js'
import type { Database } from '../db/client.js'
import {
  activityType as activityTypeTable,
  contactRelationType,
  contactRoleType,
  country,
  gender,
  noteType,
  salutation,
} from '../db/schema.js'
import { finalizeInvoice } from '../domain/finalize-invoice.js'
import { createTenant as provisionTenant } from '../domain/tenant.js'
import { createUser as provisionUser } from '../domain/user.js'
import { newId } from '../id.js'

/**
 * Fixtures for the domain tests. Names are obviously fake on purpose — no
 * realistic person ever appears in this repository.
 */

/**
 * A test tenant, made **the one way a tenant is made** — `domain/tenant.ts`,
 * the same call `praxi tenant create` makes — and furnished from the same
 * `cli/seeds/default` files the tool applies.
 *
 * That is the point rather than tidiness: every domain test now runs against
 * the provisioning path the tool uses, so a tenant the application cannot
 * reach cannot be the thing the tests are written against. There were three
 * implementations of this before — here, the seed and the demo seed — and they
 * had already drifted: this one created no `practice_settings` at all, which
 * is why three invoice tests carried an insert of their own.
 *
 * A tenant without the catalogues is not a state the application can reach:
 * each of them is the target of a composite foreign key, so without them a
 * contact could hold no role and an activity could have no type.
 */
const TEST_PARTS: readonly CataloguePart[] = [
  'roles',
  'relationTypes',
  'salutations',
  'genders',
  'countries',
  'noteTypes',
  'activityTypes',
]

export async function createTenant(database: Database): Promise<string> {
  const id = newId()

  // A narrower selection, not a second implementation: the services are the
  // one part a test never points at, and they are the slowest to apply.
  await provisionTenant(database, id, {
    practiceName: 'Testpraxis',
    user: testUserInput(id),
  })
  await applyCatalogues({
    tenantId: id,
    run: (work) => database.transaction(work),
    parts: TEST_PARTS,
  })

  return id
}

/**
 * The id of one of the seeded role types, by label.
 *
 * A role has no code since migration 0035, so a test that wants "the patient
 * role" has to look it up. Labelled rather than positional: `roleTypeId(db,
 * tenant, 'Patient')` says what it wants, `types[0].id` says where it happens
 * to sit.
 */
export async function roleTypeId(
  database: Database,
  tenantId: string,
  label: string,
): Promise<string> {
  const [row] = await database
    .select({ id: contactRoleType.id })
    .from(contactRoleType)
    .where(and(eq(contactRoleType.tenantId, tenantId), eq(contactRoleType.label, label)))
    .limit(1)

  if (!row) throw new Error(`no role type labelled ${label}`)
  return row.id
}

/**
 * The id of one of the seeded activity types, by label — the third of these,
 * and by now the pattern rather than the exception: migration 0041 took the
 * code off the activity catalogue the way 0035 took it off the roles and 0038
 * off the note types. `activityTypeId(db, tenant, 'Folgesitzung')` says what it
 * wants; `types[1].id` would say where it happens to sit.
 */
export async function activityTypeId(
  database: Database,
  tenantId: string,
  label: string,
): Promise<string> {
  const [row] = await database
    .select({ id: activityTypeTable.id })
    .from(activityTypeTable)
    .where(and(eq(activityTypeTable.tenantId, tenantId), eq(activityTypeTable.label, label)))
    .limit(1)

  if (!row) throw new Error(`no activity type labelled ${label}`)
  return row.id
}

/**
 * The id of one of the seeded note types, by label — the same shape as
 * `roleTypeId` above and for the same reason: a note type has no code either
 * (migration 0038), and a note cannot be written without one.
 */
/**
 * The id of a seeded relation type, by its forward label.
 *
 * `contact_relation` points at the id since 0046, so a test that wants "the
 * guardian relation" has to look it up — `relationCode: 'guardian'` was a
 * string a fixture could write down, and this is what replaced it. By label
 * rather than by code, because most types no longer have one; the two system
 * entries are `Sorgeberechtigt` and `Rechnungsempfänger`.
 */
export async function relationTypeId(
  database: Database,
  tenantId: string,
  labelForward: string,
): Promise<string> {
  const [row] = await database
    .select({ id: contactRelationType.id })
    .from(contactRelationType)
    .where(
      and(
        eq(contactRelationType.tenantId, tenantId),
        eq(contactRelationType.labelForward, labelForward),
      ),
    )
    .limit(1)

  if (!row) throw new Error(`no relation type labelled "${labelForward}"`)
  return row.id
}

export async function noteTypeId(
  database: Database,
  tenantId: string,
  label: string,
): Promise<string> {
  const [row] = await database
    .select({ id: noteType.id })
    .from(noteType)
    .where(and(eq(noteType.tenantId, tenantId), eq(noteType.label, label)))
    .limit(1)

  if (!row) throw new Error(`no note type labelled ${label}`)
  return row.id
}

/**
 * The id of a seeded value-list entry, by its label — or by its ISO code for a
 * country, which is the only thing a country row carries.
 *
 * None of the three has a code to name it by (D-R3), so a test that wants "the
 * diverse gender" looks it up. Labelled rather than positional: `genderId(db,
 * tenant, 'divers')` says what it wants, `rows[2].id` says where it sits.
 */
export async function salutationId(
  database: Database,
  tenantId: string,
  label: string,
): Promise<string> {
  const [row] = await database
    .select({ id: salutation.id })
    .from(salutation)
    .where(and(eq(salutation.tenantId, tenantId), eq(salutation.label, label)))
    .limit(1)

  if (!row) throw new Error(`no salutation labelled ${label}`)
  return row.id
}

export async function genderId(
  database: Database,
  tenantId: string,
  label: string,
): Promise<string> {
  const [row] = await database
    .select({ id: gender.id })
    .from(gender)
    .where(and(eq(gender.tenantId, tenantId), eq(gender.label, label)))
    .limit(1)

  if (!row) throw new Error(`no gender labelled ${label}`)
  return row.id
}

export async function countryId(
  database: Database,
  tenantId: string,
  isoCode: string,
): Promise<string> {
  const [row] = await database
    .select({ id: country.id })
    .from(country)
    .where(and(eq(country.tenantId, tenantId), eq(country.isoCode, isoCode)))
    .limit(1)

  if (!row) throw new Error(`no country for ${isoCode}`)
  return row.id
}

export type TestUser = {
  id: string
  tenantId: string
  email: string
  password: string
}

/** The default password every test user gets. Obviously not a secret. */
const TEST_PASSWORD = 'correct horse battery staple'

/**
 * The whole id in the local part, not its first eight characters: a UUIDv7
 * begins with the timestamp, so two users created in the same millisecond
 * shared that prefix and collided on the global unique index on `email`.
 */
function testUserInput(seed: string): { email: string; name: string; password: string } {
  return {
    email: `test.user.${seed}@praxi.invalid`,
    name: 'Test Behandler',
    password: TEST_PASSWORD,
  }
}

/**
 * A user, through `domain/user.ts` — the same call `praxi user add` makes, and
 * the reason a test proves the path the tool uses rather than a copy of it.
 * The two inserts were written out here as well until this slice.
 */
export async function createUser(
  database: Database,
  options: { tenantId: string; email?: string; password?: string; name?: string },
): Promise<TestUser> {
  const defaults = testUserInput(newId())
  const input = {
    email: options.email ?? defaults.email,
    name: options.name ?? defaults.name,
    password: options.password ?? defaults.password,
  }

  const created = await provisionUser(database, options.tenantId, input)
  return {
    id: created.id,
    tenantId: options.tenantId,
    email: created.email,
    password: input.password,
  }
}

/**
 * `finalizeInvoice` reduced to the document it produced.
 *
 * It returns two things since slice 8 — the invoice and whether the
 * "Betrag erhalten" outro block was found — and almost every test cares only
 * about the first. The tests that exercise the settle path call
 * `finalizeInvoice` directly.
 */
export async function finalizeDocument(
  ...args: Parameters<typeof finalizeInvoice>
): Promise<Invoice | null> {
  const result = await finalizeInvoice(...args)
  return result?.invoice ?? null
}
