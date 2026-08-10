import { z } from 'zod'
import { optionalText, requiredText } from './field.js'

/**
 * The SMTP account invoices are sent from (CLAUDE.md rule 14, slice 10).
 *
 * Its own entity rather than columns on `practice_settings`, and the reason is
 * structural rather than tidiness: `updatePracticeSettings` writes the whole
 * form object. A password living there would travel to the client and back on
 * every save of the master data. Kept apart, "the settings response carries no
 * secret" is a property of the shape instead of something to remember.
 */

/**
 * `starttls` is the common case (port 587): a plain connection upgraded before
 * anything is sent. `tls` is implicit TLS from the first byte (port 465).
 * `none` exists for a mail relay on the same machine.
 *
 * Text with a named check rather than a `pgEnum`: `none` may well be dropped
 * one day, and the conventions say not to reach for an enum when a value could
 * be removed.
 */
export const smtpSecurities = ['starttls', 'tls', 'none'] as const
export const smtpSecuritySchema = z.enum(smtpSecurities)
export type SmtpSecurity = z.infer<typeof smtpSecuritySchema>

export const smtpSettingsInputSchema = z.object({
  host: requiredText(255),
  port: z.coerce.number().int().min(1).max(65_535),
  security: smtpSecuritySchema,
  username: optionalText(255),
  /**
   * Absent or empty leaves the stored password alone — a settings form that
   * cannot show the password must not clear it by being saved. Explicit `null`
   * clears it, which is the "remove password" button.
   */
  password: z
    .string()
    .max(255)
    .transform((value) => (value === '' ? undefined : value))
    .nullable()
    .optional(),
  /** The sender, and the only address the test send can ever go to. */
  fromAddress: z.email().max(255),
  fromName: optionalText(120),
})

export type SmtpSettingsInput = z.infer<typeof smtpSettingsInputSchema>

/**
 * What the API answers with. There is no password field, in any shape — only
 * whether one is stored.
 */
export const smtpSettingsSchema = z.object({
  host: z.string(),
  port: z.number().int(),
  security: smtpSecuritySchema,
  username: z.string().nullable(),
  fromAddress: z.string(),
  fromName: z.string().nullable(),
  passwordSet: z.boolean(),
  /** True when the stored password was encrypted with a different key than the
   *  one configured now — named rather than left to fail at a GCM tag. */
  keyMismatch: z.boolean(),
})

export type SmtpSettings = z.infer<typeof smtpSettingsSchema>

/** What the test send answers. It takes no recipient — see rule 14. */
export const smtpTestResultSchema = z.object({
  ok: z.boolean(),
  /** Where it went: the configured sender, always. Echoed back so the screen
   *  can say the address rather than "an die Absenderadresse". */
  recipient: z.string(),
  error: z.string().nullable(),
})

export type SmtpTestResult = z.infer<typeof smtpTestResultSchema>
