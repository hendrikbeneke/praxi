/**
 * The whole seed: everything a fresh clone needs to be usable.
 *
 *   pnpm db:seed
 *
 * Every section is idempotent, so running it again is safe.
 */

import { loadEnvFile } from '../../env.js'
import { closeDatabase, db } from '../client.js'
import { seedBase } from './base.js'
import { seedContactTypes } from './contact-types.js'
import { seedServices } from './services.js'

loadEnvFile()

try {
  const database = db()
  const tenantId = await seedBase(database)
  await seedContactTypes(database, tenantId)
  await seedServices(database, tenantId)
  console.info('seed complete')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabase()
}
