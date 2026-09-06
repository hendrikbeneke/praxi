import { type Theme, userPreferencesSchema } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { appUser } from '../db/schema.js'

/**
 * The two reads Better Auth's hooks need out of `app_user`, in `domain/` where
 * the rest of the business logic is rather than inside the configuration.
 */

/**
 * The tenant a user belongs to, for the session being created.
 *
 * It throws rather than returning null: a user without a tenant cannot exist —
 * `app_user.tenant_id` is `not null` — so getting nothing here means the user
 * was deleted between authenticating and writing the session. Signing in has
 * to fail then, not succeed with a session that carries no tenant.
 */
export async function tenantOfUser(database: Database, userId: string): Promise<string> {
  const [row] = await database
    .select({ tenantId: appUser.tenantId })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1)

  if (!row) throw new Error('no such user')
  return row.tenantId
}

/**
 * The colour scheme, for the cookie written beside the session cookie.
 *
 * A query rather than a field on the session: `preferences` is `jsonb`, which
 * is not one of the types Better Auth's `additionalFields` can carry, and
 * putting the theme on the session row instead would be a second place holding
 * it — one that every open session would have to be walked to update. One read
 * at sign-in is cheaper than a second truth.
 */
export async function themeOfUser(database: Database, userId: string): Promise<Theme | undefined> {
  const [row] = await database
    .select({ preferences: appUser.preferences })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1)

  return userPreferencesSchema.parse(row?.preferences ?? {}).theme
}
