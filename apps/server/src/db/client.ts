import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getEnv } from '../env.js'
import * as schema from './schema.js'

type Sql = ReturnType<typeof postgres>

let client: Sql | undefined

function getClient(): Sql {
  if (!client) {
    client = postgres(getEnv().DATABASE_URL, {
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

export type Database = ReturnType<typeof db>

/**
 * The handle inside `database.transaction(...)`. Domain functions that must
 * run within a caller's transaction — the number counter, for one — take this
 * instead of `Database`, so the type makes the requirement explicit.
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/** For read helpers that are called both standalone and from inside a
 *  transaction. */
export type DbReader = Database | Transaction

/** Fails fast at startup if Postgres is not reachable. */
export async function verifyDatabaseConnection(): Promise<void> {
  await getClient()`select 1`
}

export async function closeDatabase(): Promise<void> {
  await client?.end({ timeout: 5 })
  client = undefined
  database = undefined
}
