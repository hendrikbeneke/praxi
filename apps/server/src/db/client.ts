import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getEnv } from '../env.js'
import * as schema from './schema.js'

type Sql = ReturnType<typeof postgres>

let client: Sql | undefined

/**
 * The server connects as `praxi_app`, not as the owner.
 *
 * That is the whole precondition of row-level security here: `praxi` is a
 * superuser, has BYPASSRLS and owns every table, so a policy would never have
 * been consulted for it — enabling RLS under that role changes nothing, without
 * an error and without a hint. Migrations, the seed and the scripts keep the
 * owner's `DATABASE_URL`; only this pool is the unprivileged one.
 *
 * There is no fallback to `DATABASE_URL`, and that is the point rather than
 * strictness: with the policies on, running as the owner bypasses all of them
 * and answers every query exactly as it did before — nothing fails and nothing
 * is logged, the isolation is just gone. `env.ts` makes the variable required
 * so a misconfigured server refuses to start, which is the only moment anyone
 * would notice.
 *
 * The tests are the deliberate exception: `test/setup.ts` points this at their
 * own throwaway database with the owner's credentials. They assert business
 * rules, not isolation — that is `routes/rls.test.ts`, which drops to the
 * unprivileged role itself with `SET LOCAL ROLE`.
 */
function getClient(): Sql {
  if (!client) {
    const env = getEnv()
    client = postgres(env.APP_DATABASE_URL, {
      max: 10,
      // Postgres notices can quote row values; keep them out of the log.
      onnotice: () => {},
    })
  }
  return client
}

let database: ReturnType<typeof createDatabase> | undefined

function createDatabase(sql: Sql) {
  // `casing: 'snake_case'` lets us write camelCase in TypeScript and get
  // snake_case identifiers in Postgres, without repeating every column name.
  return drizzle(sql, { schema, casing: 'snake_case' })
}

/**
 * The connection is created on first use, not at import time, so importing a
 * route or a domain module in a test never opens a socket.
 */
export function db() {
  if (!database) database = createDatabase(getClient())
  return database
}

/** The pool itself. Only `db()` hands this out, and only the seed, the
 *  scripts, the tests and the worker's own entry point take it. */
export type Pool = ReturnType<typeof db>

/**
 * The handle inside `database.transaction(...)`. Domain functions that must
 * run within a caller's transaction — the number counter, for one — take this
 * instead of `Database`, so the type makes the requirement explicit.
 */
export type Transaction = Parameters<Parameters<Pool['transaction']>[0]>[0]

/**
 * What a domain function takes.
 *
 * A union since S-C1, and the reason is the request transaction: every request
 * now runs inside one (`middleware/tenant-db.ts` opens it to carry
 * `app.tenant_id` into the database), so what reaches a domain function from a
 * route is a `Transaction`, while the seed, the scripts and the worker still
 * hand it the pool. Both answer the same queries and both can open a nested
 * transaction — a savepoint, in the transaction's case.
 *
 * Widening the type rather than editing 147 signatures is not a shortcut: those
 * signatures were already right. `Database` always meant "something to run
 * queries on", and it is only now that there is more than one such thing.
 */
export type Database = Pool | Transaction

/** Kept as the name that says "reads only, either handle". Identical to
 *  `Database` now — the distinction it drew disappeared when every request
 *  became a transaction. */
export type DbReader = Database

/** Fails fast at startup if Postgres is not reachable. */
export async function verifyDatabaseConnection(): Promise<void> {
  await getClient()`select 1`
}

export async function closeDatabase(): Promise<void> {
  await client?.end({ timeout: 5 })
  client = undefined
  database = undefined
}
