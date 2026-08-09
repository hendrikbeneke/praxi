import { describe, expect, it } from 'vitest'
import { relationLabel, relationOptions } from './contact-relation.js'

/** The seeded types, reduced to what the label helpers read. */
const guardian = {
  code: 'guardian',
  labelForward: 'Sorgeberechtigt',
  labelInverse: 'Sorgeberechtigt für',
  isSymmetric: false,
}

const spouse = {
  code: 'spouse_of',
  labelForward: 'Ehepartner von',
  labelInverse: null,
  isSymmetric: true,
}

describe('relationLabel', () => {
  it('reads the forward label from the `from` end', () => {
    expect(relationLabel(guardian, 'forward')).toBe('Sorgeberechtigt')
  })

  it('reads the inverse label from the `to` end', () => {
    expect(relationLabel(guardian, 'inverse')).toBe('Sorgeberechtigt für')
  })

  it('uses the forward label on both ends of a symmetric type', () => {
    expect(relationLabel(spouse, 'forward')).toBe('Ehepartner von')
    expect(relationLabel(spouse, 'inverse')).toBe('Ehepartner von')
  })
})

describe('relationOptions', () => {
  it('offers a directed type from both sides and a symmetric one once', () => {
    expect(relationOptions([guardian, spouse])).toEqual([
      { code: 'guardian', direction: 'forward', label: 'Sorgeberechtigt' },
      { code: 'guardian', direction: 'inverse', label: 'Sorgeberechtigt für' },
      { code: 'spouse_of', direction: 'forward', label: 'Ehepartner von' },
    ])
  })

  it('keeps the order it is given, so the caller decides it', () => {
    expect(relationOptions([spouse, guardian]).map((option) => option.code)).toEqual([
      'spouse_of',
      'guardian',
      'guardian',
    ])
  })
})
