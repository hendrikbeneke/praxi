/**
 * The countries an address in this practice can be in.
 *
 * **A country is stored as its ISO 3166-1 alpha-2 code and never shown as one.**
 * The code is the right thing in a column — short, stable, sortable — and the
 * wrong thing on a screen: nobody checks an address by reading "AT". So every
 * place that renders a country resolves it here, and every place that asks for
 * one offers this list rather than a text field (K4).
 *
 * That includes the invoice PDF. Its address block printed the raw code for a
 * recipient outside Germany, which is wrong in a letter for the same reason it
 * is wrong on a screen — and worse, because a finalized document can never be
 * corrected. For Germany no country line is printed at all, which is why the
 * mistake could sit there unnoticed.
 *
 * Deliberately short. It is the neighbourhood a Bremen practice bills into, not
 * a world list — eight entries are pickable without a search field, and the day
 * a ninth is needed it is one line. Taken from the design, which settled the
 * same eight.
 */
export const countries = [
  { code: 'DE', name: 'Deutschland' },
  { code: 'AT', name: 'Österreich' },
  { code: 'CH', name: 'Schweiz' },
  { code: 'LU', name: 'Luxemburg' },
  { code: 'NL', name: 'Niederlande' },
  { code: 'BE', name: 'Belgien' },
  { code: 'DK', name: 'Dänemark' },
  { code: 'FR', name: 'Frankreich' },
] as const

export type CountryCode = (typeof countries)[number]['code']

/**
 * The readable name for a stored code — and the code itself when it is one we
 * do not know.
 *
 * Falling back to the code rather than to a dash matters for old data: an
 * invoice's `recipient_snapshot` holds whatever the contact's country was when
 * it was finalized, and a snapshot must keep rendering the document it rendered
 * then. Showing "XK" is honest; showing "—" would hide an address line that the
 * printed original carries.
 */
export function countryName(code: string): string {
  return countries.find((entry) => entry.code === code)?.name ?? code
}
