import { z } from 'zod'
import { requiredText } from './field.js'

/**
 * The intro and outro blocks on an invoice.
 *
 * Picking one fills the draft's `intro_text` / `outro_text`, which stay
 * editable for that one invoice — see the note on `invoiceSchema`. The
 * template itself is never referenced by an invoice.
 *
 * A `pgEnum` for `kind`: the set is structurally fixed, an invoice has a top
 * and a bottom and nothing else.
 */
export const textTemplateKinds = ['intro', 'outro'] as const
export const textTemplateKindSchema = z.enum(textTemplateKinds)
export type TextTemplateKind = z.infer<typeof textTemplateKindSchema>

export const textTemplateInputSchema = z
  .object({
    kind: textTemplateKindSchema,
    name: requiredText(120),
    body: requiredText(4000),
    /** At most one per kind; the one a new draft starts with. */
    isDefault: z.boolean().default(false),
    /**
     * The outro used when the invoice is settled on the spot. There is no such
     * thing for an intro, and the check constraint says so.
     *
     * The action that uses it — "Betrag erhalten" — arrives in slice 8 with
     * the `payment` table, because it also records a payment.
     */
    isPaidVariant: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .refine((input) => !input.isPaidVariant || input.kind === 'outro', {
    message: 'only an outro can be the paid variant',
    path: ['isPaidVariant'],
  })

export type TextTemplateInput = z.infer<typeof textTemplateInputSchema>

export const textTemplateSchema = z.object({
  id: z.uuid(),
  kind: textTemplateKindSchema,
  name: z.string(),
  body: z.string(),
  isDefault: z.boolean(),
  isPaidVariant: z.boolean(),
  active: z.boolean(),
})

export type TextTemplate = z.infer<typeof textTemplateSchema>
