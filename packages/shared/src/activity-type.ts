import { z } from 'zod'
import { DEFAULT_COLOR, hexColorSchema } from './color.js'
import { requiredText } from './field.js'

/**
 * The catalogue of activity types — Erstgespräch, Folgesitzung, Vortrag,
 * Beratung and whatever else the practice needs (CLAUDE.md rule 6).
 *
 * Like the role and relation catalogues of rule 4 this is maintained by the
 * practitioner, so `activity.activity_type_id` points at a row here through a
 * composite foreign key rather than being an enum or a check constraint.
 *
 * **There is no `code`** since migration 0041, and that follows from the next
 * sentence rather than contradicting it: there are no system entries, nothing
 * in the software depends on a particular activity type existing, so there was
 * nothing for an anchor to anchor. What a code bought was a second name to keep
 * in step and a field on screen that could be read and not edited. The label is
 * what a type is recognised by now — unique per tenant, and freely renamable
 * because every activity points at the id.
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

/**
 * Creating and editing take the same fields — there is nothing that is settled
 * once and frozen afterwards, which is exactly what dropping the code bought.
 * `ActivityTypeCreate` stays as an alias so the two intents still read
 * differently at the call sites.
 */
export const activityTypeInputSchema = z.object(activityTypeFields)
export type ActivityTypeInput = z.infer<typeof activityTypeInputSchema>

export const activityTypeCreateSchema = activityTypeInputSchema
export type ActivityTypeCreate = ActivityTypeInput

export const activityTypeSchema = z.object({
  id: z.uuid(),
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

/**
 * The label of a type, by id, for a list that has the catalogue loaded.
 *
 * The fallback used to be the code, which said *something* to a reader. An id
 * says nothing, so a missing entry falls back to the em dash every list uses
 * for an absent value. It is unreachable in practice — a type an activity
 * carries cannot be deleted, and the callers all load inactive types too — and
 * printing a uuid in a calendar block would be the worse way to find that out.
 */
export function activityTypeLabel(types: readonly ActivityType[] | undefined, id: string): string {
  return types?.find((type) => type.id === id)?.label ?? '—'
}

export function activityTypeColor(
  types: readonly ActivityType[] | undefined,
  id: string | null,
): string {
  if (id === null) return DEFAULT_COLOR
  return types?.find((type) => type.id === id)?.color ?? DEFAULT_COLOR
}
