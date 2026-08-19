import { z } from 'zod'
import { appointmentDraftSchema, appointmentSchema } from './appointment.js'
import { typeCodeSchema } from './contact-role-type.js'
import { optionalText, requiredText } from './field.js'

/**
 * A dated event where services were rendered to a contact — a session, a talk,
 * a consultation. The activity is the record of what happened and the primary
 * place to make corrections (CLAUDE.md rule 6).
 *
 * `type` is the `code` of an `activity_type`, a catalogue the practitioner
 * maintains, reached through a composite foreign key. Neither an enum nor a
 * check constraint: the set is not merely expected to change, it is owned by
 * the practice.
 */

/**
 * What became of the activity. Descriptive only — **it does not gate billing**.
 * Anything in the past can be invoiced whatever this says, and
 * `domain/billable.ts` does not read it; billability is a property of the item
 * (`activity_item.billable`), per CLAUDE.md rule 6.
 *
 * Separate from `appointment.status`, which says what became of the *slot*.
 * A no-show is an activity that did not take place in a slot that stayed
 * occupied, and before the split neither status could say that.
 */
export const activityStatuses = ['planned', 'rendered', 'no_show'] as const
export const activityStatusSchema = z.enum(activityStatuses)
export type ActivityStatus = z.infer<typeof activityStatusSchema>

/**
 * Whether what was rendered here has been claimed yet.
 *
 * Derived on read from the invoice lines and **never stored** — a column would
 * be a second place saying what the lines already say, and a cancelled invoice
 * frees its items again (rule 9) without anything to keep in step. It comes
 * from `billingStateOf()` in `domain/billable.ts`, which uses the very same
 * condition as the billable list; see the note there.
 *
 * `none` is not "nothing has been billed" but "there is nothing to bill" — an
 * activity whose items are all marked unbillable, or one without items.
 */
export const activityBillingStates = ['none', 'open', 'billed'] as const
export const activityBillingStateSchema = z.enum(activityBillingStates)
export type ActivityBillingState = z.infer<typeof activityBillingStateSchema>

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
 * - `service` — the domain copies description, fee code and price out of the
 *   catalogue. `service_id` is kept as a record of origin and means nothing
 *   for price or text afterwards (rule 5).
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
    billable: z.boolean().default(true),
  }),
])

export type ActivityItemInput = z.infer<typeof activityItemInputSchema>

export const activityInputSchema = z.object({
  contactId: z.uuid(),
  /** The `code` of an `activity_type`. */
  type: typeCodeSchema,
  status: activityStatusSchema.default('planned'),
  occurredAt: z.iso.datetime(),
  /** Descriptive only. Nothing is derived from it — an activity documented
   *  afterwards has no appointment to take a length from. */
  durationMin,
  /** Optional: where it is missing, every screen shows the label of the
   *  activity type instead — see `activityLabel`. */
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
  billable: z.boolean(),
})

export type ActivityItem = z.infer<typeof activityItemSchema>

export const activitySchema = z.object({
  id: z.uuid(),
  contactId: z.uuid(),
  /** Who it was for. On the practice-wide list this is the first thing read —
   *  it is the only column that says the rows apart — and it comes along here
   *  rather than through a second request, the same way `invoice.contactName`
   *  does. `formatContactName()` on the server, so the list and the invoice
   *  spell a name the same way. */
  contactName: z.string(),
  contactNumber: z.number().int(),
  type: z.string(),
  status: activityStatusSchema,
  occurredAt: z.iso.datetime(),
  durationMin: z.number().int().nullable(),
  title: z.string().nullable(),
  internalNote: z.string().nullable(),
  appointment: appointmentSchema.nullable(),
  items: z.array(activityItemSchema),
  billingState: activityBillingStateSchema,
})

export type Activity = z.infer<typeof activitySchema>

/**
 * An appointment in a list, with just enough of its contact and activity to
 * paint a calendar without a second round trip.
 *
 * It lives here rather than next to `appointmentSchema` because it needs both
 * halves, and this is the file that may see both: `activity.ts` imports
 * `appointment.ts`, so the reverse import would close a cycle.
 *
 * The activity's type travels as its `code`, not as a label and not as a
 * colour — the client has the catalogue loaded for the filter anyway, and
 * resolving it there keeps one source for both. Both activity columns are null
 * only for an appointment without an activity, which the application cannot
 * produce today (every appointment comes into being with its activity) but the
 * left join admits.
 */
export const calendarEntrySchema = appointmentSchema.extend({
  activityId: z.uuid().nullable(),
  activityType: z.string().nullable(),
  activityStatus: activityStatusSchema.nullable(),
  /** Both null on an appointment that belongs to nobody. What the block then
   *  shows is its title — which is why a bare appointment has one. */
  contactNumber: z.number().int().nullable(),
  contactName: z.string().nullable(),
})

export type CalendarEntry = z.infer<typeof calendarEntrySchema>

/** Either by contact or by date range; the route requires at least one, so a
 *  bare call cannot walk the whole history. */
export const activityListQuerySchema = z
  .object({
    contactId: z.uuid().optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    status: activityStatusSchema.optional(),
    /** The `code` of an `activity_type` (D8). Filtered on the server like the
     *  status, and for the same reason: the list is paged. */
    type: typeCodeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((query) => query.contactId !== undefined || query.from !== undefined, {
    message: 'contactId or from is required',
  })

export type ActivityListQuery = z.infer<typeof activityListQuerySchema>

/** The same window the list is drawn for, without the paging — a summary is an
 *  aggregate over the whole range or it says nothing. */
export const activitySummaryQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  type: typeCodeSchema.optional(),
})

export type ActivitySummaryQuery = z.infer<typeof activitySummaryQuerySchema>

/**
 * What the Vorgänge page says above the list: how many there are, how they
 * split by status, how many are still ahead, and what has been rendered and
 * not yet claimed.
 *
 * The status counts are what the filter chips carry, so switching a chip does
 * not change them — they describe the window, not the selection.
 */
export const activitySummarySchema = z.object({
  total: z.number().int(),
  planned: z.number().int(),
  rendered: z.number().int(),
  noShow: z.number().int(),
  /** Still ahead — `occurredAt` at or after the moment of asking, which is the
   *  same rule the list's "Kommend" section uses. Compared as an instant and
   *  not as a day on purpose: at ten in the morning, the nine o'clock session
   *  has happened, and a list that still calls it upcoming is wrong about the
   *  one thing this number is for. */
  upcoming: z.number().int(),
  /** Rendered and not yet on a non-cancelled invoice. The one figure here that
   *  is money, and the reason the line is worth reading at all. */
  unbilledCents: z.number().int(),
})

export type ActivitySummary = z.infer<typeof activitySummarySchema>

/**
 * What to call an activity on screen: its own title, or the label of its type.
 *
 * `title` is optional, and the fallback has to be the same everywhere — list,
 * calendar, contact overview, note dialog — so it lives here rather than being
 * written out four times. The caller resolves the label from the catalogue it
 * has loaded anyway (`activityTypeLabel`).
 */
export function activityLabel(activity: { title: string | null }, typeLabel: string): string {
  return activity.title ?? typeLabel
}

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
