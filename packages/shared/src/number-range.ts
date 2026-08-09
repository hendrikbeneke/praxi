import { z } from 'zod'

/**
 * The number ranges that may be maintained through the settings.
 *
 * `contact` creates itself on first use (see `domain/counter.ts`); it is listed
 * so an existing row can still be corrected. `invoice` deliberately does not
 * create itself — that range is configured on purpose and may continue a
 * numbering from the previous system.
 */
export const numberRangeCodes = ['invoice', 'contact'] as const
export const numberRangeCodeSchema = z.enum(numberRangeCodes)
export type NumberRangeCode = z.infer<typeof numberRangeCodeSchema>

export const numberRangeInputSchema = z.object({
  /** Becomes part of a file name (`invoices/{year}/{number}.pdf`), so a slash
   *  or a space in here would be a path problem. */
  prefix: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9._-]*$/)
    .default(''),
  padding: z.number().int().min(1).max(12).default(1),
  nextValue: z.number().int().min(1),
})

export type NumberRangeInput = z.infer<typeof numberRangeInputSchema>

export const numberRangeSchema = numberRangeInputSchema.extend({
  id: z.uuid(),
  code: z.string(),
})

export type NumberRange = z.infer<typeof numberRangeSchema>

/**
 * How a counter value becomes a document number.
 *
 * Shared with the client so the settings screen can show what the next invoice
 * will be called before one exists. The result is frozen into `invoice.number`
 * at finalization — changing the padding later must never rewrite a number
 * that has already been issued.
 */
export function formatNumber(prefix: string, padding: number, value: number): string {
  return `${prefix}${String(value).padStart(padding, '0')}`
}
