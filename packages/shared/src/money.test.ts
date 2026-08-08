import { describe, expect, it } from 'vitest'
import { formatEuro, formatEuroAmount, parseEuroAmount } from './money.js'

describe('formatEuro', () => {
  it('writes amounts the German way', () => {
    // Non-breaking narrow space before the sign, as Intl produces it.
    expect(formatEuro(9000).replace(/ | /g, ' ')).toBe('90,00 €')
    expect(formatEuro(123456).replace(/ | /g, ' ')).toBe('1.234,56 €')
    expect(formatEuro(0).replace(/ | /g, ' ')).toBe('0,00 €')
  })

  it('formats without a symbol for input fields', () => {
    expect(formatEuroAmount(9000)).toBe('90,00')
    expect(formatEuroAmount(123456)).toBe('1.234,56')
  })
})

describe('parseEuroAmount', () => {
  it('reads what a German keyboard produces', () => {
    expect(parseEuroAmount('80')).toBe(8000)
    expect(parseEuroAmount('80,5')).toBe(8050)
    expect(parseEuroAmount('80,50')).toBe(8050)
    expect(parseEuroAmount('1.234,56')).toBe(123456)
    expect(parseEuroAmount('0')).toBe(0)
  })

  it('tolerates spaces and a pasted currency symbol', () => {
    expect(parseEuroAmount('  90,00 € ')).toBe(9000)
    expect(parseEuroAmount('1 234,56')).toBe(123456)
  })

  it('reads pasted English notation', () => {
    expect(parseEuroAmount('80.50')).toBe(8050)
    expect(parseEuroAmount('1,234.56')).toBe(123456)
  })

  /**
   * The one genuinely ambiguous case. `1.234` is thousands grouping in German
   * and would be a decimal point in English — three digits behind a lone dot
   * decides it, because `1.23` and `1.2345` are not valid grouping.
   */
  it('reads a lone dot with three digits as thousands grouping', () => {
    expect(parseEuroAmount('1.234')).toBe(123400)
    expect(parseEuroAmount('1.23')).toBe(123)
    // Not grouping, so a decimal point — and 1.2345 € rounds to 123 cents.
    expect(parseEuroAmount('1.2345')).toBe(123)
  })

  it('rounds to whole cents rather than carrying a float', () => {
    expect(parseEuroAmount('0,105')).toBe(11)
    expect(parseEuroAmount('19,99')).toBe(1999)
    expect(Number.isInteger(parseEuroAmount('0,07'))).toBe(true)
  })

  it('reads negative amounts', () => {
    expect(parseEuroAmount('-12,50')).toBe(-1250)
  })

  it('returns null instead of guessing', () => {
    expect(parseEuroAmount('')).toBeNull()
    expect(parseEuroAmount('   ')).toBeNull()
    expect(parseEuroAmount('achtzig')).toBeNull()
    expect(parseEuroAmount('80,00,00')).toBeNull()
    expect(parseEuroAmount('12a')).toBeNull()
    expect(parseEuroAmount(',')).toBeNull()
  })
})
