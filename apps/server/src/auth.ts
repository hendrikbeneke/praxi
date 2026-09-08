import type { Theme } from '@praxi/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { z } from 'zod'
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE } from './cookies.js'
import { db } from './db/client.js'
import * as schema from './db/schema.js'
import { hashPassword, sweepOnSignIn, verifyPassword } from './domain/auth.js'
import { tenantOfUser, themeOfUser } from './domain/session.js'
import { getEnv } from './env.js'
import { newId } from './id.js'

/** The context a hook is handed, derived from the function that takes it
 *  rather than imported by name — the library exports the callback type and
 *  not the parameter, and inferring it cannot fall out of step. */
type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]

/**
 * Writes or clears `praxi_theme`.
 *
 * Not `httpOnly`, deliberately: the inline script in `index.html` has to read
 * it. It carries the name of a colour scheme and nothing else — no identity,
 * no session — and it never leaves the origin. `secure` is left to the
 * library, which decides it the same way for every cookie it sets.
 */
function writeThemeCookie(ctx: HookContext, theme: Theme | undefined): void {
  const clearing = !theme || theme === 'slate'
  ctx.setCookie(THEME_COOKIE, clearing ? '' : theme, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: clearing ? 0 : THEME_COOKIE_MAX_AGE,
  })
}

/**
 * Better Auth, configured against the tables this application already has.
 *
 * `app_user` and `session` keep their names and every column they had —
 * `modelName` points the library at them rather than the other way round. No
 * table is renamed (`user` is reserved in Postgres anyway), and the four
 * composite foreign keys onto `app_user (id, tenant_id)` are untouched. Only
 * `account`, `verification` and `rate_limit` are new.
 *
 * What the library owns from here on: the session, its token, its cookie, the
 * sliding expiry, the sign-in flow and the rate limit. What stays ours: the
 * argon2 functions it is handed, the tenant that travels on the session, and
 * the theme cookie written beside the session cookie.
 *
 * Built on first use rather than at import time — the same shape as `db()`,
 * `getEnv()` and `logger()`, and for the same reason: `index.ts` calls
 * `loadEnvFile()` before anything reads the environment, so a `betterAuth({…})`
 * evaluated while this module is imported would look for `DATABASE_URL` and
 * `BETTER_AUTH_SECRET` before either is there.
 */
function build() {
  return betterAuth({
    /**
     * The five tables the library may touch, and no others.
     *
     * The adapter resolves a model through the KEY of this object, not through
     * the drizzle table's name — so the keys are the `modelName`s below, and
     * `app_user` maps to our `appUser` export. Handing it the whole schema
     * module would look tidier and would be wrong twice: `rate_limit` would not
     * resolve at all (the export is `rateLimit`), and the adapter would be able
     * to reach `contact` and `note`, which it has no business knowing about.
     */
    database: drizzleAdapter(db(), {
      provider: 'pg',
      schema: {
        app_user: schema.appUser,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rate_limit: schema.rateLimit,
      },
    }),
    secret: getEnv().BETTER_AUTH_SECRET,
    basePath: '/api/auth',

    emailAndPassword: {
      enabled: true,
      // There is exactly one user and the seed creates it. Nothing signs up, and
      // an endpoint that would create one must not exist while that is true.
      disableSignUp: true,
      /**
       * This application's own argon2, handed in rather than replaced. The
       * hashes written before S-B therefore keep verifying: migration 0043 moved
       * the string from `app_user.password_hash` into `account.password` and
       * re-hashed nothing.
       */
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
    },

    user: {
      modelName: 'app_user',
      additionalFields: {
        /**
         * CLAUDE.md rule 1. It is declared here so the library carries it on the
         * user it hands back; it is never written from a request — nothing signs
         * up, and `input: false` says so to the library as well.
         */
        tenantId: { type: 'string', input: false, required: true },
        /**
         * Better Auth has no notion of a deactivated user, so nothing in the
         * library reads this. `apiGuard` does, immediately after resolving the
         * session, which is what keeps "deactivated is out at the next request"
         * true rather than "true until the session expires".
         */
        active: { type: 'boolean', input: false, required: false, defaultValue: true },
      },
    },

    session: {
      modelName: 'session',
      // 14 days, refreshed after an hour of use — SESSION_TTL_MS and
      // SESSION_REFRESH_AFTER_MS of the implementation this replaces, unchanged.
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60,
      additionalFields: {
        /**
         * The tenant is denormalized onto the session exactly as it was before,
         * and for the same reason: the middleware resolves user and tenant in
         * one read. It comes from the user's row through the hook below, never
         * from the request — which is what keeps rule 1 literally true. A JWT
         * would have moved this into a token held by the client; a session row
         * does not.
         */
        tenantId: { type: 'string', input: false, required: true },
      },
    },

    advanced: {
      // UUIDv7 from the application, as every other id in this schema.
      database: { generateId: () => newId() },
      cookies: {
        // `praxi_session` as before. The name is the same and the content is
        // not — a signed, opaque token rather than our own random one.
        session_token: { name: 'praxi_session' },
      },
    },

    /**
     * The login rate limit (S-B, part three).
     *
     * In the database rather than in the process: in memory, a restart is the
     * cheapest reset an attacker can get. It counts by IP and never locks an
     * account, which is the right shape here — with one practitioner, an account
     * lockout is a denial of service against exactly that person the moment
     * somebody knows the address.
     *
     * Enabled in development too, against the library's default. A limit that
     * only exists in production is a limit nobody has ever watched work.
     */
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'rate_limit',
      // Five attempts a minute. The library's default for this path is three in
      // ten seconds, which is a typo window rather than an attacker window.
      customRules: { '/sign-in/email': { window: 60, max: 5 } },
    },

    databaseHooks: {
      session: {
        create: {
          /**
           * The tenant, onto the session being written. `session.tenant_id` is
           * `not null` with a composite foreign key against
           * `app_user (id, tenant_id)`, so a session can only ever carry the
           * tenant of its own user — the database says it, not this function.
           */
          before: async (session) => {
            const tenantId = await tenantOfUser(db(), session.userId)
            return { data: { ...session, tenantId } }
          },
          /**
           * The free moment that used to sit inside `login()`. Floated
           * deliberately: housekeeping must not be able to fail a sign-in.
           */
          after: async (session) => {
            // The `before` hook above put it there and the column is not null,
            // but the library types this callback's argument without our
            // additional fields — so it is parsed rather than asserted.
            const tenant = z.uuid().safeParse(session.tenantId)
            if (!tenant.success) return
            void sweepOnSignIn(db(), tenant.data).catch(() => {})
          },
        },
      },
    },

    hooks: {
      /**
       * The theme cookie, in the same response as the session cookie.
       *
       * That sameness is the whole mechanism and not a convenience: the inline
       * script in `index.html` reads `praxi_theme` before the first byte is
       * rendered, so the first paint after signing in is already in the right
       * scheme. Fetching it afterwards would mean one request, which means one
       * frame in the wrong colours.
       *
       * It is a cache and never a source of truth — `app_user.preferences`
       * decides, and every load reconciles the document with it.
       */
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-in/email') {
          const user = ctx.context.newSession?.user
          if (!user) return
          // `undefined` where the theme is `slate`: the default is stored as
          // the *absence* of a value on both sides, the convention `cookies.ts`,
          // `theme-picker.tsx` and the inline script all keep.
          writeThemeCookie(ctx, await themeOfUser(db(), user.id))
          return
        }

        if (ctx.path === '/sign-out') {
          // Or the next person's login screen wears the last one's colours.
          writeThemeCookie(ctx, undefined)
        }
      }),
    },
  })
}

/**
 * The type is inferred from `build` rather than written out: spelling it
 * `ReturnType<typeof betterAuth>` widens it to the library's generic default
 * and loses `additionalFields`, so `session.tenantId` and `user.active` — the
 * two fields the middleware exists to read — silently stop existing.
 */
let cached: ReturnType<typeof build> | undefined

export function auth(): ReturnType<typeof build> {
  cached ??= build()
  return cached
}
