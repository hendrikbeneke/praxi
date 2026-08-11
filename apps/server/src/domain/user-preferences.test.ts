import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { appUser } from '../db/schema.js'
import { createTenant, createUser } from '../test/fixtures.js'
import { getUserPreferences, updateUserPreferences } from './user-preferences.js'

let userId: string

beforeEach(async () => {
  const tenantId = await createTenant(db())
  const user = await createUser(db(), { tenantId })
  userId = user.id
})

describe('getUserPreferences', () => {
  it('is empty for a fresh user', async () => {
    expect(await getUserPreferences(db(), userId)).toEqual({})
  })
})

describe('updateUserPreferences', () => {
  it('sets a preference', async () => {
    const result = await updateUserPreferences(db(), userId, { theme: 'blau' })
    expect(result).toEqual({ theme: 'blau' })
    expect(await getUserPreferences(db(), userId)).toEqual({ theme: 'blau' })
  })

  it('rejects an unknown theme', async () => {
    // @ts-expect-error — exercising the schema's own rejection at the boundary
    await expect(updateUserPreferences(db(), userId, { theme: 'lila' })).rejects.toThrow()
  })

  /**
   * The whole reason for the jsonb `||` merge over a plain `set`: a save from
   * a screen that only knows `theme` must not erase a key a newer client
   * already wrote and this schema does not (yet) validate. Seeds that key
   * directly, bypassing `updateUserPreferences`, then confirms it survives an
   * ordinary theme save — read back with raw SQL, because
   * `getUserPreferences` parses through the current schema and would drop an
   * unknown key from its own answer regardless of whether it survived in the
   * database.
   */
  it('does not clobber a key this schema does not know, on a later save', async () => {
    const database = db()
    await database
      .update(appUser)
      .set({
        preferences: sql`${appUser.preferences} || ${JSON.stringify({ futureSetting: true })}::jsonb`,
      })
      .where(eq(appUser.id, userId))

    await updateUserPreferences(database, userId, { theme: 'nacht' })

    const [row] = await database
      .select({ preferences: appUser.preferences })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1)
    expect(row?.preferences).toEqual({ theme: 'nacht', futureSetting: true })
  })
})
