import { z } from 'zod'
import { requiredText } from './field.js'

/**
 * The catalogue of note types — Sitzung, Allgemein, Dokument and whatever else
 * the practice files its documentation under (L1).
 *
 * `note.type` was a check constraint over six fixed values until migration
 * 0038, and the set was never the software's to decide: how a practice sorts
 * its documentation is its own business. So it became a catalogue, built like
 * `contact_role_type` after 0035 and the three lists of 0037 — no `code` as an
 * anchor, so a label stays renamable and every note follows, and no `active`
 * flag, because the assignment is one column at the note and there is no dead
 * end for a flag to manage.
 *
 * **`addendum` is not among the entries, and that is the one change of
 * substance.** Whether a note is an addendum is decided by `correctsNoteId`,
 * not by its type: as a catalogue entry "Nachtrag" would have been selectable,
 * and a note carrying it without a note it corrects would have been refused by
 * a constraint the screen could not explain. An addendum has a type of its
 * own now, because an addendum to a session note is itself session
 * documentation.
 *
 * Field for field identical to `contactRoleTypeInputSchema`, and deliberately
 * not shared with it: one schema would bind the two catalogues together the
 * moment either grows a field.
 */

const noteTypeFields = {
  /** What a type is recognised by — there is no code. Unique per tenant, so
   *  the filter row cannot grow two indistinguishable chips. */
  label: requiredText(60),
  /**
   * The note list offers this type as a filter chip of its own. The flag alone
   * decides it: a chip appears even where the count is zero, because at a
   * filter a zero is an answer, and which types are worth a chip is the
   * practitioner's call rather than a consequence of what a contact happens to
   * have.
   */
  showAsTab: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(0),
}

export const noteTypeInputSchema = z.object(noteTypeFields)
export type NoteTypeInput = z.infer<typeof noteTypeInputSchema>

export const noteTypeSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  showAsTab: z.boolean(),
  sortOrder: z.number().int(),
})

export type NoteType = z.infer<typeof noteTypeSchema>
