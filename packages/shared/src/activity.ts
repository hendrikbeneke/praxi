import { z } from 'zod'
import { appointmentDraftSchema, appointmentSchema } from './appointment.js'
import { optionalText, requiredText } from './field.js'

/**
 * A dated event where services were rendered to a contact — a session, a talk,
 * a consultation. The activity is the record of what happened and the primary
 * place to make corrections (CLAUDE.md rule 6).
 *
 * `text` with a named check constraint rather than an enum: CLAUDE.md marks
 * this set as expected to change.
 */
export const activityTypes = ['session', 'talk', 'consultation', 'other'] as const
export const activityTypeSchema = z.enum(activityTypes)
export type ActivityType = z.infer<typeof activityTypeSchema>

const quantity = z.number().int().positive().max(999)
const durationMin = z
  .number()
  .int()
  .positive()
  .max(24 * 60)
  .nullable()
  .default(null)

/**
 * How a position is submitted. The same union serves creating and editing,
 * and the copying happens on the server — the rule that a service is a
 * template belongs in `domain/`, not in a form.
 *
 * - `service` — the domain copies description, fee code, price and duration
 *   out of the catalogue. `service_id` is kept as a record of origin and means
 *   nothing for price or text afterwards (rule 5).
 * - `group` — resolved into individual items immediately. No group id is
 *   stored anywhere; renaming or emptying the group later changes nothing.
 * - `custom` — taken as given. A one-off talk, an adjusted price, or an item
 *   that already exists and is being edited. `id` present means "this row",
 *   absent means "a new one".
 */
export const activityItemInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('service'),
    serviceId: z.uuid(),
    quantity: quantity.default(1),
    billable: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal('group'),
    serviceGroupId: z.uuid(),
  }),
  z.object({
    kind: z.literal('custom'),
    id: z.uuid().optional(),
    serviceId: z.uuid().nullable().default(null),
    description: requiredText(200),
    feeCode: optionalText(40),
    quantity: quantity.default(1),
    // No sign restriction, unlike the catalogue: rule 5 handles discounts by
    // leaving the price here free, and a negative one-off line is the way.
    unitPriceCents: z.number().int().min(-100_000_000).max(100_000_000),
    durationMin,
    billable: z.boolean().default(true),
  }),
])

export type ActivityItemInput = z.infer<typeof activityItemInputSchema>

export const activityInputSchema = z.object({
  contactId: z.uuid(),
  type: activityTypeSchema,
  occurredAt: z.iso.datetime(),
  /** Descriptive only. Nothing is derived from it — an activity documented
   *  afterwards has no appointment to take a length from. */
  durationMin,
  title: optionalText(200),
  internalNote: optionalText(4000),
  items: z.array(activityItemInputSchema).max(100).default([]),
  /** Created together with the activity by default; `null` documents
   *  something that never produced a calendar entry. */
  appointment: appointmentDraftSchema.nullable().default(null),
})

export type ActivityInput = z.infer<typeof activityInputSchema>

export const activityItemSchema = z.object({
  id: z.uuid(),
  position: z.number().int(),
  serviceId: z.uuid().nullable(),
  description: z.string(),
  feeCode: z.string().nullable(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  durationMin: z.number().int().nullable(),
  billable: z.boolean(),
})

export type ActivityItem = z.infer<typeof activityItemSchema>

export const activitySchema = z.object({
  id: z.uuid(),
  contactId: z.uuid(),
  type: activityTypeSchema,
  occurredAt: z.iso.datetime(),
  durationMin: z.number().int().nullable(),
  title: z.string().nullable(),
  internalNote: z.string().nullable(),
  appointment: appointmentSchema.nullable(),
  items: z.array(activityItemSchema),
})

export type Activity = z.infer<typeof activitySchema>

/** Either by contact or by date range; the route requires at least one, so a
 *  bare call cannot walk the whole history. */
export const activityListQuerySchema = z
  .object({
    contactId: z.uuid().optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((query) => query.contactId !== undefined || query.from !== undefined, {
    message: 'contactId or from is required',
  })

export type ActivityListQuery = z.infer<typeof activityListQuerySchema>

/** Sum of an activity's positions, billable ones only or all of them. Lives
 *  here so the list, the editor and the later invoice draft agree. */
export function sumItems(
  items: readonly Pick<ActivityItem, 'quantity' | 'unitPriceCents' | 'billable'>[],
  options: { billableOnly?: boolean } = {},
): number {
  return items
    .filter((item) => !options.billableOnly || item.billable)
    .reduce((total, item) => total + item.quantity * item.unitPriceCents, 0)
}
