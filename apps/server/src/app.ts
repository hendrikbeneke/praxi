import { Hono } from 'hono'
import type { AppEnv } from './context.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import { sameOrigin } from './middleware/origin.js'
import { requestLog } from './middleware/request-log.js'
import { activitiesRoute } from './routes/activities.js'
import { activityTypesRoute } from './routes/activity-types.js'
import { appointmentsRoute } from './routes/appointments.js'
import { authRoute } from './routes/auth.js'
import { contactRelationTypesRoute, contactRoleTypesRoute } from './routes/contact-types.js'
import { contactsRoute } from './routes/contacts.js'
import { googleRoute } from './routes/google.js'
import { healthRoute } from './routes/health.js'
import { invoicesRoute } from './routes/invoices.js'
import { notesRoute } from './routes/notes.js'
import { numberRangesRoute } from './routes/number-ranges.js'
import { paymentsRoute, receivablesRoute } from './routes/payments.js'
import { serviceGroupsRoute } from './routes/service-groups.js'
import { servicesRoute } from './routes/services.js'
import { settingsRoute } from './routes/settings.js'
import { textTemplatesRoute } from './routes/text-templates.js'

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
  .route('/api/contacts', contactsRoute)
  .route('/api/contact-role-types', contactRoleTypesRoute)
  .route('/api/contact-relation-types', contactRelationTypesRoute)
  .route('/api/services', servicesRoute)
  .route('/api/service-groups', serviceGroupsRoute)
  .route('/api/activities', activitiesRoute)
  .route('/api/activity-types', activityTypesRoute)
  .route('/api/appointments', appointmentsRoute)
  .route('/api/notes', notesRoute)
  .route('/api/invoices', invoicesRoute)
  // Payments hang under their invoice; the two chains share the prefix.
  .route('/api/invoices', paymentsRoute)
  .route('/api/receivables', receivablesRoute)
  .route('/api/text-templates', textTemplatesRoute)
  .route('/api/number-ranges', numberRangesRoute)
  .route('/api/google', googleRoute)

export { app }
export type AppType = typeof routes
