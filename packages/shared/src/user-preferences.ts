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

/** Where to land after signing in. English identifiers, unlike `themeOptions`
 *  above — that one predates this rule being applied consistently; left as
 *  it is for now, see WORKPLAN.md "Before going live". */
export const startPageOptions = ['overview', 'contacts', 'calendar', 'activities'] as const
export const startPageSchema = z.enum(startPageOptions)
export type StartPage = z.infer<typeof startPageSchema>

/**
 * One schema for both reading and writing: every key is optional by nature —
 * a preference that was never set is simply absent, not a distinct "unset"
 * value — so a `PATCH` body and a `GET` response have the same shape. Unknown
 * keys are dropped on parse rather than rejected, which is what lets an older
 * client read a `preferences` blob a newer one has already added a key to.
 *
 * **Every preference is its own flat, top-level key — never nested.**
 * `updateUserPreferences` (`apps/server/src/domain/user-preferences.ts`)
 * merges a save with Postgres's `jsonb || jsonb`, and that merge is shallow:
 * it replaces a key wholesale rather than merging into it. A key like
 * `columns: { contacts: [...], invoices: [...] }` would lose the invoice
 * columns the instant the contact list saves its own — silently, and not
 * noticed until both lists have been customized. `contactListColumns` and
 * `invoiceListColumns` as two separate top-level keys cannot make that
 * mistake; neither can ever overwrite the other.
 */
export const userPreferencesSchema = z.object({
  theme: themeSchema.optional(),
  startPage: startPageSchema.optional(),
  sidebarCollapsed: z.boolean().optional(),
})
export type UserPreferences = z.infer<typeof userPreferencesSchema>
