/**
 * The value lists every tenant starts with (D-R3).
 *
 * None of these entries has any standing: `Herr`, `weiblich` and `DE` are a
 * starting point, deletable and renamable like anything the practitioner adds.
 * No code reads any of them.
 *
 * Idempotent: an entry that already exists keeps what it has. Migration 0037
 * carries a frozen copy for the tenant that existed when it ran — this file is
 * the living definition.
 */
import { newId } from '../../id.js'
import type { Database } from '../client.js'
import { country, gender, salutation } from '../schema.js'

/** "Firma" is here on purpose: it is allowed on an organization too, because
 *  "Firma Mustermann GmbH" is the usual first line of a German address. */
const SALUTATIONS = [
  { label: 'Herr', sortOrder: 10 },
  { label: 'Frau', sortOrder: 20 },
  { label: 'Firma', sortOrder: 30 },
] as const

const GENDERS = [
  { label: 'weiblich', sortOrder: 10 },
  { label: 'männlich', sortOrder: 20 },
  { label: 'divers', sortOrder: 30 },
] as const

/** One country, not the eight the old fixed list carried: which ones the
 *  practice bills into is a choice it makes, and the first is the obvious one. */
const COUNTRIES = [{ isoCode: 'DE', sortOrder: 10 }] as const

export async function seedValueLists(database: Database, tenantId: string): Promise<void> {
  for (const entry of SALUTATIONS) {
    await database
      .insert(salutation)
      .values({ id: newId(), tenantId, ...entry })
      .onConflictDoNothing({ target: [salutation.tenantId, salutation.label] })
  }

  for (const entry of GENDERS) {
    await database
      .insert(gender)
      .values({ id: newId(), tenantId, ...entry })
      .onConflictDoNothing({ target: [gender.tenantId, gender.label] })
  }

  for (const entry of COUNTRIES) {
    await database
      .insert(country)
      .values({ id: newId(), tenantId, ...entry })
      .onConflictDoNothing({ target: [country.tenantId, country.isoCode] })
  }
}
