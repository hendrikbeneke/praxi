import { v7 } from 'uuid'

/**
 * Primary keys are UUIDv7, generated here rather than by the database.
 *
 * v7 over v4 because the first 48 bits are a millisecond timestamp: rows land
 * in insert order in the btree, which keeps the index compact and makes
 * "newest first" listings cheap. Postgres 17 has no native `uuidv7()` — that
 * arrives in 18 — and CLAUDE.md puts generation in the application anyway, so
 * an id exists before the insert and can be referenced within the same
 * transaction.
 */
export function newId(): string {
  return v7()
}
