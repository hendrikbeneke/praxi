import { createHash, randomBytes } from 'node:crypto'
import { type Algorithm, hash as argonHash, verify as argonVerify } from '@node-rs/argon2'
import type { CurrentUser } from '@praxi/shared'
import { and, eq, lt } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { appUser, session } from '../db/schema.js'
import { newId } from '../id.js'

/**
 * Argon2id with the parameters OWASP lists as the low-memory baseline
 * (19 MiB, two passes). They are encoded into the resulting hash string, so
 * `verify` reads them from there and raising them later keeps old hashes
 * verifiable.
 */
/**
 * `Algorithm.Argon2id`. The package declares `Algorithm` as an ambient
 * `const enum`, which `verbatimModuleSyntax` cannot read as a value, so the
 * member is spelled out and pinned to its type instead.
 */
const ARGON2ID: Algorithm = 2

const argon2Options = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

/** How long a session lives from its last use. */
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000

/**
 * A session is only written back once its last use is this old. Without it
 * every authenticated request — including every poll of `/me` — would be a
 * write.
 */
export const SESSION_REFRESH_AFTER_MS = 60 * 60 * 1000

export function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, argon2Options)
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(passwordHash, plain)
  } catch {
    // A malformed hash in the database must read as "wrong password", never as
    // a 500 that tells the caller the account exists.
    return false
  }
}

/**
 * A hash of a password nobody has, produced with exactly the parameters above,
 * so that verifying against it costs the same as verifying a real one. Used
 * when the email is unknown, so the response time does not reveal which
 * accounts exist. Computed once per process and reused.
 */
let dummyHash: Promise<string> | undefined
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(`no-such-account-${randomBytes(16).toString('hex')}`)
  return dummyHash
}

/** 256 bits of entropy, URL-safe so it survives a cookie unencoded. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Only the hash is stored. A dump of `session` therefore does not hand out
 * live sessions. SHA-256 without a salt is deliberate: the input is 256 random
 * bits, so there is nothing to guess and the lookup stays a single indexed
 * equality.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function sessionExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + SESSION_TTL_MS)
}

export function isSessionExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime()
}

export function needsRefresh(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= SESSION_REFRESH_AFTER_MS
}

export type LoginResult = {
  token: string
  expiresAt: Date
  user: CurrentUser
  tenantId: string
}

/**
 * Verifies the credentials and opens a session. Returns `null` for every kind
 * of failure — unknown email, wrong password, deactivated user — because the
 * caller must not be able to tell them apart.
 */
export async function login(
  database: Database,
  input: { email: string; password: string },
  now: Date = new Date(),
): Promise<LoginResult | null> {
  const [user] = await database
    .select()
    .from(appUser)
    .where(eq(appUser.email, input.email))
    .limit(1)

  // Unknown email and deactivated account take the same path, including the
  // cost of a hash, so neither the answer nor the timing tells them apart.
  if (!user?.active) {
    await verifyPassword(await getDummyHash(), input.password)
    return null
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) return null

  // Cheap housekeeping at the only moment a session is created. No job needed.
  await deleteExpiredSessions(database, now)

  const token = generateSessionToken()
  const expiresAt = sessionExpiryFrom(now)

  await database.insert(session).values({
    id: newId(),
    tenantId: user.tenantId,
    userId: user.id,
    tokenHash: hashSessionToken(token),
    expiresAt,
    lastSeenAt: now,
  })

  return {
    token,
    expiresAt,
    tenantId: user.tenantId,
    user: { id: user.id, email: user.email, name: user.name },
  }
}

export type ValidatedSession = {
  sessionId: string
  tenantId: string
  user: CurrentUser
}

/**
 * Resolves a cookie token to its user, refreshing the sliding expiry when the
 * session has not been touched for a while. Returns `null` if the token is
 * unknown, expired or belongs to a deactivated user.
 */
export async function validateSession(
  database: Database,
  token: string,
  now: Date = new Date(),
): Promise<ValidatedSession | null> {
  const [row] = await database
    .select({
      sessionId: session.id,
      tenantId: session.tenantId,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt,
      userId: appUser.id,
      email: appUser.email,
      name: appUser.name,
      active: appUser.active,
    })
    .from(session)
    .innerJoin(appUser, eq(appUser.id, session.userId))
    .where(eq(session.tokenHash, hashSessionToken(token)))
    .limit(1)

  if (!row) return null

  if (isSessionExpired(row.expiresAt, now)) {
    await database.delete(session).where(eq(session.id, row.sessionId))
    return null
  }

  if (!row.active) return null

  if (needsRefresh(row.lastSeenAt, now)) {
    await database
      .update(session)
      .set({ lastSeenAt: now, expiresAt: sessionExpiryFrom(now) })
      .where(eq(session.id, row.sessionId))
  }

  return {
    sessionId: row.sessionId,
    tenantId: row.tenantId,
    user: { id: row.userId, email: row.email, name: row.name },
  }
}

/** Ends a session by deleting the row — clearing the cookie alone would leave
 *  a token that still works if it was captured. */
export async function logout(database: Database, token: string): Promise<void> {
  await database.delete(session).where(eq(session.tokenHash, hashSessionToken(token)))
}

export async function deleteExpiredSessions(database: Database, now: Date): Promise<void> {
  await database.delete(session).where(lt(session.expiresAt, now))
}

/** Ends every session of a user, for instance after a password change. */
export async function logoutAllSessions(
  database: Database,
  tenantId: string,
  userId: string,
): Promise<void> {
  await database
    .delete(session)
    .where(and(eq(session.tenantId, tenantId), eq(session.userId, userId)))
}
