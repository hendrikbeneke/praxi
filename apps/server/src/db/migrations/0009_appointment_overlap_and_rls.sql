-- ── the appointment foreign key, corrected ─────────────────────────────────
-- drizzle-kit cannot express `ON DELETE SET NULL (column_list)`, so migration
-- 0008 emitted a bare `ON DELETE SET NULL`. On a three-column key that nulls
-- *every* column of the key — including `tenant_id`, which is NOT NULL — so
-- deleting an appointment would fail instead of detaching it.
--
-- The column list (Postgres 15+) restricts it to the one column that may go
-- away. Deleting a calendar entry has to leave the activity standing: the
-- appointment is a projection towards a calendar, not the record of what
-- happened (CLAUDE.md rule 6).
--
-- The name is kept, so drizzle-kit's snapshot still matches the TypeScript
-- schema and no phantom drift is reported. `db/schema.ts` carries a note.
ALTER TABLE "activity" DROP CONSTRAINT "activity_appointment_contact_tenant_fk";
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_appointment_contact_tenant_fk"
  FOREIGN KEY ("appointment_id", "contact_id", "tenant_id")
  REFERENCES "public"."appointment" ("id", "contact_id", "tenant_id")
  ON DELETE SET NULL ("appointment_id");
--> statement-breakpoint

-- ── no two appointments in the same slot ───────────────────────────────────
-- btree_gist is what lets a plain `=` on uuid sit in a GiST index next to a
-- range operator.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- Three things about this constraint are not obvious from reading it:
--
-- 1. `tstzrange(a, b)` is half-open, `[a, b)`. An appointment ending at 11:00
--    and one starting at 11:00 therefore do NOT overlap, which is what back to
--    back sessions need. Making it inclusive would reject every adjacent pair.
--
-- 2. `no_show` still occupies the slot, deliberately. The time really was
--    reserved and really was lost; a second appointment can never have taken
--    place in it. Only `cancelled` and `cancelled_late` release it, which is
--    what makes cancelling free the slot for someone else.
--    The same two statuses are listed in `SLOT_RELEASING_STATUSES` in
--    packages/shared/src/appointment.ts — keep them in step.
--
-- 3. It applies to all of time, past included. Entering a historical
--    appointment that overlaps an existing one is rejected as well.
--
-- Violations raise SQLSTATE 23P01, translated in db/errors.ts.
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_no_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  ) WHERE (status NOT IN ('cancelled', 'cancelled_late'));
--> statement-breakpoint

-- ── updated_at, per migration 0002 ─────────────────────────────────────────
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "appointment"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "activity"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "activity_item"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- ── row-level security, created and disabled (CLAUDE.md rule 1) ────────────
CREATE POLICY "tenant_isolation" ON "appointment"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "appointment" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "activity"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "activity" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "activity_item"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "activity_item" DISABLE ROW LEVEL SECURITY;
