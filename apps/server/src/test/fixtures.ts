import type { Invoice } from '@praxi/shared'
import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import {
  appUser,
  contactRoleType,
  country,
  gender,
  practiceSettings,
  salutation,
  tenant,
} from '../db/schema.js'
import { seedActivityTypes } from '../db/seed/activity-types.js'
import { seedContactTypes } from '../db/seed/contact-types.js'
import { seedValueLists } from '../db/seed/value-lists.js'
import { hashPassword } from '../domain/auth.js'
import { finalizeInvoice } from '../domain/finalize-invoice.js'
import { newId } from '../id.js'

/**
 * Fixtures for the domain tests. Names are obviously fake on purpose — no
 * realistic person ever appears in this repository.
 */

/**
 * The catalogues come with the tenant, from the same functions the seed
 * uses. A tenant without them is not a state the application can reach — every
 * one of them is the target of a composite foreign key, so without them a
 * contact could hold no role and an activity could have no type at all.
 */
export async function createTenant(database: Database): Promise<string> {
  const id = newId()
  await database.insert(tenant).values({ id })
  await seedContactTypes(database, id)
  await seedValueLists(database, id)
  await seedActivityTypes(database, id)
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

export async function createPracticeSettings(
  database: Database,
  tenantId: string,
  overrides: Partial<typeof practiceSettings.$inferInsert> = {},
): Promise<string> {
  const id = newId()
  await database.insert(practiceSettings).values({
    id,
    tenantId,
    practiceName: 'Testpraxis',
    ...overrides,
  })
  return id
}

export type TestUser = {
  id: string
  tenantId: string
  email: string
  password: string
}

export async function createUser(
  database: Database,
  options: {
    tenantId: string
    email?: string
    password?: string
    name?: string
    active?: boolean
  },
): Promise<TestUser> {
  const id = newId()
  const email = options.email ?? `test.user.${id.slice(0, 8)}@praxi.invalid`
  const password = options.password ?? 'correct horse battery staple'

  await database.insert(appUser).values({
    id,
    tenantId: options.tenantId,
    email,
    passwordHash: await hashPassword(password),
    name: options.name ?? 'Test Behandler',
    active: options.active ?? true,
  })

  return { id, tenantId: options.tenantId, email, password }
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
