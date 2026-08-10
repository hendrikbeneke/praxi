import { z } from 'zod'
import { typeCodeSchema } from './contact-role-type.js'
import { optionalText, requiredText } from './field.js'

/**
 * The catalogue of relations between two contacts (CLAUDE.md rule 4).
 *
 * ## Direction
 *
 * `from` is the contact in whose record the fact is a property *of that
 * contact*; `to` is the counterpart. So a patient is the `from` of
 * `billing_recipient` (this patient has a billing recipient) and a child is
 * the `from` of `guardian` (this child has a guardian).
 *
 * The convention is not cosmetic: `is_exclusive` is enforced per
 * `from_contact_id`, so with it exclusivity always reads as "this contact has
 * at most one X". Without it the direction would decide what the flag means,
 * and the third exclusive type would get it wrong.
 *
 * `parent_of` is the deliberate exception: with kinship there is no side for
 * which the fact is more of a property, and "Elternteil von / Kind von" is the
 * more common reading direction.
 *
 * ## Labels
 *
 * `labelForward` is what the record of the `from` contact says about the `to`
 * contact, `labelInverse` the other way round. A symmetric type has no inverse
 * label and uses the forward one on both sides; the
 * `contact_relation_type_inverse_label` check constraint holds that.
 */

const relationTypeFields = {
  labelForward: requiredText(60),
  labelInverse: optionalText(60),
  /** Stored as one row regardless — two rows for one fact could drift apart.
   *  The domain normalizes the direction so the reverse duplicate collides. */
  isSymmetric: z.boolean().default(false),
  /** At most one relation of this type per `from` contact. */
  isExclusive: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
}

type SymmetryFields = { labelInverse: string | null; isSymmetric: boolean }

/** An inverse label is required exactly when the type is not symmetric. */
const symmetryRule = {
  check: (input: SymmetryFields) => (input.labelInverse !== null) === !input.isSymmetric,
  options: {
    message: 'labelInverse is required unless the type is symmetric',
    path: ['labelInverse'] as PropertyKey[],
  },
}

export const contactRelationTypeInputSchema = z
  .object(relationTypeFields)
  .refine(symmetryRule.check, symmetryRule.options)

export type ContactRelationTypeInput = z.infer<typeof contactRelationTypeInputSchema>

export const contactRelationTypeCreateSchema = z
  .object({ code: typeCodeSchema, ...relationTypeFields })
  .refine(symmetryRule.check, symmetryRule.options)

export type ContactRelationTypeCreate = z.infer<typeof contactRelationTypeCreateSchema>

export const contactRelationTypeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  labelForward: z.string(),
  labelInverse: z.string().nullable(),
  isSymmetric: z.boolean(),
  isExclusive: z.boolean(),
  isSystem: z.boolean(),
  sortOrder: z.number().int(),
  active: z.boolean(),
})

export type ContactRelationType = z.infer<typeof contactRelationTypeSchema>

/**
 * The system relation types, by code. Logic is allowed to depend on these two
 * and on nothing else in the catalogue: `guardian` is what the reminder about
 * a minor without one looks for, `billing_recipient` is who a later slice will
 * address the invoice to.
 */
export const GUARDIAN_RELATION_CODE = 'guardian'
export const BILLING_RECIPIENT_RELATION_CODE = 'billing_recipient'
