import type { AnyColumn, SQL } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

/**
 * Paging by keyset — "everything after this row in this order" (L3).
 *
 * ## Why not an offset
 *
 * `limit`/`offset` trusts that nothing above the window has moved. When a row
 * is inserted or removed in between, the next page starts one row too late and
 * something is skipped without a trace. A cursor names the last row instead,
 * so what comes after it is the same whatever happened above.
 *
 * ## Why the id is always the second key
 *
 * A keyset only works over a **total** order, and none of the columns sorted
 * on here is unique. Two contacts called "Müller, Anna" have no order of their
 * own; Postgres may return them either way round between two queries, so
 * "after Müller, Anna" would be an ambiguous instruction — the second page
 * would repeat one of them and drop the other. Sorting by the column *and then
 * by the id* makes the position of every row unambiguous.
 *
 * That tie-break is missing from every list query written before this module,
 * and nothing noticed, because nothing paged.
 *
 * ## Nulls
 *
 * Last, in **both** directions. A contact without a city has no place on a
 * scale of cities, and having it jump to the top when the arrow is clicked
 * would be worse than useless. Postgres puts nulls first on `desc` by default,
 * so both orders name it explicitly, and the predicate below mirrors it.
 *
 * Deliberately absent: the moment of asking. An earlier draft of this module
 * carried a frozen `now` in the cursor, because the contact list was to be
 * sorted by nearness to it and that ordering drifts while one scrolls. That
 * sort is gone; every order here is over stored values, which do not move
 * under the cursor.
 */

/** A cursor this server did not write. The route answers 400: a client
 *  sending a broken cursor is asking for a page nobody can hand it, and
 *  silently starting from the top would look like a list that jumps. */
export class InvalidCursorError extends Error {
  constructor() {
    super('cursor is not readable')
    this.name = 'InvalidCursorError'
  }
}

/**
 * What a list sorts by: usually a column, sometimes an expression over one.
 * `contact.kind` is the case that needed it — a `pgEnum` sorts by the order
 * its values were *declared*, not by the alphabet, so it is compared as text.
 */
export type SortExpression = AnyColumn | SQL

const cursorPayloadSchema = z.object({
  /** The sort column's value on the last row of the previous page. */
  k: z.union([z.string(), z.number(), z.null()]),
  /** Its id — the second key, and what makes the position unambiguous. */
  i: z.uuid(),
})

export type Cursor = z.infer<typeof cursorPayloadSchema>

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

/** Null for anything that is not a cursor this server wrote. The caller turns
 *  that into a 400 rather than silently starting from the top: a client that
 *  sends a broken cursor is asking for a page it will not get. */
export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = cursorPayloadSchema.safeParse(
      JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')),
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * "Strictly after this row", in the given direction, with nulls last.
 *
 * Written as three cases rather than a row comparison — `(col, id) > (k, i)`
 * is shorter but yields NULL as soon as either side holds one, which would
 * quietly drop every row without a value.
 */
export function afterCursor(
  column: SortExpression,
  id: AnyColumn,
  direction: 'asc' | 'desc',
  cursor: Cursor,
): SQL {
  // The previous page ended inside the null group, which sits at the end. Only
  // further nulls can follow, ordered by id.
  if (cursor.k === null) return sql`${column} is null and ${id} > ${cursor.i}`

  const beyond = direction === 'asc' ? sql`${column} > ${cursor.k}` : sql`${column} < ${cursor.k}`
  // ...or the same value and a later id, or a null, which comes after all of
  // them whichever way the arrow points.
  return sql`(${beyond} or (${column} = ${cursor.k} and ${id} > ${cursor.i}) or ${column} is null)`
}

/** The matching `ORDER BY`. It has to mirror `afterCursor` exactly — an order
 *  and a predicate that disagree page past each other. */
export function cursorOrder(
  column: SortExpression,
  id: AnyColumn,
  direction: 'asc' | 'desc',
): SQL[] {
  return [
    direction === 'asc' ? sql`${column} asc nulls last` : sql`${column} desc nulls last`,
    sql`${id} asc`,
  ]
}

/**
 * Splits `limit + 1` fetched rows into the page and the cursor for the next
 * one.
 *
 * The extra row is how "is there more" is answered without a second count:
 * either it is there, and the page is full with something behind it, or it is
 * not, and this was the last page.
 */
export function takePage<T>(
  rows: T[],
  limit: number,
  keyOf: (row: T) => Cursor,
): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: rows, nextCursor: null }

  const items = rows.slice(0, limit)
  const last = items.at(-1)
  return { items, nextCursor: last ? encodeCursor(keyOf(last)) : null }
}
