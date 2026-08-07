import { describe, expect, it } from 'vitest'
import { healthResponseSchema } from './health.js'

describe('healthResponseSchema', () => {
  it('accepts a UTC timestamp', () => {
    const parsed = healthResponseSchema.parse({
      status: 'ok',
      time: '2026-01-01T12:00:00.000Z',
    })
    expect(parsed.status).toBe('ok')
  })

  it('rejects a timestamp without a zone', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      time: '2026-01-01 12:00:00',
    })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown status', () => {
    const result = healthResponseSchema.safeParse({
      status: 'degraded',
      time: '2026-01-01T12:00:00.000Z',
    })
    expect(result.success).toBe(false)
  })
})
