import { DEFAULT_EVENT_TITLE_TEMPLATE } from '@praxi/shared'
import { describe, expect, it } from 'vitest'
import { buildEvent, EmptyEventTitleError, googleEventId } from './payload.js'

/**
 * What Google is told, checked at the **assembled payload** and not at
 * whatever some mock chose to answer.
 *
 * B1 turned the title from a boolean — contact number or name — into a
 * template, and this file changed shape with it. What it gave up is one
 * sentence: it used to assert that the word "Erstgespräch" never appears
 * anywhere in a payload, and the practice can now ask for exactly that. What
 * it gained is three assertions that are harder to satisfy by accident:
 *
 *   1. **The template governs the title and nothing else.** Asserted across a
 *      matrix of templates including hostile ones, by blanking `summary` and
 *      demanding the rest be identical. That is the promise the boolean's
 *      version made for two settings; it now holds for any string.
 *   2. **The placeholder set is closed.** A test walks
 *      `eventTitlePlaceholders` and pins each to the field it draws from, so a
 *      new placeholder without an entry here fails. And an unknown name
 *      resolves to nothing rather than reaching for a field by luck.
 *   3. **The default is the contact number.** A practice that connects and
 *      configures nothing sends digits.
 */

const APPOINTMENT_ID = '01927b3c-4d5e-7f80-9abc-def012345678'

/** Exactly these keys, no more. A new field on the payload type has to be
 *  added here on purpose, which is the point. */
const KEYS = ['end', 'id', 'reminders', 'start', 'status', 'summary', 'transparency', 'visibility']

const source = {
  appointmentId: APPOINTMENT_ID,
  contactNumber: 42,
  contactName: 'Erika Testperson',
  activityType: 'Erstgespräch',
  activityTitle: 'Verlaufsgespräch',
  appointmentTitle: 'Rückruf Frau K.',
  titleTemplate: DEFAULT_EVENT_TITLE_TEMPLATE,
  startsAt: new Date('2026-09-01T08:00:00.000Z'),
  endsAt: new Date('2026-09-01T09:00:00.000Z'),
  status: 'planned' as const,
}

/**
 * The templates every structural assertion runs over — the harmless, the
 * maximal, and one that asks for everything at once. If a payload property is
 * supposed to hold "whatever the practice configures", it has to hold for the
 * worst thing the practice can configure.
 */
const TEMPLATES = [
  DEFAULT_EVENT_TITLE_TEMPLATE,
  '{{contactName}}',
  '{{contactNumber}} — {{activityType}}',
  '{{contactName}} — {{activityType}} — {{activityTitle}}',
  '{{activityTitle | appointmentTitle}}',
  'Praxis {{contactNumber}}/{{contactName}}/{{activityType}}/{{appointmentTitle}}',
]

describe('the default', () => {
  /** A practice that connects and never opens the setting sends digits. */
  it('is the contact number and nothing else', () => {
    expect(buildEvent(source).summary).toBe('42')
  })
})

describe('the template governs the title and nothing else', () => {
  it.each(TEMPLATES)('leaves the rest of the payload untouched: %s', (titleTemplate) => {
    const event = buildEvent({ ...source, titleTemplate })

    expect(Object.keys(event).sort()).toEqual(KEYS)
    // The one assertion that carries the whole promise: blank the title and
    // every template produces the identical event.
    expect({ ...event, summary: '' }).toEqual({ ...buildEvent(source), summary: '' })
  })

  it.each(TEMPLATES)('carries no field a title could hide in: %s', (titleTemplate) => {
    const serialized = JSON.stringify(buildEvent({ ...source, titleTemplate }))

    expect(serialized).not.toContain('description')
    expect(serialized).not.toContain('attendees')
    expect(serialized).not.toContain('location')
    expect(serialized).not.toContain('conferenceData')
  })
})

/**
 * The set is closed, and this is what makes that a property rather than a
 * hope: every placeholder is pinned to the field it draws from, so adding one
 * to `eventTitlePlaceholders` without adding it here fails the suite.
 */
describe('the placeholders', () => {
  const cases: [string, string][] = [
    ['{{contactNumber}}', '42'],
    ['{{contactName}}', 'Erika Testperson'],
    ['{{activityType}}', 'Erstgespräch'],
    ['{{activityTitle}}', 'Verlaufsgespräch'],
    ['{{appointmentTitle}}', 'Rückruf Frau K.'],
  ]

  it.each(cases)('%s resolves to its own field', (titleTemplate, expected) => {
    expect(buildEvent({ ...source, titleTemplate }).summary).toBe(expected)
  })

  /**
   * A name outside the set reaches nothing. It cannot arrive here — the route
   * refuses it when the template is saved — and this asserts the second lock:
   * even if one did, it resolves to emptiness rather than to a field it
   * happens to resemble.
   */
  it('resolve nothing for a name outside the set', () => {
    expect(() => buildEvent({ ...source, titleTemplate: '{{diagnose}}' })).toThrow(
      EmptyEventTitleError,
    )
    expect(buildEvent({ ...source, titleTemplate: '{{contactNumber}} {{diagnose}}' }).summary).toBe(
      '42',
    )
  })

  /** The chain: first name with a value wins, and a Vorgang's own title beats
   *  the appointment's where both exist. */
  it('take the first of a chain that has a value', () => {
    const chain = '{{activityTitle | appointmentTitle}}'

    expect(buildEvent({ ...source, titleTemplate: chain }).summary).toBe('Verlaufsgespräch')
    expect(buildEvent({ ...source, titleTemplate: chain, activityTitle: null }).summary).toBe(
      'Rückruf Frau K.',
    )
  })
})

describe('an appointment that belongs to nobody', () => {
  const bare = {
    ...source,
    contactNumber: null,
    contactName: null,
    activityType: null,
    activityTitle: null,
    appointmentTitle: 'Teambesprechung mit Frau K.',
  }

  /**
   * A constant, whatever the template says — asked before the template is
   * looked at. The appointment's own title is typed by the practitioner at 200
   * characters, and "Rückruf Frau K." is exactly the sentence rule 13 exists
   * to keep out of Google. A busy block with no content at all is all a
   * projection owes anyone.
   */
  it.each(TEMPLATES)('says "Belegt" and nothing of its own: %s', (titleTemplate) => {
    const event = buildEvent({ ...bare, titleTemplate })

    expect(event.summary).toBe('Belegt')
    expect(JSON.stringify(event)).not.toContain('Teambesprechung')
    expect(JSON.stringify(event)).not.toContain('Frau K.')
    expect(Object.keys(event).sort()).toEqual(KEYS)
  })
})

/**
 * A template can be valid and still come out with nothing for one particular
 * appointment. Google would then draw the block as "(kein Titel)" — a
 * projection quietly saying nothing, which is the worst failure here because
 * the calendar still looks fine. Throwing puts the row in the outbox with an
 * error the settings screen shows.
 */
describe('a title that comes out empty', () => {
  it('refuses to send rather than sending nothing', () => {
    expect(() =>
      buildEvent({ ...source, titleTemplate: '{{activityTitle}}', activityTitle: null }),
    ).toThrow(EmptyEventTitleError)
  })

  /** Separators alone are not a title either — "42 — " must not go out as a
   *  dangling dash, and where the number is there it must. */
  it('drops separators left dangling by a missing value', () => {
    const titleTemplate = '{{contactNumber}} — {{activityType}}'

    expect(buildEvent({ ...source, titleTemplate }).summary).toBe('42 — Erstgespräch')
    expect(buildEvent({ ...source, titleTemplate, activityType: null }).summary).toBe('42')
  })
})

describe('buildEvent', () => {
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
