import type { ContactInput } from '@praxi/shared'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { foreignKeyViolationConstraint, raisedMessage } from '../db/errors.js'
import { contactRelationType, contactRole, contactRoleType } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant } from '../test/fixtures.js'
import { createContact } from './contact.js'
import {
  createRoleType,
  deleteRelationType,
  deleteRoleType,
  listRelationTypes,
  listRoleTypes,
  SystemTypeError,
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
    salutation: null,
    title: null,
    firstName: 'Test',
    lastName: 'Testperson',
    dateOfBirth: null,
    birthPlace: null,
    gender: null,
    vatId: null,
    street: null,
    houseNumber: null,
    postalCode: null,
    city: null,
    country: 'DE',
    email: null,
    phoneMobile: null,
    phoneLandline: null,
    internalNote: null,
    diagnosis: null,
    roles,
  }
}

function roleTypeRow(code: string) {
  return db()
    .select({ id: contactRoleType.id, isSystem: contactRoleType.isSystem })
    .from(contactRoleType)
    .where(and(eq(contactRoleType.tenantId, tenantId), eq(contactRoleType.code, code)))
    .limit(1)
}

describe('the seeded catalogue', () => {
  it('marks patient as a system role and gives it a tab', async () => {
    const types = await listRoleTypes(db(), tenantId, false)
    const patient = types.find((type) => type.code === 'patient')

    expect(patient).toMatchObject({ isSystem: true, showAsTab: true, active: true })
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
    expect(types.find((type) => type.code === 'spouse_of')).toMatchObject({
      isSymmetric: true,
      labelInverse: null,
    })
  })
})

describe('system entries', () => {
  it('are not deletable through the domain', async () => {
    const [patient] = await roleTypeRow('patient')
    if (!patient) throw new Error('the seed did not create the patient role type')

    await expect(deleteRoleType(db(), tenantId, patient.id)).rejects.toThrow(SystemTypeError)

    const [stillThere] = await roleTypeRow('patient')
    expect(stillThere).toBeDefined()
  })

  it('are not deletable at the database either', async () => {
    const [patient] = await roleTypeRow('patient')
    if (!patient) throw new Error('the seed did not create the patient role type')

    expect(
      await refusal(db().delete(contactRoleType).where(eq(contactRoleType.id, patient.id))),
    ).toBe('system entry is not deletable')
  })

  it('keep their code when it is changed at the database', async () => {
    const [patient] = await roleTypeRow('patient')
    if (!patient) throw new Error('the seed did not create the patient role type')

    expect(
      await refusal(
        db()
          .update(contactRoleType)
          .set({ code: 'client' })
          .where(eq(contactRoleType.id, patient.id)),
      ),
    ).toBe('system entry code is immutable')
  })

  it('cannot have the system flag cleared, which would be a way around the guard', async () => {
    const [patient] = await roleTypeRow('patient')
    if (!patient) throw new Error('the seed did not create the patient role type')

    expect(
      await refusal(
        db()
          .update(contactRoleType)
          .set({ isSystem: false })
          .where(eq(contactRoleType.id, patient.id)),
      ),
    ).toBe('system flag is immutable')
  })

  it('stay editable in everything that is presentation', async () => {
    const [patient] = await roleTypeRow('patient')
    if (!patient) throw new Error('the seed did not create the patient role type')

    const updated = await updateRoleType(db(), tenantId, patient.id, {
      label: 'Klientin oder Klient',
      showAsTab: false,
      sortOrder: 5,
      active: true,
    })

    expect(updated).toMatchObject({ code: 'patient', label: 'Klientin oder Klient', sortOrder: 5 })
  })

  it('protect the relation catalogue the same way', async () => {
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
      code: 'referrer',
      label: 'Zuweiser',
      showAsTab: false,
      sortOrder: 40,
      active: true,
    })

    expect(await deleteRoleType(db(), tenantId, created.id)).toBe(true)
  })

  it('cannot be deleted while a contact still holds the role', async () => {
    const created = await createRoleType(db(), tenantId, {
      code: 'referrer',
      label: 'Zuweiser',
      showAsTab: false,
      sortOrder: 40,
      active: true,
    })

    await createContact(db(), tenantId, testPerson([{ roleCode: 'referrer', since: null }]))

    await expect(deleteRoleType(db(), tenantId, created.id)).rejects.toThrow()
  })
})

describe('tenant scoping', () => {
  it('refuses a role type that belongs to another tenant', async () => {
    const otherTenant = await createTenant(db())
    await createRoleType(db(), otherTenant, {
      code: 'referrer',
      label: 'Zuweiser',
      showAsTab: false,
      sortOrder: 40,
      active: true,
    })

    const created = await createContact(db(), tenantId, testPerson())

    /**
     * The code exists — for the other tenant. The foreign key is composite and
     * carries `tenant_id`, so what is checked is the pair and not the string,
     * and this row cannot be written at all.
     */
    let constraint: string | null = null
    try {
      await db().insert(contactRole).values({
        id: newId(),
        tenantId,
        contactId: created.id,
        roleCode: 'referrer',
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
