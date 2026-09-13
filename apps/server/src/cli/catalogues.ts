import {
  activityTypeCreateSchema,
  contactRelationTypeInputSchema,
  contactRoleTypeInputSchema,
  countryEntryInputSchema,
  noteTypeInputSchema,
  valueListEntryInputSchema,
} from '@praxi/shared'
import { z } from 'zod'
import type { Transaction } from '../db/client.js'
import { createActivityType, listActivityTypes } from '../domain/activity-type.js'
import {
  createRelationType,
  createRoleType,
  listRelationTypes,
  listRoleTypes,
} from '../domain/contact-type.js'
import { createNoteType, listNoteTypes } from '../domain/note-type.js'
import {
  createCountryEntry,
  createLabelEntry,
  listCountries,
  listGenders,
  listSalutations,
} from '../domain/value-list.js'
import { readSeedFile } from './seed-files.js'

/**
 * The initial fitting-out of a tenant, applied **through the domain functions
 * the settings screens call**.
 *
 * That is the whole design of this file and it is not tidiness: the tool walks
 * the paths a user walks, so a path that has broken is noticed at the next
 * tenant rather than at the first customer. Writing the rows directly would be
 * shorter and would let states exist that the application cannot reach.
 *
 * What is *not* here: the two system relation types, which `createTenant`
 * writes because `createRelationType` provably cannot (no `isSystem` and no
 * `code` in the input schema, and `contact_relation_type_system_needs_code`
 * refuses a system entry without one); and services, which start empty — see
 * `seeds/default/README.md`.
 *
 * **Resumption is the derived state and nothing else.** Each part reads what is
 * there and creates only what is missing, compared on what its catalogue is
 * unique on. A second run creates nothing, and there is no log file that could
 * disagree with the database.
 *
 * Where a catalogue has an `active` flag, what is there is read **including the
 * inactive entries**: a deactivated entry still holds its label against the
 * unique index, so counting it as missing would fail on the insert rather than
 * skip it — and it is there, it is merely out of the picker.
 */

export const CATALOGUE_PARTS = [
  'roles',
  'relationTypes',
  'salutations',
  'genders',
  'countries',
  'noteTypes',
  'activityTypes',
] as const

export type CataloguePart = (typeof CATALOGUE_PARTS)[number]

/** What the operator reads while it runs, and what a test asserts on. */
export type CatalogueStep = {
  part: CataloguePart
  /** As it is printed — `note types`, not `noteTypes`. */
  label: string
  created: number
  alreadyPresent: number
}

/**
 * Opens a **fresh** tenant-scoped transaction, once per part.
 *
 * A callback rather than a database handle, because per-part atomicity is the
 * point: a failure in the note types leaves the five parts before it standing,
 * and the next run picks up there. Handing in one transaction would make the
 * whole thing all-or-nothing and the resumption pointless.
 */
export type TenantRunner = <T>(work: (tx: Transaction) => Promise<T>) => Promise<T>

type ApplyOptions = {
  tenantId: string
  run: TenantRunner
  parts?: readonly CataloguePart[]
  onStep?: (step: CatalogueStep) => void
}

const PART_LABELS: Record<CataloguePart, string> = {
  roles: 'roles',
  relationTypes: 'relation types',
  salutations: 'salutations',
  genders: 'genders',
  countries: 'countries',
  noteTypes: 'note types',
  activityTypes: 'activity types',
}

/**
 * One part: what the file says, what is there, and the difference.
 *
 * `key` is what the catalogue is recognised by — the label everywhere, the ISO
 * code for countries — which is exactly the column its unique index is on.
 */
async function applyPart<Entry, Existing>(
  entries: readonly Entry[],
  existing: readonly Existing[],
  key: { of: (entry: Entry) => string; ofExisting: (row: Existing) => string },
  create: (entry: Entry) => Promise<unknown>,
): Promise<{ created: number; alreadyPresent: number }> {
  const present = new Set(existing.map(key.ofExisting))
  const missing = entries.filter((entry) => !present.has(key.of(entry)))

  for (const entry of missing) await create(entry)

  return { created: missing.length, alreadyPresent: entries.length - missing.length }
}

async function applyOne(
  part: CataloguePart,
  tenantId: string,
  tx: Transaction,
): Promise<{ created: number; alreadyPresent: number }> {
  switch (part) {
    case 'roles': {
      const entries = await readSeedFile(
        'default',
        'roles.json',
        z.array(contactRoleTypeInputSchema),
      )
      return applyPart(
        entries,
        await listRoleTypes(tx, tenantId),
        { of: (entry) => entry.label, ofExisting: (row) => row.label },
        (entry) => createRoleType(tx, tenantId, entry),
      )
    }

    case 'relationTypes': {
      const entries = await readSeedFile(
        'default',
        'relation-types.json',
        z.array(contactRelationTypeInputSchema),
      )
      return applyPart(
        entries,
        await listRelationTypes(tx, tenantId, true),
        { of: (entry) => entry.labelForward, ofExisting: (row) => row.labelForward },
        (entry) => createRelationType(tx, tenantId, entry),
      )
    }

    case 'salutations':
    case 'genders': {
      const list = part === 'salutations' ? 'salutation' : 'gender'
      const entries = await readSeedFile(
        'default',
        `${part}.json`,
        z.array(valueListEntryInputSchema),
      )
      const existing =
        part === 'salutations'
          ? await listSalutations(tx, tenantId)
          : await listGenders(tx, tenantId)
      return applyPart(
        entries,
        existing,
        { of: (entry) => entry.label, ofExisting: (row) => row.label },
        (entry) => createLabelEntry(tx, tenantId, list, entry),
      )
    }

    case 'countries': {
      const entries = await readSeedFile(
        'default',
        'countries.json',
        z.array(countryEntryInputSchema),
      )
      return applyPart(
        entries,
        await listCountries(tx, tenantId),
        { of: (entry) => entry.isoCode, ofExisting: (row) => row.isoCode },
        (entry) => createCountryEntry(tx, tenantId, entry),
      )
    }

    case 'noteTypes': {
      const entries = await readSeedFile('default', 'note-types.json', z.array(noteTypeInputSchema))
      return applyPart(
        entries,
        await listNoteTypes(tx, tenantId),
        { of: (entry) => entry.label, ofExisting: (row) => row.label },
        (entry) => createNoteType(tx, tenantId, entry),
      )
    }

    case 'activityTypes': {
      const entries = await readSeedFile(
        'default',
        'activity-types.json',
        z.array(activityTypeCreateSchema),
      )
      return applyPart(
        entries,
        await listActivityTypes(tx, tenantId, true),
        { of: (entry) => entry.label, ofExisting: (row) => row.label },
        (entry) => createActivityType(tx, tenantId, entry),
      )
    }
  }
}

export async function applyCatalogues(options: ApplyOptions): Promise<CatalogueStep[]> {
  const { tenantId, run, parts = CATALOGUE_PARTS, onStep } = options
  const steps: CatalogueStep[] = []

  for (const part of parts) {
    const counted = await run((tx) => applyOne(part, tenantId, tx))
    const step: CatalogueStep = { part, label: PART_LABELS[part], ...counted }
    steps.push(step)
    onStep?.(step)
  }

  return steps
}
