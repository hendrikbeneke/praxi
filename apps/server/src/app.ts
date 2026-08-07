import { Hono } from 'hono'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import { requestLog } from './middleware/request-log.js'
import { healthRoute } from './routes/health.js'

const app = new Hono()

app.use('*', requestLog)
app.onError(errorHandler)
app.notFound(notFoundHandler)

/**
 * Every API route is mounted under `/api`. The chained `route()` calls are what
 * carries the types to the client — `AppType` is the type of the chain, not of
 * the bare app, so a route missing from this chain is invisible to `hc`.
 */
const routes = app.route('/api/health', healthRoute)

export { app }
export type AppType = typeof routes
