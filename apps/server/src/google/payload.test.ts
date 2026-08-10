import { describe, expect, it } from 'vitest'
import { buildEvent, googleEventId } from './payload.js'

/**
 * The pseudonymization promise, checked at the **assembled payload** and not
 * at whatever some mock chose to answer. If this file ever passes while a name
 * reaches Google, the test is worthless.
 */

const APPOINTMENT_ID = '01927b3c-4d5e-7f80-9abc-def012345678'

/** Everything that must never leave the house. Deliberately spelled out as
 *  strings, so the assertion is the promise and not a paraphrase of it. */
const FORBIDDEN = [
  'Testperson',
  'Erika',
  'Musterfirma',
  'Erstgespräch',
  'Einzelsitzung',
  'Psychotherapie',
  'Gesprächstherapie',
  'Ausfallhonorar',
]

const source = {
  appointmentId: APPOINTMENT_ID,
  contactNumber: 42,
  startsAt: new Date('2026-09-01T08:00:00.000Z'),
  endsAt: new Date('2026-09-01T09:00:00.000Z'),
  status: 'planned' as const,
}

describe('buildEvent', () => {
  it('carries the contact number as the title and nothing else', () => {
    const event = buildEvent(source)

    expect(event.summary).toBe('42')
    // Exactly these keys, no more. A new field on the payload type has to be
    // added here on purpose, which is the point.
    expect(Object.keys(event).sort()).toEqual([
      'end',
      'id',
      'reminders',
      'start',
      'status',
      'summary',
      'transparency',
      'visibility',
    ])
  })

  it('contains no name, no service and no activity type', () => {
    const serialized = JSON.stringify(buildEvent(source))

    for (const word of FORBIDDEN) {
      expect(serialized).not.toContain(word)
    }
    // Nor the fields those things would travel in.
    expect(serialized).not.toContain('description')
    expect(serialized).not.toContain('attendees')
    expect(serialized).not.toContain('location')
  })

  it('says confirmed while the slot is occupied and cancelled once it is free', () => {
    expect(buildEvent({ ...source, status: 'planned' }).status).toBe('confirmed')
    expect(buildEvent({ ...source, status: 'confirmed' }).status).toBe('confirmed')
    expect(buildEvent({ ...source, status: 'requested' }).status).toBe('confirmed')
    // Both releasing statuses free the time in Google too — as a cancelled
    // event, not as a deletion, so the id stays valid for a revival.
    expect(buildEvent({ ...source, status: 'cancelled' }).status).toBe('cancelled')
    expect(buildEvent({ ...source, status: 'cancelled_late' }).status).toBe('cancelled')
  })

  it('sends the times in UTC', () => {
    const event = buildEvent(source)
    expect(event.start.dateTime).toBe('2026-09-01T08:00:00.000Z')
    expect(event.end.dateTime).toBe('2026-09-01T09:00:00.000Z')
  })
})

describe('googleEventId', () => {
  it('is derived from the appointment id and therefore stable', () => {
    expect(googleEventId(APPOINTMENT_ID)).toBe(googleEventId(APPOINTMENT_ID))
    expect(googleEventId(APPOINTMENT_ID)).not.toBe(
      googleEventId('01927b3c-4d5e-7f80-9abc-def012345679'),
    )
  })

  it('uses only characters Google accepts for an event id', () => {
    // base32hex, lower case: a-v and 0-9, at least five characters.
    expect(googleEventId(APPOINTMENT_ID)).toMatch(/^[0-9a-v]{26}$/)
  })
})
