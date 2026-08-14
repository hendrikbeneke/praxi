import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DbReader, Transaction } from '../db/client.js'
import { db } from '../db/client.js'
import { service } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant } from '../test/fixtures.js'
import { MoveTargetNotFoundError, moveInList } from './reorder.js'

let tenantId: string

beforeEach(async () => {
  tenantId = await createTenant(db())
})

/**
 * `service` is the vehicle for these tests — any table with `id`, `tenant_id`
 * and `sort_order` would do, and this is the plainest one. The `ops` below
 * talk to the real table directly, deliberately bypassing `domain/service.ts`,
 * so this file tests `moveInList` on its own rather than one catalogue's
 * wiring of it.
 */
const ops = {
  list: (reader: DbReader, tid: string) =>
    reader
      .select({ id: service.id, sortOrder: service.sortOrder })
      .from(service)
      .where(eq(service.tenantId, tid))
      .orderBy(asc(service.sortOrder), asc(service.description)),
  setSortOrder: async (tx: Transaction, id: string, sortOrder: number): Promise<void> => {
    await tx.update(service).set({ sortOrder }).where(eq(service.id, id))
  },
}

/** Seeds one row per key of `rows`, and returns the same keys mapped to the
 *  row each got — a named record rather than a positional array, so callers
 *  never index into a possibly-missing slot. */
async function seed<Name extends string>(
  rows: Record<Name, number>,
): Promise<Record<Name, string>> {
  const names = Object.keys(rows) as Name[]
  const ids = Object.fromEntries(names.map((name) => [name, newId()])) as Record<Name, string>

  await db()
    .insert(service)
    .values(
      names.map((name) => ({
        id: ids[name],
        tenantId,
        description: name,
        defaultPriceCents: 0,
        sortOrder: rows[name],
      })),
    )

  return ids
}

async function sortOrders(): Promise<Map<string, number>> {
  const rows = await db()
    .select({ id: service.id, sortOrder: service.sortOrder })
    .from(service)
    .where(eq(service.tenantId, tenantId))
  return new Map(rows.map((row) => [row.id, row.sortOrder]))
}

describe('moveInList', () => {
  it('swaps with the next row on delta 1', async () => {
    const { a, b, c } = await seed({ a: 0, b: 1, c: 2 })

    expect(await moveInList(db(), tenantId, a, 1, ops)).toBe(true)

    const after = await sortOrders()
    expect(after.get(b)).toBe(0)
    expect(after.get(a)).toBe(1)
    expect(after.get(c)).toBe(2)
  })

  it('swaps with the previous row on delta -1', async () => {
    const { a, b } = await seed({ a: 0, b: 1 })

    expect(await moveInList(db(), tenantId, b, -1, ops)).toBe(true)

    const after = await sortOrders()
    expect(after.get(b)).toBe(0)
    expect(after.get(a)).toBe(1)
  })

  it('refuses to move the first row up or the last row down', async () => {
    const { a, c } = await seed({ a: 0, b: 1, c: 2 })

    expect(await moveInList(db(), tenantId, a, -1, ops)).toBe(false)
    expect(await moveInList(db(), tenantId, c, 1, ops)).toBe(false)

    // Nothing was touched — not even renumbered.
    const after = await sortOrders()
    expect(after.get(a)).toBe(0)
    expect(after.get(c)).toBe(2)
  })

  it('throws for an id that does not exist in this tenant', async () => {
    await seed({ a: 0 })
    await expect(moveInList(db(), tenantId, newId(), 1, ops)).rejects.toThrow(
      MoveTargetNotFoundError,
    )
  })

  it('does not reach into another tenant, and throws the same as an unknown id', async () => {
    const { a } = await seed({ a: 0, b: 1 })
    const otherTenant = await createTenant(db(), 'Mandant B')

    await expect(moveInList(db(), otherTenant, a, 1, ops)).rejects.toThrow(MoveTargetNotFoundError)
  })

  /** Whatever a manual edit once left behind — gaps, an out-of-order value —
   *  a move renumbers the whole list gaplessly from 0, not just the pair that
   *  swapped. */
  it('closes gaps in the whole list on every move, not only the swapped pair', async () => {
    const { a, b, c } = await seed({ a: 5, b: 40, c: 41 })

    expect(await moveInList(db(), tenantId, c, -1, ops)).toBe(true)

    const after = await sortOrders()
    expect(after.get(a)).toBe(0)
    expect(after.get(c)).toBe(1)
    expect(after.get(b)).toBe(2)
  })
})
