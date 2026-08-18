import { describe, expect, it } from 'vitest'
import { countries, countryName } from './country.js'

describe('countryName', () => {
  it('resolves a known code to its German name', () => {
    expect(countryName('DE')).toBe('Deutschland')
    expect(countryName('AT')).toBe('Österreich')
  })

  /**
   * An invoice's `recipient_snapshot` keeps whatever the contact's country was
   * when the document was finalized, and a finalized document has to keep
   * rendering what it rendered then. So an unknown code comes back as itself:
   * printing "XK" is honest, printing "—" would drop an address line the paper
   * original carries.
   */
  it('gives back an unknown code unchanged', () => {
    expect(countryName('XK')).toBe('XK')
    expect(countryName('')).toBe('')
  })

  it('has no duplicate codes', () => {
    expect(new Set(countries.map((entry) => entry.code)).size).toBe(countries.length)
  })
})
