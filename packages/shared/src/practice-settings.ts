import { z } from 'zod'
import { optionalText, optionalTextPatch, requiredText } from './field.js'

/**
 * An IBAN with the spaces people paste along with it removed. The check is
 * structural only — length and alphabet, not the checksum — because rejecting
 * a technically valid but unusual account number would be worse than storing
 * a typo the practitioner can see and correct on screen.
 */
const ibanCore = z
  .string()
  .trim()
  .transform((value) => value.replaceAll(/\s+/g, '').toUpperCase())
  .refine((value) => value === '' || /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value), {
    message: 'IBAN',
  })
  .transform((value) => (value === '' ? null : value))

const iban = ibanCore.nullable().default(null)
const ibanPatch = ibanCore.nullable().optional()

const countryCore = z
  .string()
  .trim()
  .toUpperCase()
  .length(2)
  .regex(/^[A-Z]{2}$/)
const emailCore = z
  .union([z.literal(''), z.email().max(160)])
  .transform((value) => (value === '' ? null : value))

/** What the practitioner may send. `tenant_id` is never part of it. */
export const practiceSettingsInputSchema = z.object({
  practiceName: requiredText(120),
  street: optionalText(120),
  postalCode: optionalText(16),
  city: optionalText(80),
  /** ISO 3166-1 alpha-2, upper-cased. */
  country: countryCore.default('DE'),
  phone: optionalText(40),
  email: emailCore.nullable().default(null),
  website: optionalText(200),
  taxNumber: optionalText(40),
  /** The practice's own, beside the tax number — the design's "Steuern" section
   *  shows both. Same shape as `contact.vatId`. */
  vatId: optionalText(40),
  bankName: optionalText(120),
  iban,
  bic: optionalText(16),
  defaultPaymentTermDays: z.coerce.number().int().min(0).max(365).default(14),
})

/**
 * The same fields, for a **patch**: every key optional, and — unlike
 * `.partial()` on the schema above — genuinely so. `practiceSettingsInputSchema
 * .partial()` looks right but silently reintroduces every field's `.default()`
 * the instant a key is left out, because Zod applies a default whenever the
 * key is absent regardless of `.optional()`; a save of the payment term alone
 * would come back out as `{ defaultPaymentTermDays: 30, country: 'DE', ... }`
 * and wipe every other column back to its default. That is exactly the
 * silent-overwrite the two settings panels (D4: Praxis, Rechnungsstellung)
 * exist to avoid — each panel's save must only ever touch the columns it
 * actually renders, and the domain layer's `.set(patch)` only writes the keys
 * this schema actually produced.
 */
export const practiceSettingsPatchSchema = z.object({
  practiceName: requiredText(120).optional(),
  street: optionalTextPatch(120),
  postalCode: optionalTextPatch(16),
  city: optionalTextPatch(80),
  country: countryCore.optional(),
  phone: optionalTextPatch(40),
  email: emailCore.nullable().optional(),
  website: optionalTextPatch(200),
  taxNumber: optionalTextPatch(40),
  vatId: optionalTextPatch(40),
  bankName: optionalTextPatch(120),
  iban: ibanPatch,
  bic: optionalTextPatch(16),
  defaultPaymentTermDays: z.coerce.number().int().min(0).max(365).optional(),
})

export type PracticeSettingsPatch = z.infer<typeof practiceSettingsPatchSchema>

export const practiceSettingsSchema = practiceSettingsInputSchema.extend({
  id: z.uuid(),
  /**
   * Whether a letterhead is stored. Derived from `invoice_template_path`, not
   * a field of its own and never written from a payload — it exists so the
   * settings screen can tell "no letterhead yet" from "one is stored" instead
   * of offering a button that answers 404.
   *
   * The path itself stays on the server: it is a location on disk and the
   * client has no use for it.
   */
  invoiceTemplateSet: z.boolean(),
})

export type PracticeSettings = z.infer<typeof practiceSettingsSchema>
