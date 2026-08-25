import { z } from 'zod'

/**
 * The title of a Google Calendar event, as a template (B1).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE TITLE IS ALL GOOGLE EVER LEARNS. Read that before changing anything
 * here.
 *
 * An event carries two times, one bit of status, and this string. There is no
 * description, no participant, no location, no service and no activity type
 * anywhere else in the payload — `buildEvent` in `apps/server/src/google/
 * payload.ts` lists every field it sends, and its test asserts the key set.
 * So whatever a template can produce is the *entire* content of the
 * projection, and the set of placeholders below is therefore the set of things
 * that can leave this practice at all.
 *
 * It replaces the `pseudonymize` boolean of migration 0036, which had two
 * settings — contact number or name — and no way to say "number and kind of
 * appointment". The default is `{{contactNumber}}`, which is exactly what the
 * boolean's protected position produced, and the row holding it is deleted
 * when the connection is taken apart, so a new grant starts there again.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * The closed set. A placeholder that is not in this list is refused when the
 * template is saved — see `unknownEventTitlePlaceholders` — rather than
 * travelling to Google as literal `{{diagnose}}`, which is the difference
 * between a typo and a disclosure.
 *
 * English identifiers, like the mail templates' `{{number}}` and `{{name}}`:
 * they are written by the practitioner but they are identifiers, and CLAUDE.md
 * keeps those English throughout.
 */
export const eventTitlePlaceholders = [
  'contactNumber',
  'contactName',
  'activityType',
  'activityTitle',
  'appointmentTitle',
] as const

export type EventTitlePlaceholder = (typeof eventTitlePlaceholders)[number]

/**
 * What a template may draw on. Every field is nullable because every one of
 * them can genuinely be absent: an appointment without an activity has no
 * type and no activity title, and one entered as a bare blocker has neither
 * a number nor a name.
 */
export type EventTitleValues = {
  contactNumber: number | null
  contactName: string | null
  activityType: string | null
  activityTitle: string | null
  appointmentTitle: string | null
}

/**
 * `{{a}}` or `{{a | b}}` — a chain of names, first one with a value wins.
 *
 * The chain exists because the two title fields are alternatives rather than
 * additions: an appointment that belongs to an activity carries
 * `activityTitle` and usually no `appointmentTitle`, and a free-standing one
 * carries only the latter. `{{activityTitle | appointmentTitle}}` says "the
 * title, wherever it lives" in one placeholder instead of forcing a choice
 * that is wrong half the time.
 */
const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*(?:\s*\|\s*[a-zA-Z][a-zA-Z0-9]*)*)\s*\}\}/g

function names(expression: string): string[] {
  return expression.split('|').map((name) => name.trim())
}

function fieldValue(name: string, values: EventTitleValues): string {
  switch (name) {
    case 'contactNumber':
      return values.contactNumber === null ? '' : String(values.contactNumber)
    case 'contactName':
      return values.contactName ?? ''
    case 'activityType':
      return values.activityType ?? ''
    case 'activityTitle':
      return values.activityTitle ?? ''
    case 'appointmentTitle':
      return values.appointmentTitle ?? ''
    default:
      return ''
  }
}

/**
 * Every name in the template that is not one of the known ones.
 *
 * Read at **save time**, where an unknown name is refused. The mail templates
 * do the opposite — they leave `{{kontonummer}}` standing and point at it in
 * the send dialog — and the difference is who sees the result: a mail is read
 * once by its recipient before it goes out, while a calendar title is written
 * by a background worker to a third party and nobody looks at it again.
 */
export function unknownEventTitlePlaceholders(template: string): string[] {
  const found = new Set<string>()
  for (const match of template.matchAll(PLACEHOLDER)) {
    for (const name of names(match[1] ?? '')) {
      if (!eventTitlePlaceholders.includes(name as EventTitlePlaceholder)) found.add(name)
    }
  }
  return [...found]
}

/**
 * The characters a template puts *between* its placeholders. A dash between
 * two names is punctuation; on its own it is not a title.
 */
const SEPARATORS = '\\s\\-–—·,;:|/'
const ONLY_SEPARATORS = new RegExp(`^[${SEPARATORS}]*$`)

/**
 * The template, filled in.
 *
 * **Resolved piece by piece rather than by replacing in the string**, and that
 * is not fussiness: a separator belongs to the two things it sits between, so
 * when one of them turns out to be empty the separator has to go with it.
 * `{{contactNumber}} · {{activityType}} · {{activityTitle}}` on an appointment
 * whose type is missing has to come out "42 · Verlaufsgespräch", not
 * "42 · · Verlaufsgespräch" — and a `replace` over the whole string cannot
 * know that, because by the time it has written the second separator the value
 * between them is already gone.
 *
 * So a separator-only literal is held back until something after it needs it.
 * A leading one is never emitted, because nothing precedes it; a trailing one
 * never gets its turn.
 *
 * Returns `''` when nothing is left — deliberately, and the callers do
 * different things with it. `buildEvent` refuses to send an empty title,
 * because Google would show "(kein Titel)" and a projection that silently says
 * nothing is worse than one that fails loudly. The settings preview shows the
 * same emptiness so the practitioner meets it before the calendar does.
 */
export function resolveEventTitle(template: string, values: EventTitleValues): string {
  let out = ''
  /** A separator seen but not yet earned by anything after it. */
  let pending = ''
  let index = 0

  const emit = (piece: string) => {
    if (piece === '') return
    if (out !== '') out += pending
    pending = ''
    out += piece
  }

  for (const match of template.matchAll(PLACEHOLDER)) {
    const literal = template.slice(index, match.index)
    index = (match.index ?? 0) + match[0].length

    if (ONLY_SEPARATORS.test(literal)) pending = literal
    else emit(literal)

    let value = ''
    for (const name of names(match[1] ?? '')) {
      value = fieldValue(name, values).trim()
      if (value !== '') break
    }
    emit(value)
  }

  const tail = template.slice(index)
  if (!ONLY_SEPARATORS.test(tail)) emit(tail)

  return out.replace(/\s+/g, ' ').trim()
}

/**
 * A template that resolves to nothing for **every** appointment — one that is
 * empty or only punctuation. Refused when saved: it is not a title, it is a
 * setting that would break every push from then on.
 *
 * A template that merely *can* come out empty — `{{activityTitle}}` on a
 * practice that rarely titles its activities — is a different thing and is
 * allowed. That is a judgement about this practice's data, not about the
 * string, and the preview beside the field is where it shows. So the question
 * asked here is whether the template has *any* placeholder or any literal text
 * of its own, not whether it happens to produce something today.
 */
export function isEmptyEventTitleTemplate(template: string): boolean {
  const hasPlaceholder = [...template.matchAll(PLACEHOLDER)].length > 0
  const literalText = template.replace(PLACEHOLDER, '')
  return !hasPlaceholder && ONLY_SEPARATORS.test(literalText)
}

/**
 * The template as a stored value. Length-capped at 200 to match the check
 * constraint; Google's own limit is far higher, but a calendar block shows a
 * few dozen characters and the rest is only ballast travelling to a third
 * party.
 */
export const eventTitleTemplateSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((template) => unknownEventTitlePlaceholders(template).length === 0, {
    message: 'unknown placeholder',
  })
  .refine((template) => !isEmptyEventTitleTemplate(template), { message: 'empty title' })

export const googleEventTitleSchema = z.object({ eventTitleTemplate: eventTitleTemplateSchema })

/** What a fresh connection starts on: the contact number and nothing else,
 *  which is what `pseudonymize = true` produced before B1. */
export const DEFAULT_EVENT_TITLE_TEMPLATE = '{{contactNumber}}'

/**
 * The made-up values the settings preview renders with. Obviously fake, per
 * the seed rule — nobody should have to wonder whether the preview is showing
 * a real patient.
 */
export const EVENT_TITLE_PREVIEW: EventTitleValues = {
  contactNumber: 42,
  contactName: 'Testperson, Erika',
  activityType: 'Erstgespräch',
  activityTitle: 'Verlaufsgespräch',
  appointmentTitle: 'Rückruf',
}

/**
 * The same, for an appointment that has a contact and **nothing else** — no
 * Vorgang, so no type and no activity title, and no title of its own either.
 *
 * This is what the screen checks a template against to ask "can this come out
 * empty in practice". The full set above cannot answer that: every field has a
 * value there, so any saveable template produces something and the warning
 * would be unreachable. `{{activityTitle}}` is a legitimate template and a
 * trap at the same time, and this is the difference between saying so and
 * finding out from a stuck queue row.
 */
export const EVENT_TITLE_PREVIEW_SPARSE: EventTitleValues = {
  contactNumber: 42,
  contactName: 'Testperson, Erika',
  activityType: null,
  activityTitle: null,
  appointmentTitle: null,
}
