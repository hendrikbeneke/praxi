import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { app } from './app.js'
import { closeDatabase, verifyDatabaseConnection } from './db/client.js'
import { getEnv, loadEnvFile } from './env.js'
import { logger } from './logger.js'

loadEnvFile()
const env = getEnv()
const log = logger()

try {
  await verifyDatabaseConnection()
} catch {
  log.fatal('database unreachable — is Postgres running? (pnpm db:up)')
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
    server.close(() => {
      void closeDatabase().then(() => process.exit(0))
    })
  })
}
