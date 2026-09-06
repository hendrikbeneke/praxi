import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { auth } from '../auth.js'
import { db } from '../db/client.js'
import { appUser, rateLimit, session } from '../db/schema.js'
import { createTenant, createUser } from '../test/fixtures.js'

/**
 * Better Auth, as this application wired it up.
 *
 * Everything goes through `auth.handler` with a real `Request` rather than
 * through `auth.api.*`, and that is not incidental: the server API bypasses
 * the rate limiter by design, so the one test that matters most here would
 * silently pass against nothing.
 *
 * What is asserted is our wiring — the argon2 hashes still verify, the tenant
 * lands on the session row, a deactivated user is refused, the theme cookie
 * rides along, the limiter bites — not the library's own behaviour.
 */

const PASSWORD = 'correct horse battery staple'

function request(path: string, body: unknown, ip = '203.0.113.1'): Request {
  return new Request(`http://localhost:3000/api/auth${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // The limiter keys on the connecting address.
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  })
}

function signIn(email: string, password: string, ip?: string): Promise<Response> {
  return auth().handler(request('/sign-in/email', { email, password }, ip))
}

/** Every test starts on an empty counter table; the limiter is on in tests as
 *  it is everywhere, so a previous test's attempts would otherwise carry. */
beforeEach(async () => {
  await db().delete(rateLimit)
})

describe('signing in', () => {
  it('accepts the password against the argon2 hash migration 0043 moved', async () => {
    const tenantId = await createTenant(db())
    const user = await createUser(db(), { tenantId, password: PASSWORD })

    const res = await signIn(user.email, PASSWORD)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { user: { id: string } }
    expect(body.user.id).toBe(user.id)
  })

  it('refuses a wrong password', async () => {
    const tenantId = await createTenant(db())
    const user = await createUser(db(), { tenantId, password: PASSWORD })

    const res = await signIn(user.email, 'wrong')

    expect(res.status).toBe(401)
    expect(await db().select().from(session)).toEqual([])
  })

  it('refuses an unknown address the same way', async () => {
    await createTenant(db())

    const res = await signIn('nobody@praxi.invalid', PASSWORD)

    expect(res.status).toBe(401)
  })

  it('writes the tenant onto the session row', async () => {
    const tenantId = await createTenant(db())
    const user = await createUser(db(), { tenantId, password: PASSWORD })

    await signIn(user.email, PASSWORD)

    const [row] = await db().select().from(session).where(eq(session.userId, user.id))
    // CLAUDE.md rule 1: the tenant comes from the user's row through the
    // create hook, and every later request reads it from here rather than
    // from anything the client sent.
    expect(row?.tenantId).toBe(tenantId)
  })

  it('sets the theme cookie in the same response as the session cookie', async () => {
    const tenantId = await createTenant(db())
    const user = await createUser(db(), { tenantId, password: PASSWORD })
    await db()
      .update(appUser)
      .set({ preferences: { theme: 'nacht' } })
      .where(eq(appUser.id, user.id))

    const res = await signIn(user.email, PASSWORD)

    // Same response, because the inline script in index.html reads the cookie
    // before the first byte is rendered. A second request would mean one frame
    // painted in the wrong scheme.
    const cookies = res.headers.getSetCookie().join('\n')
    expect(cookies).toContain('praxi_session=')
    expect(cookies).toMatch(/praxi_theme=nacht/)
  })

  it('clears the theme cookie where the theme is the default', async () => {
    const tenantId = await createTenant(db())
    const user = await createUser(db(), { tenantId, password: PASSWORD })

    const res = await signIn(user.email, PASSWORD)

    // `schiefer` is stored as the absence of a value on both sides, so an
    // unset theme has to actively clear a cookie the last user may have left.
    const themeCookie = res.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('praxi_theme='))
    expect(themeCookie).toMatch(/praxi_theme=;/)
  })
})

describe('a deactivated user', () => {
  it('is refused by the guard even holding a valid session', async () => {
    const tenantId = await createTenant(db())
    const user = await createUser(db(), { tenantId, password: PASSWORD })

    const signedIn = await signIn(user.email, PASSWORD)
    const cookie = signedIn.headers.getSetCookie().join('; ')

    // Better Auth has no notion of this; `requireAuth` reads `active` on every
    // request, which is what makes deactivating take effect at once instead of
    // whenever the session happens to expire.
    await db().update(appUser).set({ active: false }).where(eq(appUser.id, user.id))

    const { app } = await import('../app.js')
    const res = await app.request('/api/contacts', { headers: { cookie } })

    expect(res.status).toBe(401)
  })
})

describe('the login rate limit', () => {
  it('answers 429 after five attempts from one address inside the window', async () => {
    const tenantId = await createTenant(db())
    const user = await createUser(db(), { tenantId, password: PASSWORD })

    const statuses: number[] = []
    for (let attempt = 0; attempt < 7; attempt++) {
      statuses.push((await signIn(user.email, 'wrong', '198.51.100.7')).status)
    }

    // Five get through and are refused on their merits; the rest never reach
    // argon2 at all, which is the point — 19 MiB per attempt is a resource
    // question as much as a guessing one.
    expect(statuses.filter((status) => status === 401)).toHaveLength(5)
    expect(statuses.filter((status) => status === 429)).toHaveLength(2)
  })

  it('counts per address, so one attacker cannot lock the practitioner out', async () => {
    const tenantId = await createTenant(db())
    const user = await createUser(db(), { tenantId, password: PASSWORD })

    for (let attempt = 0; attempt < 6; attempt++) {
      await signIn(user.email, 'wrong', '198.51.100.8')
    }

    // The whole reason the limiter keys on the address and never locks the
    // account: with one practitioner, an account lockout is a denial of
    // service against exactly that person.
    const fromElsewhere = await signIn(user.email, PASSWORD, '203.0.113.9')
    expect(fromElsewhere.status).toBe(200)
  })

  it('keeps its counters in the database rather than in the process', async () => {
    const tenantId = await createTenant(db())
    const user = await createUser(db(), { tenantId, password: PASSWORD })

    await signIn(user.email, 'wrong', '198.51.100.10')

    // In memory a restart would be the cheapest reset an attacker can get.
    const rows = await db().select().from(rateLimit)
    expect(rows.length).toBeGreaterThan(0)
  })
})

describe('signing up', () => {
  it('is not reachable', async () => {
    const res = await auth().handler(
      request('/sign-up/email', {
        email: 'intruder@praxi.invalid',
        password: PASSWORD,
        name: 'Intruder',
      }),
    )

    // `disableSignUp`. There is one user and the seed creates it; an endpoint
    // that makes a second one — with a tenant it would have to invent — must
    // not exist while that is true.
    expect(res.status).not.toBe(200)
    expect(await db().select().from(appUser)).toEqual([])
  })
})
