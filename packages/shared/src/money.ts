/**
 * Money is integer cents everywhere (CLAUDE.md rule 2). These two functions
 * are the only places it turns into text and back.
 *
 * They live in `packages/shared` rather than in the frontend because the
 * invoice PDF in slice 6 formats the same amounts on the server, and a
 * printed invoice must not read differently from the screen it was checked on.
 */

const euroFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

export function formatEuro(cents: number): string {
  return euroFormat.format(cents / 100)
}

/** Without the currency symbol — for input fields, which get their € from a
 *  label rather than from the value. */
const plainFormat = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatEuroAmount(cents: number): string {
  return plainFormat.format(cents / 100)
}

/**
 * Reads what a German keyboard produces: `80`, `80,5`, `80,50`, `1.234,56`,
 * and — because people paste — `1234.56` and `80.50`.
 *
 * Returns `null` for anything it cannot read, so the caller decides what an
 * invalid amount means. Never guesses: `1.234` is one thousand two hundred
 * thirty-four, `1,234` is not a valid amount at all.
 */
export function parseEuroAmount(input: string): number | null {
  const trimmed = input.trim().replace(/\s|€/g, '')
  if (trimmed === '') return null

  const negative = trimmed.startsWith('-')
  const digits = negative ? trimmed.slice(1) : trimmed
  if (!/^[\d.,]+$/.test(digits)) return null

  const lastComma = digits.lastIndexOf(',')
  const lastDot = digits.lastIndexOf('.')

  let normalized: string
  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: the rightmost one is the decimal separator, the other
    // groups thousands. "1.234,56" and "1,234.56" both work.
    const decimalAt = Math.max(lastComma, lastDot)
    const groupingChar = decimalAt === lastComma ? '.' : ','
    normalized = `${digits.slice(0, decimalAt).replaceAll(groupingChar, '')}.${digits.slice(decimalAt + 1)}`
  } else if (lastComma >= 0) {
    // A comma is always the decimal separator in German.
    normalized = digits.replace(',', '.')
  } else if (lastDot >= 0) {
    // A lone dot is ambiguous. Exactly three digits behind it is thousands
    // grouping ("1.234"); anything else is a pasted decimal point ("80.5").
    const fraction = digits.slice(lastDot + 1)
    normalized = fraction.length === 3 ? digits.replaceAll('.', '') : digits
  } else {
    normalized = digits
  }

  // A second separator of the same kind, or a stray one, survives to here.
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null

  const value = Number(normalized)
  if (!Number.isFinite(value)) return null

  const cents = Math.round(value * 100)
  return negative ? -cents : cents
}
