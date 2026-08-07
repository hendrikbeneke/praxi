import type { Database } from '../db/client.js'
import { appUser, practiceSettings, tenant } from '../db/schema.js'
import { hashPassword } from '../domain/auth.js'
import { newId } from '../id.js'

/**
 * Fixtures for the domain tests. Names are obviously fake on purpose — no
 * realistic person ever appears in this repository.
 */

export async function createTenant(database: Database, name = 'Testmandant'): Promise<string> {
  const id = newId()
  await database.insert(tenant).values({ id, name })
  return id
}

export async function createPracticeSettings(
  database: Database,
  tenantId: string,
  overrides: Partial<typeof practiceSettings.$inferInsert> = {},
): Promise<string> {
  const id = newId()
  await database.insert(practiceSettings).values({
    id,
    tenantId,
    practiceName: 'Testpraxis',
    ...overrides,
  })
  return id
}

export type TestUser = {
  id: string
  tenantId: string
  email: string
  password: string
}

export async function createUser(
  database: Database,
  options: {
    tenantId: string
    email?: string
    password?: string
    name?: string
    active?: boolean
  },
): Promise<TestUser> {
  const id = newId()
  const email = options.email ?? `test.user.${id.slice(0, 8)}@example.invalid`
  const password = options.password ?? 'correct horse battery staple'

  await database.insert(appUser).values({
    id,
    tenantId: options.tenantId,
    email,
    passwordHash: await hashPassword(password),
    name: options.name ?? 'Test Behandler',
    active: options.active ?? true,
  })

  return { id, tenantId: options.tenantId, email, password }
}
