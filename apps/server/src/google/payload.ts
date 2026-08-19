import type { AppointmentStatus } from '@praxi/shared'
import { occupiesSlot } from '@praxi/shared'
import { messages } from '../messages.js'

/**
 * Building the event that goes to Google.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS LOOKS SO AWKWARD — read before simplifying it.
 *
 * Google never receives data that identifies a patient. This is not data
 * protection cosmetics, it is § 203 StGB: a calendar entry "Erstgespräch —
 * Maria Schulz" in the calendar of a Heilpraktiker für Psychotherapie
 * discloses that this person is in psychotherapeutic treatment. Google signs
 * no Verpflichtungserklärung under § 203 Abs. 4.
 *
 * The rule holds for **every** contact, with no exception for the ones who
 * hold no patient role — the company booking a talk included. Two reasons:
 *
 *   1. A rule without an exception can be tested as an absolute: "the
 *      assembled payload contains nothing but the contact number, start, end
 *      and status". With an exception that test becomes an either-or, and a
 *      test that permits both branches no longer checks the property that
 *      matters.
 *
 *   2. Roles change retroactively, written events do not. A prospect becomes
 *      a patient. The appointments that went to Google under their real name
 *      while they were a prospect are still sitting there. The exception
 *      would therefore need a mechanism that rewrites every past event — and
 *      that mechanism could never be complete, because the data has long
 *      since been cached on a phone.
 *
 * So: the title is the contact number as a bare string of digits, with no
 * prefix. Every additional character is the place where somebody later "just
 * adds" the activity type.
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
    // The contact number, and nothing else. See the block comment above.
    //
    // An appointment that belongs to nobody has no number, and what stands in
    // for it is a **constant** — never the appointment's own title. The title
    // is typed by the practitioner and "Rückruf Frau K." is exactly the
    // sentence the rule above exists to keep out of Google. So: a busy block
    // with no content at all, which is all a projection owes anyone.
    summary:
      source.contactNumber === null
        ? messages.appointment.googleBusy
        : String(source.contactNumber),
    start: { dateTime: source.startsAt.toISOString() },
    end: { dateTime: source.endsAt.toISOString() },
    status: occupiesSlot(source.status) ? 'confirmed' : 'cancelled',
    visibility: 'private',
    transparency: 'opaque',
    // No notification for an event nobody is invited to.
    reminders: { useDefault: false },
  }
}
