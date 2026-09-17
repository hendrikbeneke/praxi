import { v7 } from 'uuid'

/**
 * Primary keys are UUIDv7, generated here rather than by the database.
 *
 * v7 over v4 because the first 48 bits are a millisecond timestamp: rows land
 * in insert order in the btree, which keeps the index compact and makes
 * "newest first" listings cheap.
 *
 * **Postgres 18 has a native `uuidv7()` and this still does not use it.** The
 * reason was never that the database could not: CLAUDE.md puts generation in
 * the application so that an id exists *before* the insert — `createTenant`
 * needs it to set `app.tenant_id` to the tenant it is about to create, and a
 * parent id has to be referenceable within the same transaction. A default on
 * the column would hand the id back only afterwards.
 */
export function newId(): string {
  return v7()
}
