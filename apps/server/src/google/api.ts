import { eq } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { googleConnection } from '../db/schema.js'
import { createGoogleApi, type Fetcher, type GoogleApi } from './client.js'
import { decryptToken } from './crypto.js'
import { oauthConfigured, refreshAccessToken } from './oauth.js'

/**
 * Turning a stored connection into a usable API handle.
 *
 * The access token is cached here, in memory, and nowhere else: it is valid
 * for an hour, and a process restart simply fetches a new one. Storing it
 * would mean a second credential at rest for no gain.
 */

type CachedToken = { accessToken: string; expiresAt: number }

const tokens = new Map<string, CachedToken>()

/** A minute of slack, so a token does not expire mid-call. */
const EXPIRY_SLACK_MS = 60_000

/** Dropped when the connection goes, so a reconnect never reuses the token of
 *  the account that was just disconnected. */
export function forgetAccessToken(tenantId: string): void {
  tokens.delete(tenantId)
}

/**
 * `null` when there is nothing to talk to: no OAuth configuration, or no
 * connection. Both are normal states, not errors — the software is fully
 * usable without Google.
 *
 * A key mismatch is *not* swallowed: `decryptToken` throws
 * `TokenKeyMismatchError`, and the caller turns that into a sentence.
 */
export async function openGoogleApi(
  database: Database,
  tenantId: string,
  options: { fetch?: Fetcher; now?: Date } = {},
): Promise<GoogleApi | null> {
  if (!oauthConfigured()) return null

  const [row] = await database
    .select({
      cipher: googleConnection.refreshTokenCipher,
      fingerprint: googleConnection.keyFingerprint,
    })
    .from(googleConnection)
    .where(eq(googleConnection.tenantId, tenantId))
    .limit(1)

  if (!row) return null

  const refreshToken = decryptToken(row.cipher, row.fingerprint)
  const doFetch = options.fetch
  const nowMs = (options.now ?? new Date()).getTime()

  return createGoogleApi({
    fetch: doFetch,
    accessToken: async () => {
      const cached = tokens.get(tenantId)
      if (cached && cached.expiresAt > Date.now() + EXPIRY_SLACK_MS) return cached.accessToken

      const fresh = await refreshAccessToken(refreshToken, doFetch ?? fetch)
      tokens.set(tenantId, {
        accessToken: fresh.accessToken,
        expiresAt: Math.max(nowMs, Date.now()) + fresh.expiresInSec * 1000,
      })
      return fresh.accessToken
    },
  })
}
