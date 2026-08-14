import type { Database, DbReader, Transaction } from '../db/client.js'

/**
 * The reordering every catalogue with a `sort_order` column needs — roles,
 * relation types, activity types, services, service groups, text templates,
 * email templates (CLAUDE.md D2). One implementation rather than each
 * catalogue's own copy of "swap two rows' `sort_order`", which is what the
 * settings screens did before this — three copies already, in
 * `contact-type-settings.tsx` (twice) and `activity-type-settings.tsx`, none
 * of them atomic: two separate `PUT` requests, so a request that fails
 * between them leaves the list in neither order.
 *
 * Generic over the table via two small callbacks rather than the Drizzle
 * table object itself — a function parameterized on an arbitrary `PgTable`
 * fights Drizzle's column typing for no benefit here, since every catalogue
 * already has its own `list`/column shape. Each catalogue's domain module
 * supplies `list` (ordered exactly as its own listing query orders, so a move
 * lines up with what is on screen) and `setSortOrder`; `moveInList` owns the
 * transaction and the renumbering.
 *
 * Moving further renumbers the *whole* list gaplessly from 0, not just the
 * two swapped rows. A plain swap would leave the two rows correct relative to
 * each other but the values themselves free to drift — gaps, duplicates,
 * whatever a manual `UPDATE` once left behind. Renumbering on every move
 * means `sort_order` is always exactly the display position, an invariant
 * simple enough to trust when inspecting the table by hand.
 *
 * An id this tenant does not have and a boundary already at the end of the
 * list are not the same outcome, even though a disabled arrow button means
 * neither should normally happen: an unknown id is a genuine error — a typo
 * in the id would otherwise pass silently — and throws `MoveTargetNotFoundError`
 * so the route can answer 404. A boundary is not an error at all, the row
 * exists and the move is legitimately a no-op, so it returns `false` and the
 * route answers 204 either way (see the callers in `routes/`).
 */

export type SortableRow = { id: string; sortOrder: number }

export class MoveTargetNotFoundError extends Error {
  constructor(id: string) {
    super(`move target not found: ${id}`)
  }
}

export async function moveInList(
  database: Database,
  tenantId: string,
  id: string,
  delta: 1 | -1,
  ops: {
    list: (reader: DbReader, tenantId: string) => Promise<SortableRow[]>
    setSortOrder: (tx: Transaction, id: string, sortOrder: number) => Promise<void>
  },
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const rows = await ops.list(tx, tenantId)
    const index = rows.findIndex((row) => row.id === id)
    if (index < 0) throw new MoveTargetNotFoundError(id)

    const target = index + delta
    if (target < 0 || target >= rows.length) return false

    const reordered = [...rows]
    const [moved] = reordered.splice(index, 1)
    if (!moved) return false
    reordered.splice(target, 0, moved)

    await Promise.all(
      reordered
        .map((row, position) => ({ row, position }))
        .filter(({ row, position }) => row.sortOrder !== position)
        .map(({ row, position }) => ops.setSortOrder(tx, row.id, position)),
    )

    return true
  })
}
