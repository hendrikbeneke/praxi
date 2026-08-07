/**
 * Where the tests point Postgres, derived from `DATABASE_URL` so there is only
 * one connection string to configure.
 *
 * Isolation is **one database per Vitest worker**. The obvious cheaper variant
 * — one schema per worker via `search_path` — does not work here: drizzle-kit
 * writes foreign keys as `REFERENCES "public"."tenant"`, schema-qualified, so
 * every worker would land on the same tables anyway. A database per worker
 * needs no rewriting of generated SQL, and it is what makes truncating between
 * test cases safe while Vitest runs files in parallel.
 *
 * The databases are created once and reused across runs; migrations are
 * applied incrementally, so only the first run pays for them.
 */

function baseUrl(): URL {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.')
  return new URL(url)
}

/** `CREATE DATABASE` cannot run against the database being created. */
export const MAINTENANCE_DATABASE = 'postgres'

export function databaseUrlFor(database: string): string {
  const url = baseUrl()
  url.pathname = `/${database}`
  return url.toString()
}

/** `praxi_test_w1`, `praxi_test_w2`, … — never the development database. */
export function workerDatabaseName(): string {
  const worker = (process.env.VITEST_WORKER_ID ?? '1').replaceAll(/\W/g, '')
  return `praxi_test_w${worker}`
}
