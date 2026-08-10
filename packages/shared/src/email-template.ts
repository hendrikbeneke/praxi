import { z } from 'zod'
import { requiredText } from './field.js'

/**
 * The subject and body an invoice is sent with.
 *
 * Its own entity rather than two new values in `text_template_kind`: a subject
 * and a body are one message. Two independent rows of a generic table could be
 * picked apart — a subject from one template and a body from another — which
 * is a state that means nothing. `text_template` stays untouched, and the enum
 * that would have needed `ALTER TYPE … ADD VALUE` stays as it is.
 */
export const emailTemplateInputSchema = z.object({
  name: requiredText(120),
  subject: requiredText(200),
  body: requiredText(4000),
  /** At most one; the one the send dialog opens with. */
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
})

export type EmailTemplateInput = z.infer<typeof emailTemplateInputSchema>

export const emailTemplateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  subject: z.string(),
  body: z.string(),
  isDefault: z.boolean(),
  active: z.boolean(),
})

export type EmailTemplate = z.infer<typeof emailTemplateSchema>
