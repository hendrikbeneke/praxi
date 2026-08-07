import { z } from 'zod'

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
