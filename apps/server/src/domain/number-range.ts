import type { NumberRange, NumberRangeInput } from '@praxi/shared'
import { and, asc, eq } from 'drizzle-orm'
import type { Database, Transaction } from '../db/client.js'
import { invoice, numberRange } from '../db/schema.js'
import { newId } from '../id.js'

/**
 * Maintaining the number ranges by hand (CLAUDE.md rule 8).
 *
 * This is the **only** place in the codebase where `next_value` may move
 * backwards, and it does so because a human typed it. Nothing in the
 * production path lowers it or hands a number back: a discarded draft never
 * held one, and there is no reset endpoint. Whoever edits the range is
 * responsible for entering something sensible; on assignment the system checks
 * that the resulting number does not already exist and refuses if it does.
 *
 * The yearly reset lives here too — before the first invoice of a new year the
 * practitioner sets the prefix to the new year and `next_value` back to 1.
 * That is why `invoice.number_prefix` is frozen alongside the value and forms
 * part of the unique key: value 1 exists once per year.
 */

const columns = {
  id: numberRange.id,
  code: numberRange.code,
  prefix: numberRange.prefix,
  padding: numberRange.padding,
  nextValue: numberRange.nextValue,
}

export async function listNumberRanges(
  database: Database,
  tenantId: string,
): Promise<NumberRange[]> {
  return database
    .select(columns)
    .from(numberRange)
    .where(eq(numberRange.tenantId, tenantId))
    .orderBy(asc(numberRange.code))
}

/** Creates the range if it does not exist yet — which is how the `invoice`
 *  range comes into being, deliberately by hand and never on demand. */
export async function upsertNumberRange(
  database: Database,
  tenantId: string,
  code: string,
  input: NumberRangeInput,
): Promise<NumberRange> {
  const [row] = await database
    .insert(numberRange)
    .values({ id: newId(), tenantId, code, ...input })
    .onConflictDoUpdate({
      target: [numberRange.tenantId, numberRange.code],
      set: { prefix: input.prefix, padding: input.padding, nextValue: input.nextValue },
    })
    .returning(columns)

  if (!row) throw new Error('upsert returned no row')
  return row
}

/** Raised when the number a range is about to hand out is already on an
 *  invoice — the check rule 8 asks for. */
export class NumberAlreadyIssuedError extends Error {
  readonly number: string

  constructor(issued: string) {
    super(`invoice number ${issued} has already been issued`)
    this.name = 'NumberAlreadyIssuedError'
    this.number = issued
  }
}

export async function assertNumberFree(
  tx: Transaction,
  tenantId: string,
  formatted: string,
): Promise<void> {
  const [existing] = await tx
    .select({ id: invoice.id })
    .from(invoice)
    .where(and(eq(invoice.tenantId, tenantId), eq(invoice.number, formatted)))
    .limit(1)

  if (existing) throw new NumberAlreadyIssuedError(formatted)
}

/** The prefix and padding in force right now, for showing what the next
 *  invoice will be called. */
export async function getNumberRange(
  database: Database,
  tenantId: string,
  code: string,
): Promise<NumberRange | null> {
  const [row] = await database
    .select(columns)
    .from(numberRange)
    .where(and(eq(numberRange.tenantId, tenantId), eq(numberRange.code, code)))
    .limit(1)

  return row ?? null
}
