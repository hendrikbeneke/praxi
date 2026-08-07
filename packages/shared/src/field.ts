import { z } from 'zod'

/**
 * Building blocks shared by the entity schemas.
 *
 * The recurring problem they solve: an empty text input arrives as `''`, but
 * the database column is nullable, and `''` and `null` must not both end up
 * meaning "not filled in". Every optional text field therefore trims and folds
 * the empty string to `null` at the edge, so the domain layer never sees one.
 */

/** Optional free text: trimmed, `''` folded to `null`. */
export function optionalText(max = 200) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .default(null)
}

/** Required free text: trimmed, must not be empty. */
export function requiredText(max = 200) {
  return z.string().trim().min(1).max(max)
}
