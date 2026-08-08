-- The `updated_at` trigger from migration 0002, on the tables just created.
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "number_range"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "contact"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "contact_role"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Row-level security per CLAUDE.md rule 1: policies created, then explicitly
-- DISABLED. Tenant isolation is enforced by the application — the tenant id
-- comes from the session via middleware/tenant.ts. See migration 0001 for the
-- reasoning and for what enabling them would take.
CREATE POLICY "tenant_isolation" ON "number_range"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "number_range" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "contact"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "contact" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "contact_role"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "contact_role" DISABLE ROW LEVEL SECURITY;
