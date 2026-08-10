-- The `updated_at` trigger from migration 0002, on the three tables 0026
-- created.
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "smtp_settings"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "email_template"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "invoice_send"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Row-level security per CLAUDE.md rule 1: policy created, then explicitly
-- DISABLED. Tenant isolation is enforced by the application — the tenant id
-- comes from the session via middleware/tenant.ts. See migration 0001.
CREATE POLICY "tenant_isolation" ON "smtp_settings"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "smtp_settings" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "email_template"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "email_template" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoice_send"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "invoice_send" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

COMMENT ON TABLE "smtp_settings" IS
  'The SMTP account invoices are sent from. Its own table rather than columns '
  'on practice_settings, and the reason is structural: updatePracticeSettings '
  'writes the whole form object, so a password living there would travel to '
  'the client and back on every save of the master data. The password is '
  'encrypted by src/secrets.ts — the same mechanism and the same key as the '
  'Google refresh token, not a second one.';
--> statement-breakpoint

COMMENT ON COLUMN "smtp_settings"."from_address" IS
  'The sender, and the ONLY address the test send can ever reach. It is not a '
  'form field and not a request parameter — a button that exists to check the '
  'configuration must not double as a way to send an invoice somewhere by '
  'accident (CLAUDE.md rule 14).';
--> statement-breakpoint

COMMENT ON TABLE "email_template" IS
  'The subject and body an invoice is sent with. Its own table rather than two '
  'new values in text_template_kind: a subject and a body are ONE message, and '
  'two independent rows of the generic table could be picked apart into a '
  'state that means nothing.';
--> statement-breakpoint

COMMENT ON TABLE "invoice_send" IS
  'One send attempt, successful or not. Failed attempts stay — that is what '
  'makes "I tried three times" answerable, and it is what a synchronous send '
  'has instead of a retry mechanism: sending is an act, and an automatic '
  'retry would mean possibly delivering twice with nobody able to tell. The '
  'last successful send is DERIVED from these rows; there are deliberately no '
  'sent_at/sent_to columns on invoice, which would also have meant widening '
  'the allowlist of protect_finalized_invoice.';
--> statement-breakpoint

COMMENT ON COLUMN "invoice_send"."error" IS
  'The server''s answer, raw — it usually quotes the recipient address. That '
  'is correct here: this is a record inside the protected database, not a log '
  'line. Rule 12 governs the log stream, where neither this nor the recipient '
  'ever appears.';
