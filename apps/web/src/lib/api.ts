import type { AppType } from '@praxi/server'
import { hc } from 'hono/client'

/**
 * Typed client over the Hono app. The base URL is relative on purpose: in
 * development Vite proxies /api to the server on port 3000, in production the
 * same process serves both. No environment switch in the code.
 */
export const api = hc<AppType>('/')
