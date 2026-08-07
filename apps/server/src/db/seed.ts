/**
 * Seeds the one tenant, its practice settings and the one user.
 *
 * Idempotent: run it as often as you like. An existing tenant is reused, and
 * an existing user keeps the password it has — the seed never silently
 * overwrites a password that is already in use.
 *
 *   pnpm db:seed
 */
import { passwordPolicy } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { closeDatabase, db } from '../db/client.js'
import { appUser, practiceSettings, tenant } from '../db/schema.js'
import { hashPassword } from '../domain/auth.js'
import { getEnv, loadEnvFile } from '../env.js'
import { newId } from '../id.js'

/** Obviously fake master data — never a realistic person or practice. */
const SEED_TENANT_NAME = 'Testpraxis'

const SEED_PRACTICE = {
  practiceName: 'Praxis Musterfrau — Heilpraktikerin für Psychotherapie',
  street: 'Beispielweg 1',
  postalCode: '12345',
  city: 'Musterstadt',
  country: 'DE',
  phone: '+49 30 000000',
  email: 'kontakt@example.invalid',
  website: 'https://www.example.invalid',
  taxNumber: '00/000/00000',
  bankName: 'Musterbank',
  iban: 'DE02120300000000202051',
  bic: 'BYLADEM1001',
  defaultPaymentTermDays: 14,
} as const

function requireSeedUser() {
  const env = getEnv()
  const email = env.SEED_USER_EMAIL?.trim().toLowerCase()
  const password = env.SEED_USER_PASSWORD
  const name = env.SEED_USER_NAME?.trim()

  if (!email) throw new Error('SEED_USER_EMAIL is not set. See .env.example.')
  if (!password || password.trim() === '') {
    throw new Error('SEED_USER_PASSWORD is not set or empty. Refusing to seed a blank password.')
  }
  if (password.length < passwordPolicy.minLength) {
    throw new Error(`SEED_USER_PASSWORD must be at least ${passwordPolicy.minLength} characters.`)
  }
  if (!name) throw new Error('SEED_USER_NAME is not set. See .env.example.')

  return { email, password, name }
}

async function seed(): Promise<void> {
  const seedUser = requireSeedUser()
  const database = db()

  const tenantId = await database.transaction(async (tx) => {
    const [existing] = await tx.select({ id: tenant.id }).from(tenant).limit(1)
    if (existing) return existing.id

    const id = newId()
    await tx.insert(tenant).values({ id, name: SEED_TENANT_NAME })
    return id
  })

  await database
    .insert(practiceSettings)
    .values({ id: newId(), tenantId, ...SEED_PRACTICE })
    .onConflictDoNothing({ target: practiceSettings.tenantId })

  const [existingUser] = await database
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, seedUser.email))
    .limit(1)

  if (existingUser) {
    console.info(`user ${seedUser.email} already exists — password left unchanged`)
  } else {
    await database.insert(appUser).values({
      id: newId(),
      tenantId,
      email: seedUser.email,
      passwordHash: await hashPassword(seedUser.password),
      name: seedUser.name,
    })
    console.info(`created user ${seedUser.email}`)
  }

  console.info('seed complete')
}

loadEnvFile()

try {
  await seed()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabase()
}
