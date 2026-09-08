/**
 * Demo data: two practices with contacts, sessions, notes and draft invoices.
 *
 *   pnpm db:seed:demo
 *
 * Separate from `pnpm db:seed` on purpose — that one is what a fresh clone
 * needs, this one is a convenience for developing and must never reach the
 * database of a practice that has started using this. Idempotent: a practice
 * whose user already exists is left alone rather than doubled.
 *
 * The second practice exists so tenant isolation is something to look at in a
 * browser and not only an assertion in a test: sign in as one and none of the
 * other's contacts, notes or invoices may be anywhere.
 */
import { loadEnvFile } from '../../env.js'
import { closeDatabase, ownerDb } from '../client.js'
import { DEMO_PASSWORD, seedDemo } from './demo.js'

loadEnvFile()

try {
  await seedDemo(ownerDb())
  console.info(`\nBoth demo users share the password: ${DEMO_PASSWORD}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabase()
}
