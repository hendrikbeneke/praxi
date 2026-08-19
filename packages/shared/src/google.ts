import { z } from 'zod'
import { appointmentStatusSchema } from './appointment.js'

/**
 * The Google Calendar projection (CLAUDE.md slice 9).
 *
 * The local database is the system of record; Google Calendar is a projection
 * of *when* the practitioner is occupied — never of *who* by. Everything in
 * this file is deliberately thin for that reason: there is not much to say
 * about a projection that carries three facts.
 */

/**
 * What the settings screen shows. `configured` and `connected` are two
 * different questions and the screen asks both: without a client id and an
 * encryption key there is nothing to connect *with*, and saying "not connected"
 * would send the practitioner looking for a button that cannot exist.
 */
export const googleStatusSchema = z.object({
  /** Client id, secret and encryption key are all present in the environment. */
  configured: z.boolean(),
  connected: z.boolean(),
  /**
   * True when a connection exists but the stored refresh token was encrypted
   * with a different key than the one currently configured. Not an error we
   * can repair — but one we can name, instead of failing at a GCM tag.
   */
  keyMismatch: z.boolean(),
  /** The practitioner's own Google account. Not a patient datum. */
  accountEmail: z.string().nullable(),
  /** The calendar appointments are written to. Null until one is chosen, and
   *  nothing is enqueued while it is. */
  calendarId: z.string().nullable(),
  /** The calendars queried for busy intervals while scheduling. */
  freebusyCalendarIds: z.array(z.string()),
  lastSyncAt: z.iso.datetime().nullable(),
  /** The last error from the API, as a sentence. Never a payload (rule 12). */
  lastError: z.string().nullable(),
  /** Entries waiting to go out, and how many of those have been failing long
   *  enough to need a look. */
  queuePending: z.number().int(),
  queueStuck: z.number().int(),
  /** Appointments changed on both sides at once, waiting to be resolved by
   *  hand. Shown here as a count; the list itself sits in the calendar. */
  conflicts: z.number().int(),
})

export type GoogleStatus = z.infer<typeof googleStatusSchema>

/** One entry of the account's calendar list, for the two pickers. */
export const googleCalendarSchema = z.object({
  id: z.string(),
  summary: z.string(),
  primary: z.boolean(),
  /** `owner`, `writer`, `reader`, `freeBusyReader`. Writing needs at least
   *  `writer`; the picker for the practice calendar says so. */
  accessRole: z.string(),
})

export type GoogleCalendar = z.infer<typeof googleCalendarSchema>

/**
 * A busy interval from `freebusy.query`. This is all the API returns — no
 * title, no participants, no calendar of origin — and it is all we ever ask
 * for. Never stored: it is painted into the calendar while scheduling and
 * forgotten.
 */
export const busyIntervalSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
})

export type BusyInterval = z.infer<typeof busyIntervalSchema>

export const busyRangeQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
})

/**
 * Why a conflict exists.
 *
 * `both_changed` — the slot was moved here and in Google before our change got
 * out. That is the only kind there is: `overlap` ("Google's times cannot be
 * applied at all, another appointment holds them") went with the exclusion
 * constraint in migration 0034, because a remote change can now always be
 * applied. The single-valued enum stays because a conflict has a reason, and
 * the next kind will want to say a different one.
 */
export const syncConflictReasons = ['both_changed'] as const
export const syncConflictReasonSchema = z.enum(syncConflictReasons)
export type SyncConflictReason = z.infer<typeof syncConflictReasonSchema>

/**
 * An appointment changed on both sides. Both versions travel, because
 * resolving it is a decision and a decision needs both sides in view.
 */
export const syncConflictSchema = z.object({
  appointmentId: z.uuid(),
  activityId: z.uuid().nullable(),
  /** Null on an appointment that belongs to nobody (0034). */
  contactId: z.uuid().nullable(),
  contactNumber: z.number().int().nullable(),
  detectedAt: z.iso.datetime(),
  reason: syncConflictReasonSchema,
  localStartsAt: z.iso.datetime(),
  localEndsAt: z.iso.datetime(),
  localStatus: appointmentStatusSchema,
  remoteStartsAt: z.iso.datetime(),
  remoteEndsAt: z.iso.datetime(),
  remoteCancelled: z.boolean(),
})

export type SyncConflict = z.infer<typeof syncConflictSchema>

/** Resolving is a choice between the two sides, never a merge. */
export const conflictResolutionSchema = z.object({ keep: z.enum(['local', 'remote']) })
export type ConflictResolution = z.infer<typeof conflictResolutionSchema>

/** Choosing the practice calendar. Null detaches it: nothing is enqueued then,
 *  and what is already in Google stays where it is. */
export const googleCalendarSelectionSchema = z.object({ calendarId: z.string().min(1).nullable() })

export const googleFreebusySelectionSchema = z.object({
  calendarIds: z.array(z.string().min(1)).max(20),
})

/**
 * Disconnecting. Whether the events in Google go with it is a decision only
 * the practitioner can make, so it is asked rather than assumed — leaving them
 * standing is the default, because it loses nothing.
 */
export const googleDisconnectSchema = z.object({ deleteRemoteEvents: z.boolean().default(false) })

/**
 * What disconnecting did.
 *
 * `remaining` names the events that could not be deleted, with their time —
 * "47 of 49 deleted" without saying *which* two leaves the practitioner
 * scrolling a year of calendar looking for them.
 */
export const googleDisconnectResultSchema = z.object({
  deleted: z.number().int(),
  attempted: z.number().int(),
  remaining: z.array(busyIntervalSchema),
})

export type GoogleDisconnectResult = z.infer<typeof googleDisconnectResultSchema>

/** What one manual sync run did, for the button in the settings. */
export const googleSyncResultSchema = z.object({
  pushed: z.number().int(),
  failed: z.number().int(),
  pulled: z.number().int(),
  conflicts: z.number().int(),
})

export type GoogleSyncResult = z.infer<typeof googleSyncResultSchema>
