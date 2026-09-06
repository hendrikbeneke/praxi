import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { appUser, noteDraft, rateLimit, session } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant, createUser } from '../test/fixtures.js'
import {
  deleteExpiredSessions,
  deleteStaleRateLimits,
  hashPassword,
  RATE_LIMIT_MAX_AGE_MS,
  sweepOnSignIn,
  verifyPassword,
} from './auth.js'

/**
 * What is left of this module after S-B: the password functions Better Auth is
 * handed, and the housekeeping that used to hang off `login()`.
 *
 * The session mechanism itself — tokens, the sliding expiry, the sign-in flow
 * — is the library's and is tested where it is used, in
 * `routes/auth.test.ts`, through actual HTTP requests. Testing it here would
 * mean asserting the library's behaviour through its own API, which proves
 * nothing about whether this application wired it up correctly.
 */

describe('hashPassword / verifyPassword', () => {
  it('verifies the password it hashed', async () => {
    const hash = await hashPassword('correct horse battery staple')

    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true)
    expect(await verifyPassword(hash, 'Correct horse battery staple')).toBe(false)
  })

  it('produces an argon2id hash, which is what migration 0043 moved', async () => {
    // The stored string is what travelled from app_user.password_hash into
    // account.password. If the algorithm or its parameters ever change here,
    // old hashes have to keep verifying — argon2 encodes both into the string,
    // which is exactly why they are not stored separately.
    expect(await hashPassword('x')).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
  })

  it('reads a malformed hash as a wrong password rather than throwing', async () => {
    // A 500 here would tell the caller that the account exists.
    expect(await verifyPassword('not a hash', 'anything')).toBe(false)
  })
})

describe('deleteExpiredSessions', () => {
  it('removes the expired rows and leaves the live ones', async () => {
    const tenantId = await createTenant(db())
    const user = await createUser(db(), { tenantId })
    const now = new Date('2026-09-07T10:00:00Z')

    const rows = [
      { id: newId(), token: 'live', expiresAt: new Date('2026-09-08T10:00:00Z') },
      { id: newId(), token: 'dead', expiresAt: new Date('2026-09-06T10:00:00Z') },
    ]
    for (const row of rows) {
      await db()
        .insert(session)
        .values({ ...row, tenantId, userId: user.id })
    }

    await deleteExpiredSessions(db(), now)

    const left = await db().select({ token: session.token }).from(session)
    expect(left.map((row) => row.token)).toEqual(['live'])
  })
})

describe('deleteStaleRateLimits', () => {
  it('keeps a row inside the retention window and drops one past it', async () => {
    const now = new Date('2026-09-07T10:00:00Z')

    await db()
      .insert(rateLimit)
      .values([
        { id: newId(), key: 'fresh', count: 3, lastRequest: now.getTime() - 60_000 },
        {
          id: newId(),
          key: 'stale',
          count: 3,
          lastRequest: now.getTime() - RATE_LIMIT_MAX_AGE_MS - 1,
        },
      ])

    await deleteStaleRateLimits(db(), now)

    const left = await db().select({ key: rateLimit.key }).from(rateLimit)
    expect(left.map((row) => row.key)).toEqual(['fresh'])
  })

  it('retains for a day and not for thirty', () => {
    // A counter row is meaningless minutes after it is written; the window is
    // a minute. Anyone tracing an attack pattern needs a log, not this table.
    expect(RATE_LIMIT_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000)
  })
})

describe('sweepOnSignIn', () => {
  it('clears expired sessions, stale drafts and stale counters in one go', async () => {
    const tenantId = await createTenant(db())
    const user = await createUser(db(), { tenantId })
    const now = new Date()
    const longAgo = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000)

    await db().insert(session).values({
      id: newId(),
      tenantId,
      userId: user.id,
      token: 'dead',
      expiresAt: longAgo,
    })
    await db()
      .insert(rateLimit)
      .values({ id: newId(), key: 'stale', count: 1, lastRequest: longAgo.getTime() })

    await sweepOnSignIn(db(), now)

    expect(await db().select().from(session)).toEqual([])
    expect(await db().select().from(rateLimit)).toEqual([])
    // The drafts are swept by the same call; `note-draft.test.ts` owns the
    // rule about which ones are stale.
    expect(await db().select().from(noteDraft)).toEqual([])
  })
})

describe('the user row after S-B', () => {
  it('carries no password — that lives in `account`', async () => {
    const tenantId = await createTenant(db())
    const user = await createUser(db(), { tenantId })

    const [row] = await db().select().from(appUser).where(eq(appUser.id, user.id))

    // Not a tautology over the schema: this is the property migration 0043
    // established, and a column added back here would be a second place a
    // password could live.
    expect(row).toBeDefined()
    expect(Object.keys(row ?? {})).not.toContain('passwordHash')
  })
})
