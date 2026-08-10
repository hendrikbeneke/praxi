/**
 * Reading Postgres errors without letting their text escape.
 *
 * A unique violation quotes the conflicting value in its message — a short
 * code here, a contact's email address elsewhere — so the message itself must
 * never reach the client or the log (CLAUDE.md rule 12). The constraint name
 * is safe, and it is enough to say what went wrong in German.
 */

/** SQLSTATE 23505. */
const UNIQUE_VIOLATION = '23505'

/** SQLSTATE 23P01 — an EXCLUDE constraint. Only `appointment_no_overlap` uses
 *  one, so the name identifies it. */
const EXCLUSION_VIOLATION = '23P01'

type PostgresError = { code?: unknown; constraint_name?: unknown; message?: unknown }

/**
 * Drizzle wraps driver errors in a `DrizzleQueryError` whose message is the
 * failed SQL with its parameters — so the interesting fields sit on `cause`,
 * one or more levels down, and that outer message must never be forwarded.
 */
function driverError(error: unknown): PostgresError | null {
  let current: unknown = error

  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    if (typeof current !== 'object') return null
    if (typeof (current as PostgresError).code === 'string') return current as PostgresError
    current = (current as { cause?: unknown }).cause
  }

  return null
}

/** The name of the violated unique constraint, or `null` if this is a
 *  different error. */
export function uniqueViolationConstraint(error: unknown): string | null {
  const driver = driverError(error)
  if (!driver || driver.code !== UNIQUE_VIOLATION) return null

  return typeof driver.constraint_name === 'string' ? driver.constraint_name : ''
}

/** SQLSTATE 23503. */
const FOREIGN_KEY_VIOLATION = '23503'

/**
 * The name of the violated foreign key, or `null` if this is a different
 * error. Reported both ways round: a row pointing at something that does not
 * exist, and a row that cannot be deleted because something still points at
 * it.
 */
export function foreignKeyViolationConstraint(error: unknown): string | null {
  const driver = driverError(error)
  if (!driver || driver.code !== FOREIGN_KEY_VIOLATION) return null

  return typeof driver.constraint_name === 'string' ? driver.constraint_name : ''
}

/** SQLSTATE 23514. */
const CHECK_VIOLATION = '23514'

/** The name of the violated check constraint, or `null` if this is a different
 *  error. Used by the tests to assert that a named constraint refused rather
 *  than something else about the statement. */
export function checkViolationConstraint(error: unknown): string | null {
  const driver = driverError(error)
  if (!driver || driver.code !== CHECK_VIOLATION) return null

  return typeof driver.constraint_name === 'string' ? driver.constraint_name : ''
}

/** True when two appointments would occupy the same slot — the
 *  `appointment_no_overlap` exclusion constraint from migration 0009. */
export function isOverlapViolation(error: unknown): boolean {
  const driver = driverError(error)
  return driver?.code === EXCLUSION_VIOLATION
}

/** SQLSTATE P0001 — `RAISE EXCEPTION` from PL/pgSQL, which is how the
 *  `protect_locked_note` triggers refuse. */
const RAISE_EXCEPTION = 'P0001'

/**
 * The message a trigger raised, or `null` for anything else.
 *
 * Unlike the messages this module otherwise keeps hidden, these are ours: they
 * come from `RAISE EXCEPTION` in a migration we wrote and carry no row values.
 * Used by the tests to assert that the *database* refused, not the domain code
 * — the wrapper Drizzle throws says only which SQL failed.
 */
export function raisedMessage(error: unknown): string | null {
  const driver = driverError(error)
  if (!driver || driver.code !== RAISE_EXCEPTION) return null

  return typeof driver.message === 'string' ? driver.message : ''
}
