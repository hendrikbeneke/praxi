import { type Algorithm, hash as argonHash, verify as argonVerify } from '@node-rs/argon2'
import { lt } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { rateLimit, session } from '../db/schema.js'
import { deleteStaleNoteDrafts } from './note-draft.js'

/**
 * What is left of the hand-rolled authentication after S-B: the password
 * functions, which Better Auth is handed rather than replacing (see
 * `src/auth.ts`), and the housekeeping that used to hang off `login()`.
 *
 * Sessions, tokens, the sliding expiry and the login flow itself are the
 * library's from here on. Keeping a second implementation of any of them
 * beside it would be the thing adopting a library is meant to avoid.
 */

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

/**
 * Handed to Better Auth as `emailAndPassword.password.hash` / `.verify`, so
 * the library never hashes anything itself and the hashes written by the
 * implementation this replaced keep verifying unchanged. That is what made the
 * migration a move of one string rather than a forced password reset.
 */
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
 * The housekeeping that used to hang off `login()` — the only moment a session
 * was created, and therefore a free one. Better Auth owns signing in now, so
 * this is called from `databaseHooks.session.create.after` in `src/auth.ts`:
 * the same free moment, one layer out.
 *
 * Expired sessions are swept here because Better Auth does not sweep them; it
 * refuses an expired row but leaves it lying.
 */
export async function sweepOnSignIn(database: Database, now: Date = new Date()): Promise<void> {
  await deleteExpiredSessions(database, now)
  await deleteStaleNoteDrafts(database, now)
  await deleteStaleRateLimits(database, now)
}

export async function deleteExpiredSessions(database: Database, now: Date): Promise<void> {
  await database.delete(session).where(lt(session.expiresAt, now))
}

/** How long a counter row outlives the window it counts. */
export const RATE_LIMIT_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * A rate-limit row is meaningless minutes after it is written — the window is
 * a minute, and `/sign-in/email` is five attempts in it. A day is already
 * generous; keeping them for weeks would turn a counter table into a bad
 * substitute for an access log, which is a separate thing and belongs in one.
 *
 * `last_request` is epoch milliseconds, so the comparison is arithmetic on a
 * number rather than on a timestamp — see the column in `db/schema.ts`.
 */
export async function deleteStaleRateLimits(database: Database, now: Date): Promise<void> {
  await database
    .delete(rateLimit)
    .where(lt(rateLimit.lastRequest, now.getTime() - RATE_LIMIT_MAX_AGE_MS))
}
