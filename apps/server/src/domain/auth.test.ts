import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { appUser, session } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant, createUser, type TestUser } from '../test/fixtures.js'
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  isSessionExpired,
  login,
  logout,
  needsRefresh,
  SESSION_REFRESH_AFTER_MS,
  SESSION_TTL_MS,
  sessionExpiryFrom,
  validateSession,
  verifyPassword,
} from './auth.js'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** A fixed instant, so nothing in these tests depends on the wall clock. */
const T0 = new Date('2026-03-01T09:00:00.000Z')
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs)

describe('password hashing', () => {
  it('verifies a password against its own hash', async () => {
    const hash = await hashPassword('ein hinreichend langes Passwort')

    expect(await verifyPassword(hash, 'ein hinreichend langes Passwort')).toBe(true)
    expect(await verifyPassword(hash, 'ein hinreichend langes Passwor')).toBe(false)
  })

  it('produces a different hash for the same password each time', async () => {
    const [a, b] = await Promise.all([hashPassword('dasselbe'), hashPassword('dasselbe')])

    expect(a).not.toBe(b)
  })

  it('reads a malformed hash as a wrong password rather than throwing', async () => {
    await expect(verifyPassword('not-a-hash', 'whatever')).resolves.toBe(false)
  })
})

describe('session tokens', () => {
  it('generates unique, URL-safe tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, generateSessionToken))

    expect(tokens.size).toBe(50)
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('hashes a token deterministically and never to the token itself', () => {
    const token = generateSessionToken()

    expect(hashSessionToken(token)).toBe(hashSessionToken(token))
    expect(hashSessionToken(token)).not.toContain(token)
    expect(hashSessionToken(token)).toHaveLength(64)
  })
})

describe('session expiry arithmetic', () => {
  it('expires a session exactly one TTL after its last use', () => {
    expect(sessionExpiryFrom(T0).getTime()).toBe(T0.getTime() + SESSION_TTL_MS)
  })

  it('treats the expiry instant itself as expired', () => {
    const expiresAt = sessionExpiryFrom(T0)

    expect(isSessionExpired(expiresAt, at(SESSION_TTL_MS - 1))).toBe(false)
    expect(isSessionExpired(expiresAt, at(SESSION_TTL_MS))).toBe(true)
  })

  it('refreshes only once the session has gone untouched for an hour', () => {
    expect(needsRefresh(T0, at(SESSION_REFRESH_AFTER_MS - 1))).toBe(false)
    expect(needsRefresh(T0, at(SESSION_REFRESH_AFTER_MS))).toBe(true)
  })
})

describe('login', () => {
  let tenantId: string
  let user: TestUser

  beforeEach(async () => {
    tenantId = await createTenant(db())
    user = await createUser(db(), { tenantId, email: 'behandler@praxi.invalid' })
  })

  it('opens a session and returns the user', async () => {
    const result = await login(db(), { email: user.email, password: user.password }, T0)

    expect(result).not.toBeNull()
    expect(result?.user).toEqual({
      id: user.id,
      email: 'behandler@praxi.invalid',
      name: 'Test Behandler',
    })
    expect(result?.tenantId).toBe(tenantId)
    expect(result?.expiresAt.getTime()).toBe(T0.getTime() + SESSION_TTL_MS)
  })

  it('stores only the hash of the token, never the token', async () => {
    const result = await login(db(), { email: user.email, password: user.password }, T0)
    const rows = await db().select().from(session)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.tokenHash).toBe(hashSessionToken(result?.token ?? ''))
    expect(rows[0]?.tokenHash).not.toBe(result?.token)
    expect(rows[0]?.tenantId).toBe(tenantId)
  })

  it('rejects a wrong password without opening a session', async () => {
    const result = await login(db(), { email: user.email, password: 'falsch' }, T0)

    expect(result).toBeNull()
    expect(await db().select().from(session)).toHaveLength(0)
  })

  it('rejects an unknown email address', async () => {
    const result = await login(
      db(),
      { email: 'niemand@praxi.invalid', password: user.password },
      T0,
    )

    expect(result).toBeNull()
  })

  it('rejects a deactivated user even with the right password', async () => {
    const inactive = await createUser(db(), {
      tenantId,
      email: 'inaktiv@praxi.invalid',
      active: false,
    })

    const result = await login(db(), { email: inactive.email, password: inactive.password }, T0)

    expect(result).toBeNull()
    expect(await db().select().from(session)).toHaveLength(0)
  })

  it('clears out expired sessions on the way', async () => {
    await db()
      .insert(session)
      .values({
        id: newId(),
        tenantId,
        userId: user.id,
        tokenHash: hashSessionToken('long gone'),
        expiresAt: at(-DAY),
        lastSeenAt: at(-15 * DAY),
      })

    await login(db(), { email: user.email, password: user.password }, T0)
    const rows = await db().select().from(session)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.tokenHash).not.toBe(hashSessionToken('long gone'))
  })
})

describe('validateSession', () => {
  let tenantId: string
  let user: TestUser
  let token: string

  beforeEach(async () => {
    tenantId = await createTenant(db())
    user = await createUser(db(), { tenantId })
    const result = await login(db(), { email: user.email, password: user.password }, T0)
    token = result?.token ?? ''
  })

  it('resolves a live token to its user and tenant', async () => {
    const validated = await validateSession(db(), token, at(HOUR))

    expect(validated?.user.id).toBe(user.id)
    expect(validated?.tenantId).toBe(tenantId)
  })

  it('rejects an unknown token', async () => {
    expect(await validateSession(db(), generateSessionToken(), at(HOUR))).toBeNull()
  })

  it('rejects an expired token and deletes the row', async () => {
    const validated = await validateSession(db(), token, at(SESSION_TTL_MS + 1))

    expect(validated).toBeNull()
    expect(await db().select().from(session)).toHaveLength(0)
  })

  it('rejects a token whose user was deactivated', async () => {
    await db().update(appUser).set({ active: false }).where(eq(appUser.id, user.id))

    expect(await validateSession(db(), token, at(HOUR))).toBeNull()
  })

  it('slides the expiry once the session has gone untouched for an hour', async () => {
    const now = at(2 * HOUR)
    await validateSession(db(), token, now)
    const [row] = await db().select().from(session)

    expect(row?.lastSeenAt.getTime()).toBe(now.getTime())
    expect(row?.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL_MS)
  })

  it('does not write on every request', async () => {
    const [before] = await db().select().from(session)
    await validateSession(db(), token, at(SESSION_REFRESH_AFTER_MS - 1000))
    const [after] = await db().select().from(session)

    expect(after?.lastSeenAt.getTime()).toBe(before?.lastSeenAt.getTime())
    expect(after?.expiresAt.getTime()).toBe(before?.expiresAt.getTime())
  })
})

describe('logout', () => {
  it('deletes the session so the token stops working', async () => {
    const tenantId = await createTenant(db())
    const user = await createUser(db(), { tenantId })
    const result = await login(db(), { email: user.email, password: user.password }, T0)
    const token = result?.token ?? ''

    await logout(db(), token)

    expect(await db().select().from(session)).toHaveLength(0)
    expect(await validateSession(db(), token, at(HOUR))).toBeNull()
  })
})

describe('session tenant integrity', () => {
  /**
   * `session.tenant_id` is denormalized (see the schema). The composite
   * foreign key against `app_user (id, tenant_id)` is what makes it impossible
   * for a session to claim a tenant its user does not belong to — this test
   * exists so that guarantee cannot be dropped unnoticed.
   */
  it('refuses a session whose tenant differs from its user', async () => {
    const tenantA = await createTenant(db())
    const tenantB = await createTenant(db())
    const user = await createUser(db(), { tenantId: tenantA })

    await expect(
      db()
        .insert(session)
        .values({
          id: newId(),
          tenantId: tenantB,
          userId: user.id,
          tokenHash: hashSessionToken(generateSessionToken()),
          expiresAt: sessionExpiryFrom(T0),
          lastSeenAt: T0,
        }),
    ).rejects.toThrow()
  })

  it('removes the sessions of a deleted user', async () => {
    const tenantId = await createTenant(db())
    const user = await createUser(db(), { tenantId })
    await login(db(), { email: user.email, password: user.password }, T0)

    await db().delete(appUser).where(eq(appUser.id, user.id))

    expect(await db().select().from(session)).toHaveLength(0)
  })
})
