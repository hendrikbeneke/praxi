import { z } from 'zod'
import { optionalText, requiredText } from './field.js'

/**
 * An IBAN with the spaces people paste along with it removed. The check is
 * structural only — length and alphabet, not the checksum — because rejecting
 * a technically valid but unusual account number would be worse than storing
 * a typo the practitioner can see and correct on screen.
 */
const iban = z
  .string()
  .trim()
  .transform((value) => value.replaceAll(/\s+/g, '').toUpperCase())
  .refine((value) => value === '' || /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value), {
    message: 'IBAN',
  })
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null)

/** What the practitioner may send. `tenant_id` is never part of it. */
export const practiceSettingsInputSchema = z.object({
  practiceName: requiredText(120),
  street: optionalText(120),
  postalCode: optionalText(16),
  city: optionalText(80),
  /** ISO 3166-1 alpha-2, upper-cased. */
  country: z
    .string()
    .trim()
    .toUpperCase()
    .length(2)
    .regex(/^[A-Z]{2}$/)
    .default('DE'),
  phone: optionalText(40),
  email: z
    .union([z.literal(''), z.email().max(160)])
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .default(null),
  website: optionalText(200),
  taxNumber: optionalText(40),
  bankName: optionalText(120),
  iban,
  bic: optionalText(16),
  defaultPaymentTermDays: z.coerce.number().int().min(0).max(365).default(14),
})

export type PracticeSettingsInput = z.infer<typeof practiceSettingsInputSchema>

export const practiceSettingsSchema = practiceSettingsInputSchema.extend({
  id: z.uuid(),
})

export type PracticeSettings = z.infer<typeof practiceSettingsSchema>
