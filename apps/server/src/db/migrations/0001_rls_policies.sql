-- Row-level security per CLAUDE.md rule 1.
--
-- The policies are created and then explicitly DISABLED. Tenant isolation is
-- enforced by the application: the tenant id comes from the session via
-- middleware/tenant.ts and is never accepted from a request body or query
-- string. These policies are the second line of defence, ready to be switched
-- on with a single ALTER TABLE ... ENABLE ROW LEVEL SECURITY should the
-- database ever be reached by more than this one process.
--
-- `current_setting('app.tenant_id', true)` returns NULL instead of raising when
-- the setting is absent, so a connection that has not set it sees no rows
-- rather than erroring — a safe default if the policies are ever enabled.

CREATE POLICY "tenant_isolation" ON "tenant"
  USING ("id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "tenant" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "practice_settings"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "practice_settings" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Note for whoever enables these: the login lookup finds the user by email
-- alone, before any tenant is known, so it would have to run outside this
-- policy (a SECURITY DEFINER function or a separate role). That is exactly why
-- the policies stay disabled for now.
CREATE POLICY "tenant_isolation" ON "app_user"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "app_user" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "session"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "session" DISABLE ROW LEVEL SECURITY;
