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
 * No database and no service here: the point is what happens when the database
 * is *not* reachable, and a real one would be the wrong instrument for that.
 * The fakes below throw the way the driver throws.
 */

/** A database that refuses at the first thing the tick asks of it — the tenant
 *  lookup, which used to run outside every `try` there was. */
function refusingDatabase(): Database {
  const error = Object.assign(new Error('write CONNECT_TIMEOUT localhost:55432'), {
    code: 'CONNECT_TIMEOUT',
  })
  return {
    select: () => {
      throw error
    },
  } as unknown as Database
}

/** One that answers the lookup and then fails — so the failure lands in the
 *  per-tenant branch, where recording it fails for the same reason. */
function halfDeadDatabase(): Database {
  let answered = false
  return {
    select: () => {
      if (answered) throw new Error('gone')
      answered = true
      return { from: async () => [{ tenantId: '01927b3c-4d5e-7f80-9abc-def012345678' }] }
    },
    update: () => {
      throw new Error('gone')
    },
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
    await expect(runTick(halfDeadDatabase())).resolves.toBeUndefined()
  })
})
