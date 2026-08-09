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
} from './contact-relation.js'
import { updateRelationType } from './contact-type.js'

let tenantId: string
let child: string
let mother: string
let father: string

function testPerson(lastName: string): ContactInput {
  return {
    kind: 'person',
    salutation: null,
    title: null,
    firstName: 'Test',
    lastName,
    dateOfBirth: null,
    vatId: null,
    street: null,
    postalCode: null,
    city: null,
    country: 'DE',
    email: null,
    phone: null,
    internalNote: null,
    roles: [],
  }
}

beforeEach(async () => {
  tenantId = await createTenant(db())
  child = (await createContact(db(), tenantId, testPerson('Testkind'))).id
  mother = (await createContact(db(), tenantId, testPerson('Testmutter'))).id
  father = (await createContact(db(), tenantId, testPerson('Testvater'))).id
})

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

  it('cannot be switched on while a contact already holds two', async () => {
    const [type] = await relationTypeId('guardian')
    if (!type) throw new Error('the seed did not create the guardian relation type')

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

    await expect(
      updateRelationType(db(), tenantId, type.id, {
        labelForward: 'Sorgeberechtigt',
        labelInverse: 'Sorgeberechtigt für',
        isSymmetric: false,
        isExclusive: true,
        sortOrder: 10,
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
    const [type] = await relationTypeId('guardian')
    if (!type) throw new Error('the seed did not create the guardian relation type')

    await addRelation(db(), tenantId, child, {
      relationCode: 'guardian',
      direction: 'forward',
      otherContactId: mother,
      since: null,
    })

    await updateRelationType(db(), tenantId, type.id, {
      labelForward: 'Sorgeberechtigt',
      labelInverse: 'Sorgeberechtigt für',
      isSymmetric: false,
      isExclusive: true,
      sortOrder: 10,
      active: true,
    })

    // The mirrored column now says so, so the index guards the old row too.
    const [row] = await db().select({ exclusive: contactRelation.exclusive }).from(contactRelation)
    expect(row?.exclusive).toBe(true)

    await expect(
      addRelation(db(), tenantId, child, {
        relationCode: 'guardian',
        direction: 'forward',
        otherContactId: father,
        since: null,
      }),
    ).rejects.toThrow()
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
