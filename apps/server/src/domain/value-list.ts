import type {
  CountryEntry,
  CountryEntryInput,
  ValueListEntry,
  ValueListEntryInput,
} from '@praxi/shared'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { contact, country, gender, salutation } from '../db/schema.js'
import { newId } from '../id.js'
import { moveInList } from './reorder.js'

/**
 * The three value lists behind a contact's own fields (D-R3): salutation,
 * gender, country.
 *
 * One module rather than three, because the rules are the same one written
 * three times — create, rename, reorder, and refuse to delete an entry a
 * contact still points at. The differences are two: `country` carries an ISO
 * code instead of a label, and only `salutation` may be held by an
 * organization. Neither is worth a file of its own.
 *
 * Built like `contact_role_type` after migration 0035: no code as an anchor,
 * so a label stays renamable and every contact follows, and no `active` flag,
 * because an assignment is one nullable column that can always be cleared.
 * There is no dead end here for a flag to manage — unlike a service, which
 * cannot be removed from a finalized invoice.
 */

/** A catalogue entry some contact still points at. Counted rather than left to
 *  the foreign key, so the message can say how many — "clear it there first"
 *  without a number sends the practitioner through the whole card index. */
export class ValueInUseError extends Error {
  constructor(
    readonly list: 'salutation' | 'gender' | 'country',
    readonly count: number,
  ) {
    super(`${list} entry is held by ${count} contacts`)
    this.name = 'ValueInUseError'
  }
}

const labelColumns = (table: typeof salutation | typeof gender) => ({
  id: table.id,
  label: table.label,
  sortOrder: table.sortOrder,
})

const countryColumns = {
  id: country.id,
  isoCode: country.isoCode,
  sortOrder: country.sortOrder,
}

/** Which contact column points at which list — the one place the three differ
 *  for the count, and the reason `deleteEntry` below can be written once. */
const holders = {
  salutation: contact.salutationId,
  gender: contact.genderId,
  country: contact.countryId,
} as const

async function countHolders(
  database: Database,
  tenantId: string,
  list: keyof typeof holders,
  id: string,
): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(contact)
    .where(and(eq(contact.tenantId, tenantId), eq(holders[list], id)))

  return row?.count ?? 0
}

// ----------------------------------------------------------- label lists

export function listSalutations(database: Database, tenantId: string): Promise<ValueListEntry[]> {
  return listLabels(database, tenantId, salutation)
}

export function listGenders(database: Database, tenantId: string): Promise<ValueListEntry[]> {
  return listLabels(database, tenantId, gender)
}

function listLabels(
  database: Database,
  tenantId: string,
  table: typeof salutation | typeof gender,
): Promise<ValueListEntry[]> {
  return database
    .select(labelColumns(table))
    .from(table)
    .where(eq(table.tenantId, tenantId))
    .orderBy(asc(table.sortOrder), asc(table.label))
}

export async function createLabelEntry(
  database: Database,
  tenantId: string,
  list: 'salutation' | 'gender',
  input: ValueListEntryInput,
): Promise<ValueListEntry> {
  const table = list === 'salutation' ? salutation : gender
  const [row] = await database
    .insert(table)
    .values({ id: newId(), tenantId, ...input })
    .returning(labelColumns(table))

  if (!row) throw new Error('insert returned no row')
  return row
}

export async function updateLabelEntry(
  database: Database,
  tenantId: string,
  list: 'salutation' | 'gender',
  id: string,
  input: ValueListEntryInput,
): Promise<ValueListEntry | null> {
  const table = list === 'salutation' ? salutation : gender
  const [row] = await database
    .update(table)
    .set(input)
    .where(and(eq(table.tenantId, tenantId), eq(table.id, id)))
    .returning(labelColumns(table))

  return row ?? null
}

// --------------------------------------------------------------- country

export function listCountries(database: Database, tenantId: string): Promise<CountryEntry[]> {
  return database
    .select(countryColumns)
    .from(country)
    .where(eq(country.tenantId, tenantId))
    .orderBy(asc(country.sortOrder), asc(country.isoCode))
}

/**
 * Adding a country is choosing one, not describing one — there is no label to
 * send and nothing to rename afterwards, which is why there is no update
 * counterpart to this beyond reordering.
 */
export async function createCountryEntry(
  database: Database,
  tenantId: string,
  input: CountryEntryInput,
): Promise<CountryEntry> {
  const [row] = await database
    .insert(country)
    .values({ id: newId(), tenantId, ...input })
    .returning(countryColumns)

  if (!row) throw new Error('insert returned no row')
  return row
}

// ------------------------------------------------- delete and reorder, all

/** Refuses an entry a contact still points at, with the number. The foreign
 *  key would refuse it too and stays as the backstop, but it can only name a
 *  constraint. */
export async function deleteEntry(
  database: Database,
  tenantId: string,
  list: 'salutation' | 'gender' | 'country',
  id: string,
): Promise<boolean> {
  const table = tableFor(list)

  const [existing] = await database
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.tenantId, tenantId), eq(table.id, id)))
    .limit(1)

  if (!existing) return false

  const held = await countHolders(database, tenantId, list, id)
  if (held > 0) throw new ValueInUseError(list, held)

  const deleted = await database
    .delete(table)
    .where(and(eq(table.tenantId, tenantId), eq(table.id, id)))
    .returning({ id: table.id })

  return deleted.length > 0
}

/** Swaps with the neighbour `delta` steps away and renumbers the whole list
 *  gaplessly, in one transaction — see `domain/reorder.ts`. Ordered exactly as
 *  the listing queries above order, so a move lines up with the screen. */
export function moveEntry(
  database: Database,
  tenantId: string,
  list: 'salutation' | 'gender' | 'country',
  id: string,
  delta: 1 | -1,
): Promise<boolean> {
  const table = tableFor(list)
  const second = list === 'country' ? country.isoCode : (table as typeof salutation).label

  return moveInList(database, tenantId, id, delta, {
    list: (reader, tid) =>
      reader
        .select({ id: table.id, sortOrder: table.sortOrder })
        .from(table)
        .where(eq(table.tenantId, tid))
        .orderBy(asc(table.sortOrder), asc(second)),
    setSortOrder: async (tx, rowId, sortOrder) => {
      await tx.update(table).set({ sortOrder }).where(eq(table.id, rowId))
    },
  })
}

function tableFor(list: 'salutation' | 'gender' | 'country') {
  if (list === 'salutation') return salutation
  if (list === 'gender') return gender
  return country
}
