import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { getEnv } from '../env.js'
import { messages } from '../messages.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Vite's dev server. In development the SPA is served from 5173 while the API
 * answers on 3000; Vite proxies `/api` and forwards the browser's origin
 * unchanged, so that origin has to be accepted explicitly. In production the
 * same process serves both and the plain host comparison already matches.
 */
const DEV_ORIGIN_HOSTS = new Set(['localhost:5173', '127.0.0.1:5173'])

/**
 * Same-origin check on state-changing requests, as a second lock next to the
 * `SameSite=Lax` cookie.
 *
 * A missing `Origin` header is allowed: browsers always send it on
 * cross-origin POSTs, so its absence means a non-browser client — curl, a
 * test — which carries no ambient cookie anyway.
 */
export const sameOrigin = createMiddleware(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next()

  const origin = c.req.header('origin')
  if (!origin) return next()

  const host = c.req.header('x-forwarded-host') ?? c.req.header('host')

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    throw new HTTPException(403, { message: messages.error.forbidden })
  }

  const developmentAllows = getEnv().NODE_ENV !== 'production' && DEV_ORIGIN_HOSTS.has(originHost)

  if (originHost !== host && !developmentAllows) {
    throw new HTTPException(403, { message: messages.error.forbidden })
  }

  await next()
})
