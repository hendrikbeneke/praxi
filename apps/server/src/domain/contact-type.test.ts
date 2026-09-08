import type { ContactInput } from '@praxi/shared'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import {
  foreignKeyViolationConstraint,
  raisedMessage,
  uniqueViolationConstraint,
} from '../db/errors.js'
import { contactRelationType, contactRole, contactRoleType } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant, roleTypeId } from '../test/fixtures.js'
import { createContact } from './contact.js'
import {
  createRelationType,
  createRoleType,
  deleteRelationType,
  deleteRoleType,
  listRelationTypes,
  listRoleTypes,
  RoleTypeInUseError,
  SystemTypeError,
  updateRelationType,
  updateRoleType,
} from './contact-type.js'

let tenantId: string

beforeEach(async () => {
  tenantId = await createTenant(db())
})

/**
 * Runs a query that must be refused by a trigger and returns the message the
 * trigger raised. Asserting on this rather than on what Drizzle throws matters:
 * Drizzle wraps driver errors, and its own message is just the failed SQL — a
 * `rejects.toThrow(/…/)` against it passes for any failure at all.
 */
async function refusal(query: PromiseLike<unknown>): Promise<string | null> {
  try {
    await query
  } catch (error) {
    return raisedMessage(error)
  }
  throw new Error('expected the database to refuse, but the query succeeded')
}

/** Obviously fake, like everywhere else in this repository. */
function testPerson(roles: ContactInput['roles'] = []): ContactInput {
  return {
    kind: 'person',
    salutationId: null,
    title: null,
    firstName: 'Test',
    lastName: 'Testperson',
    dateOfBirth: null,
    birthPlace: null,
    genderId: null,
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
    roles,
  }
}

describe('the seeded catalogue', () => {
  it('gives patient a tab and no standing beyond that', async () => {
    const types = await listRoleTypes(db(), tenantId)
    const patient = types.find((type) => type.label === 'Patient')

    expect(patient).toMatchObject({ showAsTab: true })
    // The point of migration 0035, asserted as a shape: a role type has a
    // label, a tab flag and a place in the list. No code, no system flag, no
    // active flag — nothing logic could key off.
    expect(Object.keys(patient ?? {}).sort()).toEqual(['id', 'label', 'showAsTab', 'sortOrder'])
  })

  it('marks the two relations logic will depend on as system entries', async () => {
    const types = await listRelationTypes(db(), tenantId, false)
    const system = types.filter((type) => type.isSystem).map((type) => type.code)

    expect(system).toEqual(['guardian', 'billing_recipient'])
  })

  it('gives the exclusive type its own side and the symmetric one no inverse label', async () => {
    const types = await listRelationTypes(db(), tenantId, false)

    expect(types.find((type) => type.code === 'billing_recipient')).toMatchObject({
      isExclusive: true,
      labelForward: 'Rechnungsempfänger',
      labelInverse: 'Rechnungsempfänger für',
    })
    // By label, because a type nothing points at carries no code since 0046.
    expect(types.find((type) => type.labelForward === 'Ehepartner von')).toMatchObject({
      isSymmetric: true,
      labelInverse: null,
    })
  })
})

/**
 * Roles used to be protected the same way relations still are: `patient` was a
 * system entry, undeletable, its code frozen. All of that is gone (0035) —
 * these tests assert the *absence*, because a protection that quietly comes
 * back is worse than one that never left.
 */
describe('role types carry no protection', () => {
  it('lets the seeded patient role be deleted while nobody holds it', async () => {
    const patient = await roleTypeId(db(), tenantId, 'Patient')

    expect(await deleteRoleType(db(), tenantId, patient)).toBe(true)
    expect((await listRoleTypes(db(), tenantId)).map((type) => type.label)).toEqual([
      'Interessent',
      'Teilnehmer',
    ])
  })

  it('lets the database delete it too — no trigger stands in the way', async () => {
    const patient = await roleTypeId(db(), tenantId, 'Patient')

    await db().delete(contactRoleType).where(eq(contactRoleType.id, patient))

    expect(await listRoleTypes(db(), tenantId)).toHaveLength(2)
  })

  it('lets it be renamed', async () => {
    const patient = await roleTypeId(db(), tenantId, 'Patient')

    const updated = await updateRoleType(db(), tenantId, patient, {
      label: 'Klientin oder Klient',
      showAsTab: false,
      sortOrder: 5,
    })

    expect(updated).toMatchObject({ label: 'Klientin oder Klient', showAsTab: false, sortOrder: 5 })
  })

  it('refuses a second role with the same label', async () => {
    await expect(
      createRoleType(db(), tenantId, { label: 'Patient', showAsTab: false, sortOrder: 40 }),
    ).rejects.toThrow()
  })
})

describe('system entries', () => {
  it('protect the relation catalogue, and only that one', async () => {
    const [guardian] = await db()
      .select({ id: contactRelationType.id })
      .from(contactRelationType)
      .where(
        and(eq(contactRelationType.tenantId, tenantId), eq(contactRelationType.code, 'guardian')),
      )
      .limit(1)
    if (!guardian) throw new Error('the seed did not create the guardian relation type')

    await expect(deleteRelationType(db(), tenantId, guardian.id)).rejects.toThrow(SystemTypeError)
    expect(
      await refusal(
        db()
          .update(contactRelationType)
          .set({ code: 'custody' })
          .where(eq(contactRelationType.id, guardian.id)),
      ),
    ).toBe('system entry code is immutable')
  })
})

describe('the practice’s own entries', () => {
  it('can be created and deleted while unused', async () => {
    const created = await createRoleType(db(), tenantId, {
      label: 'Zuweiser',
      showAsTab: false,
      sortOrder: 40,
    })

    expect(await deleteRoleType(db(), tenantId, created.id)).toBe(true)
  })

  /** With the number, because "delete them there first" without one sends the
   *  practitioner through the whole card index. */
  it('cannot be deleted while contacts still hold the role, and says how many', async () => {
    const created = await createRoleType(db(), tenantId, {
      label: 'Zuweiser',
      showAsTab: false,
      sortOrder: 40,
    })

    await createContact(db(), tenantId, testPerson([{ roleTypeId: created.id, since: null }]))
    await createContact(db(), tenantId, testPerson([{ roleTypeId: created.id, since: null }]))

    const thrown = await deleteRoleType(db(), tenantId, created.id).catch((error: unknown) => error)
    if (!(thrown instanceof RoleTypeInUseError)) throw new Error('expected RoleTypeInUseError')
    expect(thrown.count).toBe(2)
    // The domain refuses first; the foreign key is the backstop behind it.
    expect(
      foreignKeyViolationConstraint(
        await db()
          .delete(contactRoleType)
          .where(eq(contactRoleType.id, created.id))
          .catch((error: unknown) => error),
      ),
    ).toBe('contact_role_type_fk')
  })
})

describe('tenant scoping', () => {
  it('refuses a role type that belongs to another tenant', async () => {
    const otherTenant = await createTenant(db())
    const foreign = await createRoleType(db(), otherTenant, {
      label: 'Zuweiser',
      showAsTab: false,
      sortOrder: 40,
    })

    const created = await createContact(db(), tenantId, testPerson())

    /**
     * The role type exists — for the other tenant. The foreign key is
     * composite and carries `tenant_id`, so what is checked is the pair and
     * not the id, and this row cannot be written at all.
     */
    let constraint: string | null = null
    try {
      await db().insert(contactRole).values({
        id: newId(),
        tenantId,
        contactId: created.id,
        roleTypeId: foreign.id,
        since: null,
      })
      throw new Error('expected the database to refuse, but the insert succeeded')
    } catch (error) {
      constraint = foreignKeyViolationConstraint(error)
    }

    expect(constraint).toBe('contact_role_type_fk')
  })
})

describe('the symmetry rule', () => {
  it('refuses a symmetric type carrying an inverse label', async () => {
    await expect(
      db().insert(contactRelationType).values({
        id: newId(),
        tenantId,
        code: 'sibling_of',
        labelForward: 'Geschwister von',
        labelInverse: 'Geschwister von',
        isSymmetric: true,
      }),
    ).rejects.toThrow()
  })

  it('refuses a directed type without one', async () => {
    await expect(
      db().insert(contactRelationType).values({
        id: newId(),
        tenantId,
        code: 'refers_to',
        labelForward: 'Überweist an',
        labelInverse: null,
        isSymmetric: false,
      }),
    ).rejects.toThrow()
  })
})

/**
 * Who carries a code, since 0046.
 *
 * It used to be everyone, derived from the label, because `contact_relation`
 * hung from it. The relation points at the id now, so the code is left with
 * the one job it was ever really for: letting `domain/invoice.ts` name
 * `billing_recipient` without writing down a uuid that differs per
 * installation.
 */
describe('the code after the relation moved to the id', () => {
  it('gives a practitioner-made type none at all', async () => {
    const own = await createRelationType(db(), tenantId, {
      labelForward: 'Betreut von',
      labelInverse: 'Betreut',
      isSymmetric: false,
      isExclusive: false,
      sortOrder: 100,
      active: true,
    })

    // Nothing in the software points at this entry, so there is nothing to
    // anchor — and a derived code would have been a second name to keep in
    // step for no reader.
    expect(own.code).toBeNull()
  })

  it('lets two of them exist without colliding', async () => {
    // The old derivation appended `_2` to keep the codes unique for the
    // foreign key. With NULLs there is nothing to collide, and the labels are
    // what tell the two apart.
    const first = await createRelationType(db(), tenantId, {
      labelForward: 'Betreut von',
      labelInverse: 'Betreut',
      isSymmetric: false,
      isExclusive: false,
      sortOrder: 100,
      active: true,
    })
    const second = await createRelationType(db(), tenantId, {
      labelForward: 'Begleitet von',
      labelInverse: 'Begleitet',
      isSymmetric: false,
      isExclusive: false,
      sortOrder: 110,
      active: true,
    })

    expect([first.code, second.code]).toEqual([null, null])
    expect(first.id).not.toBe(second.id)
  })

  it('refuses two types with the same label', async () => {
    const input = {
      labelForward: 'Betreut von',
      labelInverse: 'Betreut',
      isSymmetric: false,
      isExclusive: false,
      sortOrder: 100,
      active: true,
    }
    await createRelationType(db(), tenantId, input)

    // The label is what an entry is recognised by now — two of them in the
    // same picker would be indistinguishable, which is exactly the argument
    // the roles (0035) and the note types (0038) already settled.
    await expect(createRelationType(db(), tenantId, input)).rejects.toSatisfy(
      (error: unknown) =>
        uniqueViolationConstraint(error) === 'contact_relation_type_tenant_label_key',
    )
  })

  it('keeps it on the system entries, which is what it is for', async () => {
    const types = await listRelationTypes(db(), tenantId, false)
    const withCode = types.filter((type) => type.code !== null).map((type) => type.code)

    expect(withCode.sort()).toEqual(['billing_recipient', 'guardian'])
  })

  it('will not let a system entry exist without one', async () => {
    // The check constraint, which is what turns "a system entry has an anchor"
    // from a habit into something the database refuses to break.
    await expect(
      db().insert(contactRelationType).values({
        id: newId(),
        tenantId,
        code: null,
        labelForward: 'Erfundene Systemart',
        labelInverse: 'Erfundene Systemart für',
        isSymmetric: false,
        isSystem: true,
      }),
    ).rejects.toThrow()
  })

  it('leaves a rename alone on an own type, as it always did', async () => {
    const own = await createRelationType(db(), tenantId, {
      labelForward: 'Betreut von',
      labelInverse: 'Betreut',
      isSymmetric: false,
      isExclusive: false,
      sortOrder: 100,
      active: true,
    })

    const renamed = await updateRelationType(db(), tenantId, own.id, {
      labelForward: 'Bezugsperson',
      labelInverse: 'Bezugsperson für',
      isSymmetric: false,
      isExclusive: false,
      sortOrder: 100,
      active: true,
    })

    // The relations hang from the id, so the label is free to change and
    // nothing has to follow it anywhere.
    expect(renamed?.labelForward).toBe('Bezugsperson')
    expect(renamed?.id).toBe(own.id)
    expect(renamed?.code).toBeNull()
  })
})
