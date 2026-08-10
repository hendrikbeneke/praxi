import {
  busyRangeQuerySchema,
  conflictResolutionSchema,
  googleCalendarSelectionSchema,
  googleDisconnectSchema,
  googleFreebusySelectionSchema,
} from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { isOverlapViolation } from '../db/errors.js'
import {
  busyIntervals,
  disconnect,
  getStatus,
  saveConnection,
  setCalendar,
  setFreebusyCalendars,
} from '../domain/google-connection.js'
import { listConflicts, resolveConflict } from '../domain/google-sync.js'
import { openGoogleApi } from '../google/api.js'
import { isAuthFailure } from '../google/client.js'
import {
  beginAuthorization,
  exchangeCode,
  fetchAccountEmail,
  oauthConfigured,
  takeFlow,
} from '../google/oauth.js'
import { syncNow } from '../google/worker.js'
import { logger } from '../logger.js'
import { messages } from '../messages.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'
import { EncryptionKeyMismatchError } from '../secrets.js'

const appointmentParam = z.object({ appointmentId: z.uuid() })
const callbackQuery = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
})

/** The two failures that are worth their own sentence rather than a generic
 *  500. Everything else goes through the normal error handler. */
function translate(error: unknown): never {
  if (error instanceof EncryptionKeyMismatchError) {
    throw new HTTPException(409, { message: messages.google.keyMismatch })
  }
  if (isAuthFailure(error)) {
    throw new HTTPException(409, { message: messages.google.authExpired })
  }
  throw error
}

/**
 * A tiny HTML page for the loopback redirect.
 *
 * It cannot redirect into the SPA: the flow comes back on `127.0.0.1`, which
 * is a different origin than `localhost`, so neither the session cookie nor
 * the client's router are there. Nothing but text, and no data from the
 * request is echoed into it.
 */
function callbackPage(title: string, body: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>${title}</title></head>
<body style="font-family:system-ui;padding:3rem;max-width:32rem">
<h1 style="font-size:1.25rem">${title}</h1><p>${body}</p></body></html>`
}

/**
 * The OAuth callback, mounted before the auth middleware on purpose: it
 * authenticates through the single-use `state` it issued, because the session
 * cookie does not travel to `127.0.0.1`.
 */
const callbackRoute = new Hono<AppEnv>().get(
  '/oauth/callback',
  validate('query', callbackQuery),
  async (c) => {
    const query = c.req.valid('query')
    if (query.error || !query.code || !query.state) {
      return c.html(callbackPage(messages.google.callbackFailed, messages.google.stateInvalid), 400)
    }

    const flow = takeFlow(query.state, new Date())
    if (!flow) {
      return c.html(callbackPage(messages.google.callbackFailed, messages.google.stateInvalid), 400)
    }

    try {
      const tokens = await exchangeCode(query.code, flow.verifier)
      const email = await fetchAccountEmail(tokens.accessToken)
      await saveConnection(db(), flow.tenantId, {
        refreshToken: tokens.refreshToken,
        accountEmail: email,
      })
    } catch (error) {
      logger().warn({ tenantId: flow.tenantId }, 'google oauth exchange failed')
      const message = error instanceof Error ? error.message : messages.error.internal
      return c.html(callbackPage(messages.google.callbackFailed, message), 502)
    }

    return c.html(callbackPage(messages.google.callbackTitle, messages.google.callbackBody))
  },
)

export const googleRoute = new Hono<AppEnv>()
  .route('/', callbackRoute)

  .use('*', requireAuth, withTenant)

  .get('/status', async (c) => c.json(await getStatus(db(), tenantId(c))))

  /** Hands back the URL rather than redirecting: the SPA opens it in a new
   *  window and keeps polling the status in this one. */
  .post('/connect', async (c) => {
    if (!oauthConfigured()) {
      throw new HTTPException(409, { message: messages.google.notConfigured })
    }
    return c.json({ authUrl: beginAuthorization(tenantId(c), new Date()) })
  })

  .post('/disconnect', validate('json', googleDisconnectSchema), async (c) => {
    const tenant = tenantId(c)
    /**
     * A handle is only needed for the deleting variant, and even there its
     * absence must not stop the local cleanup — disconnecting has to work
     * offline, or a broken connection could never be got rid of.
     */
    const api = await openGoogleApi(db(), tenant).catch(() => null)

    const result = await disconnect(db(), tenant, {
      deleteRemoteEvents: c.req.valid('json').deleteRemoteEvents,
      api,
    })
    return c.json(result)
  })

  .get('/calendars', async (c) => {
    const api = await openGoogleApi(db(), tenantId(c)).catch(translate)
    if (!api) throw new HTTPException(409, { message: messages.google.notConnected })
    return c.json(await api.listCalendars().catch(translate))
  })

  .put('/calendar', validate('json', googleCalendarSelectionSchema), async (c) => {
    const ok = await setCalendar(db(), tenantId(c), c.req.valid('json').calendarId)
    if (!ok) throw new HTTPException(409, { message: messages.google.notConnected })
    return c.body(null, 204)
  })

  .put('/freebusy-calendars', validate('json', googleFreebusySelectionSchema), async (c) => {
    const ok = await setFreebusyCalendars(db(), tenantId(c), c.req.valid('json').calendarIds)
    if (!ok) throw new HTTPException(409, { message: messages.google.notConnected })
    return c.body(null, 204)
  })

  /**
   * Busy intervals for the calendar view. Never stored, and it fails quietly:
   * without a line the calendar simply shows no foreign blocks rather than an
   * error over a screen that otherwise works.
   */
  .get('/freebusy', validate('query', busyRangeQuerySchema), async (c) => {
    const range = c.req.valid('query')
    const api = await openGoogleApi(db(), tenantId(c)).catch(() => null)
    if (!api) return c.json([])

    const intervals = await busyIntervals(
      db(),
      tenantId(c),
      api,
      new Date(range.from),
      new Date(range.to),
    ).catch(() => [])

    return c.json(intervals)
  })

  .get('/conflicts', async (c) => c.json(await listConflicts(db(), tenantId(c))))

  .post(
    '/conflicts/:appointmentId/resolve',
    validate('param', appointmentParam),
    validate('json', conflictResolutionSchema),
    async (c) => {
      const resolved = await resolveConflict(
        db(),
        tenantId(c),
        c.req.valid('param').appointmentId,
        c.req.valid('json').keep,
      ).catch((error: unknown) => {
        if (isOverlapViolation(error)) {
          throw new HTTPException(409, { message: messages.google.conflictOverlap })
        }
        throw error
      })

      if (!resolved) throw new HTTPException(404, { message: messages.google.conflictNotFound })
      return c.body(null, 204)
    },
  )

  .post('/sync', async (c) => c.json(await syncNow(db(), tenantId(c)).catch(translate)))
