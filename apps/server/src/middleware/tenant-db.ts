import { sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../context.js'
import { type Database, db, type Transaction } from '../db/client.js'
import { messages } from '../messages.js'
import { tenantId } from './tenant.js'

/**
 * Opens the request's transaction and tells the database which tenant it is
 * for. Every route handler works on the handle this puts on the context.
 *
 * **`SET LOCAL`, and therefore a transaction, and this is the point of the
 * whole file.** A connection is reused, so a plain `SET` outlives the request
 * that made it and the next one helps itself to the wrong tenant. That is not a
 * theory — with `max: 1`, which is what a warm pool amounts to:
 *
 *     SET       in a transaction, tenant A -> 2 rows
 *               next request, nothing set  -> 2 rows      (the leak)
 *     SET LOCAL in a transaction, tenant A -> 2 rows
 *               next request, nothing set  -> 0 rows
 *               after a ROLLBACK           -> 0 rows
 *
 * `SET LOCAL` is undone by Postgres when the transaction ends, however it ends.
 * The alternative — reserving a connection and resetting it in a `finally` —
 * has the same effect while it works, and depends on a block someone has to
 * write correctly every time. Here a leak is not unlikely; it is unreachable.
 *
 * **Why here and not in `withTenant`.** That middleware is a checkpoint: it
 * says a tenant is present. It holds no database handle, so setting the
 * variable there would set it on *some* connection while the route then pulled
 * a different one out of the pool. The tenant has to be set where the handle is
 * made, so that "handle" and "tenant is set" are one thing rather than two that
 * must agree.
 *
 * **The cost, stated rather than hidden.** The transaction is held for the
 * whole request, which includes the handful of routes that call Google or an
 * SMTP server while it is open. `idle_in_transaction_session_timeout` bounds
 * it, and the tidier shape — read, commit, then talk to the network — is noted
 * in WORKPLAN.md for those seven routes. One practitioner and ten connections
 * is not where that becomes a correctness problem.
 */
export const withTenantDatabase = createMiddleware<AppEnv>(async (c, next) => {
  const tenant = tenantId(c)

  await db().transaction(async (tx) => {
    // `set_config(..., is_local => true)` rather than `SET LOCAL`, because the
    // value is a bind parameter this way. `SET LOCAL` takes a literal, which
    // would mean interpolating an id into SQL — it comes from the session and
    // not from the request, but a query that cannot be injected into beats one
    // that merely is not.
    await tx.execute(sql`select set_config('app.tenant_id', ${tenant}, true)`)

    c.set('db', tx)
    await next()
  })
})

/**
 * The one way a route handler gets at the database.
 *
 * Not `db()`: that is the bare pool, with no tenant set on it. Under row-level
 * security a query on it answers with zero rows rather than with someone
 * else's — the failure is visible, which is the whole reason for the policies —
 * but it is still a failure, and this is how not to write one.
 */
export function database(c: Context<AppEnv>): Database {
  const handle = c.get('db')
  if (!handle) throw new HTTPException(401, { message: messages.auth.notSignedIn })
  return handle
}

/**
 * The same transaction, for the two callers that legitimately have a tenant but
 * no request behind them: the Google OAuth callback, which is public and
 * carries its tenant in the single-use `state` it issued, and the sync worker,
 * which runs on a timer.
 *
 * They cannot use `database(c)` — there is no context — and they must not use
 * the bare pool either: under row-level security a query on it sees nothing.
 * This is the one shape both of them share, so it is written once.
 */
export async function asTenant<T>(
  tenant: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenant}, true)`)
    return work(tx)
  })
}
