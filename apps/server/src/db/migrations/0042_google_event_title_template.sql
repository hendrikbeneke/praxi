-- B1: the Google event title becomes a template.
--
-- `pseudonymize` (migration 0036) was a boolean with two settings — the
-- contact number, or the contact's name — and no way to say "the number and
-- what kind of appointment it is". The template says that, and anything else
-- the practice wants, out of a closed set of placeholders
-- (`eventTitlePlaceholders` in packages/shared/src/google-event-title.ts).
--
-- The default is exactly what the boolean's protected position produced, so a
-- connection that is never configured behaves as it did. And because
-- disconnecting deletes this row, a new grant starts back at the number —
-- which is the point rather than a side effect: a new grant can go to a
-- different account, and "send names" is not something a new access should
-- inherit in silence.
--
-- What has NOT changed is that this governs the title and nothing else. The
-- event carries two times, one bit of status and this string; there is no
-- description, no participant, no location. `google/payload.ts` lists every
-- field it sends and its test asserts the key set across a matrix of
-- templates, hostile ones included.

ALTER TABLE "google_connection" DROP COLUMN "pseudonymize";--> statement-breakpoint

ALTER TABLE "google_connection"
  ADD COLUMN "event_title_template" text NOT NULL DEFAULT '{{contactNumber}}';--> statement-breakpoint

-- Google's own limit is far higher. A calendar block shows a few dozen
-- characters and the rest would be ballast travelling to a third party.
ALTER TABLE "google_connection"
  ADD CONSTRAINT "google_connection_event_title_template_length"
  CHECK (char_length("event_title_template") BETWEEN 1 AND 200);--> statement-breakpoint

COMMENT ON COLUMN "google_connection"."event_title_template" IS
  'Governs the TITLE of a Google event and nothing else — and the title is all Google ever learns. Read by buildEvent() and by nothing besides. Resets to the contact number when the connection is deleted.';
