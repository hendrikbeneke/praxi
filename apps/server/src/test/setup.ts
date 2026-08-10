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
 * `CREATE DATABASE` briefly locks the template database, so two workers doing
 * it at the same moment can fail even though their target names differ. One
 * advisory lock on the shared maintenance database serializes them. The key is
 * arbitrary but has to be the same for all workers. Two 32-bit halves rather
 * than one 64-bit key, because the driver does not bind bigint parameters.
 */
const CREATE_DATABASE_LOCK: readonly [number, number] = [814_723, 69_101]

async function ensureDatabaseExists(): Promise<void> {
  const admin = postgres(databaseUrlFor(MAINTENANCE_DATABASE), { max: 1, onnotice: () => {} })
  try {
    const [lockA, lockB] = CREATE_DATABASE_LOCK
    await admin`select pg_advisory_lock(${lockA}, ${lockB})`
    try {
      const [existing] = await admin`select 1 from pg_database where datname = ${databaseName}`
      if (!existing) await admin.unsafe(`create database "${databaseName}"`)
    } finally {
      await admin`select pg_advisory_unlock(${lockA}, ${lockB})`
    }
  } finally {
    await admin.end({ timeout: 5 })
  }
}

const workerUrl = databaseUrlFor(databaseName)

await ensureDatabaseExists()

const sql = postgres(workerUrl, { max: 1, onnotice: () => {} })
await migrate(drizzle(sql), { migrationsFolder })

process.env.DATABASE_URL = workerUrl

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
