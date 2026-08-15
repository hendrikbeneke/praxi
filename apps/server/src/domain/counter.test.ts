import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { numberRange } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant } from '../test/fixtures.js'
import { MissingNumberRangeError, nextNumber } from './counter.js'

let tenantId: string

beforeEach(async () => {
  tenantId = await createTenant(db())
})

function take(code: string): Promise<number> {
  return db().transaction((tx) => nextNumber(tx, tenantId, code))
}

async function rangeValue(code: string): Promise<number | undefined> {
  const [row] = await db()
    .select({ nextValue: numberRange.nextValue })
    .from(numberRange)
    .where(and(eq(numberRange.tenantId, tenantId), eq(numberRange.code, code)))

  return row?.nextValue
}

describe('nextNumber', () => {
  it('creates a whitelisted range on demand, starting at 1', async () => {
    expect(await take('contact')).toBe(1)
    expect(await take('contact')).toBe(2)
    expect(await rangeValue('contact')).toBe(3)
  })

  it('continues from a range that was set by hand', async () => {
    await db()
      .insert(numberRange)
      .values({ id: newId(), tenantId, code: 'invoice', nextValue: 2026_001 })

    expect(await take('invoice')).toBe(2026_001)
    expect(await take('invoice')).toBe(2026_002)
  })

  /**
   * The whole point of the whitelist: starting an invoice range at 1 by
   * accident would issue numbers that already exist in the previous system.
   */
  it('refuses a code that is not whitelisted and creates nothing', async () => {
    await expect(take('invoice')).rejects.toBeInstanceOf(MissingNumberRangeError)
    expect(await rangeValue('invoice')).toBeUndefined()
  })

  it('names the code in the error', async () => {
    await expect(take('invoice')).rejects.toThrow(/'invoice'/)
  })

  it('keeps ranges of different codes apart', async () => {
    await db()
      .insert(numberRange)
      .values({ id: newId(), tenantId, code: 'invoice', nextValue: 500 })

    expect(await take('contact')).toBe(1)
    expect(await take('invoice')).toBe(500)
    expect(await take('contact')).toBe(2)
  })

  it('keeps ranges of different tenants apart', async () => {
    const otherTenant = await createTenant(db())

    expect(await take('contact')).toBe(1)
    expect(await db().transaction((tx) => nextNumber(tx, otherTenant, 'contact'))).toBe(1)
    expect(await take('contact')).toBe(2)
  })

  /**
   * The reason for `FOR UPDATE`. Without the lock, concurrent callers read the
   * same `next_value` and hand out the same number twice — for invoices that
   * is a unique-violation at best and a duplicated invoice number at worst.
   */
  it('hands out every number exactly once under concurrency', async () => {
    const count = 20
    const numbers = await Promise.all(Array.from({ length: count }, () => take('contact')))

    expect(new Set(numbers).size).toBe(count)
    expect([...numbers].sort((a, b) => a - b)).toEqual(
      Array.from({ length: count }, (_, index) => index + 1),
    )
    expect(await rangeValue('contact')).toBe(count + 1)
  })

  /** A rolled back transaction must not consume a number — that is exactly
   *  what a sequence would get wrong. */
  it('leaves the range untouched when the transaction rolls back', async () => {
    expect(await take('contact')).toBe(1)

    await expect(
      db().transaction(async (tx) => {
        await nextNumber(tx, tenantId, 'contact')
        throw new Error('rolled back on purpose')
      }),
    ).rejects.toThrow('rolled back on purpose')

    expect(await rangeValue('contact')).toBe(2)
    expect(await take('contact')).toBe(2)
  })
})
