import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { account, appUser } from '../db/schema.js'
import { createTenant } from '../test/fixtures.js'
import { verifyPassword } from './auth.js'
import { createUser, EmailTakenError, emailTaken } from './user.js'

let tenantId: string

beforeEach(async () => {
  tenantId = await createTenant(db())
})

async function credentialOf(userId: string): Promise<string | null> {
  const [row] = await db()
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    .limit(1)
  return row?.password ?? null
}

describe('createUser', () => {
  /**
   * Not "a row exists" but "this user can sign in": the credential lives in
   * `account` since S-B, and a user without that row exists and is locked out.
   * Asserting the hash verifies is the only form of this that would have caught
   * the two inserts drifting apart.
   */
  it('creates a user that can actually sign in', async () => {
    const created = await createUser(db(), tenantId, {
      email: 'neue.person@praxi.invalid',
      name: 'Neue Person',
      password: 'ein hinreichend langes passwort',
    })

    const hash = await credentialOf(created.id)
    expect(hash).not.toBeNull()
    expect(hash).not.toBe('ein hinreichend langes passwort')
    expect(await verifyPassword(hash ?? '', 'ein hinreichend langes passwort')).toBe(true)
    expect(await verifyPassword(hash ?? '', 'etwas ganz anderes hier')).toBe(false)
  })

  it('lower-cases the email, because the column has a check constraint on it', async () => {
    const created = await createUser(db(), tenantId, {
      email: '  GROSS.Geschrieben@Praxi.Invalid ',
      name: 'Gross Geschrieben',
      password: 'ein hinreichend langes passwort',
    })

    expect(created.email).toBe('gross.geschrieben@praxi.invalid')

    const [row] = await db()
      .select({ email: appUser.email })
      .from(appUser)
      .where(eq(appUser.id, created.id))
    expect(row?.email).toBe('gross.geschrieben@praxi.invalid')
  })

  /**
   * The decision from slice 1: the sign-in form has no tenant context, so the
   * address identifies the user across all of them. A practice trying to reuse
   * an address in a second tenant is the case this message exists for.
   */
  it('refuses an email that is taken in ANOTHER tenant', async () => {
    const otherTenant = await createTenant(db())
    await createUser(db(), otherTenant, {
      email: 'einmalig@praxi.invalid',
      name: 'Erste Person',
      password: 'ein hinreichend langes passwort',
    })

    await expect(
      createUser(db(), tenantId, {
        email: 'einmalig@praxi.invalid',
        name: 'Zweite Person',
        password: 'ein hinreichend langes passwort',
      }),
    ).rejects.toBeInstanceOf(EmailTakenError)
  })

  it('refuses a password below the policy, with the schema the API uses', async () => {
    await expect(
      createUser(db(), tenantId, {
        email: 'zu.kurz@praxi.invalid',
        name: 'Zu Kurz',
        password: 'kurz',
      }),
    ).rejects.toThrow()
  })

  /** The user and the credential are one transaction: a refusal leaves neither. */
  it('leaves no half user behind when it refuses', async () => {
    const before = await db().select({ id: appUser.id }).from(appUser)

    await expect(
      createUser(db(), tenantId, {
        email: 'nicht angelegt',
        name: 'Kaputte Adresse',
        password: 'ein hinreichend langes passwort',
      }),
    ).rejects.toThrow()

    const after = await db().select({ id: appUser.id }).from(appUser)
    expect(after).toHaveLength(before.length)
  })
})

describe('emailTaken', () => {
  it('answers across tenants and is case-insensitive about it', async () => {
    await createUser(db(), tenantId, {
      email: 'schon.da@praxi.invalid',
      name: 'Schon Da',
      password: 'ein hinreichend langes passwort',
    })

    expect(await emailTaken(db(), 'SCHON.DA@praxi.invalid')).toBe(true)
    expect(await emailTaken(db(), 'noch.nicht@praxi.invalid')).toBe(false)
  })
})
