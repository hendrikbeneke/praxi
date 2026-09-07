import type { CurrentUser } from '@praxi/shared'
import type { Transaction } from './db/client.js'

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
  /**
   * The request's own database handle — a transaction with `app.tenant_id` set
   * on it, opened by `middleware/tenant-db.ts`. Route handlers reach it through
   * `database(c)` and never through `db()`, so the tenant and the connection
   * carrying it cannot come apart.
   */
  db: Transaction
}

export type AppEnv = { Variables: AppVariables }
