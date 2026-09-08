import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { appUser } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant, createUser } from '../test/fixtures.js'
import { tenantOfUser, themeOfUser } from './session.js'

/**
 * `tenantOfUser` decides which tenant applies at all.
 *
 * That makes it the one function row-level security cannot cover: `app_user` is
 * deliberately outside the policies (authentication precedes tenancy — see
 * migration 0044), so a forgotten filter here would not fail visibly the way it
 * would anywhere else. Every request's `app.tenant_id` traces back to this
 * answer, so a wrong one is not a leak in one screen but in all of them.
 */

describe('tenantOfUser', () => {
  it('answers with the tenant of the user it was asked about', async () => {
    const tenantA = await createTenant(db())
    const tenantB = await createTenant(db())
    const userA = await createUser(db(), { tenantId: tenantA })
    const userB = await createUser(db(), { tenantId: tenantB })

    expect(await tenantOfUser(db(), userA.id)).toBe(tenantA)
    expect(await tenantOfUser(db(), userB.id)).toBe(tenantB)
  })

  it('does not answer with some other tenant when several exist', async () => {
    // The failure this guards against is a query without a `where`, which
    // returns the first row of the table. Written so that the first row is
    // deliberately the WRONG one: with two tenants and the asked-about user
    // created second, an unfiltered `limit 1` answers with the first user's
    // tenant and the assertion fails.
    const decoy = await createTenant(db())
    await createUser(db(), { tenantId: decoy })

    const mine = await createTenant(db())
    const user = await createUser(db(), { tenantId: mine })

    const answer = await tenantOfUser(db(), user.id)

    expect(answer).toBe(mine)
    expect(answer).not.toBe(decoy)
  })

  it('throws for a user that does not exist rather than inventing a tenant', async () => {
    await createTenant(db())

    // Returning null and letting the caller carry on would mean a session
    // written with no tenant, or with somebody's. Signing in has to fail.
    await expect(tenantOfUser(db(), newId())).rejects.toThrow()
  })
})

describe('themeOfUser', () => {
  it('reads the theme of the user it was asked about', async () => {
    const tenantA = await createTenant(db())
    const tenantB = await createTenant(db())
    const userA = await createUser(db(), { tenantId: tenantA })
    const userB = await createUser(db(), { tenantId: tenantB })

    await db()
      .update(appUser)
      .set({ preferences: { theme: 'night' } })
      .where(eq(appUser.id, userA.id))
    await db()
      .update(appUser)
      .set({ preferences: { theme: 'rose' } })
      .where(eq(appUser.id, userB.id))

    expect(await themeOfUser(db(), userA.id)).toBe('night')
    expect(await themeOfUser(db(), userB.id)).toBe('rose')
  })

  it('answers undefined where nothing is stored', async () => {
    const tenantId = await createTenant(db())
    const user = await createUser(db(), { tenantId })

    // `slate` is the default and is stored as the absence of a value, so
    // "nothing stored" and "the default" are the same answer on purpose.
    expect(await themeOfUser(db(), user.id)).toBeUndefined()
  })
})
