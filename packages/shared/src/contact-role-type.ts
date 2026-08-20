import { z } from 'zod'
import { requiredText } from './field.js'

/**
 * The catalogue of roles a contact can hold — patient, prospect, participant
 * and whatever else the practice needs (CLAUDE.md rule 4).
 *
 * A role is a *property* of one contact. Anything that only means something
 * with a counterpart — a guardian, a billing recipient — is a relation and
 * lives in `contact-relation-type.ts`.
 *
 * **And it is a label, nothing more.** There is no `code` here, no `isSystem`
 * and no `active` (migration 0035): all three existed so logic could depend on
 * a particular role, and nothing ever did. What decides who is pseudonymized
 * towards Google is a switch on the Google connection, not a role. So every
 * entry is alike — creatable, renamable, deletable as long as no contact holds
 * it — and the assignment points at the id.
 *
 * The relation catalogue kept all three on purpose; there the codes really do
 * carry logic.
 */

const roleTypeFields = {
  /** What a role is recognised by, now that there is no code. Unique per
   *  tenant, so the contact list cannot grow two identical tabs. */
  label: requiredText(60),
  /**
   * The contact list offers this role as a tab of its own. Roles without the
   * flag stay filterable through the "further roles" dropdown next to it —
   * the flag decides prominence, not availability.
   */
  showAsTab: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(0),
}

/** Creating and editing take the same fields — there is nothing that may only
 *  be set once anymore. */
export const contactRoleTypeInputSchema = z.object(roleTypeFields)
export type ContactRoleTypeInput = z.infer<typeof contactRoleTypeInputSchema>

export const contactRoleTypeSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  showAsTab: z.boolean(),
  sortOrder: z.number().int(),
})

export type ContactRoleType = z.infer<typeof contactRoleTypeSchema>
