import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { listRelationTypes, listRoleTypes } from '../domain/contact-type.js'
import { deleteNoteType, listNoteTypes } from '../domain/note-type.js'
import { createTenant } from '../domain/tenant.js'
import { newId } from '../id.js'
import { applyCatalogues, CATALOGUE_PARTS, type TenantRunner } from './catalogues.js'

/**
 * The starting catalogues: that the files are readable and valid, and that
 * applying them twice is not the same as applying them twice over.
 */

/** In the tests `db()` is the owner's pool against this worker's throwaway
 *  database, so a fresh transaction per part is all the runner has to be. */
const run: TenantRunner = (work) => db().transaction(work)

let tenantId: string

beforeEach(async () => {
  tenantId = newId()
  await createTenant(db(), tenantId, {
    practiceName: `Praxis ${tenantId.slice(0, 8)}`,
    user: {
      email: `erste.person.${tenantId}@praxi.invalid`,
      name: 'Erste Person',
      password: 'ein hinreichend langes passwort',
    },
  })
})

describe('the seed files', () => {
  /**
   * Every file in `seeds/default` is applied by a part, and every part reads a
   * file. A file added without a part — or a part whose file was renamed —
   * fails here rather than being applied by nobody, which is the failure that
   * would otherwise be invisible: a catalogue somebody believes is there.
   */
  it('are exactly the files the parts read', async () => {
    const directory = fileURLToPath(new URL('./seeds/default/', import.meta.url))
    const present = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort()

    expect(present).toEqual([
      'activity-types.json',
      'countries.json',
      'genders.json',
      'note-types.json',
      'relation-types.json',
      'roles.json',
      'salutations.json',
    ])
    expect(present).toHaveLength(CATALOGUE_PARTS.length)
  })

  /** Parsing happens inside `applyCatalogues`; a bad file cannot reach the
   *  database, because the schema refuses it first. */
  it('parse and apply through the domain functions', async () => {
    const steps = await applyCatalogues({ tenantId, run })

    expect(steps.map((step) => step.part)).toEqual([...CATALOGUE_PARTS])
    expect(steps.every((step) => step.created > 0 || step.alreadyPresent > 0)).toBe(true)

    expect(await listRoleTypes(db(), tenantId)).toHaveLength(3)
    expect(await listNoteTypes(db(), tenantId)).toHaveLength(5)
  })

  /**
   * The two system relation types are already there from `createTenant`, and
   * the file holds only the two free ones — so the step reports two created
   * beside two that were already present, and nothing collides on the unique
   * label.
   */
  it('adds the free relation types beside the system pair', async () => {
    await applyCatalogues({ tenantId, run, parts: ['relationTypes'] })

    const types = await listRelationTypes(db(), tenantId, true)
    expect(types).toHaveLength(4)
    expect(types.filter((type) => type.isSystem)).toHaveLength(2)
    expect(types.filter((type) => type.code === null)).toHaveLength(2)
  })
})

describe('applying twice', () => {
  it('creates nothing the second time', async () => {
    await applyCatalogues({ tenantId, run })
    const second = await applyCatalogues({ tenantId, run })

    expect(second.every((step) => step.created === 0)).toBe(true)
    expect(second.every((step) => step.alreadyPresent > 0)).toBe(true)

    expect(await listNoteTypes(db(), tenantId)).toHaveLength(5)
  })

  /**
   * Resumption is the derived state and nothing else — there is no log saying
   * "note types done". Delete one and the next run puts back exactly that one,
   * which is what makes a run that broke off halfway continuable by running it
   * again.
   */
  it('puts back exactly what is missing', async () => {
    await applyCatalogues({ tenantId, run })

    const types = await listNoteTypes(db(), tenantId)
    const removed = types.find((type) => type.label === 'Korrespondenz')
    expect(removed).toBeDefined()
    await deleteNoteType(db(), tenantId, removed?.id ?? '')
    expect(await listNoteTypes(db(), tenantId)).toHaveLength(4)

    const third = await applyCatalogues({ tenantId, run })

    expect(third.find((step) => step.part === 'noteTypes')?.created).toBe(1)
    expect(
      third.filter((step) => step.part !== 'noteTypes').every((step) => step.created === 0),
    ).toBe(true)
    expect((await listNoteTypes(db(), tenantId)).map((type) => type.label)).toContain(
      'Korrespondenz',
    )
  })
})
