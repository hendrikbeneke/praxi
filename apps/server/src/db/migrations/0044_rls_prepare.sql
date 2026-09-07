-- S-C1: everything row-level security needs, with row-level security still off.
--
-- Nothing in this migration changes what the application does. The policies are
-- rewritten, a second database role is created, and RLS stays DISABLED on every
-- table — S-C2 is the one migration that flips it, so there is one moment in
-- which behaviour can change instead of five.
--
-- WHY A SECOND ROLE AT ALL. `praxi` is a superuser, has BYPASSRLS, and owns all
-- 39 tables. Each of those three on its own is enough to walk past every policy
-- ever written here, so enabling RLS today would have changed exactly nothing —
-- no error, no warning, no rows withheld. That is the worst possible outcome for
-- a safeguard: one that is believed. From here on the server process connects as
-- `praxi_app`, which is none of those things; `praxi` stays the owner and keeps
-- running migrations and the seed.
--
-- THE BUG IN EVERY POLICY, found by running one. `SET LOCAL` does not restore a
-- custom GUC to NULL at the end of a transaction — it restores it to the EMPTY
-- STRING. `current_setting('app.tenant_id', true)` was chosen precisely because
-- it answers NULL instead of raising when the setting is absent, and the case
-- that actually occurs is not absence:
--
--     begin; set local app.tenant_id = '…'; select … ;  ->  the tenant's rows
--     commit;
--     select … ;  ->  ERROR: invalid input syntax for type uuid: ""
--
-- So a query outside a transaction would have answered with a database error
-- rather than an empty result. `nullif(…, '')` treats the empty string as what
-- it means here — no tenant set — and the same sequence then answers 0 rows.
-- All 34 policies below carry it.

DROP POLICY "tenant_isolation" ON "activity";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "activity"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "activity_item";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "activity_item"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "activity_type";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "activity_type"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "activity_type_preset_item";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "activity_type_preset_item"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "appointment";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "appointment"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "appointment_sync_conflict";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "appointment_sync_conflict"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "contact";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "contact"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "contact_relation";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "contact_relation"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "contact_relation_type";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "contact_relation_type"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "contact_role";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "contact_role"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "contact_role_type";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "contact_role_type"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "country";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "country"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "email_template";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "email_template"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "gender";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "gender"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "google_connection";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "google_connection"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "google_sync_queue";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "google_sync_queue"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "invoice";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoice"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "invoice_line";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoice_line"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "invoice_send";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoice_send"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "note";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "note"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "note_draft";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "note_draft"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "note_file";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "note_file"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "note_type";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "note_type"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "number_range";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "number_range"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "opening_hour";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "opening_hour"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "payment";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payment"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "practice_settings";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "practice_settings"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "salutation";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "salutation"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "service";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "service"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "service_group";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "service_group"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "service_group_item";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "service_group_item"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "smtp_settings";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "smtp_settings"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "tenant";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant"
  USING ("id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "text_template";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "text_template"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint

-- The two AUTH tables lose their policy rather than keeping a dormant one.
--
-- `app_user` and `session` can never be under a tenant policy in the request
-- path, and migration 0001 already said why in a note to whoever would enable
-- these: **authentication precedes tenancy.** The user is found by email before
-- any tenant is known, and the tenant is read OUT of the session row — a policy
-- there would mean nobody can sign in. Better Auth reads three more tables the
-- same way (`account`, `verification`, `rate_limit`), which is why those were
-- created without a policy in 0043.
--
-- A policy that exists but must never be enabled is exactly the trap this slice
-- was written to clear out: it drifts, unread and untested, until somebody
-- believes it. Deleting it states the decision instead. What is lost is that a
-- forgotten filter in `tenantOfUser` or `getUserPreferences` stays invisible —
-- those tables hold the practitioner's own name, address and preferences, not
-- patient data, and `domain/session.test.ts` covers the one function that
-- decides which tenant applies at all.
DROP POLICY "tenant_isolation" ON "app_user";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "session";--> statement-breakpoint

COMMENT ON TABLE "app_user" IS
  'Deliberately NOT under row-level security: authentication precedes tenancy - the user is found by email before any tenant is known. See migration 0044.';--> statement-breakpoint
COMMENT ON TABLE "session" IS
  'Deliberately NOT under row-level security: the tenant is read OUT of this row, so a policy over it could never be satisfied. See migration 0044.';--> statement-breakpoint
COMMENT ON TABLE "account" IS
  'Better Auth: one row per authentication method. Deliberately not under row-level security, and it has no tenant_id. See migration 0044.';--> statement-breakpoint

-- The application role.
--
-- NOLOGIN here on purpose: a password does not belong in a migration that is
-- committed to git. `pnpm db:app-role` sets it from APP_DATABASE_PASSWORD and
-- grants LOGIN - one idempotent command, documented in the README.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'praxi_app') THEN
    CREATE ROLE praxi_app NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO praxi_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO praxi_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO praxi_app;--> statement-breakpoint

-- So a table created by a LATER migration is reachable without anyone
-- remembering to grant it. Same direction as the api-guard in S-A: the default
-- has to be the safe-and-working one, not the one that needs a note.
ALTER DEFAULT PRIVILEGES FOR ROLE praxi IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO praxi_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE praxi IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO praxi_app;--> statement-breakpoint

-- The bound on the request transaction.
--
-- Every request now runs inside one, which is what carries `app.tenant_id` into
-- the database (`middleware/tenant-db.ts`), and a handful of routes call Google
-- or an SMTP server while it is open. Those are taken in hand rather than
-- redesigned for now — the tidier shape, read and commit before talking to the
-- network, is noted in WORKPLAN.md for the seven routes it concerns. This is
-- the guard in the meantime: a transaction that goes idle is ended rather than
-- holding a connection and its locks indefinitely.
--
-- On the ROLE and not on the database, so it applies to the server process and
-- not to migrations, the seed or a psql session doing maintenance — those are
-- `praxi` and legitimately slow.
ALTER ROLE praxi_app SET idle_in_transaction_session_timeout = '30s';--> statement-breakpoint

-- The ONE operation that legitimately crosses tenants: a hole exactly the size
-- of what it does and no larger.
--
-- It would silently do nothing under RLS otherwise, and that silence is what it
-- is worth: a sync that has stopped syncing looks exactly like one with nothing
-- to do.
--
-- The stale-draft sweep was going to be a second such function and is not, on
-- purpose. Its rule is "older than 30 days OR older than its own note", and
-- writing that in SQL beside the TypeScript would be a second definition of
-- when a draft is stale - the one thing this codebase refuses everywhere else.
-- It runs per tenant instead, at the sign-in of that tenant's own user; a
-- tenant nobody signs into accumulates no new drafts either.

-- Reads one column of one table. The Google worker runs on a timer with no
-- request behind it, so it has no tenant; it uses this to find which tenants
-- have a connection at all, and then does each one's work with SET LOCAL.
CREATE FUNCTION google_connection_tenant_ids()
  RETURNS SETOF uuid
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  STABLE
AS $$
  SELECT tenant_id FROM google_connection;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION google_connection_tenant_ids() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION google_connection_tenant_ids() TO praxi_app;--> statement-breakpoint
COMMENT ON FUNCTION google_connection_tenant_ids() IS
  'Crosses tenants on purpose: the Google worker has no request and therefore no tenant. Hands out one column of one table and nothing else.';--> statement-breakpoint
