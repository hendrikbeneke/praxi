import type { AppointmentStatus } from '@praxi/shared'
import { occupiesSlot } from '@praxi/shared'
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
 * So the title is the contact number as a bare string of digits, with no
 * prefix. Every additional character is the place where somebody later "just
 * adds" the activity type.
 *
 * **The operator can switch it off** (`google_connection.pseudonymize`,
 * migration 0036), and then the title is the contact's name. Whether that is
 * lawful in their practice is their judgement to make and their
 * responsibility to carry; the setting says so in two sentences.
 *
 * What it is NOT is a rule derived from roles. "Pseudonymize the patients"
 * was considered and refused, twice over:
 *
 *   1. A rule without an exception can be tested as an absolute. With one it
 *      becomes an either-or, and a test that permits both branches no longer
 *      checks the property that matters. A switch keeps the absolute — it
 *      just has two settings, and each is testable on its own.
 *
 *   2. Roles change retroactively, written events do not. A prospect becomes
 *      a patient. The appointments that went to Google under their real name
 *      while they were a prospect are still sitting there. Keying off a role
 *      would therefore need a mechanism that rewrites every past event — and
 *      that mechanism could never be complete, because the data has long
 *      since been cached on a phone. The switch has the same property, which
 *      is why it too only governs what is written from now on, and why the
 *      settings screen says that in as many words.
 *
 * The switch governs **the title and nothing else**. No description, no
 * participants, no invitations, no location, no hint of a service or an
 * activity type — in either setting.
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
 *  the type is the second lock next to the test. */
export type EventSource = {
  appointmentId: string
  /** Null on an appointment that belongs to nobody (0034) — see the summary
   *  in `buildEvent`. */
  contactNumber: number | null
  /** Only ever used when `pseudonymize` is false. It is listed here rather
   *  than resolved elsewhere so the whole decision stays in one function. */
  contactName: string | null
  /** `google_connection.pseudonymize`. True is the protected setting. */
  pseudonymize: boolean
  startsAt: Date
  endsAt: Date
  status: AppointmentStatus
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
 * The title, and the only place the switch has any effect.
 *
 * The order of the three cases is the point. "No contact" is asked **first**,
 * in both settings: an appointment that belongs to nobody has no number and no
 * name, and what stands in for it is a **constant** — never the appointment's
 * own title. That title is typed by the practitioner, and "Rückruf Frau K." is
 * exactly the sentence rule 13 exists to keep out of Google. A busy block with
 * no content at all is all a projection owes anyone.
 */
function summaryFor(source: EventSource): string {
  if (source.contactNumber === null) return messages.appointment.googleBusy
  if (source.pseudonymize) return String(source.contactNumber)
  return source.contactName ?? messages.appointment.googleBusy
}
