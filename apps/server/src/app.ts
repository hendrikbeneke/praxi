import { Hono } from 'hono'
import { auth } from './auth.js'
import type { AppEnv } from './context.js'
import { apiGuard } from './middleware/api-guard.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import { sameOrigin } from './middleware/origin.js'
import { requestLog } from './middleware/request-log.js'
import { activitiesRoute } from './routes/activities.js'
import { activityTypesRoute } from './routes/activity-types.js'
import { appointmentsRoute } from './routes/appointments.js'
import { contactRelationTypesRoute, contactRoleTypesRoute } from './routes/contact-types.js'
import { contactsRoute } from './routes/contacts.js'
import { googleRoute } from './routes/google.js'
import { healthRoute } from './routes/health.js'
import { invoiceSendRoute } from './routes/invoice-send.js'
import { invoicesRoute } from './routes/invoices.js'
import { emailTemplatesRoute, smtpRoute } from './routes/mail.js'
import { noteDraftsRoute } from './routes/note-drafts.js'
import { noteTypesRoute } from './routes/note-types.js'
import { notesRoute } from './routes/notes.js'
import { numberRangesRoute } from './routes/number-ranges.js'
import { paymentsRoute } from './routes/payments.js'
import { serviceGroupsRoute } from './routes/service-groups.js'
import { servicesRoute } from './routes/services.js'
import { settingsRoute } from './routes/settings.js'
import { textTemplatesRoute } from './routes/text-templates.js'
import { userPreferencesRoute } from './routes/user-preferences.js'
import { countriesRoute, gendersRoute, salutationsRoute } from './routes/value-lists.js'

const app = new Hono<AppEnv>()

app.use('*', requestLog)
app.use('/api/*', sameOrigin)
/**
 * The auth boundary, on the group rather than on each router — see
 * `middleware/api-guard.ts`. It has to be registered before the `route()`
 * chain below: Hono runs middleware in registration order.
 */
app.use('/api/*', apiGuard)

/**
 * Better Auth owns everything under `/api/auth`: signing in and out, the
 * session endpoint, and later the password reset and the OAuth callbacks. It
 * is one Hono route with the library's own router behind it, which is why
 * `PUBLIC_API_ROUTES` carries a single wildcard entry for it — the only one,
 * and `api-guard.test.ts` asserts that nothing of ours is ever mounted under
 * that prefix, so the exception can only ever cover the library.
 */
app.all('/api/auth/*', (c) => auth().handler(c.req.raw))

app.onError(errorHandler)
app.notFound(notFoundHandler)

/**
 * Every API route is mounted under `/api`. The chained `route()` calls are what
 * carries the types to the client — `AppType` is the type of the chain, not of
 * the bare app, so a route missing from this chain is invisible to `hc`.
 */
const routes = app
  .route('/api/health', healthRoute)
  .route('/api/settings', settingsRoute)
  .route('/api/contacts', contactsRoute)
  .route('/api/contact-role-types', contactRoleTypesRoute)
  .route('/api/salutations', salutationsRoute)
  .route('/api/genders', gendersRoute)
  .route('/api/countries', countriesRoute)
  .route('/api/contact-relation-types', contactRelationTypesRoute)
  .route('/api/services', servicesRoute)
  .route('/api/service-groups', serviceGroupsRoute)
  .route('/api/activities', activitiesRoute)
  .route('/api/activity-types', activityTypesRoute)
  .route('/api/appointments', appointmentsRoute)
  .route('/api/notes', notesRoute)
  .route('/api/note-types', noteTypesRoute)
  .route('/api/note-drafts', noteDraftsRoute)
  .route('/api/invoices', invoicesRoute)
  // Payments and sending hang under their invoice; the chains share the prefix.
  .route('/api/invoices', paymentsRoute)
  .route('/api/invoices', invoiceSendRoute)
  .route('/api/text-templates', textTemplatesRoute)
  .route('/api/number-ranges', numberRangesRoute)
  .route('/api/google', googleRoute)
  .route('/api/settings/smtp', smtpRoute)
  .route('/api/email-templates', emailTemplatesRoute)
  .route('/api/user-preferences', userPreferencesRoute)

export { app }
export type AppType = typeof routes
