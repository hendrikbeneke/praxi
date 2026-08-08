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
 * prospect who becomes a patient, a parent who is both guardian and billing
 * recipient (CLAUDE.md rule 4).
 *
 * Stored as `text` with a named check constraint rather than as an enum —
 * this set is expected to change, and a check constraint is replaced with
 * DROP/ADD in one migration. This list is the single definition; the Drizzle
 * column type is derived from it.
 */
export const contactRoles = [
  'patient',
  'prospect',
  'participant',
  'guardian',
  'billing_recipient',
  'other',
] as const
export const contactRoleSchema = z.enum(contactRoles)
export type ContactRole = z.infer<typeof contactRoleSchema>

/** `since` may be unknown — when an old contact is entered afterwards, the
 *  date the role started often cannot be reconstructed. */
export const contactRoleInputSchema = z.object({
  role: contactRoleSchema,
  since: z.iso.date().nullable().default(null),
})

export type ContactRoleInput = z.infer<typeof contactRoleInputSchema>

const rolesField = z
  .array(contactRoleInputSchema)
  .max(contactRoles.length)
  .default([])
  .refine((roles) => new Set(roles.map((entry) => entry.role)).size === roles.length, {
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
  roles: rolesField,
}

/**
 * A discriminated union rather than one flat object with everything optional,
 * so the shape mirrors the `contact_kind_fields` check constraint exactly: the
 * fields of the other kind cannot even be expressed, let alone sent.
 */
export const contactInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('person'),
    // Free text, not an enum: "Familie" and "Herr und Frau" have to be
    // possible, and no letter is generated from this.
    salutation: optionalText(40),
    title: optionalText(40),
    firstName: optionalText(80),
    lastName: requiredText(80),
    dateOfBirth: z.iso.date().nullable().default(null),
    ...sharedFields,
  }),
  z.object({
    kind: z.literal('organization'),
    companyName: requiredText(120),
    contactPerson: optionalText(120),
    ...sharedFields,
  }),
])

export type ContactInput = z.infer<typeof contactInputSchema>

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
  roles: z.array(z.object({ role: contactRoleSchema, since: z.string().nullable() })),
})

export type Contact = z.infer<typeof contactSchema>

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
  role: contactRoleSchema.optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ContactListQuery = z.infer<typeof contactListQuerySchema>
