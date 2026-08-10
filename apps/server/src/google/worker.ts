import type { GoogleSyncResult } from '@praxi/shared'
import type { Database } from '../db/client.js'
import { googleConnection } from '../db/schema.js'
import { recordSyncError, runSync } from '../domain/google-sync.js'
import { logger } from '../logger.js'
import { EncryptionKeyMismatchError } from '../secrets.js'
import { openGoogleApi } from './api.js'
import { isAuthFailure } from './client.js'
import { oauthConfigured } from './oauth.js'

/**
 * The outbox worker: a `setInterval` in the same process, no queue server, no
 * scheduler. There is one practice and one process, and a job runner would be
 * a second thing to keep alive for work that is a handful of HTTP calls a day.
 */

const TICK_MS = 30_000

/**
 * Single-flight. The manual "sync now" button runs the same function, and two
 * passes over the same rows at once would push twice.
 */
let running = false

export async function syncNow(database: Database, tenantId: string): Promise<GoogleSyncResult> {
  if (running) return { pushed: 0, failed: 0, pulled: 0, conflicts: 0 }
  running = true

  try {
    const api = await openGoogleApi(database, tenantId)
    if (!api) return { pushed: 0, failed: 0, pulled: 0, conflicts: 0 }

    return await runSync(database, tenantId, api, new Date())
  } finally {
    running = false
  }
}

/** Which tenants have a connection at all. One row today; the query costs
 *  nothing and keeps the worker from assuming there is only ever one. */
async function connectedTenants(database: Database): Promise<string[]> {
  const rows = await database.select({ tenantId: googleConnection.tenantId }).from(googleConnection)
  return rows.map((row) => row.tenantId)
}

async function tick(database: Database): Promise<void> {
  for (const tenantId of await connectedTenants(database)) {
    try {
      await syncNow(database, tenantId)
    } catch (error) {
      /**
       * Two failures deserve a sentence on the connection rather than a log
       * line nobody reads: a revoked grant, and a token that no longer matches
       * the configured key. Both stop the pass — no number of retries fixes
       * either — and both are shown in the settings.
       */
      if (isAuthFailure(error)) {
        await recordSyncError(
          database,
          tenantId,
          'Die Verbindung zu Google ist abgelaufen. Bitte neu verbinden.',
        )
      } else if (error instanceof EncryptionKeyMismatchError) {
        await recordSyncError(
          database,
          tenantId,
          'Der hinterlegte Schlüssel passt nicht zum gespeicherten Token. Bitte neu verbinden.',
        )
      } else {
        await recordSyncError(
          database,
          tenantId,
          error instanceof Error ? error.message : 'Unbekannter Fehler.',
        )
      }
      // IDs only, never content (rule 12).
      logger().warn({ tenantId }, 'google sync tick failed')
    }
  }
}

/**
 * Starts the worker, or does not: without an OAuth configuration there is
 * nothing to sync with, and the software is fully usable that way.
 *
 * `unref()` so a pending timer never holds the process open on shutdown.
 */
export function startGoogleWorker(database: Database): NodeJS.Timeout | null {
  if (!oauthConfigured()) return null

  const timer = setInterval(() => {
    void tick(database)
  }, TICK_MS)

  timer.unref()
  return timer
}
