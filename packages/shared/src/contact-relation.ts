import { z } from 'zod'
import type { ContactRelationType } from './contact-relation-type.js'

/**
 * A relation between two contacts, always stored as a single row. Both records
 * show it — the one holding the `from` end sees the forward label, the other
 * the inverse one. See `contact-relation-type.ts` for how the direction is
 * chosen.
 */

/** Which end of the stored row a contact is on: `forward` means it is the
 *  `from` contact. */
export const relationDirections = ['forward', 'inverse'] as const
export const relationDirectionSchema = z.enum(relationDirections)
export type RelationDirection = z.infer<typeof relationDirectionSchema>

/**
 * Adding *or* changing a relation from one contact's record. `direction` says
 * which end that contact takes, so both sides of a directed type can be
 * entered from either record and produce the same row with the ends swapped.
 *
 * One schema for both, because a change is not a patch: the type and the
 * counterpart together *are* the relation, and altering either one rewrites
 * the row. `updateRelation` therefore takes the same complete statement an add
 * does, and the client sends whatever the row now says.
 *
 * **Deliberately absent since L5: `replace`.** It existed for "Ersetzen" on an
 * exclusive type — take the place of the row the exclusivity index would
 * collide with, in one transaction, so swapping the billing recipient could
 * not leave the contact without one. With a relation editable in place that
 * swap *is* an edit of that row, and `updateRelation` gives it the same
 * single-transaction guarantee. Two ways to say one thing is one too many.
 */
export const contactRelationInputSchema = z.object({
  relationTypeId: z.uuid(),
  direction: relationDirectionSchema,
  otherContactId: z.uuid(),
  since: z.iso.date().nullable().default(null),
})

export type ContactRelationInput = z.infer<typeof contactRelationInputSchema>

/**
 * A relation as seen from one contact's record.
 *
 * `exclusive` is deliberately absent: whether a type allows a second relation
 * is a property of the type, and the mirrored column on the row exists only so
 * the partial unique index can be written. Reading it here would invite code
 * that trusts a copy instead of the original.
 */
export const contactRelationSchema = z.object({
  id: z.uuid(),
  relationTypeId: z.uuid(),
  direction: relationDirectionSchema,
  otherContactId: z.uuid(),
  otherContactName: z.string(),
  otherContactNumber: z.number().int(),
  otherContactArchived: z.boolean(),
  since: z.string().nullable(),
})

export type ContactRelation = z.infer<typeof contactRelationSchema>

type LabelledType = Pick<ContactRelationType, 'labelForward' | 'labelInverse' | 'isSymmetric'>

/** What the record on this end of the relation calls the contact on the other
 *  end. A symmetric type reads the same from both sides. */
export function relationLabel(type: LabelledType, direction: RelationDirection): string {
  if (type.isSymmetric || direction === 'forward') return type.labelForward
  return type.labelInverse ?? type.labelForward
}

export type RelationOption = {
  id: string
  direction: RelationDirection
  label: string
}

/**
 * The choices offered when adding a relation: every directed type twice, once
 * per side with its own label, and a symmetric type once. Picking the inverse
 * side is what stores the row with the ends swapped.
 *
 * The order of `types` is kept — the caller passes them sorted.
 */
export function relationOptions(types: (LabelledType & { id: string })[]): RelationOption[] {
  return types.flatMap((type) => {
    const forward: RelationOption = {
      id: type.id,
      direction: 'forward',
      label: relationLabel(type, 'forward'),
    }
    if (type.isSymmetric) return [forward]

    return [forward, { id: type.id, direction: 'inverse', label: relationLabel(type, 'inverse') }]
  })
}
