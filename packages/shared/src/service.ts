import { z } from 'zod'
import { optionalText, requiredText } from './field.js'

/**
 * The catalogue. A `service` is a template and nothing more: when an
 * `activity_item` is created in slice 4, description, fee code, price and
 * duration are **copied** from it, and `service_id` stays behind only as a
 * record of origin (CLAUDE.md rule 5).
 *
 * That is why there is no price history and no `valid_from`/`valid_to` here —
 * editing the catalogue is meant to have no effect on anything that already
 * exists.
 */
export const serviceInputSchema = z.object({
  /** Optional handle for quick entry, unique among the services that have one. */
  shortCode: optionalText(16),
  description: requiredText(200),
  /** GebüH number. Free text, and usually empty — the software neither
   *  validates nor derives anything from it. */
  feeCode: optionalText(40),
  defaultPriceCents: z.number().int().min(0),
  /** Not every service lasts a measurable time — a no-show fee does not. */
  defaultDurationMin: z
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .nullable()
    .default(null),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
})

export type ServiceInput = z.infer<typeof serviceInputSchema>

export const serviceSchema = serviceInputSchema.extend({
  id: z.uuid(),
})

export type Service = z.infer<typeof serviceSchema>

/**
 * A group is a selection helper and nothing else. Picking one resolves into
 * individual items immediately, at entry time; **no table ever stores a
 * reference to a group** (CLAUDE.md rule 5). Renaming or emptying a group can
 * therefore never change an activity that was entered from it.
 */
export const serviceGroupItemInputSchema = z.object({
  serviceId: z.uuid(),
  /** A session is the unit; duration lives in `defaultDurationMin`. */
  quantity: z.number().int().positive().max(999).default(1),
})

export const serviceGroupInputSchema = z.object({
  name: requiredText(120),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
  /** Order is the array order — `position` is written from the index on save. */
  items: z
    .array(serviceGroupItemInputSchema)
    .max(50)
    .default([])
    .refine((items) => new Set(items.map((item) => item.serviceId)).size === items.length, {
      message: 'duplicate service',
    }),
})

export type ServiceGroupInput = z.infer<typeof serviceGroupInputSchema>

export const serviceGroupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  items: z.array(
    serviceGroupItemInputSchema.extend({
      /** Denormalized for display, so the group editor and the picker do not
       *  each have to join the catalogue themselves. */
      description: z.string(),
      shortCode: z.string().nullable(),
      defaultPriceCents: z.number().int(),
      defaultDurationMin: z.number().int().nullable(),
      serviceActive: z.boolean(),
    }),
  ),
})

export type ServiceGroup = z.infer<typeof serviceGroupSchema>

/**
 * `includeInactive` is false by default, which is what keeps deactivated
 * entries out of every selection list. The management screen asks for them
 * explicitly.
 */
export const catalogueListQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

export type CatalogueListQuery = z.infer<typeof catalogueListQuerySchema>
