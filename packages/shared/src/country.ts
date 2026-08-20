import { DISPLAY_LOCALE } from './date-format.js'

/**
 * The countries an address can be in.
 *
 * **A country is stored as its ISO 3166-1 alpha-2 code and never shown as one.**
 * The code is the right thing in a column — short, stable, sortable — and the
 * wrong thing on a screen: nobody checks an address by reading "AT". So every
 * place that renders a country resolves it through `countryName()`, and every
 * place that asks for one offers a selection rather than a text field.
 *
 * That includes the invoice PDF. Its address block printed the raw code for a
 * recipient outside Germany, which is wrong in a letter for the same reason it
 * is wrong on a screen — and worse, because a finalized document can never be
 * corrected. For Germany no country line is printed at all, which is why the
 * mistake could sit there unnoticed.
 *
 * This file holds **codes only** since D-R3. It used to carry eight
 * `{ code, name }` pairs, which was the neighbourhood a Bremen practice bills
 * into; the practitioner now chooses which countries the contact form offers
 * (the `country` table), and this list is what that choice is made *from*. It
 * is the standard, not a maintained source: entries are neither added nor
 * renamed by hand.
 */

/**
 * Every ISO 3166-1 alpha-2 code currently assigned, in alphabetical order.
 *
 * Hard-coded because `Intl` cannot enumerate regions — `Intl.supportedValuesOf`
 * knows calendars, currencies and time zones, and not this. The names come
 * from `Intl.DisplayNames`; only the set of codes lives here.
 */
export const countryCodes = [
  'AD',
  'AE',
  'AF',
  'AG',
  'AI',
  'AL',
  'AM',
  'AO',
  'AQ',
  'AR',
  'AS',
  'AT',
  'AU',
  'AW',
  'AX',
  'AZ',
  'BA',
  'BB',
  'BD',
  'BE',
  'BF',
  'BG',
  'BH',
  'BI',
  'BJ',
  'BL',
  'BM',
  'BN',
  'BO',
  'BQ',
  'BR',
  'BS',
  'BT',
  'BV',
  'BW',
  'BY',
  'BZ',
  'CA',
  'CC',
  'CD',
  'CF',
  'CG',
  'CH',
  'CI',
  'CK',
  'CL',
  'CM',
  'CN',
  'CO',
  'CR',
  'CU',
  'CV',
  'CW',
  'CX',
  'CY',
  'CZ',
  'DE',
  'DJ',
  'DK',
  'DM',
  'DO',
  'DZ',
  'EC',
  'EE',
  'EG',
  'EH',
  'ER',
  'ES',
  'ET',
  'FI',
  'FJ',
  'FK',
  'FM',
  'FO',
  'FR',
  'GA',
  'GB',
  'GD',
  'GE',
  'GF',
  'GG',
  'GH',
  'GI',
  'GL',
  'GM',
  'GN',
  'GP',
  'GQ',
  'GR',
  'GS',
  'GT',
  'GU',
  'GW',
  'GY',
  'HK',
  'HM',
  'HN',
  'HR',
  'HT',
  'HU',
  'ID',
  'IE',
  'IL',
  'IM',
  'IN',
  'IO',
  'IQ',
  'IR',
  'IS',
  'IT',
  'JE',
  'JM',
  'JO',
  'JP',
  'KE',
  'KG',
  'KH',
  'KI',
  'KM',
  'KN',
  'KP',
  'KR',
  'KW',
  'KY',
  'KZ',
  'LA',
  'LB',
  'LC',
  'LI',
  'LK',
  'LR',
  'LS',
  'LT',
  'LU',
  'LV',
  'LY',
  'MA',
  'MC',
  'MD',
  'ME',
  'MF',
  'MG',
  'MH',
  'MK',
  'ML',
  'MM',
  'MN',
  'MO',
  'MP',
  'MQ',
  'MR',
  'MS',
  'MT',
  'MU',
  'MV',
  'MW',
  'MX',
  'MY',
  'MZ',
  'NA',
  'NC',
  'NE',
  'NF',
  'NG',
  'NI',
  'NL',
  'NO',
  'NP',
  'NR',
  'NU',
  'NZ',
  'OM',
  'PA',
  'PE',
  'PF',
  'PG',
  'PH',
  'PK',
  'PL',
  'PM',
  'PN',
  'PR',
  'PS',
  'PT',
  'PW',
  'PY',
  'QA',
  'RE',
  'RO',
  'RS',
  'RU',
  'RW',
  'SA',
  'SB',
  'SC',
  'SD',
  'SE',
  'SG',
  'SH',
  'SI',
  'SJ',
  'SK',
  'SL',
  'SM',
  'SN',
  'SO',
  'SR',
  'SS',
  'ST',
  'SV',
  'SX',
  'SY',
  'SZ',
  'TC',
  'TD',
  'TF',
  'TG',
  'TH',
  'TJ',
  'TK',
  'TL',
  'TM',
  'TN',
  'TO',
  'TR',
  'TT',
  'TV',
  'TW',
  'TZ',
  'UA',
  'UG',
  'UM',
  'US',
  'UY',
  'UZ',
  'VA',
  'VC',
  'VE',
  'VG',
  'VI',
  'VN',
  'VU',
  'WF',
  'WS',
  'YE',
  'YT',
  'ZA',
  'ZM',
  'ZW',
] as const

export type CountryCode = (typeof countryCodes)[number]

const names = new Intl.DisplayNames([DISPLAY_LOCALE], { type: 'region' })

/**
 * The readable name for a stored code — and the code itself when it is one we
 * do not know.
 *
 * Falling back to the code rather than to a dash matters for old data: an
 * invoice's `recipient_snapshot` holds whatever the contact's country was when
 * it was finalized, and a snapshot must keep rendering the document it
 * rendered then. Showing "XK" is honest; showing "—" would hide an address
 * line that the printed original carries.
 *
 * **The name comes from ICU, so server and client resolve it from two separate
 * data sets** — the one built into Node and the one built into the browser.
 * They can in principle disagree, which the single hard-coded table this file
 * used to hold could not. It is accepted here because an invoice is rendered
 * exactly once and then lies on disk as a file (CLAUDE.md rule 9): a later ICU
 * update cannot change a document that already exists. If the divergence ever
 * does matter, the answer is to freeze the *name* into `recipient_snapshot` at
 * finalization instead of the code — one field, not a rebuild.
 */
export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code
  return names.of(code) ?? code
}

/**
 * Codes whose name matches what was typed, best-first, for the picker in the
 * settings. Matches the **name and the code**, so "DK" and "Däne" both find
 * Denmark, and prefers a name that starts with the term over one that merely
 * contains it — "Ni" should offer Niederlande before Bosnien.
 */
export function searchCountries(term: string, limit = 8): CountryCode[] {
  const needle = term.trim().toLocaleLowerCase(DISPLAY_LOCALE)
  if (needle === '') return []

  const starts: CountryCode[] = []
  const contains: CountryCode[] = []

  for (const code of countryCodes) {
    const name = countryName(code).toLocaleLowerCase(DISPLAY_LOCALE)
    if (name.startsWith(needle) || code.toLowerCase().startsWith(needle)) starts.push(code)
    else if (name.includes(needle)) contains.push(code)
  }

  return [...starts, ...contains].slice(0, limit)
}
