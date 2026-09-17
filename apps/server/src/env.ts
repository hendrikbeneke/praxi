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

/**
 * Treats an empty value as an absent one.
 *
 * `.env.example` ships these keys with nothing after the `=`, which is how a
 * variable is documented without being set — and `z.url().optional()` rejects
 * `''` rather than ignoring it, so a copied example file would refuse to start
 * with a message about a URL nobody meant to configure.
 */
function emptyAsUnset<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional())
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
  /**
   * What Better Auth signs the session cookie with. Required — not optional
   * like the Google block, because without it nobody can sign in and the
   * server may as well refuse to start rather than fail at the login form.
   *
   * It is the second half of the rule stated for `ENCRYPTION_KEY` above: a key
   * things are protected *with*, never a credential being protected. Generated
   * once with `openssl rand -hex 32` and never typed by a human. Losing it
   * invalidates every open session and costs one sign-in.
   */
  BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),

  /**
   * The connection the SERVER uses, as the unprivileged role `praxi_app`.
   *
   * `DATABASE_URL` above stays the owner's, and the two are deliberately not
   * interchangeable: migrations, the seed and the scripts need to own tables
   * and create roles, while the request path must be a role that row-level
   * security actually applies to — `praxi` is a superuser with BYPASSRLS and
   * owns every table, so a policy would never have been consulted for it.
   *
   * **Required since S-C2**, and the reason is that its absence is invisible.
   * With the policies on, falling back to `DATABASE_URL` means running as the
   * owner — which bypasses every one of them and answers every query exactly as
   * it did before. Nothing fails, nothing is logged, and the isolation is
   * simply not there. A server that refuses to start says so at the only moment
   * anyone would notice.
   */
  APP_DATABASE_URL: z.url(),
  APP_DATABASE_PASSWORD: emptyAsUnset(z.string().min(1)),

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

/**
 * The connection strings that must not cross a network in the clear.
 *
 * Patient data travels over both of them, so a database that is not on this
 * machine is reached with TLS **and** a verified certificate, or the server does
 * not start. This is the fourth of a family of faults this project keeps
 * finding: something that looks like it worked. A superuser with BYPASSRLS, a
 * seed with no tenant set, an `ALTER ROLE` nobody was allowed to run — and this
 * one is the worst of them, because the failure mode is patient data in the
 * clear over the public internet with nothing anywhere saying so.
 */
const TLS_CHECKED_URLS = ['DATABASE_URL', 'APP_DATABASE_URL'] as const

/**
 * What counts as local — **loopback and nothing else**, deliberately stricter
 * than "not reachable from outside".
 *
 * A private address or a Docker service name on a shared network would be
 * legitimate without TLS too, and both are refused here anyway. The trade is
 * not close: a wrong refusal costs a minute and says exactly what to add, while
 * a connection waved through costs professional confidentiality and announces
 * itself to nobody. There is deliberately no opt-out variable — one deployment
 * exists and it crosses the public internet, so an escape hatch today would be
 * a hole for a case that does not exist. The day the database sits on a private
 * network again, that is a deliberate change with a name on it.
 *
 * An empty host is `postgres:///praxi` and similar, which means a local socket.
 */
function isLoopbackHost(host: string): boolean {
  if (host === '') return true

  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  const name = bare.toLowerCase()

  if (name === 'localhost' || name.endsWith('.localhost')) return true
  if (name === '::1') return true
  // The whole 127.0.0.0/8, not just 127.0.0.1.
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name)
}

/**
 * `null` when the URL is acceptable, otherwise the sentence to refuse with.
 *
 * **Only `sslmode=verify-full` counts**, and not because the others cannot
 * encrypt. Measured against the installed `postgres.js`: `sslmode=require`
 * sets `rejectUnauthorized: false`, so the connection is encrypted against
 * whatever certificate answers — which is protection against a passive listener
 * and none at all against somebody in the middle. No parameter at all is plain
 * text, silently. `verify-full` is what leaves Node's verification on, so the
 * chain and the hostname are both checked.
 *
 * The URL is never quoted back: it carries the password. The host is, because
 * it is what makes the message actionable and it is in DNS anyway.
 */
export function databaseTlsProblem(name: string, value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    // Shape is the Zod schema's business; an unparseable URL is its error to
    // report, not this one's.
    return null
  }

  if (isLoopbackHost(url.hostname)) return null

  const sslmode = (url.searchParams.get('sslmode') ?? '').trim().toLowerCase()
  if (sslmode === 'verify-full') return null

  const found =
    sslmode === ''
      ? 'it carries no sslmode at all, which means the connection is made in plain text'
      : `it carries sslmode=${sslmode}, which does not verify the certificate` +
        (sslmode === 'require'
          ? ' — `require` encrypts against whatever certificate answers, so it protects' +
            ' against listening and not against being redirected'
          : '')

  return (
    `${name} points at ${url.hostname}, which is not this machine, and ${found}.\n` +
    `Add ?sslmode=verify-full&sslrootcert=system to ${name}.\n` +
    'Patient data crosses this connection; the server refuses to start rather ' +
    'than send it unprotected.'
  )
}

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

  // Both at once: fixing one and being told about the other on the next
  // deployment is two deployments for one mistake.
  const problems = TLS_CHECKED_URLS.map((name) =>
    databaseTlsProblem(name, result.data[name]),
  ).filter((problem): problem is string => problem !== null)

  if (problems.length > 0) throw new Error(problems.join('\n\n'))

  cached = result.data
  return cached
}
