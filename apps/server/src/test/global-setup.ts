import postgres from 'postgres'
import { loadEnvFile } from '../env.js'
import { databaseUrlFor, MAINTENANCE_DATABASE } from './database-url.js'

/**
 * Runs once per `pnpm test`, before any worker starts. It only checks that
 * Postgres is reachable, so a forgotten `pnpm db:up` produces one clear
 * sentence instead of a connection error per test file.
 *
 * The per-worker databases themselves are created in `src/test/setup.ts`,
 * because how many workers there will be is not known here.
 */
export default async function globalSetup(): Promise<void> {
  // Runs in its own process, ahead of the per-worker setup file, so the root
  // .env has to be read here as well.
  loadEnvFile()

  const admin = postgres(databaseUrlFor(MAINTENANCE_DATABASE), { max: 1, onnotice: () => {} })

  try {
    await admin`select 1`
  } catch (error) {
    throw new Error(
      `Postgres is not reachable — the tests need a running database (pnpm db:up).\n${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  } finally {
    await admin.end({ timeout: 5 })
  }
}
