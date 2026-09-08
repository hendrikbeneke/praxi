import { describe, expect, it } from 'vitest'
import type { Database } from '../db/client.js'
import { runTick } from './worker.js'

/**
 * **The worker must not be able to end the process.**
 *
 * Slice 9 promises that the application works with the network cable pulled and
 * that a failed push blocks nothing. A floated promise with no `catch` becomes
 * an unhandled rejection, and Node ends the process on one — so until D-K1.5
 * Postgres refusing a connection for a second took the whole application down
 * with it, twice in one afternoon. A background tick that stops the practice
 * from working because a projection could not run is the inversion of the rule
 * it serves.
 *
 * ## What the handle passed in still reaches, and what it no longer does
 *
 * `runTick(database)` uses that handle for **one** thing: the tenant lookup.
 * Everything after it goes through `asTenant()`, which opens its own
 * transaction on the pool — so since S-C1 a fake database cannot make the
 * per-tenant branch fail, and the second test below said it did for as long as
 * that was no longer true. It passed the whole time, because the fake had no
 * `execute` either: the lookup threw a TypeError, the tick returned early, and
 * the branch the test is named after was never entered.
 *
 * So the failure is provoked where it can still be provoked for real — a
 * malformed tenant id, which every query for that tenant raises on (22P02),
 * against this worker's own database. Contrived as an id, honest as a failure:
 * the sync throws, and recording the failure throws for the same reason, which
 * is the nested `catch` this is about.
 */

/** A database that refuses at the first thing the tick asks of it — the tenant
 *  lookup, which used to run outside every `try` there was. */
function refusingDatabase(): Database {
  const error = Object.assign(new Error('write CONNECT_TIMEOUT localhost:55432'), {
    code: 'CONNECT_TIMEOUT',
  })
  return {
    execute: () => {
      throw error
    },
  } as unknown as Database
}

/** One that answers the lookup with a tenant id no query can be run for, so the
 *  failure lands in the per-tenant branch — and recording it fails there for
 *  exactly the same reason. */
function answeringWithABadTenant(): Database {
  return {
    execute: async () => [{ google_connection_tenant_ids: 'not-a-tenant-id' }],
  } as unknown as Database
}

describe('the sync tick', () => {
  it('resolves when the database cannot be reached at all', async () => {
    await expect(runTick(refusingDatabase())).resolves.toBeUndefined()
  })

  /**
   * The second escape route, and the subtler one: a throw from inside a `catch`
   * block is not caught by that block. Recording the failure fails for the very
   * reason the sync did.
   */
  it('resolves when recording the failure fails too', async () => {
    await expect(runTick(answeringWithABadTenant())).resolves.toBeUndefined()
  })
})
