import { z } from 'zod'

/**
 * A preference of the signed-in user, never of the practice — kept out of
 * `practice_settings` on purpose (CLAUDE.md). `theme` is the first one;
 * a display setting like a per-view column list belongs here too, as its
 * own optional key, never as a new column.
 */
export const themeOptions = ['schiefer', 'blau', 'salbei', 'rose', 'nacht'] as const
export const themeSchema = z.enum(themeOptions)
export type Theme = z.infer<typeof themeSchema>

/**
 * One schema for both reading and writing: every key is optional by nature —
 * a preference that was never set is simply absent, not a distinct "unset"
 * value — so a `PATCH` body and a `GET` response have the same shape. Unknown
 * keys are dropped on parse rather than rejected, which is what lets an older
 * client read a `preferences` blob a newer one has already added a key to.
 */
export const userPreferencesSchema = z.object({
  theme: themeSchema.optional(),
})
export type UserPreferences = z.infer<typeof userPreferencesSchema>
