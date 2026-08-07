import { Hono } from 'hono'
import type { AppEnv } from './context.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import { sameOrigin } from './middleware/origin.js'
import { requestLog } from './middleware/request-log.js'
import { authRoute } from './routes/auth.js'
import { healthRoute } from './routes/health.js'
import { settingsRoute } from './routes/settings.js'

const app = new Hono<AppEnv>()

app.use('*', requestLog)
app.use('/api/*', sameOrigin)
app.onError(errorHandler)
app.notFound(notFoundHandler)

/**
 * Every API route is mounted under `/api`. The chained `route()` calls are what
 * carries the types to the client — `AppType` is the type of the chain, not of
 * the bare app, so a route missing from this chain is invisible to `hc`.
 */
const routes = app
  .route('/api/health', healthRoute)
  .route('/api/auth', authRoute)
  .route('/api/settings', settingsRoute)

export { app }
export type AppType = typeof routes
