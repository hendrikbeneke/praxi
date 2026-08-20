-- The pseudonymization becomes a setting (D-R2).
--
-- Until here `buildEvent` put the contact number in an event's title without
-- exception, and CLAUDE.md rule 13 said Google never receives a name. The rule
-- stays the DEFAULT — a new connection pseudonymizes, and switching it off is
-- a deliberate act whose consequences the operator carries.
--
-- It sits on the connection rather than on practice_settings for three
-- reasons. It is meaningless without a connection. getPracticeSettings answers
-- with the whole row, so the switch would end up in the master data form,
-- far from the two sentences that explain it. And disconnecting deletes this
-- row, so the next connection starts pseudonymized again — which is right,
-- not a side effect: a new grant can go to a different account, and "send
-- names" is not something a new access should inherit in silence.
ALTER TABLE "google_connection"
  ADD COLUMN "pseudonymize" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

COMMENT ON COLUMN "google_connection"."pseudonymize" IS
  'Title of the Google events: the contact number instead of the name. '
  'Default true — on connecting, the protected state is the right one. Read '
  'by buildEvent() in google/payload.ts and by nothing else. Reset by '
  'disconnecting, because the row goes with it.';
