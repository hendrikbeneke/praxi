import { createMiddleware } from 'hono/factory'
import { logger } from '../logger.js'

/**
 * One line per request: method, path, status, duration.
 *
 * `c.req.path` deliberately, never `c.req.url` — the query string carries
 * search terms, and a search term in this application is usually a patient's
 * name. See CLAUDE.md rule 12.
 */
export const requestLog = createMiddleware(async (c, next) => {
  const startedAt = performance.now()
  await next()
  const durationMs = Math.round(performance.now() - startedAt)

  logger().info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
    },
    'request',
  )
})
