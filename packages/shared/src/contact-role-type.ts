import { z } from 'zod'
import { requiredText } from './field.js'

/**
 * The catalogue of roles a contact can hold — patient, prospect, participant
 * and whatever else the practice needs (CLAUDE.md rule 4).
 *
 * A role is a *property* of one contact. Anything that only means something
 * with a counterpart — a guardian, a billing recipient — is a relation and
 * lives in `contact-relation-type.ts`.
 */

/**
 * The stable handle of a type. Logic may hang on it, so it is set when the
 * entry is created and never changes afterwards — not for system entries,
 * where a trigger enforces it, and not for the practice's own, where the
 * domain refuses. A typo is fixed by deleting the unused entry and adding it
 * again.
 */
export const typeCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,39}$/)

const roleTypeFields = {
  label: requiredText(60),
  /**
   * The contact list offers this role as a tab of its own. Roles without the
   * flag stay filterable through the "further roles" dropdown next to it —
   * the flag decides prominence, not availability.
   */
  showAsTab: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
}

/** What an edit may change. `code` is absent on purpose, `isSystem` too — the
 *  latter is set by the seed and by nothing else. */
export const contactRoleTypeInputSchema = z.object(roleTypeFields)
export type ContactRoleTypeInput = z.infer<typeof contactRoleTypeInputSchema>

export const contactRoleTypeCreateSchema = z.object({ code: typeCodeSchema, ...roleTypeFields })
export type ContactRoleTypeCreate = z.infer<typeof contactRoleTypeCreateSchema>

export const contactRoleTypeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  label: z.string(),
  /** Not deletable, `code` not changeable — logic is allowed to depend on it.
   *  The label stays editable. */
  isSystem: z.boolean(),
  showAsTab: z.boolean(),
  sortOrder: z.number().int(),
  active: z.boolean(),
})

export type ContactRoleType = z.infer<typeof contactRoleTypeSchema>
