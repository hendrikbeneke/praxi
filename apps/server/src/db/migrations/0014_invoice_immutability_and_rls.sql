-- ── a finalized invoice is final ───────────────────────────────────────────
-- CLAUDE.md rule 9. Everything on the row is a snapshot, and the whole point
-- of a snapshot is that it cannot move afterwards. Only `status` may still
-- change — that is what cancelling does in slice 7, which also adds
-- `cancelled_by_invoice_id` to the list below.
--
-- `RETURN coalesce(NEW, OLD)`, not `RETURN NEW`: see migration 0012. In a
-- BEFORE DELETE trigger `NEW` is NULL and returning NULL cancels the delete
-- without an error.
CREATE FUNCTION protect_finalized_invoice() RETURNS trigger AS $$
BEGIN
  -- Finalization itself is an UPDATE out of 'draft', so it passes here.
  IF OLD.status = 'draft' THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'finalized invoice cannot be deleted';
  END IF;

  IF (NEW.contact_id, NEW.type, NEW.number, NEW.number_prefix, NEW.number_value,
      NEW.invoice_date, NEW.payment_term_days, NEW.recipient_snapshot,
      NEW.intro_text, NEW.outro_text, NEW.total_cents, NEW.pdf_path,
      NEW.pdf_hash, NEW.finalized_at)
     IS DISTINCT FROM
     (OLD.contact_id, OLD.type, OLD.number, OLD.number_prefix, OLD.number_value,
      OLD.invoice_date, OLD.payment_term_days, OLD.recipient_snapshot,
      OLD.intro_text, OLD.outro_text, OLD.total_cents, OLD.pdf_path,
      OLD.pdf_hash, OLD.finalized_at)
  THEN
    RAISE EXCEPTION 'finalized invoice is immutable except for its status';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER protect_finalized_invoice BEFORE UPDATE OR DELETE ON "invoice"
  FOR EACH ROW EXECUTE FUNCTION protect_finalized_invoice();
--> statement-breakpoint

-- The lines belong to the document and are just as frozen. INSERT included,
-- or a line could be added to an invoice whose total and PDF are already
-- fixed.
CREATE FUNCTION protect_finalized_invoice_line() RETURNS trigger AS $$
DECLARE
  parent uuid := coalesce(NEW.invoice_id, OLD.invoice_id);
BEGIN
  IF EXISTS (SELECT 1 FROM invoice WHERE id = parent AND status <> 'draft') THEN
    RAISE EXCEPTION 'finalized invoice is immutable';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER protect_finalized_invoice_line
  BEFORE INSERT OR UPDATE OR DELETE ON "invoice_line"
  FOR EACH ROW EXECUTE FUNCTION protect_finalized_invoice_line();
--> statement-breakpoint

-- ── a billed activity item is frozen too ───────────────────────────────────
-- CLAUDE.md rule 6. Deleting one is already impossible through the
-- `ON DELETE RESTRICT` on invoice_line.activity_item_id; this covers changing
-- it.
--
-- "Billed" means: on an invoice that is finalized, not cancelled, and not
-- itself a cancellation invoice. The last condition is the one that is easy to
-- miss. A cancellation invoice carries the same activity_item_id values as the
-- original, so that the document shows what it takes back — without excluding
-- its type here, cancelling would leave the items frozen forever, which is the
-- exact opposite of what rule 9 asks for. The same condition appears in the
-- billable query in domain/billable.ts; the two must stay in step.
--
-- Drafts are deliberately *not* covered: a draft claims an item so it cannot
-- be billed twice, but the item stays editable until the document exists.
CREATE FUNCTION protect_billed_activity_item() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM invoice_line il
      JOIN invoice i ON i.id = il.invoice_id
     WHERE il.activity_item_id = OLD.id
       AND i.status = 'finalized'
       AND i.type <> 'cancellation_invoice'
  ) THEN
    RAISE EXCEPTION 'activity item is billed and cannot be modified';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER protect_billed_activity_item BEFORE UPDATE ON "activity_item"
  FOR EACH ROW EXECUTE FUNCTION protect_billed_activity_item();
--> statement-breakpoint

-- ── updated_at, per migration 0002 ─────────────────────────────────────────
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "invoice"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "invoice_line"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "text_template"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- ── row-level security, created and disabled (CLAUDE.md rule 1) ────────────
CREATE POLICY "tenant_isolation" ON "invoice"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "invoice" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "invoice_line"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "invoice_line" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "text_template"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "text_template" DISABLE ROW LEVEL SECURITY;
