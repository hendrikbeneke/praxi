import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { app } from './app.js'
import { closeDatabase, db, verifyDatabaseConnection } from './db/client.js'
import { getEnv, loadEnvFile } from './env.js'
import { startGoogleWorker } from './google/worker.js'
import { logger } from './logger.js'

loadEnvFile()
const env = getEnv()
const log = logger()

/**
 * The SQLSTATE, and nothing around it.
 *
 * Rule 12: a driver error's `message` is the failed connection or query with
 * its parameters — here the connection string, password included — so what may
 * travel to the log is the code. It sits on the driver error for Postgres's own
 * refusals and on the `AggregateError` Node builds when no socket could be
 * opened at all; walk down `cause` so a future wrapper does not swallow it.
 */
function connectionErrorCode(error: unknown): string {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    if (typeof current !== 'object') break
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' && code !== '') return code
    current = (current as { cause?: unknown }).cause
  }
  return 'unknown'
}

try {
  await verifyDatabaseConnection()
} catch (error) {
  /**
   * Two causes, and the code tells them apart: `ECONNREFUSED` is Postgres not
   * being there, `28P01` is Postgres refusing the credentials — which covers
   * both a wrong password and a role that may not log in, and on a server it is
   * almost always the latter. The baseline creates `praxi_app` NOLOGIN on
   * purpose, because a password does not belong in a file committed to git, so
   * the very first deployment fails exactly this way until `pnpm db:app-role`
   * or one line of SQL has given the role its own.
   *
   * This line said "is Postgres running? (pnpm db:up)" and nothing else until
   * the go-live checklist was written against it. That is advice for a laptop,
   * and it points away from the likelier cause on the machine where being wrong
   * costs a deployment and the container one cannot exec into to look.
   */
  log.fatal(
    { code: connectionErrorCode(error) },
    'cannot reach the database — either Postgres is not running (locally: pnpm db:up), ' +
      'or it refused the credentials (28P01: check APP_DATABASE_URL, and whether praxi_app ' +
      'has a password and LOGIN — pnpm db:app-role)',
  )
  process.exit(1)
}

/**
 * In production this one process also serves the SPA that `pnpm build` wrote
 * into `apps/server/public`. The API routes are registered in app.ts and
 * therefore match first; everything else falls back to index.html so client
 * side routing survives a reload.
 *
 * `apps/server/data` is deliberately not under `public` — uploads are served
 * only through an authenticated route (CLAUDE.md rule 12).
 */
if (env.NODE_ENV === 'production') {
  const publicDir = new URL('../public/', import.meta.url)
  const staticRoot = relative(process.cwd(), fileURLToPath(publicDir)) || '.'
  const indexHtml = await readFile(new URL('index.html', publicDir), 'utf8')

  app.use('*', serveStatic({ root: staticRoot }))
  app.get('*', (c) =>
    // An unknown /api path must stay a JSON 404, not become the SPA shell.
    c.req.path.startsWith('/api/') ? c.notFound() : c.html(indexHtml),
  )
}

/**
 * The outbox worker (slice 9). Returns null without a Google configuration,
 * which is a normal state — everything except the Google area works without
 * one. The timer is `unref`ed, so it never holds the process open.
 */
const googleWorker = startGoogleWorker(db())
if (googleWorker) log.info('google calendar sync worker started')

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info({ port: info.port, env: env.NODE_ENV }, 'server listening')
})

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    log.fatal({ port: env.PORT }, 'port already in use — is another instance running?')
  } else {
    log.fatal({ name: err.name, code: err.code }, 'server failed to start')
  }
  process.exit(1)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info({ signal }, 'shutting down')
    if (googleWorker) clearInterval(googleWorker)
    server.close(() => {
      // Same family as the worker's floated tick: a rejection here would end
      // the shutdown with an unhandled rejection instead of a clean exit, and
      // a pool that refuses to close is not a reason to fail on the way out.
      closeDatabase()
        .catch((error: unknown) => {
          log.warn(
            { name: error instanceof Error ? error.name : 'unknown' },
            'closing the database failed',
          )
        })
        .finally(() => process.exit(0))
    })
  })
}
