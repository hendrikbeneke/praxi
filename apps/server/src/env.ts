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
