import { z } from 'zod'
import { typeCodeSchema } from './contact-role-type.js'
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
 * The set is configurable — `roleCode` points at a `contact_role_type` of the
 * same tenant and is validated by a composite foreign key, not by an enum or a
 * check constraint. Anything that needs a counterpart to mean something is not
 * a role but a relation; see `contact-relation.ts`.
 */

/** `since` may be unknown — when an old contact is entered afterwards, the
 *  date the role started often cannot be reconstructed. */
export const contactRoleInputSchema = z.object({
  roleCode: typeCodeSchema,
  since: z.iso.date().nullable().default(null),
})

export type ContactRoleInput = z.infer<typeof contactRoleInputSchema>

const rolesField = z
  .array(contactRoleInputSchema)
  .max(50)
  .default([])
  .refine((roles) => new Set(roles.map((entry) => entry.roleCode)).size === roles.length, {
    message: 'duplicate role',
  })

/** Fields that apply regardless of `kind`. */
const sharedFields = {
  // A sole trader is a person and can still have a VAT id, so this is not
  // restricted to organizations.
  vatId: optionalText(40),
  street: optionalText(120),
  postalCode: optionalText(16),
  city: optionalText(80),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .length(2)
    .regex(/^[A-Z]{2}$/)
    .default('DE'),
  email: z
    .union([z.literal(''), z.email().max(160)])
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .default(null),
  phone: optionalText(40),
  internalNote: optionalText(4000),
}

const personFields = {
  kind: z.literal('person'),
  // Free text, not an enum: "Familie" and "Herr und Frau" have to be
  // possible, and no letter is generated from this.
  salutation: optionalText(40),
  title: optionalText(40),
  firstName: optionalText(80),
  lastName: requiredText(80),
  dateOfBirth: z.iso.date().nullable().default(null),
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
 * **`roles` is deliberately absent, and must stay absent.** They are edited in
 * the page header, which saves the moment a role is ticked, while the master
 * data form is a form with a save button. If a role travelled in this payload
 * too, an open form would carry the roles as they were when it was opened and
 * write them back over anything ticked in the meantime — silently, and only
 * sometimes. Roles go through `PUT /api/contacts/:id/roles`; nothing else may
 * touch them.
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
export type ContactRolesInput = z.infer<typeof contactRolesInputSchema>

/** What the API returns. Flat, with every field of both kinds present and
 *  `null` where it does not apply. */
export const contactSchema = z.object({
  id: z.uuid(),
  contactNumber: z.number().int().positive(),
  kind: contactKindSchema,
  salutation: z.string().nullable(),
  title: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  companyName: z.string().nullable(),
  vatId: z.string().nullable(),
  contactPerson: z.string().nullable(),
  street: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  internalNote: z.string().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  roles: z.array(z.object({ roleCode: z.string(), since: z.string().nullable() })),
})

export type Contact = z.infer<typeof contactSchema>

/**
 * A row of the contact list.
 *
 * `appointmentAt` is the appointment nearest to now within the window the
 * "Aktuell" order uses, and `null` in every other order — the column that
 * explains that order only exists there.
 */
export const contactListItemSchema = contactSchema.extend({
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
  roleCode: typeCodeSchema.optional(),
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
