import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor, takePage } from './keyset.js'

const ID = '019fe362-73c4-77e4-af42-33388a5b6c5d'

describe('the cursor', () => {
  it('survives a round trip, values and nulls alike', () => {
    for (const k of ['Müller, Anna', 1042, null]) {
      expect(decodeCursor(encodeCursor({ k, i: ID }))).toEqual({ k, i: ID })
    }
  })

  /** Anything that is not a cursor this server wrote is refused rather than
   *  quietly read as "start from the top" — a client asking for a page it
   *  cannot get should hear so. */
  it('refuses what it did not write', () => {
    expect(decodeCursor('not base64 at all!')).toBeNull()
    expect(decodeCursor(Buffer.from('{"k":1}', 'utf8').toString('base64url'))).toBeNull()
    expect(decodeCursor(Buffer.from('[]', 'utf8').toString('base64url'))).toBeNull()
    expect(decodeCursor(Buffer.from('{"k":1,"i":"nope"}', 'utf8').toString('base64url'))).toBeNull()
  })
})

describe('takePage', () => {
  const rows = [
    { id: '1', name: 'a' },
    { id: '2', name: 'b' },
    { id: '3', name: 'c' },
  ]
  const keyOf = (row: { id: string; name: string }) => ({ k: row.name, i: ID })

  /** The extra row is how "is there more" is answered without a second count.
   *  It is fetched, never returned. */
  it('keeps the limit and hands back a cursor when one row too many arrived', () => {
    const page = takePage(rows, 2, keyOf)
    expect(page.items.map((row) => row.id)).toEqual(['1', '2'])
    expect(page.nextCursor).not.toBeNull()
    expect(decodeCursor(page.nextCursor ?? '')).toEqual({ k: 'b', i: ID })
  })

  it('says there is no next page when the extra row did not arrive', () => {
    expect(takePage(rows, 3, keyOf).nextCursor).toBeNull()
    expect(takePage([], 3, keyOf)).toEqual({ items: [], nextCursor: null })
  })
})
