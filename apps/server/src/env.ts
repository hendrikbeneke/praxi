import { z } from 'zod'

/**
 * The repository root, resolved relative to this file so it works both from
 * `src/` (tsx, dev) and from `dist/` (node, production) — both are two levels
 * below `apps/server`.
 */
const repoRoot = new URL('../../../', import.meta.url)

/**
 * Load the root `.env` if there is one. In production the process may well be
 * started with real environment variables and no file at all, so a missing
 * file is not an error.
 */
export function loadEnvFile(): void {
  try {
    process.loadEnvFile(new URL('.env', repoRoot))
  } catch {
    // no .env file — rely on the ambient environment
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  /**
   * Where uploaded files and generated PDFs live. Outside the web root, never
   * served statically (CLAUDE.md rule 12). Relative values are resolved
   * against the repository root, so the default works from `src/` and `dist/`
   * alike; an absolute path moves the whole store somewhere else — a mounted
   * volume on a server, for instance — without touching a single stored path,
   * because `note_file.storage_path` is relative to this directory.
   */
  DATA_DIR: z.string().min(1).default('apps/server/data'),

  /**
   * Google Calendar (slice 9). All optional: the server starts, and everything
   * except the Google area works, without a single one of them. The settings
   * then say "not set up" rather than offering a button that cannot work.
   *
   * `ENCRYPTION_KEY` is the key every stored credential is encrypted *with* —
   * the Google refresh token and the SMTP password — not a credential itself.
   * 32 bytes as 64 hex characters, generated once with `openssl rand -hex 32`
   * and never typed by a human. Losing it does not lose data; it costs one
   * reconnect and one re-entered password. It is used by `src/secrets.ts` and
   * is listed here, in the Google block, only because that slice needed it
   * first.
   *
   * `GOOGLE_REDIRECT_URI` is the only thing that changes on a server
   * deployment. Everything else in this software is relative.
   */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'must be 64 hex characters')
    .optional(),
  GOOGLE_REDIRECT_URI: z.url().optional(),

  // Read by `pnpm db:seed` only, therefore optional here — the server must
  // start without them. The seed validates them itself and refuses to run on
  // a missing or empty password.
  SEED_USER_EMAIL: z.string().optional(),
  SEED_USER_PASSWORD: z.string().optional(),
  SEED_USER_NAME: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | undefined

/**
 * Parse and cache the environment. Fails loudly at startup rather than at the
 * first request. The error names the offending variables only — never values,
 * because DATABASE_URL contains a password.
 */
export function getEnv(): Env {
  if (cached) return cached

  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Invalid environment configuration. Check these variables: ${names}`)
  }

  cached = result.data
  return cached
}
