-- The `updated_at` trigger from migration 0002, on the three tables just
-- touched by 0024. `appointment` already has it.
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "google_connection"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "google_sync_queue"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "appointment_sync_conflict"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Row-level security per CLAUDE.md rule 1: policy created, then explicitly
-- DISABLED. Tenant isolation is enforced by the application — the tenant id
-- comes from the session via middleware/tenant.ts. See migration 0001.
CREATE POLICY "tenant_isolation" ON "google_connection"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "google_connection" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "google_sync_queue"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "google_sync_queue" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "appointment_sync_conflict"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "appointment_sync_conflict" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

COMMENT ON TABLE "google_connection" IS
  'The connection to one Google account. One row per tenant; deleting it IS '
  'disconnecting. The refresh token is stored encrypted with a key from the '
  'environment, the access token is never stored at all. key_fingerprint '
  'exists so a changed key can be named rather than surfacing as an '
  'authentication tag mismatch (CLAUDE.md slice 9).';
--> statement-breakpoint

COMMENT ON COLUMN "google_connection"."freebusy_calendar_ids" IS
  'The calendars asked for busy intervals. Their CONTENT is never read: the '
  'token carries calendar.freebusy, not calendar.readonly, so the API can '
  'only ever answer with intervals — no titles, no participants.';
--> statement-breakpoint

COMMENT ON TABLE "google_sync_queue" IS
  'The outbox. A row is written in the same transaction as the change it '
  'describes, so a failed push never blocks entering or moving an '
  'appointment — the software works with the network cable pulled. `upsert` '
  'reads the appointment fresh at push time, so a burst of edits collapses '
  'into one call; `delete` exists for the one case where there is nothing '
  'left to read.';
--> statement-breakpoint

COMMENT ON COLUMN "google_sync_queue"."calendar_id" IS
  'Frozen when the row is written. Without it, changing the practice calendar '
  'would send a pending deletion to the wrong calendar and leave the event '
  'standing in the old one.';
--> statement-breakpoint

COMMENT ON TABLE "appointment_sync_conflict" IS
  'An appointment changed here and in Google before our change got out. The '
  'two sides are never merged: which one is right is a decision, and merging '
  'would invent a third version nobody chose. Resolved by being deleted — '
  'the list sits in the calendar, where scheduling happens.';
--> statement-breakpoint

COMMENT ON COLUMN "appointment"."google_event_id" IS
  'The event in the practice calendar. Derived from this row''s own id (see '
  'googleEventId() in google/payload.ts), so a lost answer after a successful '
  'insert cannot produce a duplicate. The event carries the contact number '
  'and nothing else — Google never receives data identifying a patient '
  '(§ 203 StGB).';
