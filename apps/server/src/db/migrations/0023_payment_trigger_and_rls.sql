-- The `updated_at` trigger from migration 0002, on the table just created.
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "payment"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Row-level security per CLAUDE.md rule 1: policy created, then explicitly
-- DISABLED. Tenant isolation is enforced by the application — the tenant id
-- comes from the session via middleware/tenant.ts. See migration 0001.
CREATE POLICY "tenant_isolation" ON "payment"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "payment" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- A draft cannot be paid (CLAUDE.md rule 9). It is not a claim yet: it carries
-- no number, no document and no date it falls due, and money received against
-- one would belong to a document that may never exist.
--
-- This cannot be a check constraint or a foreign key: the status it depends on
-- lives in a second table. So the same shape as the mirrored `exclusive` flag
-- on contact_relation — domain/payment.ts refuses first so the message is a
-- readable sentence, and this trigger makes the state unreachable for anything
-- that goes around it, psql included.
--
-- Only INSERT and UPDATE. There is no path from `finalized` back to `draft`
-- (protect_finalized_invoice, migration 0019), so an invoice cannot become a
-- draft underneath a payment that already exists.
CREATE FUNCTION payment_requires_finalized_invoice() RETURNS trigger AS $$
DECLARE
  invoice_status text;
BEGIN
  SELECT i."status"::text INTO invoice_status
    FROM "invoice" i WHERE i."id" = NEW."invoice_id";

  IF invoice_status = 'draft' THEN
    RAISE EXCEPTION 'a draft cannot be paid';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER payment_requires_finalized_invoice
  BEFORE INSERT OR UPDATE ON "payment"
  FOR EACH ROW EXECUTE FUNCTION payment_requires_finalized_invoice();
--> statement-breakpoint

COMMENT ON TABLE "payment" IS
  'What was received on an invoice, entered by hand. The invoice status — '
  'open, partly paid, paid, overdue — is DERIVED from the sum of these rows '
  'and never stored: invoicePaymentState() in packages/shared is the only '
  'place that decides it. Cancelling an invoice leaves its payments standing; '
  'refunding is a step outside this software (CLAUDE.md rule 9).';
--> statement-breakpoint

COMMENT ON CONSTRAINT "payment_amount_not_zero" ON "payment" IS
  'Not zero, but any sign. A negative payment records a refund without '
  'inventing a second concept, the same way a negative activity_item price '
  'grants a discount (rule 5). Zero records nothing and is always a typo.';
