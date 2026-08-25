import type { ContactInput } from '@praxi/shared'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { uniqueViolationConstraint } from '../db/errors.js'
import { contactRelation, contactRelationType } from '../db/schema.js'
import { createTenant } from '../test/fixtures.js'
import { createContact } from './contact.js'
import {
  addRelation,
  deleteRelation,
  listRelations,
  SelfRelationError,
  UnknownRelationTypeError,
  updateRelation,
} from './contact-relation.js'
import { createRelationType, SystemTypeReadOnlyError, updateRelationType } from './contact-type.js'

let tenantId: string
let child: string
let mother: string
let father: string

function testPerson(lastName: string): ContactInput {
  return {
    kind: 'person',
    salutationId: null,
    title: null,
    firstName: 'Test',
    lastName,
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
    roles: [],
  }
}

beforeEach(async () => {
  tenantId = await createTenant(db())
  child = (await createContact(db(), tenantId, testPerson('Testkind'))).id
  mother = (await createContact(db(), tenantId, testPerson('Testmutter'))).id
  father = (await createContact(db(), tenantId, testPerson('Testvater'))).id
})

/**
 * A relation type the practitioner made, for the tests about switching a type
 * to exclusive.
 *
 * They used `guardian` until B1, and `guardian` is a **system** entry: since
 * that slice its labels, direction and exclusivity are frozen, because the
 * software looks `guardian` and `billing_recipient` up by their code and a
 * renamed one would make the contact record disagree with what the code does.
 * What these tests are about is the mirrored `contact_relation.exclusive`
 * column and the partial index over it, which is a mechanism of every type —
 * so an ordinary one is the honest subject.
 */
async function ownRelationType() {
  // No code is passed: since B1d it is derived from the label — the tests
  // therefore use what comes back rather than a name they chose.
  return createRelationType(db(), tenantId, {
    labelForward: 'Betreut',
    labelInverse: 'Betreut von',
    isSymmetric: false,
    isExclusive: false,
    sortOrder: 90,
    active: true,
  })
}

function relationTypeId(code: string) {
  return db()
    .select({ id: contactRelationType.id })
    .from(contactRelationType)
    .where(and(eq(contactRelationType.tenantId, tenantId), eq(contactRelationType.code, code)))
    .limit(1)
}

describe('adding a relation', () => {
  it('shows up in both records with the matching side', async () => {
    await addRelation(db(), tenantId, child, {
      relationCode: 'guardian',
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })

    const fromChild = await listRelations(db(), tenantId, child)
    expect(fromChild).toHaveLength(1)
    expect(fromChild[0]).toMatchObject({ direction: 'forward', otherContactId: mother })

    const fromMother = await listRelations(db(), tenantId, mother)
    expect(fromMother).toHaveLength(1)
    expect(fromMother[0]).toMatchObject({ direction: 'inverse', otherContactId: child })
    // Same row, seen from the other end.
    expect(fromMother[0]?.id).toBe(fromChild[0]?.id)
  })

  it('stores the same row when entered from the other side', async () => {
    await addRelation(db(), tenantId, mother, {
      relationCode: 'guardian',
      direction: 'inverse',
      otherContactId: child,
      since: null,
    })

    const [row] = await db()
      .select({ from: contactRelation.fromContactId, to: contactRelation.toContactId })
      .from(contactRelation)

    // The child is the `from` end either way — that is what the direction
    // convention on `contact_relation_type` is for.
    expect(row).toEqual({ from: child, to: mother })
  })

  it('refuses a relation of a contact to itself', async () => {
    await expect(
      addRelation(db(), tenantId, child, {
        relationCode: 'guardian',
        direction: 'forward',
        otherContactId: child,
        since: null,
      }),
    ).rejects.toThrow(SelfRelationError)
  })

  it('refuses one at the database too', async () => {
    await expect(
      db().insert(contactRelation).values({
        id: '019fde08-0000-7000-8000-000000000001',
        tenantId,
        fromContactId: child,
        toContactId: child,
        relationCode: 'guardian',
        since: null,
      }),
    ).rejects.toThrow()
  })

  it('refuses the same relation between the same two contacts twice', async () => {
    const input = {
      relationCode: 'guardian' as const,
      direction: 'forward' as const,
      otherContactId: mother,
      since: null,
    }
    await addRelation(db(), tenantId, child, input)

    await expect(addRelation(db(), tenantId, child, input)).rejects.toSatisfy(
      (error: unknown) => uniqueViolationConstraint(error) === 'contact_relation_pair_key',
    )
  })

  it('refuses an unknown relation type', async () => {
    await expect(
      addRelation(db(), tenantId, child, {
        relationCode: 'nonsense',
        direction: 'forward',
        otherContactId: mother,
        since: null,
      }),
    ).rejects.toThrow(UnknownRelationTypeError)
  })

  it('refuses an inactive one', async () => {
    const [type] = await relationTypeId('parent_of')
    if (!type) throw new Error('the seed did not create the parent_of relation type')

    await updateRelationType(db(), tenantId, type.id, {
      labelForward: 'Elternteil von',
      labelInverse: 'Kind von',
      isSymmetric: false,
      isExclusive: false,
      sortOrder: 30,
      active: false,
    })

    await expect(
      addRelation(db(), tenantId, mother, {
        relationCode: 'parent_of',
        direction: 'forward',
        otherContactId: child,
        since: null,
      }),
    ).rejects.toThrow(UnknownRelationTypeError)
  })
})

describe('exclusive types', () => {
  it('allow only one relation per contact', async () => {
    await addRelation(db(), tenantId, child, {
      relationCode: 'billing_recipient',
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })

    await expect(
      addRelation(db(), tenantId, child, {
        relationCode: 'billing_recipient',
        direction: 'forward',
        otherContactId: father,
        since: null,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => uniqueViolationConstraint(error) === 'contact_relation_exclusive_key',
    )
  })

  /** Exclusivity is per `from` contact, which the direction convention makes
   *  the side that owns the fact: one payer may well settle for two children. */
  it('leave the other end free to hold several', async () => {
    const secondChild = (await createContact(db(), tenantId, testPerson('Testkind zwei'))).id

    await addRelation(db(), tenantId, child, {
      relationCode: 'billing_recipient',
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })
    await addRelation(db(), tenantId, secondChild, {
      relationCode: 'billing_recipient',
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })

    expect(await listRelations(db(), tenantId, mother)).toHaveLength(2)
  })

  it('are what a non-exclusive type is not', async () => {
    await addRelation(db(), tenantId, child, {
      relationCode: 'guardian',
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })
    await addRelation(db(), tenantId, child, {
      relationCode: 'guardian',
      direction: 'forward',
      otherContactId: father,
      since: null,
    })

    expect(await listRelations(db(), tenantId, child)).toHaveLength(2)
  })

  it('refuse a second one on the same contact', async () => {
    await addRelation(db(), tenantId, child, {
      relationCode: 'billing_recipient',
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })

    await expect(
      addRelation(db(), tenantId, child, {
        relationCode: 'billing_recipient',
        direction: 'forward',
        otherContactId: father,
        since: null,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => uniqueViolationConstraint(error) === 'contact_relation_exclusive_key',
    )

    // Swapping the billing recipient is editing the one that stands — see
    // `updateRelation` below, which is what replaced the `replace` flag.
    expect(await listRelations(db(), tenantId, child)).toHaveLength(1)
  })

  it('cannot be switched on while a contact already holds two', async () => {
    const type = await ownRelationType()

    await addRelation(db(), tenantId, child, {
      relationCode: type.code,
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })
    await addRelation(db(), tenantId, child, {
      relationCode: type.code,
      direction: 'forward',
      otherContactId: father,
      since: null,
    })

    await expect(
      updateRelationType(db(), tenantId, type.id, {
        labelForward: 'Betreut',
        labelInverse: 'Betreut von',
        isSymmetric: false,
        isExclusive: true,
        sortOrder: 90,
        active: true,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => uniqueViolationConstraint(error) === 'contact_relation_exclusive_key',
    )

    // The whole edit rolls back — the type is untouched.
    const [after] = await db()
      .select({ isExclusive: contactRelationType.isExclusive })
      .from(contactRelationType)
      .where(eq(contactRelationType.id, type.id))
    expect(after?.isExclusive).toBe(false)
  })

  it('propagate the switch onto existing relations', async () => {
    const type = await ownRelationType()

    await addRelation(db(), tenantId, child, {
      relationCode: type.code,
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })

    await updateRelationType(db(), tenantId, type.id, {
      labelForward: 'Betreut',
      labelInverse: 'Betreut von',
      isSymmetric: false,
      isExclusive: true,
      sortOrder: 90,
      active: true,
    })

    // The mirrored column now says so, so the index guards the old row too.
    const [row] = await db().select({ exclusive: contactRelation.exclusive }).from(contactRelation)
    expect(row?.exclusive).toBe(true)

    await expect(
      addRelation(db(), tenantId, child, {
        relationCode: type.code,
        direction: 'forward',
        otherContactId: father,
        since: null,
      }),
    ).rejects.toThrow()
  })

  /**
   * The other half of the same rule (B1): a system entry refuses the edit
   * outright. `billing_recipient` is exclusive and has to stay that way — an
   * invoice resolves its recipient through this relation and relies on there
   * being at most one.
   */
  it('cannot be switched off on a system type', async () => {
    const [type] = await relationTypeId('billing_recipient')
    if (!type) throw new Error('the seed did not create the billing_recipient relation type')

    await expect(
      updateRelationType(db(), tenantId, type.id, {
        labelForward: 'Rechnungsempfänger',
        labelInverse: 'Rechnungsempfänger für',
        isSymmetric: false,
        isExclusive: false,
        sortOrder: 20,
        active: true,
      }),
    ).rejects.toThrow(SystemTypeReadOnlyError)
  })

  /** …but switching it off entirely is allowed: a practice that never bills a
   *  third party can take the entry out of the picker. */
  it('lets a system type be deactivated', async () => {
    const [type] = await relationTypeId('billing_recipient')
    if (!type) throw new Error('the seed did not create the billing_recipient relation type')

    const saved = await updateRelationType(db(), tenantId, type.id, {
      labelForward: 'Rechnungsempfänger',
      labelInverse: 'Rechnungsempfänger für',
      isSymmetric: false,
      isExclusive: true,
      sortOrder: 20,
      active: false,
    })

    expect(saved?.active).toBe(false)
  })
})

describe('symmetric types', () => {
  it('store one row whichever side enters it', async () => {
    await addRelation(db(), tenantId, mother, {
      relationCode: 'spouse_of',
      direction: 'forward',
      otherContactId: father,
      since: null,
    })

    // The same fact from the other side must not become a second row.
    await expect(
      addRelation(db(), tenantId, father, {
        relationCode: 'spouse_of',
        direction: 'forward',
        otherContactId: mother,
        since: null,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => uniqueViolationConstraint(error) === 'contact_relation_pair_key',
    )

    expect(await listRelations(db(), tenantId, father)).toHaveLength(1)
    expect(await listRelations(db(), tenantId, mother)).toHaveLength(1)
  })
})

describe('changing a relation', () => {
  it('swaps the counterpart of an exclusive type without ever leaving none', async () => {
    const created = await addRelation(db(), tenantId, child, {
      relationCode: 'billing_recipient',
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })
    if (!created) throw new Error('the relation was not created')

    const changed = await updateRelation(db(), tenantId, child, created.id, {
      relationCode: 'billing_recipient',
      direction: 'forward',
      otherContactId: father,
      since: null,
    })

    expect(changed?.otherContactId).toBe(father)

    // One row, not two — which is the exclusivity index doing its work inside
    // the same transaction that removed the old one.
    const relations = await listRelations(db(), tenantId, child)
    expect(relations).toHaveLength(1)
    expect(relations[0]?.otherContactId).toBe(father)
    expect(await listRelations(db(), tenantId, mother)).toEqual([])
  })

  it('changes the kind, and with it which end the row is stored on', async () => {
    const created = await addRelation(db(), tenantId, child, {
      relationCode: 'guardian',
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })
    if (!created) throw new Error('the relation was not created')

    await updateRelation(db(), tenantId, child, created.id, {
      relationCode: 'guardian',
      direction: 'inverse',
      otherContactId: mother,
      since: null,
    })

    const [fromChild] = await listRelations(db(), tenantId, child)
    const [fromMother] = await listRelations(db(), tenantId, mother)
    expect(fromChild?.direction).toBe('inverse')
    expect(fromMother?.direction).toBe('forward')
  })

  it('works from either end, like removing does', async () => {
    const created = await addRelation(db(), tenantId, child, {
      relationCode: 'guardian',
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })
    if (!created) throw new Error('the relation was not created')

    const changed = await updateRelation(db(), tenantId, mother, created.id, {
      relationCode: 'guardian',
      direction: 'inverse',
      otherContactId: child,
      since: null,
    })

    expect(changed?.otherContactId).toBe(child)
    expect(await listRelations(db(), tenantId, child)).toHaveLength(1)
  })

  it('leaves the row alone when the id belongs to contacts this one is not part of', async () => {
    const created = await addRelation(db(), tenantId, child, {
      relationCode: 'guardian',
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })
    if (!created) throw new Error('the relation was not created')

    const stranger = (await createContact(db(), tenantId, testPerson('Testfremd'))).id

    expect(
      await updateRelation(db(), tenantId, stranger, created.id, {
        relationCode: 'guardian',
        direction: 'forward',
        otherContactId: mother,
        since: null,
      }),
    ).toBeNull()

    // And the original is still there: a refused edit must not delete.
    expect(await listRelations(db(), tenantId, child)).toHaveLength(1)
  })

  it('rolls the removal back when the new row cannot be written', async () => {
    const kept = await addRelation(db(), tenantId, child, {
      relationCode: 'guardian',
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })
    const doomed = await addRelation(db(), tenantId, child, {
      relationCode: 'guardian',
      direction: 'forward',
      otherContactId: father,
      since: null,
    })
    if (!kept || !doomed) throw new Error('the relations were not created')

    // Pointing the second one at the mother collides with the first: same
    // pair, same code. The delete inside the transaction has to go with it.
    await expect(
      updateRelation(db(), tenantId, child, doomed.id, {
        relationCode: 'guardian',
        direction: 'forward',
        otherContactId: mother,
        since: null,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => uniqueViolationConstraint(error) === 'contact_relation_pair_key',
    )

    expect(await listRelations(db(), tenantId, child)).toHaveLength(2)
  })

  it('refuses an unknown type and a relation to the contact itself', async () => {
    const created = await addRelation(db(), tenantId, child, {
      relationCode: 'guardian',
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })
    if (!created) throw new Error('the relation was not created')

    await expect(
      updateRelation(db(), tenantId, child, created.id, {
        relationCode: 'gibt_es_nicht',
        direction: 'forward',
        otherContactId: mother,
        since: null,
      }),
    ).rejects.toBeInstanceOf(UnknownRelationTypeError)

    await expect(
      updateRelation(db(), tenantId, child, created.id, {
        relationCode: 'guardian',
        direction: 'forward',
        otherContactId: child,
        since: null,
      }),
    ).rejects.toBeInstanceOf(SelfRelationError)
  })
})

describe('removing a relation', () => {
  it('works from either end', async () => {
    const created = await addRelation(db(), tenantId, child, {
      relationCode: 'guardian',
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })
    if (!created) throw new Error('the relation was not created')

    expect(await deleteRelation(db(), tenantId, mother, created.id)).toBe(true)
    expect(await listRelations(db(), tenantId, child)).toEqual([])
  })

  it('does not touch a relation of contacts this one is not part of', async () => {
    const created = await addRelation(db(), tenantId, child, {
      relationCode: 'guardian',
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })
    if (!created) throw new Error('the relation was not created')

    const stranger = (await createContact(db(), tenantId, testPerson('Testfremd'))).id
    expect(await deleteRelation(db(), tenantId, stranger, created.id)).toBe(false)
  })
})
