import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import {
  activityType,
  contactRelationType,
  contactRoleType,
  noteType,
  practiceSettings,
  salutation,
  tenant,
} from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant, tenantsForSelection } from './tenant.js'
import { createUser } from './user.js'

const user = {
  email: 'erste.person@praxi.invalid',
  name: 'Erste Person',
  password: 'ein hinreichend langes passwort',
}

let id: string

beforeEach(() => {
  id = newId()
})

describe('createTenant', () => {
  it('creates the tenant, its practice settings and its first user', async () => {
    const created = await createTenant(db(), id, { practiceName: 'Praxis am Wall', user })

    expect(created.tenantId).toBe(id)
    expect(created.user.email).toBe(user.email)

    const [row] = await db()
      .select({ name: practiceSettings.practiceName, street: practiceSettings.street })
      .from(practiceSettings)
      .where(eq(practiceSettings.tenantId, id))

    expect(row?.name).toBe('Praxis am Wall')
    // The name and nothing else: a placeholder address in a real practice's
    // settings is read as a record that exists.
    expect(row?.street).toBeNull()
  })

  /**
   * The boundary this whole slice turns on: what a tenant structurally IS
   * belongs here, the starting values belong to the tool. If this test ever
   * finds a role type, a catalogue has crept back into the domain.
   */
  it('creates the two system relation types and NO other catalogue', async () => {
    await createTenant(db(), id, { practiceName: 'Praxis am Wall', user })

    const relations = await db()
      .select({
        code: contactRelationType.code,
        isSystem: contactRelationType.isSystem,
        isExclusive: contactRelationType.isExclusive,
      })
      .from(contactRelationType)
      .where(eq(contactRelationType.tenantId, id))

    expect(relations.map((row) => row.code).sort()).toEqual(['billing_recipient', 'guardian'])
    expect(relations.every((row) => row.isSystem)).toBe(true)
    // `billing_recipient` is the exclusive one — a contact has at most one.
    expect(relations.find((row) => row.code === 'billing_recipient')?.isExclusive).toBe(true)

    for (const table of [contactRoleType, noteType, activityType, salutation]) {
      const rows = await db().select({ id: table.id }).from(table).where(eq(table.tenantId, id))
      expect(rows).toHaveLength(0)
    }
  })

  /** One transaction: a tenant nobody can sign into must not survive. */
  it('leaves no tenant behind when the user cannot be created', async () => {
    const taken = newId()
    await createTenant(db(), taken, { practiceName: 'Erste Praxis', user })

    await expect(createTenant(db(), id, { practiceName: 'Zweite Praxis', user })).rejects.toThrow()

    const rows = await db().select({ id: tenant.id }).from(tenant).where(eq(tenant.id, id))
    expect(rows).toHaveLength(0)
  })
})

describe('tenantsForSelection', () => {
  it('names each tenant by its practice name and counts its users', async () => {
    await createTenant(db(), id, { practiceName: 'Praxis am Wall', user })
    await createUser(db(), id, {
      email: 'zweite.person@praxi.invalid',
      name: 'Zweite Person',
      password: 'ein hinreichend langes passwort',
    })

    const entry = (await tenantsForSelection(db())).find((row) => row.id === id)

    expect(entry?.practiceName).toBe('Praxis am Wall')
    expect(entry?.userCount).toBe(2)
  })
})
