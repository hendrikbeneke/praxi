import { describe, expect, it } from 'vitest'
import { formatStreetLine } from './contact-address.js'
import { recipientSnapshotSchema } from './invoice.js'

describe('formatStreetLine', () => {
  it('puts the number after the street', () => {
    expect(formatStreetLine({ street: 'Musterweg', houseNumber: '12' })).toBe('Musterweg 12')
  })

  it('works with either half missing', () => {
    expect(formatStreetLine({ street: 'Musterweg', houseNumber: null })).toBe('Musterweg')
    expect(formatStreetLine({ street: null, houseNumber: '12' })).toBe('12')
  })

  it('is null when there is nothing to write', () => {
    expect(formatStreetLine({ street: null, houseNumber: null })).toBeNull()
    expect(formatStreetLine({ street: '  ', houseNumber: '' })).toBeNull()
    expect(formatStreetLine({})).toBeNull()
  })

  it('trims', () => {
    expect(formatStreetLine({ street: ' Musterweg ', houseNumber: ' 12 ' })).toBe('Musterweg 12')
  })
})

/**
 * A snapshot holds what the contact looked like at the moment of finalizing.
 *
 * **This is a statement about the model, not a concession to old rows, and it
 * does not stop being true after go-live.** The contact schema grows fields —
 * `houseNumber` is one — and every snapshot written before that simply does
 * not carry the key. Reading one has to produce the document it produced on
 * the day it was issued, which is why every field of `recipientSnapshotSchema`
 * is nullable with a default and why the address line is assembled from
 * whatever is present rather than from a fixed set of parts.
 *
 * Do not narrow this to "the parser tolerates a null" — the point is the
 * missing key, and the next field added to a contact will need it again.
 */
describe('a recipient snapshot written before a field existed', () => {
  /** Exactly what such a row holds: no `houseNumber` key at all. */
  const olderSnapshot = {
    contactNumber: 7,
    name: 'Erika Testperson',
    contactPerson: null,
    street: 'Teststraße 1',
    postalCode: '12345',
    city: 'Teststadt',
    country: 'DE',
    vatId: null,
  }

  it('still parses, with the new field empty', () => {
    const parsed = recipientSnapshotSchema.parse(olderSnapshot)
    expect(parsed.houseNumber).toBeNull()
  })

  it('renders the address line it always rendered', () => {
    const parsed = recipientSnapshotSchema.parse(olderSnapshot)
    expect(formatStreetLine(parsed)).toBe('Teststraße 1')
  })

  /** And the same holds for the raw JSON, because a snapshot read out of
   *  `jsonb` does not go through the schema on its way to the renderer. */
  it('renders the same line without being parsed at all', () => {
    expect(formatStreetLine(olderSnapshot)).toBe('Teststraße 1')
  })
})
