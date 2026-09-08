import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeEach } from 'vitest'
import { closeDatabase } from '../db/client.js'
import { loadEnvFile } from '../env.js'
import { databaseUrlFor, MAINTENANCE_DATABASE, workerDatabaseName } from './database-url.js'

/**
 * Per-worker test setup, wired in through `vitest.config.ts` as a setup file.
 *
 * It runs before the test file is imported, which is what lets it rewrite
 * `DATABASE_URL` in time: `db/client.ts` reads the environment on first use,
 * so from here on every domain function in this worker talks to this worker's
 * own database.
 */

loadEnvFile()

// The logger reads these on first use; keep test output down to the failures.
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL ??= 'fatal'

/**
 * A fixed key for the secret store (`src/secrets.ts`), so the tests can assert
 * that an SMTP password is stored encrypted rather than in the clear.
 *
 * Local, deterministic, and obviously fake — encryption is arithmetic, not a
 * service, so testing it needs nothing running. It never leaves this process
 * and never encrypts anything real.
 */
process.env.ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

const databaseName = workerDatabaseName()
const migrationsFolder = fileURLToPath(new URL('../db/migrations', import.meta.url))

/**
 * Two workers preparing their own database at the same moment collide on
 * things neither of them owns, so one advisory lock on the shared maintenance
 * database serializes the whole preparation. The key is arbitrary but has to
 * be the same for all workers. Two 32-bit halves rather than one 64-bit key,
 * because the driver does not bind bigint parameters.
 *
 * It covers **the migration as well as the `CREATE DATABASE`**, and that
 * second half arrived with the squash. `CREATE DATABASE` briefly locks the
 * template database, which is the older reason. The baseline additionally
 * writes to two cluster-wide catalogues — `CREATE ROLE praxi_app` and its
 * `ALTER ROLE … SET idle_in_transaction_session_timeout` — and those rows are
 * the same rows for every worker, however separate their databases are.
 * Twelve of them arriving together answers `tuple concurrently updated` and
 * the suite fails wholesale.
 *
 * The race was there before and simply never lost: the same statements sat in
 * migration 0044, but each worker reached them after forty-three files of its
 * own, so they were spread out. One file of 4300 lines removes that accidental
 * stagger — the kind of latent fault a squash surfaces rather than causes.
 *
 * The cost is that the workers migrate one after another instead of at once.
 * That is the correct trade here and not merely an acceptable one: a shared
 * catalogue is shared, and a lock is what it takes.
 */
const PREPARE_DATABASE_LOCK: readonly [number, number] = [814_723, 69_101]

async function prepareDatabase(): Promise<void> {
  const admin = postgres(databaseUrlFor(MAINTENANCE_DATABASE), { max: 1, onnotice: () => {} })
  try {
    const [lockA, lockB] = PREPARE_DATABASE_LOCK
    await admin`select pg_advisory_lock(${lockA}, ${lockB})`
    try {
      const [existing] = await admin`select 1 from pg_database where datname = ${databaseName}`
      if (!existing) await admin.unsafe(`create database "${databaseName}"`)

      const own = postgres(databaseUrlFor(databaseName), { max: 1, onnotice: () => {} })
      try {
        await migrate(drizzle(own), { migrationsFolder })
      } finally {
        await own.end({ timeout: 5 })
      }
    } finally {
      await admin`select pg_advisory_unlock(${lockA}, ${lockB})`
    }
  } finally {
    await admin.end({ timeout: 5 })
  }
}

const workerUrl = databaseUrlFor(databaseName)

await prepareDatabase()

const sql = postgres(workerUrl, { max: 1, onnotice: () => {} })

process.env.DATABASE_URL = workerUrl
/**
 * The app role's URL is pointed at the same throwaway database — at the OWNER's
 * credentials, deliberately, so the tests bypass row-level security. They assert
 * business rules, not tenant isolation; isolation is asserted where it lives, in
 * `routes/rls.test.ts`, which drops to the unprivileged role itself with
 * `SET LOCAL ROLE` and therefore needs no second password.
 *
 * **Whoever adds a third way to name a connection has to rewrite it here too.**
 * What these two lines do is not "point DATABASE_URL somewhere else", it is
 * "make this worker unable to reach any database but its own" — and a new
 * variable that `db/client.ts` prefers defeats that silently, in exactly the way
 * this one did before it was rewritten here: twenty-two tests failing on rows
 * another test had left behind, in the wrong database, and 488 tenants of test
 * data in a development database that had one. No test catches it; the tests
 * are what breaks.
 */
process.env.APP_DATABASE_URL = workerUrl

/**
 * Every test starts on empty tables. The table list comes from the catalogue
 * rather than being maintained by hand, so a table added in a later slice is
 * covered without touching this file.
 */
let tableNames: string[] | undefined

beforeEach(async () => {
  tableNames ??= (
    await sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'
    `
  ).map((row) => row.tablename)

  if (tableNames.length === 0) return

  const quoted = tableNames.map((name) => `"${name}"`).join(', ')
  await sql.unsafe(`truncate table ${quoted} restart identity cascade`)
})

afterAll(async () => {
  await closeDatabase()
  await sql.end({ timeout: 5 })
})
