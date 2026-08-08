/**
 * The service catalogue on its own, against the tenant that is already there.
 *
 *   pnpm db:seed:services
 *
 * Useful for putting the example catalogue back after clearing it out, without
 * touching the user or the practice settings.
 */

import { loadEnvFile } from '../../env.js'
import { closeDatabase, db } from '../client.js'
import { requireTenantId } from './base.js'
import { seedServices } from './services.js'

loadEnvFile()

try {
  const database = db()
  await seedServices(database, await requireTenantId(database))
  console.info('service seed complete')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabase()
}
