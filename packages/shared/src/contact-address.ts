/**
 * How an address is written wherever one is needed — the contact overview and,
 * through the recipient snapshot, the invoice PDF.
 *
 * Shared between server and client for the same reason `formatContactName` is:
 * what is printed on a document has to read exactly like what was on screen
 * before it was finalized, and that only holds with one implementation.
 */

export type StreetParts = {
  street?: string | null
  houseNumber?: string | null
}

/**
 * `Musterweg` + `12` → `Musterweg 12`, and `null` when there is nothing to
 * write. Either half may be missing: a contact entered from a letterhead often
 * has the whole address in `street`, and an old snapshot has no house number
 * at all.
 *
 * The number goes after the street and there is no rule per country. The
 * practice bills in Germany; a table of address orders would be machinery for
 * a case that does not exist here.
 */
export function formatStreetLine(parts: StreetParts): string | null {
  const line = [parts.street, parts.houseNumber]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' ')

  return line === '' ? null : line
}
