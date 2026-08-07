import type { CurrentUser } from '@praxi/shared'

/**
 * What the middleware chain puts on the Hono context.
 *
 * `tenantId` is set by `middleware/tenant.ts` from the session and by nothing
 * else — it is never read from a request body, query string or header
 * (CLAUDE.md rule 1). Route handlers and domain functions take it from here.
 */
export type AppVariables = {
  user: CurrentUser
  sessionId: string
  tenantId: string
}

export type AppEnv = { Variables: AppVariables }
