import type { Database } from '../db/client.js'
import { ownerDb } from '../db/client.js'
import { type TenantDirectoryEntry, tenantsForSelection } from '../domain/tenant.js'

/**
 * **The only file in the CLI that touches `ownerDb()`**, and a test asserts
 * that by reading the sources — the same shape as the route test that walks
 * `app.routes` rather than trusting a list somebody keeps by hand.
 *
 * Everything a command *writes* goes through `asTenant`: one transaction, one
 * tenant, under the policies. Stepping past them happens here and is two
 * things, both named:
 *
 * 1. **The tenant directory**, which is a fixed part of the way in rather than
 *    a capability a command asks for. A command that takes a tenant has to find
 *    it before it can scope to itself, and under row-level security "is there
 *    already a practice of this name" and "let me pick one from a list" both
 *    answer with nothing. It reads an id, a practice name and a number of
 *    users, and writes nothing, ever.
 * 2. **The owner handle**, for a command declaring `scope: 'owner'`. There are
 *    none. It is declared and unused on purpose, the way `verification` is a
 *    table nothing writes to yet: the day one is needed, the shape it has to
 *    take — and the sentence it has to carry in `ownerReason` — is already
 *    settled, and it shows up in a diff as a deliberate line rather than as an
 *    `ownerDb()` somebody reached for.
 */

export type TenantDirectory = {
  all(): Promise<TenantDirectoryEntry[]>
  /** `--tenant` takes an id **or** a practice name: a practice name is never a
   *  uuid, so nothing has to be guessed. */
  byIdOrName(value: string): Promise<TenantDirectoryEntry[]>
  byName(practiceName: string): Promise<TenantDirectoryEntry[]>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createTenantDirectory(): TenantDirectory {
  const all = () => tenantsForSelection(ownerDb())

  return {
    all,

    async byIdOrName(value) {
      const wanted = value.trim()
      const entries = await all()
      return UUID.test(wanted)
        ? entries.filter((entry) => entry.id === wanted.toLowerCase())
        : entries.filter((entry) => entry.practiceName === wanted)
    },

    async byName(practiceName) {
      const wanted = practiceName.trim()
      return (await all()).filter((entry) => entry.practiceName === wanted)
    },
  }
}

/** Handed only to a command that declared `scope: 'owner'`, by the runner. */
export function ownerDatabase(): Database {
  return ownerDb()
}
