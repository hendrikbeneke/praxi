import { z } from 'zod'

/**
 * Building blocks shared by the entity schemas.
 *
 * The recurring problem they solve: an empty text input arrives as `''`, but
 * the database column is nullable, and `''` and `null` must not both end up
 * meaning "not filled in". Every optional text field therefore trims and folds
 * the empty string to `null` at the edge, so the domain layer never sees one.
 */

function optionalTextCore(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
}

/** Optional free text: trimmed, `''` folded to `null`. */
export function optionalText(max = 200) {
  return optionalTextCore(max).nullable().default(null)
}

/**
 * The same field for a **patch**: omitting the key must leave the stored
 * value untouched, and `.default(null)` cannot be reused for that — Zod
 * applies a field's default whenever the key is absent, `.optional()`
 * notwithstanding, so `optionalText().partial()` would silently null out
 * every field a patch does not mention. Sending `''` still clears the field;
 * only *omitting the key* is what "leave alone" means here.
 */
export function optionalTextPatch(max = 200) {
  return optionalTextCore(max).nullable().optional()
}

/** Required free text: trimmed, must not be empty. */
export function requiredText(max = 200) {
  return z.string().trim().min(1).max(max)
}
