import { type UserPreferences, userPreferencesSchema } from '@praxi/shared'
import { eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { appUser } from '../db/schema.js'

export async function getUserPreferences(
  database: Database,
  userId: string,
): Promise<UserPreferences> {
  const [row] = await database
    .select({ preferences: appUser.preferences })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1)

  return userPreferencesSchema.parse(row?.preferences ?? {})
}

/**
 * Merges `input` into the stored preferences rather than replacing them —
 * with Postgres's own `jsonb || jsonb`, in the same `UPDATE ... RETURNING`,
 * not read-then-write in application code.
 *
 * This is the one thing not to "simplify" later: preferences are saved from
 * different, unrelated screens (the theme picker today, a column chooser
 * elsewhere tomorrow), each knowing only its own key. A client that has never
 * heard of a later key must not be able to erase it just by saving its own —
 * which is exactly what `set({ preferences: input })` would do the moment a
 * second preference exists. The merge is what keeps every screen's save
 * scoped to the key it actually owns.
 */
export async function updateUserPreferences(
  database: Database,
  userId: string,
  input: UserPreferences,
): Promise<UserPreferences> {
  const [row] = await database
    .update(appUser)
    .set({ preferences: sql`${appUser.preferences} || ${JSON.stringify(input)}::jsonb` })
    .where(eq(appUser.id, userId))
    .returning({ preferences: appUser.preferences })

  return userPreferencesSchema.parse(row?.preferences ?? {})
}
