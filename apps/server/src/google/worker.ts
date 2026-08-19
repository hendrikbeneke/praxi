import type { GoogleSyncResult } from '@praxi/shared'
import type { Database } from '../db/client.js'
import { googleConnection } from '../db/schema.js'
import { recordSyncError, runSync } from '../domain/google-sync.js'
import { logger } from '../logger.js'
import { messages } from '../messages.js'
import { EncryptionKeyMismatchError } from '../secrets.js'
import { openGoogleApi } from './api.js'
import { GoogleApiError, isAuthFailure } from './client.js'
import { oauthConfigured } from './oauth.js'

/**
 * The outbox worker: a `setInterval` in the same process, no queue server, no
 * scheduler. There is one practice and one process, and a job runner would be
 * a second thing to keep alive for work that is a handful of HTTP calls a day.
 *
 * **Nothing in here may end the process.** That is the whole point of slice 9
 * and it was broken until D-K1.5: a floated promise with no `catch` becomes an
 * unhandled rejection, and Node ends the process on one. Postgres refusing a
 * connection for a second — which happens when something else on the machine
 * holds them all — therefore took the whole application down, twice in one
 * afternoon. A background tick that stops the practice from working because a
 * projection could not run is the exact inversion of the rule it serves: a
 * failed push must block nothing, and a dead process blocks everything.
 *
 * Three guards, and the last one is the one that has to hold:
 *
 * 1. the per-tenant `try` around the sync itself, which was always there;
 * 2. a `try` around everything else in the tick — the tenant lookup ran
 *    *outside* the loop, and recording the error inside the `catch` can fail
 *    for the very reason the sync did (the database being unreachable), which
 *    is a rejection thrown from a `catch` block and escapes it;
 * 3. a `catch` on the floated promise in the interval callback, which cannot
 *    know what it is catching and is there so that no future edit above can
 *    reach the process again.
 *
 * Nothing is given up on: `next_attempt_at` and the backoff of the queue rows
 * are untouched by a failed tick, so the following one simply tries again.
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

/**
 * What may be said about a failure — the kind of error and nothing else.
 *
 * Rule 12, and not as a formality: a `DrizzleQueryError`'s `message` is the
 * failed SQL **with its parameters bound into it**, so it can carry a contact's
 * name or a note's text. It must reach neither the log stream nor
 * `google_connection.last_error`, which the settings screen prints. A class
 * name and a SQLSTATE identify the fault without describing anybody.
 */
function errorKind(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown'

  // The code sits on the driver error, and Drizzle wraps that in a
  // `DrizzleQueryError` — so the name alone would say `DrizzleQueryError` for
  // every database fault there is, which is no help at all on the one night it
  // matters. Walk down to the first `code` and report both.
  let current: unknown = error
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    if (typeof current !== 'object') break
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' && code !== '') return `${error.name}/${code}`
    current = (current as { cause?: unknown }).cause
  }

  return error.name
}

/**
 * One pass. **Exported for the test that asserts it never rejects** — which is
 * the whole property, and one that cannot be asserted through the interval.
 */
export async function runTick(database: Database): Promise<void> {
  let tenants: string[]
  try {
    tenants = await connectedTenants(database)
  } catch (error) {
    // The database, not Google. There is no connection row to write a sentence
    // onto — and if there were, writing it would fail the same way.
    logger().warn({ kind: errorKind(error) }, 'google sync tick could not read connections')
    return
  }

  for (const tenantId of tenants) {
    try {
      await syncNow(database, tenantId)
    } catch (error) {
      // IDs and the kind of fault, never content (rule 12).
      logger().warn({ tenantId, kind: errorKind(error) }, 'google sync tick failed')

      try {
        /**
         * Two failures deserve a sentence on the connection rather than a log
         * line nobody reads: a revoked grant, and a token that no longer
         * matches the configured key. Both stop the pass — no number of
         * retries fixes either — and both are shown in the settings.
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
          /**
           * Everything else gets a sentence and a kind, never the error's own
           * message: `GoogleApiError` carries a German one written for this
           * screen, but a driver error carries the failed query with its
           * parameters bound in.
           */
          await recordSyncError(
            database,
            tenantId,
            error instanceof GoogleApiError
              ? error.message
              : messages.google.syncFailed(errorKind(error)),
          )
        }
      } catch (fatal) {
        /**
         * Recording the failure failed too — the database being away is
         * exactly the case where both happen, and a throw from inside a
         * `catch` block is not caught by it. Nothing is left to write to, so
         * the pass ends here and the next one tries again.
         */
        logger().warn(
          { tenantId, kind: errorKind(fatal) },
          'google sync tick could not be recorded',
        )
      }
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
    // The last of the three guards above. `runTick` is written not to reject;
    // this is here so that a future edit inside it cannot end the process.
    runTick(database).catch((error: unknown) => {
      logger().error({ kind: errorKind(error) }, 'google sync tick threw unexpectedly')
    })
  }, TICK_MS)

  timer.unref()
  return timer
}
