import { describe, expect, it } from 'vitest'
import { buildEvent, googleEventId } from './payload.js'

/**
 * The pseudonymization promise, checked at the **assembled payload** and not
 * at whatever some mock chose to answer. If this file ever passes while a name
 * reaches Google under the pseudonymized setting, the test is worthless.
 *
 * Since migration 0036 the setting has two positions, so the promise is split
 * in two — and the **second half is the important one**: the switch may change
 * exactly one thing, the title, and nothing else about the payload may move
 * with it.
 */

const APPOINTMENT_ID = '01927b3c-4d5e-7f80-9abc-def012345678'

/** Names. Out of the payload while pseudonymizing, in the title and nowhere
 *  else once that is off. */
const NAMES = ['Testperson', 'Erika', 'Musterfirma']

/** What has no business in a Google event in **either** setting. Deliberately
 *  spelled out as strings, so the assertion is the promise and not a
 *  paraphrase of it. */
const NEVER = [
  'Erstgespräch',
  'Einzelsitzung',
  'Psychotherapie',
  'Gesprächstherapie',
  'Ausfallhonorar',
]

/** Exactly these keys, no more. A new field on the payload type has to be
 *  added here on purpose, which is the point. */
const KEYS = ['end', 'id', 'reminders', 'start', 'status', 'summary', 'transparency', 'visibility']

const source = {
  appointmentId: APPOINTMENT_ID,
  contactNumber: 42,
  contactName: 'Erika Testperson',
  pseudonymize: true,
  startsAt: new Date('2026-09-01T08:00:00.000Z'),
  endsAt: new Date('2026-09-01T09:00:00.000Z'),
  status: 'planned' as const,
}

describe('buildEvent, pseudonymized', () => {
  it('carries the contact number as the title and nothing else', () => {
    const event = buildEvent(source)

    expect(event.summary).toBe('42')
    expect(Object.keys(event).sort()).toEqual(KEYS)
  })

  it('contains no name, no service and no activity type', () => {
    const serialized = JSON.stringify(buildEvent(source))

    for (const word of [...NAMES, ...NEVER]) {
      expect(serialized).not.toContain(word)
    }
    // Nor the fields those things would travel in.
    expect(serialized).not.toContain('description')
    expect(serialized).not.toContain('attendees')
    expect(serialized).not.toContain('location')
  })
})

/**
 * The operator turned it off and carries the consequence. What is tested here
 * is not that the name goes out — that is one line — but that **only** the
 * name goes out: same keys, still no service, still no activity type, still no
 * description, and a contact-less appointment still says "Belegt".
 */
describe('buildEvent, with names', () => {
  const named = { ...source, pseudonymize: false }

  it('puts the contact name in the title', () => {
    expect(buildEvent(named).summary).toBe('Erika Testperson')
  })

  it('changes nothing else about the payload', () => {
    const event = buildEvent(named)
    const serialized = JSON.stringify(event)

    expect(Object.keys(event).sort()).toEqual(KEYS)
    for (const word of NEVER) {
      expect(serialized).not.toContain(word)
    }
    expect(serialized).not.toContain('description')
    expect(serialized).not.toContain('attendees')
    expect(serialized).not.toContain('location')

    // The switch touches the title and nothing beside it.
    expect({ ...event, summary: '' }).toEqual({ ...buildEvent(source), summary: '' })
  })
})

describe('buildEvent', () => {
  /**
   * An appointment that belongs to nobody has no contact number and no name,
   * and what goes out instead is a constant — never its own title.
   * "Teambesprechung" is harmless, "Rückruf Frau K." is not, and the
   * difference is typed by hand at 200 characters, so the payload must not be
   * able to tell them apart. This holds in **both** settings, which is why the
   * switch is asked second in `summaryFor`.
   */
  it.each([true, false])(
    'sends a constant for an appointment that belongs to nobody (pseudonymize: %s)',
    (pseudonymize) => {
      const event = buildEvent({ ...source, contactNumber: null, contactName: null, pseudonymize })

      expect(event.summary).toBe('Belegt')
      expect(JSON.stringify(event)).not.toContain('Teambesprechung')
      expect(Object.keys(event).sort()).toEqual(KEYS)
    },
  )

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
