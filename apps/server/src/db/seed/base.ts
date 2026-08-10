/**
 * Tenant, practice settings and the one user.
 *
 * Idempotent: an existing tenant is reused, and an existing user keeps the
 * password it has — the seed never silently overwrites a password that is
 * already in use.
 */
import { passwordPolicy } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { hashPassword } from '../../domain/auth.js'
import { getEnv } from '../../env.js'
import { newId } from '../../id.js'
import type { Database } from '../client.js'
import { appUser, practiceSettings, tenant } from '../schema.js'

/** Obviously fake master data — never a realistic person or practice. */
const SEED_TENANT_NAME = 'Testpraxis'

const SEED_PRACTICE = {
  practiceName: 'Praxis Musterfrau — Heilpraktikerin für Psychotherapie',
  street: 'Beispielweg 1',
  postalCode: '12345',
  city: 'Musterstadt',
  country: 'DE',
  phone: '+49 30 000000',
  email: 'kontakt@praxi.invalid',
  website: 'https://www.praxi.invalid',
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

/** Returns the tenant id, so the other seed sections can hang off it. */
export async function seedBase(database: Database): Promise<string> {
  const seedUser = requireSeedUser()

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

  return tenantId
}

/** For the sections that run on their own and need the tenant that is already
 *  there. */
export async function requireTenantId(database: Database): Promise<string> {
  const [row] = await database.select({ id: tenant.id }).from(tenant).limit(1)
  if (!row) throw new Error('No tenant found. Run `pnpm db:seed` first.')
  return row.id
}
