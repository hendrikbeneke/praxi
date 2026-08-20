import { z } from 'zod'
import { requiredText } from './field.js'

/**
 * The three value lists behind a contact's own fields (D-R3): how it is
 * addressed, its gender, and the country of its address.
 *
 * Each is its own table, the way every catalogue in this schema is — but a
 * salutation and a gender are literally the same thing, *a label with an
 * order*, so they share one schema rather than two identical copies of it.
 * `country` is different and has its own below: it carries no label, because
 * a country's name is not maintained here.
 *
 * All three follow `contact_role_type` after migration 0035: no code as an
 * anchor, so a label stays renamable and every contact follows; no `active`
 * flag, because an assignment is one nullable column at the contact that can
 * always be cleared, so there is no dead end for a flag to manage.
 *
 * **A second language would be additive**: a `labelEn` beside `label`,
 * maintained by the practitioner, with the uniqueness staying on `label`. No
 * codes, no translation table, and nothing built here in advance for it.
 * Countries need none of that — `Intl.DisplayNames` has every language.
 */

const entryFields = {
  /** What an entry is recognised by, now that there is no code. Unique per
   *  tenant, so a list cannot grow two indistinguishable rows. */
  label: requiredText(60),
  sortOrder: z.number().int().min(0).max(9999).default(0),
}

export const valueListEntryInputSchema = z.object(entryFields)
export type ValueListEntryInput = z.infer<typeof valueListEntryInputSchema>

export const valueListEntrySchema = z.object({
  id: z.uuid(),
  label: z.string(),
  sortOrder: z.number().int(),
})

export type ValueListEntry = z.infer<typeof valueListEntrySchema>

/**
 * One country the contact form offers.
 *
 * The ISO code is the whole of it. Choosing a country here is picking from the
 * standard list in `country.ts`, not describing one — which is why there is no
 * label to send and no way to rename an entry. `countryName()` resolves the
 * name wherever one is shown.
 */
export const countryEntryInputSchema = z.object({
  isoCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  sortOrder: z.number().int().min(0).max(9999).default(0),
})

export type CountryEntryInput = z.infer<typeof countryEntryInputSchema>

export const countryEntrySchema = z.object({
  id: z.uuid(),
  isoCode: z.string(),
  sortOrder: z.number().int(),
})

export type CountryEntry = z.infer<typeof countryEntrySchema>
