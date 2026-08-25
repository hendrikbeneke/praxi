import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EVENT_TITLE_TEMPLATE,
  type EventTitleValues,
  eventTitlePlaceholders,
  eventTitleTemplateSchema,
  isEmptyEventTitleTemplate,
  resolveEventTitle,
  unknownEventTitlePlaceholders,
} from './google-event-title.js'

/**
 * The resolver, tested here because it is shared: the settings preview and the
 * push both call it, and what makes "what you saw is what Google gets" true is
 * that there is only one of it.
 *
 * What the *payload* may contain is asserted one layer up, in
 * `apps/server/src/google/payload.test.ts`. This file is about the string.
 */

const FULL: EventTitleValues = {
  contactNumber: 42,
  contactName: 'Testperson, Erika',
  activityType: 'Erstgespräch',
  activityTitle: 'Verlaufsgespräch',
  appointmentTitle: 'Rückruf',
}

const EMPTY: EventTitleValues = {
  contactNumber: null,
  contactName: null,
  activityType: null,
  activityTitle: null,
  appointmentTitle: null,
}

describe('resolveEventTitle', () => {
  it('fills every placeholder from its own field', () => {
    expect(resolveEventTitle('{{contactNumber}}', FULL)).toBe('42')
    expect(resolveEventTitle('{{contactName}}', FULL)).toBe('Testperson, Erika')
    expect(resolveEventTitle('{{activityType}}', FULL)).toBe('Erstgespräch')
    expect(resolveEventTitle('{{activityTitle}}', FULL)).toBe('Verlaufsgespräch')
    expect(resolveEventTitle('{{appointmentTitle}}', FULL)).toBe('Rückruf')
  })

  it('keeps the literal text between them', () => {
    expect(resolveEventTitle('Praxis {{contactNumber}}: {{activityType}}', FULL)).toBe(
      'Praxis 42: Erstgespräch',
    )
  })

  /**
   * The separator between two placeholders is punctuation, not content. Left
   * standing it produces "42 — ", which reads as a title someone forgot to
   * finish rather than as a type this appointment does not have.
   */
  it('drops a separator left dangling by a missing value', () => {
    const template = '{{contactNumber}} — {{activityType}}'

    expect(resolveEventTitle(template, { ...FULL, activityType: null })).toBe('42')
    expect(resolveEventTitle(template, { ...FULL, contactNumber: null })).toBe('Erstgespräch')
    expect(
      resolveEventTitle('{{contactNumber}} · {{activityType}} · {{activityTitle}}', {
        ...FULL,
        activityType: null,
      }),
    ).toBe('42 · Verlaufsgespräch')
  })

  /**
   * The chain. It exists because the two title fields are alternatives rather
   * than additions: an appointment with a Vorgang carries `activityTitle`, a
   * free-standing one carries `appointmentTitle`, and "the title, wherever it
   * lives" would otherwise not be expressible.
   */
  it('takes the first name in a chain that has a value', () => {
    const template = '{{activityTitle | appointmentTitle}}'

    expect(resolveEventTitle(template, FULL)).toBe('Verlaufsgespräch')
    expect(resolveEventTitle(template, { ...FULL, activityTitle: null })).toBe('Rückruf')
    expect(resolveEventTitle(template, EMPTY)).toBe('')
  })

  it('tolerates whitespace inside the braces', () => {
    expect(resolveEventTitle('{{ contactNumber }}', FULL)).toBe('42')
    expect(resolveEventTitle('{{ activityTitle  |  appointmentTitle }}', FULL)).toBe(
      'Verlaufsgespräch',
    )
  })

  /**
   * Emptiness is reported, not papered over. `buildEvent` turns it into a
   * refusal — Google would draw "(kein Titel)" — and the settings preview
   * shows it so the practitioner meets it before the calendar does.
   */
  it('comes out empty when nothing is left', () => {
    expect(resolveEventTitle('{{contactName}}', EMPTY)).toBe('')
    expect(resolveEventTitle('{{contactNumber}} — {{activityType}}', EMPTY)).toBe('')
  })

  /** A name outside the set resolves to nothing rather than to a field it
   *  happens to resemble. It cannot get this far — the schema refuses it —
   *  and this is the second lock. */
  it('resolves an unknown name to nothing', () => {
    expect(resolveEventTitle('{{contactNumber}} {{diagnose}}', FULL)).toBe('42')
  })
})

describe('the placeholder set', () => {
  /** Walks the exported list, so a placeholder added without a value in
   *  `fieldValue` shows up as an empty resolution here rather than in Google. */
  it.each(eventTitlePlaceholders)('%s is known and resolves', (name) => {
    expect(unknownEventTitlePlaceholders(`{{${name}}}`)).toEqual([])
    expect(resolveEventTitle(`{{${name}}}`, FULL)).not.toBe('')
  })

  it('names what it does not know, in the braces and in a chain', () => {
    expect(unknownEventTitlePlaceholders('{{diagnose}}')).toEqual(['diagnose'])
    expect(unknownEventTitlePlaceholders('{{activityTitle | diagnose}}')).toEqual(['diagnose'])
    expect(unknownEventTitlePlaceholders('{{contactNumber}} {{contactName}}')).toEqual([])
  })
})

describe('eventTitleTemplateSchema', () => {
  it('accepts the default and the ordinary combinations', () => {
    for (const template of [
      DEFAULT_EVENT_TITLE_TEMPLATE,
      '{{contactName}}',
      '{{contactNumber}} — {{activityType}}',
      '{{activityTitle | appointmentTitle}}',
      'Praxis {{contactNumber}}',
    ]) {
      expect(eventTitleTemplateSchema.safeParse(template).success).toBe(true)
    }
  })

  /**
   * The refusal that matters: an unknown name is rejected **on the way in**.
   * The mail templates do the opposite and leave `{{kontonummer}}` standing
   * for the sender to see, and the difference is who reads the result — a mail
   * is looked at once before it goes, a calendar title is written by a
   * background worker to a third party and never read again.
   */
  it('refuses a placeholder outside the set', () => {
    expect(eventTitleTemplateSchema.safeParse('{{diagnose}}').success).toBe(false)
    expect(eventTitleTemplateSchema.safeParse('{{contactNumber}} {{diagnose}}').success).toBe(false)
  })

  /** A template that can never produce anything is a setting that would break
   *  every push from then on, so it is not saveable. */
  it('refuses a template that is only punctuation', () => {
    expect(eventTitleTemplateSchema.safeParse(' — ').success).toBe(false)
    expect(eventTitleTemplateSchema.safeParse('').success).toBe(false)
    expect(isEmptyEventTitleTemplate('{{contactNumber}}')).toBe(false)
    expect(isEmptyEventTitleTemplate(' · ')).toBe(true)
  })

  /**
   * A template that merely *can* come out empty is allowed. Whether
   * `{{activityTitle}}` is a good idea depends on how this practice titles its
   * activities, which is a judgement about their data and not about the
   * string; the preview beside the field is where that shows.
   */
  it('allows a template that only sometimes has a value', () => {
    expect(eventTitleTemplateSchema.safeParse('{{activityTitle}}').success).toBe(true)
  })

  it('refuses one longer than the column holds', () => {
    expect(eventTitleTemplateSchema.safeParse(`Praxis ${'x'.repeat(200)}`).success).toBe(false)
  })
})
