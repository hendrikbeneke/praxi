import { and, eq } from 'drizzle-orm'
import type { Transaction } from '../db/client.js'
import { numberRange } from '../db/schema.js'
import { newId } from '../id.js'

/**
 * Sequential numbers from `number_range`, handed out one at a time.
 *
 * Never a Postgres sequence: a sequence keeps counting when a transaction
 * rolls back, and for invoice numbers a gap is a problem you get to explain to
 * a tax auditor (CLAUDE.md rule 8). A row locked with `SELECT … FOR UPDATE`
 * inside the caller's transaction gives out the number and the row it belongs
 * to together, or neither.
 *
 * Which is why this takes a `Transaction` and not a `Database`: the number is
 * only reserved for as long as that transaction runs, and it has to be
 * committed together with whatever uses it.
 */

/**
 * Codes for which a missing `number_range` row may be created on demand,
 * starting at 1.
 *
 * Deliberately a whitelist, not a default. A contact number is a running count
 * with no meaning beyond identity, so starting at 1 is harmless. An invoice
 * number is not: that range is configured on purpose and may continue a
 * numbering that began in the previous system. Silently starting at 1 there
 * would issue invoices under numbers that already exist — so for any code not
 * listed here, a missing row is an error and never an assumption.
 */
const SELF_CREATING_CODES: ReadonlySet<string> = new Set(['contact'])

export class MissingNumberRangeError extends Error {
  readonly code: string

  constructor(code: string) {
    super(
      `No number range configured for '${code}'. It has to be set up explicitly, ` +
        'because starting it automatically could reuse numbers that were already issued.',
    )
    this.name = 'MissingNumberRangeError'
    this.code = code
  }
}

async function lockRange(tx: Transaction, tenantId: string, code: string) {
  const [row] = await tx
    .select({ id: numberRange.id, nextValue: numberRange.nextValue })
    .from(numberRange)
    .where(and(eq(numberRange.tenantId, tenantId), eq(numberRange.code, code)))
    .for('update')
    .limit(1)

  return row
}

/**
 * Reserves and returns the next number for `code`, advancing the range.
 *
 * Must be called inside a transaction, together with the insert that uses the
 * number. The `FOR UPDATE` lock is held until that transaction ends, so
 * concurrent callers queue up and no two ever see the same value.
 *
 * The counter only ever moves forward. No code path in the production flow
 * lowers `next_value` or hands a number back — not when a draft is discarded
 * (a draft never held one), and there is no reset endpoint of any kind. The
 * single exception is the manual maintenance in the settings, which is what
 * `domain/number-range.ts` exists for and where a human is answerable for the
 * value. A rollback of *this* transaction does return the number, and that is
 * the point: the number and the row it belongs to are committed together or
 * not at all.
 */
export async function nextNumber(tx: Transaction, tenantId: string, code: string): Promise<number> {
  let row = await lockRange(tx, tenantId, code)

  if (!row) {
    if (!SELF_CREATING_CODES.has(code)) throw new MissingNumberRangeError(code)

    // A concurrent transaction may be creating the same row; `do nothing`
    // waits for it to commit and then leaves it alone. Either way the row
    // exists afterwards and the second read takes the lock on it.
    await tx
      .insert(numberRange)
      .values({ id: newId(), tenantId, code, nextValue: 1 })
      .onConflictDoNothing({ target: [numberRange.tenantId, numberRange.code] })

    row = await lockRange(tx, tenantId, code)
    if (!row) throw new MissingNumberRangeError(code)
  }

  await tx
    .update(numberRange)
    .set({ nextValue: row.nextValue + 1 })
    .where(eq(numberRange.id, row.id))

  return row.nextValue
}
