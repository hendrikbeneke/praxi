import { describe, expect, it } from 'vitest'
import { appointmentDraftSchema, MAX_APPOINTMENT_MINUTES } from './appointment.js'

const base = {
  startsAt: '2026-08-09T07:34:00.000Z',
  status: 'planned' as const,
  title: null,
  note: null,
}

describe('appointmentDraftSchema', () => {
  it('accepts an ordinary session', () => {
    const parsed = appointmentDraftSchema.safeParse({ ...base, endsAt: '2026-08-09T08:24:00.000Z' })
    expect(parsed.success).toBe(true)
  })

  it('rejects an end before the start', () => {
    const parsed = appointmentDraftSchema.safeParse({ ...base, endsAt: '2026-08-09T07:00:00.000Z' })
    expect(parsed.success).toBe(false)
  })

  /**
   * The case that got through and blocked a week of the calendar: the end date
   * mistyped into the day segment of a `datetime-local`, which reads as a
   * perfectly valid timestamp.
   */
  it('rejects an appointment spanning several days', () => {
    const parsed = appointmentDraftSchema.safeParse({ ...base, endsAt: '2026-08-17T08:24:00.000Z' })
    expect(parsed.success).toBe(false)
  })

  it('allows exactly the maximum', () => {
    const endsAt = new Date(
      Date.parse(base.startsAt) + MAX_APPOINTMENT_MINUTES * 60_000,
    ).toISOString()

    expect(appointmentDraftSchema.safeParse({ ...base, endsAt }).success).toBe(true)
  })
})
