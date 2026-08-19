-- An appointment becomes a calendar entry in its own right, and overlaps
-- become allowed. Two changes, and both of them reverse a decision made
-- earlier on purpose, so both carry their reason into the database.
--
-- ── 1. A contact is optional ───────────────────────────────────────────────
--
-- Until here every appointment belonged to an activity, and every activity to
-- a contact — a blocker, documentation time, a team meeting could not be
-- entered at all. The direction turns around: the appointment stands alone,
-- and it is the activity that optionally has one.
--
-- What is deliberately NOT relaxed is the other end. `activity.contact_id`
-- stays `not null`, and the composite key
-- `activity (appointment_id, contact_id, tenant_id) -> appointment` stays as
-- it is. A foreign key never matches a row whose referenced column is NULL,
-- so an appointment without a contact can never be picked up by an activity.
-- Turning a blocker into a Vorgang afterwards is therefore impossible, which
-- is where this package leaves it: one database guarantee is given up below,
-- and giving up a second one to buy a path nobody has asked for would be a
-- poor trade.
ALTER TABLE "appointment" ALTER COLUMN "contact_id" DROP NOT NULL;
--> statement-breakpoint

COMMENT ON COLUMN "appointment"."contact_id" IS
  'Optional since 0034. An appointment is a calendar entry in its own right: a blocker, documentation time, a team meeting. An activity still always has a contact, and the composite key activity -> appointment carries contact_id through, so an appointment without one can never be carried by an activity.';
--> statement-breakpoint

-- ── 2. Overlaps are allowed ────────────────────────────────────────────────
--
-- `appointment_no_overlap` (migration 0009) refused a second appointment in an
-- occupied slot, past included. It goes, and the reason is not that double
-- bookings are harmless: it is that they are a decision, and the practitioner
-- is the one who makes it. A constraint cannot be overruled at the moment it
-- matters — an emergency at 14:00 on a full day ended in a refusal with no way
-- forward except cancelling somebody else first.
--
-- What takes its place is not nothing:
--   * the form warns before saving, and the entry is painted in the
--     destructive tone while it clashes;
--   * `findFreeSlots` still refuses to *suggest* a time that is taken, which
--     is the one place an overlap would be proposed rather than chosen.
--
-- Note that btree_gist stays — `opening_hour_no_overlap` (0032) still uses it.
ALTER TABLE "appointment" DROP CONSTRAINT "appointment_no_overlap";
--> statement-breakpoint

COMMENT ON COLUMN "appointment"."status" IS
  'What became of the SLOT. Descriptive only, and since 0034 that is complete: it gates nothing at all. It used to decide the exclusion constraint of migration 0009, which is gone. Overlapping appointments are allowed; the screen warns and the practitioner decides. findFreeSlots still refuses to suggest a time that is taken.';
--> statement-breakpoint

-- ── 3. The conflict reason `overlap` can no longer arise ───────────────────
--
-- It meant "Google's times cannot be applied at all, another appointment holds
-- them" — the refusal above, coming back through the return channel. A remote
-- change can now always be applied, so nothing can ever write the value again.
-- The column stays rather than the value being folded away: a conflict has a
-- reason, and the next kind will want to say a different one.
ALTER TABLE "appointment_sync_conflict"
  DROP CONSTRAINT "appointment_sync_conflict_reason_check";
--> statement-breakpoint

ALTER TABLE "appointment_sync_conflict"
  ADD CONSTRAINT "appointment_sync_conflict_reason_check"
  CHECK ("reason" in ('both_changed'));
