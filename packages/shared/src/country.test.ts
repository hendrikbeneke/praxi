import { describe, expect, it } from 'vitest'
import { countryCodes, countryName, searchCountries } from './country.js'

describe('countryName', () => {
  it('resolves a code to its German name', () => {
    expect(countryName('DE')).toBe('Deutschland')
    expect(countryName('AT')).toBe('Österreich')
    expect(countryName('DK')).toBe('Dänemark')
  })

  /**
   * An invoice's `recipient_snapshot` keeps whatever the contact's country was
   * when the document was finalized, and a finalized document has to keep
   * rendering what it rendered then. So an unknown code comes back as itself:
   * printing "XK" is honest, printing "—" would drop an address line the paper
   * original carries.
   */
  it('gives back an unknown code unchanged', () => {
    // QQ is user-assigned and ICU has no name for it. Not XK — Kosovo has one,
    // which is worth knowing before writing a test around "unknown".
    expect(countryName('QQ')).toBe('QQ')
    expect(countryName('')).toBe('')
    expect(countryName('Deutschland')).toBe('Deutschland')
  })

  it('has no duplicate codes and resolves every one of them', () => {
    expect(new Set(countryCodes).size).toBe(countryCodes.length)
    // Every code has a name that is not just the code echoed back. Catches a
    // typo in the list, which would otherwise surface as a picker entry
    // reading "XZ".
    const unresolved = countryCodes.filter((code) => countryName(code) === code)
    expect(unresolved).toEqual([])
  })
})

describe('searchCountries', () => {
  it('finds by name and by code', () => {
    expect(searchCountries('Däne')).toContain('DK')
    expect(searchCountries('dk')).toContain('DK')
  })

  it('puts a name that starts with the term before one that merely contains it', () => {
    // Italien starts with it, Litauen only contains it.
    const hits = searchCountries('ita')
    expect(hits.indexOf('IT')).toBeLessThan(hits.indexOf('LT'))
  })

  it('answers nothing for an empty term rather than the whole world', () => {
    expect(searchCountries('')).toEqual([])
    expect(searchCountries('   ')).toEqual([])
  })

  it('keeps the list short enough to render without scrolling', () => {
    expect(searchCountries('a').length).toBeLessThanOrEqual(8)
  })
})
