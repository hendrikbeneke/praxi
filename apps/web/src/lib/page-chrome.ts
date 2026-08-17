/**
 * How much air a screen gets around its content — the one place that knows it,
 * read by `_app.tsx` so no route sets its own page padding (K1).
 *
 * Padding lives here and the *width cap* deliberately does not: on four of the
 * eight screens the design caps a block **inside** the page rather than the
 * page itself. Vorgänge caps its list but lets the filter band run to the
 * window edge — which is what puts that full-width rule under it — and
 * Kontaktdetail caps the tab content but not the header and tab row, which is
 * what lets the tab underline span the whole field. A single number per route
 * would have quietly taken both away. The cap is `ContentWidth` instead, used
 * where the design puts it.
 *
 * Values measured in the prototype, not read off the handoff README: the
 * README of `docs/design-abgleich/` had them wrong, because they came out of a
 * `grep` for `max-width` that counted inner blocks too.
 */

/** Every screen shares the horizontal inset; only the calendar is full-bleed. */
const DEFAULT = 'px-8 pt-[22px] pb-10'

const byRouteId: Record<string, string> = {
  '/_app/': DEFAULT,
  '/_app/contacts/': 'px-8 pt-[26px] pb-6',
  '/_app/contacts/new': 'px-8 pt-[22px] pb-[18px]',
  '/_app/contacts/$contactId': 'px-8 pt-5 pb-0',
  '/_app/activities': 'px-8 pt-[22px] pb-[14px]',
  '/_app/payments': 'px-8 pt-5 pb-7',
  '/_app/services': 'px-8 pt-[22px] pb-10',
  '/_app/settings': 'px-8 pt-[22px] pb-12',
  // The calendar carries no page padding at all: its toolbar starts at the
  // content edge and the rail touches the right edge.
  '/_app/appointments': 'p-0',
}

/**
 * The padding class for the innermost matched route. A route with no entry
 * gets `DEFAULT` rather than nothing, so a new screen looks deliberate before
 * anyone remembers this file.
 */
export function pagePadding(routeIds: readonly string[]): string {
  for (let i = routeIds.length - 1; i >= 0; i--) {
    const routeId = routeIds[i]
    const found = routeId === undefined ? undefined : byRouteId[routeId]
    if (found) return found
  }
  return DEFAULT
}
