import { z } from 'zod'
import { DEFAULT_COLOR, hexColorSchema } from './color.js'
import { requiredText } from './field.js'
import { typeCodeSchema } from './type-code.js'

/**
 * The catalogue of activity types — Erstgespräch, Folgesitzung, Vortrag,
 * Beratung and whatever else the practice needs (CLAUDE.md rule 6).
 *
 * Like the role and relation catalogues of rule 4 this is maintained by the
 * practitioner, so `activity.type` points at a `code` here through a composite
 * foreign key rather than being an enum or a check constraint. Unlike those
 * two there are no system entries: nothing in the software depends on a
 * particular activity type existing.
 *
 * ## The presets are presets
 *
 * `defaultDurationMin` and `presetItems` prefill a new activity. They are read
 * once, when the type is applied, and never again — the same rule 5 reasoning
 * that makes a service a template: changing the catalogue must leave
 * everything that already exists untouched. Changing the type of an activity
 * that already carries a duration or positions therefore changes nothing by
 * itself; taking the presets over is a separate, named action in the dialog.
 *
 * `presetItems` references services only — never a group. Picking a group in
 * the settings resolves it into its members immediately, exactly as it does
 * everywhere else a group is picked (rule 5): no row here ever names one, so
 * there is nothing left to keep in step when a group is renamed or emptied.
 */

const presetItemFields = {
  serviceId: z.uuid(),
  quantity: z.number().int().positive().max(999).default(1),
}

/** What an edit may change. Order is the array order, exactly as with
 *  `service_group_item` — `position` is written from the index on save. */
export const activityTypePresetItemInputSchema = z.object(presetItemFields)

const presetItemsField = z
  .array(activityTypePresetItemInputSchema)
  .max(50)
  .default([])
  .refine((items) => new Set(items.map((item) => item.serviceId)).size === items.length, {
    message: 'duplicate service',
  })

const activityTypeFields = {
  label: requiredText(60),
  /** Painted in the calendar; the label on top is black or white, whichever
   *  reads better — see `readableTextOn` in `color.ts`. */
  color: hexColorSchema.default(DEFAULT_COLOR),
  defaultDurationMin: z
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .nullable()
    .default(null),
  presetItems: presetItemsField,
  /** Preselected when a new activity is created. At most one per tenant, held
   *  by a partial unique index. */
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
}

/** What an edit may change. `code` is absent on purpose: it is the handle
 *  `activity.type` points at and is fixed once the entry exists. */
export const activityTypeInputSchema = z.object(activityTypeFields)
export type ActivityTypeInput = z.infer<typeof activityTypeInputSchema>

export const activityTypeCreateSchema = z.object({ code: typeCodeSchema, ...activityTypeFields })
export type ActivityTypeCreate = z.infer<typeof activityTypeCreateSchema>

export const activityTypeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  label: z.string(),
  color: z.string(),
  defaultDurationMin: z.number().int().nullable(),
  presetItems: z.array(
    activityTypePresetItemInputSchema.extend({
      /** Denormalized for display, so the settings screen and the picker do
       *  not each have to join the catalogue themselves — same reasoning as
       *  `ServiceGroup.items`. */
      description: z.string(),
      shortCode: z.string().nullable(),
      defaultPriceCents: z.number().int(),
      defaultDurationMin: z.number().int().nullable(),
      serviceActive: z.boolean(),
    }),
  ),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
  active: z.boolean(),
})

export type ActivityType = z.infer<typeof activityTypeSchema>

/** The label of a type, by code, for a list that has the catalogue loaded.
 *  A code with no entry — a deactivated type is still shown where it is used —
 *  falls back to the code itself rather than to an empty cell. */
export function activityTypeLabel(
  types: readonly ActivityType[] | undefined,
  code: string,
): string {
  return types?.find((type) => type.code === code)?.label ?? code
}

export function activityTypeColor(
  types: readonly ActivityType[] | undefined,
  code: string | null,
): string {
  if (code === null) return DEFAULT_COLOR
  return types?.find((type) => type.code === code)?.color ?? DEFAULT_COLOR
}
