import { z } from 'zod'
import { requiredText } from './field.js'

/**
 * The email is lower-cased here, at the edge, because `app_user.email` carries
 * a `check (email = lower(email))` constraint and is looked up by plain
 * equality against its unique index.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email())
    .transform((value) => value.toLowerCase()),
  // No minimum length on login — a length rule here would only tell an
  // attacker something about the stored password. It belongs on the seed.
  password: z.string().min(1).max(1024),
})

export type LoginInput = z.infer<typeof loginSchema>

/** What `GET /api/auth/me` returns. Deliberately no tenant id — the client
 *  never sends one, so it has no use for it (CLAUDE.md rule 1). */
export const currentUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
})

export type CurrentUser = z.infer<typeof currentUserSchema>

/** Minimum length for a password that is being set, as opposed to entered. */
export const passwordPolicy = { minLength: 12 } as const

/**
 * What it takes to bring a user into being, as opposed to letting one in.
 *
 * Separate from `loginSchema` because the rules point in opposite directions:
 * signing in must say as little as possible about the stored password, while
 * setting one is exactly where the length rule belongs. The email is
 * lower-cased here for the same reason it is there — `app_user.email` carries
 * `check (email = lower(email))` and a global unique index.
 *
 * Read by `domain/user.ts` and by the CLI that calls it; there is no screen for
 * it yet, and when there is, it takes this one.
 */
export const newUserSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email())
    .transform((value) => value.toLowerCase()),
  name: requiredText(120),
  password: z.string().min(passwordPolicy.minLength).max(1024),
})

export type NewUserInput = z.infer<typeof newUserSchema>

/**
 * A tenant and its first user, which is the only way a tenant ever comes into
 * being: one with no user is a practice nobody can sign into.
 *
 * The practice name is the only master datum asked for. Everything else —
 * address, tax number, bank details — stays empty on purpose, because a
 * placeholder in a real practice's settings is read as a record that exists
 * ("a form never claims a state that does not exist").
 */
export const newTenantSchema = z.object({
  practiceName: requiredText(120),
  user: newUserSchema,
})

export type NewTenantInput = z.infer<typeof newTenantSchema>
