import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { foreignKeyViolationConstraint } from '../db/errors.js'
import { contact, salutation } from '../db/schema.js'
import { createTenant, salutationId } from '../test/fixtures.js'
import { createContact } from './contact.js'
import {
  createCountryEntry,
  createLabelEntry,
  deleteEntry,
  listCountries,
  listGenders,
  listSalutations,
  moveEntry,
  updateLabelEntry,
  ValueInUseError,
} from './value-list.js'

let tenantId: string

beforeEach(async () => {
  tenantId = await createTenant(db())
})

/** Obviously fake, like everywhere else in this repository. */
function person(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'person' as const,
    title: null,
    firstName: 'Erika',
    lastName: 'Testperson',
    dateOfBirth: null,
    birthPlace: null,
    genderId: null,
    salutationId: null,
    vatId: null,
    street: null,
    houseNumber: null,
    postalCode: null,
    city: null,
    countryId: null,
    email: null,
    phoneMobile: null,
    phoneLandline: null,
    internalNote: null,
    diagnosis: null,
    roles: [],
    ...overrides,
  }
}

describe('the seeded lists', () => {
  it('start with a salutation for an organization as well as for a person', async () => {
    expect((await listSalutations(db(), tenantId)).map((entry) => entry.label)).toEqual([
      'Herr',
      'Frau',
      'Firma',
    ])
  })

  it('carry the three genders German civil status law knows', async () => {
    expect((await listGenders(db(), tenantId)).map((entry) => entry.label)).toEqual([
      'weiblich',
      'männlich',
      'divers',
    ])
  })

  /**
   * One country, not the eight the old fixed list carried: which countries the
   * practice bills into is a choice it makes, and the first is the obvious one.
   */
  it('offer one country to start from', async () => {
    expect((await listCountries(db(), tenantId)).map((entry) => entry.isoCode)).toEqual(['DE'])
  })

  /**
   * The shape is the point (D-R3): a label and a place in the list, and
   * nothing logic could key off — no code, no system flag, no active flag.
   */
  it('expose nothing beyond a label and an order', async () => {
    const [first] = await listSalutations(db(), tenantId)
    expect(Object.keys(first ?? {}).sort()).toEqual(['id', 'label', 'sortOrder'])
  })
})

describe('editing', () => {
  it('renames an entry, and every contact follows because the id did not move', async () => {
    const id = await salutationId(db(), tenantId, 'Herr')
    const created = await createContact(db(), tenantId, person({ salutationId: id }))

    const updated = await updateLabelEntry(db(), tenantId, 'salutation', id, {
      label: 'Sehr geehrter Herr',
      sortOrder: 10,
    })

    expect(updated?.label).toBe('Sehr geehrter Herr')
    const [row] = await db().select().from(contact).where(eq(contact.id, created.id))
    expect(row?.salutationId).toBe(id)
  })

  it('refuses a second entry with the same label', async () => {
    await expect(
      createLabelEntry(db(), tenantId, 'salutation', { label: 'Herr', sortOrder: 40 }),
    ).rejects.toThrow()
  })

  it('refuses the same country twice', async () => {
    await expect(
      createCountryEntry(db(), tenantId, { isoCode: 'DE', sortOrder: 20 }),
    ).rejects.toThrow()
  })

  it('reorders the way every other catalogue does', async () => {
    const frau = await salutationId(db(), tenantId, 'Frau')
    await moveEntry(db(), tenantId, 'salutation', frau, -1)

    expect((await listSalutations(db(), tenantId)).map((entry) => entry.label)).toEqual([
      'Frau',
      'Herr',
      'Firma',
    ])
  })
})

describe('deleting', () => {
  it('removes an entry nobody points at', async () => {
    const created = await createLabelEntry(db(), tenantId, 'gender', {
      label: 'keine Angabe im Pass',
      sortOrder: 40,
    })

    expect(await deleteEntry(db(), tenantId, 'gender', created.id)).toBe(true)
  })

  /** With the number, because "clear it there first" without one sends the
   *  practitioner through the whole card index. */
  it('refuses an entry a contact still holds, and says how many', async () => {
    const id = await salutationId(db(), tenantId, 'Herr')
    await createContact(db(), tenantId, person({ salutationId: id }))
    await createContact(db(), tenantId, person({ salutationId: id }))

    const thrown = await deleteEntry(db(), tenantId, 'salutation', id).catch(
      (error: unknown) => error,
    )
    if (!(thrown instanceof ValueInUseError)) throw new Error('expected ValueInUseError')
    expect(thrown.count).toBe(2)
    expect(thrown.list).toBe('salutation')

    // The domain refuses first; the foreign key is the backstop behind it.
    expect(
      foreignKeyViolationConstraint(
        await db()
          .delete(salutation)
          .where(eq(salutation.id, id))
          .catch((error: unknown) => error),
      ),
    ).toBe('contact_salutation_fk')
  })

  /**
   * Deleting one and picking another has to be possible without a flag: that
   * is the whole reason none of these lists has an `active` column. An
   * assignment is one nullable field, so there is no dead end.
   */
  it('lets an entry go once the contact no longer points at it', async () => {
    const id = await salutationId(db(), tenantId, 'Frau')
    const created = await createContact(db(), tenantId, person({ salutationId: id }))

    await db().update(contact).set({ salutationId: null }).where(eq(contact.id, created.id))

    expect(await deleteEntry(db(), tenantId, 'salutation', id)).toBe(true)
  })
})

describe('tenant scoping', () => {
  it('refuses a value that belongs to another tenant', async () => {
    const otherTenant = await createTenant(db())
    const foreign = await salutationId(db(), otherTenant, 'Herr')

    await expect(createContact(db(), tenantId, person({ salutationId: foreign }))).rejects.toThrow()
  })

  it('does not count the contacts of another tenant when refusing a delete', async () => {
    const otherTenant = await createTenant(db())
    const mine = await salutationId(db(), tenantId, 'Herr')
    await createContact(
      db(),
      otherTenant,
      person({
        salutationId: await salutationId(db(), otherTenant, 'Herr'),
      }),
    )

    expect(await deleteEntry(db(), tenantId, 'salutation', mine)).toBe(true)
  })
})
