import postgres from 'postgres'
import { getEnv, loadEnvFile } from '../env.js'

/**
 * Gives the application role its password and its LOGIN, from the environment.
 *
 * Migration 0044 creates `praxi_app` NOLOGIN and grants it what it needs; it
 * deliberately does not set a password, because a migration is committed to
 * git. This is the one step that carries a secret, so it is a script that reads
 * the environment rather than a line of SQL somebody has to remember to edit.
 *
 * Idempotent: run it again after changing `APP_DATABASE_PASSWORD` and the role
 * simply takes the new one. It connects as the OWNER (`DATABASE_URL`), because
 * only a role with CREATEROLE or superuser may alter another role.
 *
 * `pnpm db:app-role`.
 */

loadEnvFile()
const env = getEnv()

const password = process.env.APP_DATABASE_PASSWORD
if (!password) {
  console.error(
    'APP_DATABASE_PASSWORD is not set. Generate one with `openssl rand -hex 24` and put it in .env,\n' +
      'together with the matching password in APP_DATABASE_URL.',
  )
  process.exit(1)
}

const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} })

try {
  const [role] = await sql`select 1 from pg_roles where rolname = 'praxi_app'`
  if (!role) {
    console.error('Role praxi_app does not exist. Run `pnpm db:migrate` first (migration 0044).')
    process.exit(1)
  }

  // `unsafe` because a role name cannot be a bind parameter and neither can a
  // password in ALTER ROLE. The value comes from the environment, not from a
  // request; the quoting is Postgres' own literal escape.
  const quoted = `'${password.replaceAll("'", "''")}'`
  await sql.unsafe(`alter role praxi_app login password ${quoted}`)

  const [check] = await sql`
    select rolcanlogin, rolsuper, rolbypassrls from pg_roles where rolname = 'praxi_app'`

  console.info('praxi_app: login granted, password set')
  console.info(
    `  superuser=${check?.rolsuper} bypassrls=${check?.rolbypassrls}` +
      ' — both must stay false, or row-level security is decoration.',
  )
} finally {
  await sql.end({ timeout: 5 })
}
