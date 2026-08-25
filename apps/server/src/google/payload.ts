import type { AppointmentStatus, EventTitleValues } from '@praxi/shared'
import { occupiesSlot, resolveEventTitle } from '@praxi/shared'
import { messages } from '../messages.js'

/**
 * Building the event that goes to Google.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS LOOKS SO AWKWARD — read before simplifying it.
 *
 * By default Google receives no data that identifies a patient. This is not
 * data protection cosmetics, it is § 203 StGB: a calendar entry "Erstgespräch
 * — Maria Schulz" in the calendar of a Heilpraktiker für Psychotherapie
 * discloses that this person is in psychotherapeutic treatment. Google signs
 * no Verpflichtungserklärung under § 203 Abs. 4.
 *
 * So the default title is the contact number as a bare string of digits, with
 * no prefix.
 *
 * **The operator decides what else goes** (`google_connection
 * .event_title_template`, B1/0042). It is a template over a closed set of
 * placeholders, so "42 — Erstgespräch" is one setting away and
 * "{{diagnose}}" is not expressible at all: an unknown name is refused when
 * the template is saved. Whether what they choose is lawful in their practice
 * is their judgement to make and their responsibility to carry; the settings
 * screen shows the sentence Google will receive, with made-up values, before
 * anything is saved.
 *
 * The template governs **the title and nothing else**. No description, no
 * participants, no invitations, no location — whatever it says. The payload
 * type below lists every field, there is no spread from an appointment row
 * anywhere in this file, and `payload.test.ts` asserts the key set across a
 * matrix of templates including hostile ones.
 *
 * What this is NOT is a rule derived from roles. "Pseudonymize the patients"
 * was considered and refused, twice over, and both reasons still hold for the
 * template:
 *
 *   1. A rule without an exception can be tested as an absolute. With one it
 *      becomes an either-or, and a test that permits both branches no longer
 *      checks the property that matters. A setting keeps the absolute — the
 *      *shape* of the payload is fixed however the title reads, and that is
 *      what the test asserts.
 *
 *   2. Roles change retroactively, written events do not. A prospect becomes
 *      a patient. The appointments that went to Google under their real name
 *      while they were a prospect are still sitting there. Keying off a role
 *      would therefore need a mechanism that rewrites every past event — and
 *      that mechanism could never be complete, because the data has long
 *      since been cached on a phone. The template has the same property,
 *      which is why it too only governs what is written from now on, and why
 *      the settings screen says that in as many words.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** The event resource we send. Every field is listed on purpose; there is no
 *  spread and no pass-through from an appointment row anywhere in this file,
 *  so a new column on `appointment` cannot leak into a payload by accident. */
export type GoogleEventPayload = {
  id: string
  summary: string
  start: { dateTime: string }
  end: { dateTime: string }
  status: 'confirmed' | 'cancelled'
  visibility: 'private'
  transparency: 'opaque'
  reminders: { useDefault: false }
}

/** What `buildEvent` is allowed to see. Deliberately not the appointment row:
 *  the type is the second lock next to the test. The five title fields are
 *  exactly `EventTitleValues`, so the closed placeholder set and the query
 *  that feeds it cannot drift apart. */
export type EventSource = EventTitleValues & {
  appointmentId: string
  /** `google_connection.event_title_template`. */
  titleTemplate: string
  startsAt: Date
  endsAt: Date
  status: AppointmentStatus
}

/** A template that came out empty for this appointment. Thrown rather than
 *  sent — see `summaryFor`. */
export class EmptyEventTitleError extends Error {
  constructor() {
    super('event title template resolved to nothing')
    this.name = 'EmptyEventTitleError'
  }
}

/**
 * Base32hex (RFC 4648) in lower case — digits `0`–`9` then `a`–`v`, which is
 * exactly the alphabet Google accepts for a client-supplied event id.
 */
const BASE32HEX = '0123456789abcdefghijklmnopqrstuv'

/**
 * The event id, derived from the appointment id.
 *
 * Deterministic on purpose: if the answer to an insert is lost — which is
 * likeliest precisely when the line is bad, the most probable failure case —
 * the retry runs into a duplicate id instead of creating a second event. A
 * UUID as 26 base32hex characters carries no personal data.
 */
export function googleEventId(appointmentId: string): string {
  const hex = appointmentId.replaceAll('-', '')
  const bytes = Uint8Array.from({ length: hex.length / 2 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  )

  let bits = 0
  let value = 0
  let out = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32HEX[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32HEX[(value << (5 - bits)) & 31]

  return out
}

/**
 * The whole projection, in one function.
 *
 * The status is the one bit that travels besides the times: a slot that has
 * been released becomes a cancelled event rather than a deletion. That keeps
 * the id valid — reviving is then an ordinary update — and it frees the time
 * in Google just the same. `occupiesSlot()` from `packages/shared` decides it,
 * the same function the exclusion constraint mirrored until migration 0034.
 */
export function buildEvent(source: EventSource): GoogleEventPayload {
  return {
    id: googleEventId(source.appointmentId),
    summary: summaryFor(source),
    start: { dateTime: source.startsAt.toISOString() },
    end: { dateTime: source.endsAt.toISOString() },
    status: occupiesSlot(source.status) ? 'confirmed' : 'cancelled',
    visibility: 'private',
    transparency: 'opaque',
    // No notification for an event nobody is invited to.
    reminders: { useDefault: false },
  }
}

/**
 * The title, and the only place the template has any effect.
 *
 * **"No contact" is asked first, whatever the template says.** An appointment
 * that belongs to nobody has no number and no name, and what stands in for it
 * is a **constant** — never the appointment's own title. That title is typed
 * by the practitioner at 200 characters, and "Rückruf Frau K." is exactly the
 * sentence rule 13 exists to keep out of Google. A busy block with no content
 * at all is all a projection owes anyone.
 *
 * **An empty result is a failure, not an empty title.** A template can be
 * valid and still come out with nothing for one particular appointment —
 * `{{activityTitle}}` where this one has none. Google would then draw the
 * block as "(kein Titel)", which is a projection quietly saying nothing, and
 * a quiet malfunction is the worst kind here: the practitioner sees a
 * calendar that looks fine and would have to count the entries to notice.
 * Throwing puts the row in the outbox with an error the settings screen shows,
 * and the appointment is still in Google's way as soon as the template is
 * mended.
 */
function summaryFor(source: EventSource): string {
  if (source.contactNumber === null && source.contactName === null) {
    return messages.appointment.googleBusy
  }

  const title = resolveEventTitle(source.titleTemplate, source)
  if (title === '') throw new EmptyEventTitleError()
  return title
}
