import { invoiceListFilterSchema } from '@praxi/shared'
import { z } from 'zod'

/**
 * What narrows a list of invoices — on the Zahlungen page and in a contact's
 * Rechnungen tab, which is one set of rules and therefore one file (B3). The
 * same shape `lib/activity-filters.ts` took in B2, for the same reason: the two
 * screens are one screen, so a filter cannot belong to only one of them.
 *
 * **In the URL on both**, so a narrowed view is a link one can send. In the
 * contact record it stands beside `tab=invoices`, which is in the address for
 * exactly that reason.
 *
 * `invoiceFilter` rather than `filter`, and that is not a flourish: the contact
 * record already carries the Vorgänge chip under `filter`, and two tabs of one
 * screen writing different things into one key is a state nobody can read back.
 * The Zahlungen page renamed its own key to match, because nothing is in
 * production and one name across two screens is worth a rename.
 *
 * **Nothing is prefilled.** No chip is pressed on arrival — the list opens on
 * everything, and the "Alle" chip says how much that is.
 *
 * What the *counts* on those chips are is deliberately not here: they come from
 * `invoiceSummaryQueryOptions`, one request over every document rather than a
 * fold over the page that happened to be loaded (B3).
 */
export const invoiceFilterSearchSchema = z.object({
  invoiceFilter: invoiceListFilterSchema.optional(),
  /**
   * Which invoice is expanded, where a screen was linked to with one in mind —
   * the contact's overview points here at the draft it just started (L5's
   * `activityId`, one record over). A *starting* state, not a controlled one:
   * clicking another row from then on is the ordinary toggle.
   */
  invoiceId: z.uuid().optional(),
})

export type InvoiceFilterValue = z.infer<typeof invoiceFilterSearchSchema>
