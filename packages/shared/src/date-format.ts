/**
 * How a date and a time are written and read *on screen*.
 *
 * Everything inside the application — state, payloads, the database — stays
 * ISO: `YYYY-MM-DD` for a date, `HH:mm` for a time. This module is the border
 * where that meets what a person types, and it is the only place that knows
 * the order of the parts, the separator and the names of the months.
 *
 * It exists because a native `<input type="date">` follows the *browser's*
 * language, not the application's: on a machine set to en-US the field asks
 * for mm/dd/yyyy while every label around it is German, and 07.03. is silently
 * a different day than it looks. The format has to be a property of the
 * application.
 *
 * Translating the application later means adding a second descriptor and
 * choosing it here. No caller names a format — `parseDateDE` and `formatDateDE`
 * are named after the descriptor that is in force today, not after a decision
 * baked into their bodies.
 */

export const DISPLAY_LOCALE = 'de-DE'

type DatePart = 'day' | 'month' | 'year'

type DateFormatDescriptor = {
  /** The order the three parts are written in. */
  readonly order: readonly [DatePart, DatePart, DatePart]
  /** Written between them, and accepted when typed. */
  readonly separator: string
  /** Also accepted while typing, because keyboards and habits differ. */
  readonly alternativeSeparators: readonly string[]
  /** What the empty field suggests, in the language of the application. */
  readonly placeholder: string
  /** The separator between hours and minutes. */
  readonly timeSeparator: string
  readonly timePlaceholder: string
}

const GERMAN: DateFormatDescriptor = {
  order: ['day', 'month', 'year'],
  separator: '.',
  alternativeSeparators: ['/', '-'],
  placeholder: 'TT.MM.JJJJ',
  timeSeparator: ':',
  timePlaceholder: 'HH:MM',
}

/** The descriptor in force. Changing this line changes every date field. */
export const dateFormat: DateFormatDescriptor = GERMAN

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * `1926-03-12` → `12.03.1926`. An empty or unreadable value formats to an
 * empty string: there is nothing to show, and inventing something is the one
 * thing a field must not do.
 */
export function formatDateDE(iso: string): string {
  const match = ISO_DATE.exec(iso.trim())
  if (!match || !isRealDate(iso.trim())) return ''

  const [, year, month, day] = match
  const parts: Record<DatePart, string> = { year: year ?? '', month: month ?? '', day: day ?? '' }

  return dateFormat.order.map((part) => parts[part]).join(dateFormat.separator)
}

export type TwoDigitYearMode =
  /**
   * 00–69 is this century, 70–99 the last one. Right for everything that
   * happened or will happen around now — a payment, a session, an invoice.
   */
  | 'nearest'
  /**
   * A two-digit year never lands in the future. Only for a date of birth,
   * which is the one field that reaches far enough back for the rule above to
   * turn dangerous: `12.3.46` typed for a patient born in 1946 would otherwise
   * become 2046, and their age would be wrong from that moment on.
   */
  | 'past'

export type ParseDateOptions = {
  twoDigitYear?: TwoDigitYearMode
  /** Only consulted for `twoDigitYear: 'past'`. A parameter so the tests do
   *  not depend on the clock. */
  now?: Date
}

/**
 * What a person typed → `YYYY-MM-DD`, or `null` when it is not a date.
 *
 * Deliberately tolerant, because the strictness belongs on the way out and not
 * under the fingers: one- or two-digit day and month, two- or four-digit year,
 * any of the accepted separators, and a bare run of digits for whoever types
 * on the number pad. `13.7.26`, `13.07.2026`, `13/7/26` and `130726` are the
 * same day.
 *
 * What it is *not* tolerant about is a day that does not exist. `31.02.2026`
 * is `null` and never the third of March — JavaScript rolls impossible
 * components over silently, and a rolled-over date is worse than a rejected
 * one because nobody sees it happen.
 */
export function parseDateDE(text: string, options: ParseDateOptions = {}): string | null {
  const parts = splitDate(text.trim())
  if (!parts) return null

  const [dayText, monthText, yearText] = parts
  const year = resolveYear(yearText, dayText, monthText, options)
  if (year === null) return null

  const iso = `${String(year).padStart(4, '0')}-${monthText.padStart(2, '0')}-${dayText.padStart(2, '0')}`
  return isRealDate(iso) ? iso : null
}

/** The three written parts, in `[day, month, year]` order whatever order the
 *  descriptor writes them in. `null` when the shape is not a date at all. */
function splitDate(text: string): [string, string, string] | null {
  if (text === '') return null

  const assign = (values: [string, string, string]): [string, string, string] => {
    const byPart = {} as Record<DatePart, string>
    dateFormat.order.forEach((part, index) => {
      byPart[part] = values[index] ?? ''
    })
    return [byPart.day, byPart.month, byPart.year]
  }

  // A bare run of digits: fixed widths, two for each of the short parts and
  // the rest for the year. `130726` and `13072026` both work.
  if (/^\d+$/.test(text)) {
    if (text.length !== 6 && text.length !== 8) return null

    let at = 0
    const values = dateFormat.order.map((part) => {
      const width = part === 'year' ? text.length - 4 : 2
      const value = text.slice(at, at + width)
      at += width
      return value
    })
    return assign(values as [string, string, string])
  }

  const separators = [dateFormat.separator, ...dateFormat.alternativeSeparators]
  const pattern = new RegExp(`[${separators.map((s) => `\\${s}`).join('')}]`)
  const written = text.split(pattern)
  if (written.length !== 3) return null
  if (!written.every((value) => /^\d{1,4}$/.test(value))) return null

  return assign(written as [string, string, string])
}

/** A written year → the year meant. Four digits are always taken at their
 *  word; two are read according to the mode. Anything else is not a year. */
function resolveYear(
  written: string,
  day: string,
  month: string,
  options: ParseDateOptions,
): number | null {
  if (/^\d{4}$/.test(written)) return Number(written)
  if (!/^\d{2}$/.test(written)) return null

  const short = Number(written)
  const nearest = short <= 69 ? 2000 + short : 1900 + short
  if (options.twoDigitYear !== 'past') return nearest

  // Past mode: step back a century rather than name a day that has not
  // happened. A four-digit year never gets here, so typing 2046 in full still
  // means 2046 (and is caught by validation elsewhere if it must not be).
  const candidate = `${nearest}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  const today = toIsoDay(options.now ?? new Date())

  return candidate > today ? nearest - 100 : nearest
}

/** The calendar day of an instant in UTC terms — only ever compared against
 *  another day string, so the hour it was taken at does not matter. */
function toIsoDay(instant: Date): string {
  return instant.toISOString().slice(0, 10)
}

/**
 * Whether `YYYY-MM-DD` names a day that exists.
 *
 * The round trip is what does the work: `Date.UTC(2026, 1, 31)` answers with
 * the third of March instead of refusing, so only comparing the result back
 * against the input catches an impossible date. Same reasoning as `parseLocal`
 * in `datetime.ts`.
 *
 * Exported for `date-format.test.ts`, which walks impossible dates one by one;
 * the parsers in this module are the callers.
 */
export function isRealDate(iso: string): boolean {
  const match = ISO_DATE.exec(iso)
  if (!match) return false

  const [, year, month, day] = match
  const stamp = Date.UTC(Number(year), Number(month) - 1, Number(day))
  return !Number.isNaN(stamp) && new Date(stamp).toISOString().slice(0, 10) === iso
}

/** `9:30` → `09:30`, and an unreadable value to an empty string. Written
 *  against the same reading as the input, so the two cannot disagree. */
export function formatTimeDE(time: string): string {
  const parsed = parseTimeDE(time)
  return parsed === null ? '' : parsed.replace(':', dateFormat.timeSeparator)
}

/**
 * What a person typed → `HH:mm`, or `null`.
 *
 * The same tolerance as the date and for the same reason: `9:5`, `9.30`,
 * `0930` and `930` are all half past nine, and `9` on its own is nine o'clock.
 * A 24-hour clock throughout — the second half of the reason this field is not
 * a native one is that an en-US browser offers AM/PM, and a session entered at
 * the wrong half of the day is an appointment nobody keeps.
 */
export function parseTimeDE(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return null

  let hourText: string
  let minuteText: string

  if (/^\d+$/.test(trimmed)) {
    if (trimmed.length <= 2) {
      hourText = trimmed
      minuteText = '0'
    } else if (trimmed.length === 3 || trimmed.length === 4) {
      hourText = trimmed.slice(0, trimmed.length - 2)
      minuteText = trimmed.slice(-2)
    } else {
      return null
    }
  } else {
    const written = trimmed.split(/[:.]/)
    if (written.length !== 2) return null
    if (!written.every((value) => /^\d{1,2}$/.test(value))) return null

    hourText = written[0] ?? ''
    minuteText = written[1] ?? ''
  }

  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (hour > 23 || minute > 59) return null

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
