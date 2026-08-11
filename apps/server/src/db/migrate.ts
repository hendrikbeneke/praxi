import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { getEnv, loadEnvFile } from '../env.js'
import { logger } from '../logger.js'

/**
 * Runs at container start, before `index.ts` — CMD chains the two so a failed
 * migration exits non-zero and the process never listens. Coolify's health
 * check then never turns green, traffic never switches to this container, and
 * the previous one keeps serving. Deliberately not `drizzle-kit migrate`: that
 * would pull `drizzle-kit` into the production image as a runtime dependency
 * for one function `drizzle-orm` already exports.
 */

loadEnvFile()
const env = getEnv()
const log = logger()

const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} })

try {
  await migrate(drizzle(sql), {
    migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)),
  })
  log.info('migrations applied')
} catch (err) {
  const isDevelopment = env.NODE_ENV !== 'production'
  const name = err instanceof Error ? err.name : 'UnknownError'
  // Message and stack can quote row values (CLAUDE.md rule 12), same
  // reasoning as middleware/error.ts — kept out of the log in production.
  log.fatal(
    {
      name,
      ...(isDevelopment && err instanceof Error ? { message: err.message, stack: err.stack } : {}),
    },
    'migration failed',
  )
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
