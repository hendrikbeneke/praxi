-- The `updated_at` trigger from migration 0002, on the catalogue tables.
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "service"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "service_group"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "service_group_item"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Row-level security per CLAUDE.md rule 1: policies created, then explicitly
-- DISABLED. Tenant isolation is enforced by the application; see migration
-- 0001 for the reasoning.
CREATE POLICY "tenant_isolation" ON "service"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "service" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "service_group"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "service_group" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "service_group_item"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "service_group_item" DISABLE ROW LEVEL SECURITY;
