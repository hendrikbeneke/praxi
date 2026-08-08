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

type PostgresError = { code?: unknown; constraint_name?: unknown }

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
