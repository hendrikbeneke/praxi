import { z } from 'zod'

/**
 * What a list that loads as it is scrolled asks for and answers with (L3).
 *
 * **A cursor, not an offset.** Offset paging hands out `limit`/`offset` and
 * trusts that the rows in between have not moved; when they have, the next
 * page starts one row too late and something is silently skipped. A cursor
 * says "everything after this row in this order", so an insertion above it
 * cannot shift what comes next.
 *
 * That only works if the order is total, which is why every paged query sorts
 * by its column **and then by `id`**. Two contacts called "Müller, Anna" have
 * no order of their own; Postgres may return them either way round, and
 * without the tie-break the second page would repeat one of them and drop the
 * other. Nothing sees that today because nothing pages yet — it would have
 * arrived with the first scroll.
 *
 * The cursor is opaque on purpose: base64 of the last row's sort value and its
 * id, so the client hands back what it was given without a stake in the
 * shape.
 */

export const cursorSchema = z.string().min(1).max(512)

/** One page of a list. `total` travels only with the **first** page: it does
 *  not change while scrolling, and counting the whole set again on every
 *  fetch pays for an answer that is already known. */
export type Page<T> = {
  items: T[]
  /** Null when this was the last page. */
  nextCursor: string | null
  total?: number
}

export const sortDirectionSchema = z.enum(['asc', 'desc'])
export type SortDirection = z.infer<typeof sortDirectionSchema>

/** How many rows a page holds. Both lists use it; the client sends nothing. */
export const PAGE_SIZE = 50
