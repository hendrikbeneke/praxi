import { z } from 'zod'
import { optionalText, requiredText } from './field.js'

/**
 * `kind` is structural: it decides which fields apply and never changes.
 * Stored as a Postgres enum, because the set cannot grow.
 */
export const contactKinds = ['person', 'organization'] as const
export const contactKindSchema = z.enum(contactKinds)
export type ContactKind = z.infer<typeof contactKindSchema>

/**
 * Roles are separate from `kind` and there can be several per contact: a
 * prospect who becomes a patient, someone who is both a patient and a course
 * participant (CLAUDE.md rule 4).
 *
 * The set is configurable — `roleTypeId` points at a `contact_role_type` of
 * the same tenant and is validated by a composite foreign key, not by an enum
 * or a check constraint. It pointed at that type's `code` until migration
 * 0035; a role is a label now and has none. Anything that needs a counterpart
 * to mean something is not a role but a relation; see `contact-relation.ts`.
 */

/** `since` may be unknown — when an old contact is entered afterwards, the
 *  date the role started often cannot be reconstructed. */
export const contactRoleInputSchema = z.object({
  roleTypeId: z.uuid(),
  since: z.iso.date().nullable().default(null),
})

export type ContactRoleInput = z.infer<typeof contactRoleInputSchema>

const rolesField = z
  .array(contactRoleInputSchema)
  .max(50)
  .default([])
  .refine((roles) => new Set(roles.map((entry) => entry.roleTypeId)).size === roles.length, {
    message: 'duplicate role',
  })

/** Fields that apply regardless of `kind`. */
const sharedFields = {
  // A sole trader is a person and can still have a VAT id, so this is not
  // restricted to organizations.
  vatId: optionalText(40),
  street: optionalText(120),
  // Its own field, not part of the street. `formatStreetLine` puts the two
  // back together for the screen and the invoice alike.
  houseNumber: optionalText(20),
  postalCode: optionalText(16),
  city: optionalText(80),
  /**
   * A `country` catalogue entry (D-R3), and genuinely optional with it: the
   * column was `not null default 'DE'`, so "not recorded" and "Germany" were
   * the same value. It is null now when nothing was entered.
   */
  countryId: z.uuid().nullable().default(null),
  /**
   * A `salutation` catalogue entry. It sits in the **shared** fields rather
   * than under `person`: "Firma Mustermann GmbH" is the usual first line of a
   * German address, and there the salutation is what it is for a person — a
   * prefix to the name, not a personal attribute.
   */
  salutationId: z.uuid().nullable().default(null),
  email: z
    .union([z.literal(''), z.email().max(160)])
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .default(null),
  phoneMobile: optionalText(40),
  phoneLandline: optionalText(40),
  internalNote: optionalText(4000),
  /** A health datum under Art. 9 GDPR (CLAUDE.md rule 12) — hence
   *  `contactListItemSchema` below omits it explicitly rather than inheriting
   *  it from this schema like every other field. */
  diagnosis: optionalText(4000),
}

const personFields = {
  kind: z.literal('person'),
  title: optionalText(40),
  firstName: optionalText(80),
  lastName: requiredText(80),
  dateOfBirth: z.iso.date().nullable().default(null),
  birthPlace: optionalText(120),
  /**
   * A `gender` catalogue entry, and a person's alone — unlike the salutation
   * above, this one really does apply to people only.
   *
   * Null is "not recorded", which is at the same time the fourth state German
   * civil status law has, "no entry". There is deliberately no catalogue entry
   * for it: a value meaning the same as its own absence would be a second way
   * of saying almost the same thing, and the two would eventually disagree.
   */
  genderId: z.uuid().nullable().default(null),
}

const organizationFields = {
  kind: z.literal('organization'),
  companyName: requiredText(120),
  contactPerson: optionalText(120),
}

/**
 * What may be changed on an existing contact.
 *
 * A discriminated union rather than one flat object with everything optional,
 * so the shape mirrors the `contact_kind_fields` check constraint exactly: the
 * fields of the other kind cannot even be expressed, let alone sent.
 *
 * **`roles` is deliberately absent, and must stay absent.** They go through
 * `PUT /api/contacts/:id/roles` and nothing else may touch them, so no request
 * can rewrite them as a side effect of saving an address.
 *
 * The original reason was a race: roles were ticked in the page header and
 * saved on the click, while the master data was a form with a save button, so
 * a payload carrying both would have written the roles as they stood when the
 * form was opened over anything ticked since — silently, and only sometimes.
 * Since K6 the roles are a section of that same form and there is no second
 * place to lose the race to. The rule stays anyway, and now for the plainer
 * reason: one resource, one route. A caller changing roles says so.
 */
export const contactUpdateSchema = z.discriminatedUnion('kind', [
  z.object({ ...personFields, ...sharedFields }),
  z.object({ ...organizationFields, ...sharedFields }),
])

export type ContactUpdate = z.infer<typeof contactUpdateSchema>

/**
 * What creating a contact takes. The same fields plus the roles, because at
 * that moment there is no second place they could be edited from and no race
 * to lose — "add a new patient" should stay one action.
 */
export const contactInputSchema = z.discriminatedUnion('kind', [
  z.object({ ...personFields, ...sharedFields, roles: rolesField }),
  z.object({ ...organizationFields, ...sharedFields, roles: rolesField }),
])

export type ContactInput = z.infer<typeof contactInputSchema>

/** The body of the roles endpoint — the only way roles change. */
export const contactRolesInputSchema = z.object({ roles: rolesField })

/** What the API returns. Flat, with every field of both kinds present and
 *  `null` where it does not apply. */
export const contactSchema = z.object({
  id: z.uuid(),
  contactNumber: z.number().int().positive(),
  kind: contactKindSchema,
  salutationId: z.uuid().nullable(),
  title: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  birthPlace: z.string().nullable(),
  genderId: z.uuid().nullable(),
  companyName: z.string().nullable(),
  vatId: z.string().nullable(),
  contactPerson: z.string().nullable(),
  street: z.string().nullable(),
  houseNumber: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  countryId: z.uuid().nullable(),
  email: z.string().nullable(),
  phoneMobile: z.string().nullable(),
  phoneLandline: z.string().nullable(),
  internalNote: z.string().nullable(),
  diagnosis: z.string().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  roles: z.array(z.object({ roleTypeId: z.uuid(), since: z.string().nullable() })),
})

export type Contact = z.infer<typeof contactSchema>

/**
 * A row of the contact list.
 *
 * `appointmentAt` is the appointment nearest to now within the window the
 * "Aktuell" order uses, and `null` in every other order — the column that
 * explains that order only exists there.
 *
 * `diagnosis` is deliberately omitted rather than inherited — a health datum
 * under Art. 9 GDPR must not appear in the contact list (CLAUDE.md rule 12).
 * `listContacts` in `domain/contact.ts` mirrors this at the SQL level with its
 * own column set, so the value is never even read for a list row.
 */
export const contactListItemSchema = contactSchema.omit({ diagnosis: true }).extend({
  appointmentAt: z.iso.datetime().nullable(),
})

export type ContactListItem = z.infer<typeof contactListItemSchema>

/**
 * How the list is ordered.
 *
 * `current` is the everyday entry point: whoever was here in the last days or
 * is coming in the next, nearest first. `alpha` is the card index.
 *
 * The default here is `alpha`, the plainer of the two — an API that starts
 * filtering by a time window unless told otherwise is a surprise. The screen
 * defaults to `current` and says so in the request.
 */
export const contactListOrders = ['current', 'alpha'] as const
export const contactListOrderSchema = z.enum(contactListOrders)
export type ContactListOrder = z.infer<typeof contactListOrderSchema>

export const contactSortFields = ['name', 'number'] as const
export const contactSortFieldSchema = z.enum(contactSortFields)
export type ContactSortField = z.infer<typeof contactSortFieldSchema>

export const sortDirectionSchema = z.enum(['asc', 'desc'])
export type SortDirection = z.infer<typeof sortDirectionSchema>

/**
 * Query for the contact list.
 *
 * `q` is deliberately not part of the router's search params on the client: in
 * this application a search term is almost always a patient's name, and the
 * URL ends up in browser history and autocomplete. Role and archived do go
 * into the URL — they are not personal data.
 */
export const contactListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  roleTypeId: z.uuid().optional(),
  order: contactListOrderSchema.default('alpha'),
  sort: contactSortFieldSchema.default('name'),
  dir: sortDirectionSchema.default('asc'),
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ContactListQuery = z.infer<typeof contactListQuerySchema>
