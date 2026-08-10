-- ── cancelling is the one thing a finalized invoice still does ─────────────
-- Replaces the function from migration 0014. Two changes, both about the
-- columns slice 7 added:
--
-- * `cancels_invoice_id` joins the frozen list. What a cancellation document
--   takes back is part of the document.
-- * `cancelled_by_invoice_id` is the exception the comment in 0014 promised.
--   It may be written **once**, from NULL to a value. Never back to NULL,
--   never to a different invoice: there is no un-cancelling, and the reference
--   is what `invoice_cancelled_state` ties the status to.
--
-- `RETURN coalesce(NEW, OLD)`, not `RETURN NEW`: see migration 0012.
CREATE OR REPLACE FUNCTION protect_finalized_invoice() RETURNS trigger AS $$
BEGIN
  -- Finalization itself is an UPDATE out of 'draft', so it passes here.
  IF OLD.status = 'draft' THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'finalized invoice cannot be deleted';
  END IF;

  IF OLD.cancelled_by_invoice_id IS NOT NULL
     AND NEW.cancelled_by_invoice_id IS DISTINCT FROM OLD.cancelled_by_invoice_id THEN
    RAISE EXCEPTION 'a cancelled invoice cannot be uncancelled';
  END IF;

  IF (NEW.contact_id, NEW.type, NEW.number, NEW.number_prefix, NEW.number_value,
      NEW.invoice_date, NEW.payment_term_days, NEW.recipient_snapshot,
      NEW.intro_text, NEW.outro_text, NEW.total_cents, NEW.pdf_path,
      NEW.pdf_hash, NEW.finalized_at, NEW.cancels_invoice_id)
     IS DISTINCT FROM
     (OLD.contact_id, OLD.type, OLD.number, OLD.number_prefix, OLD.number_value,
      OLD.invoice_date, OLD.payment_term_days, OLD.recipient_snapshot,
      OLD.intro_text, OLD.outro_text, OLD.total_cents, OLD.pdf_path,
      OLD.pdf_hash, OLD.finalized_at, OLD.cancels_invoice_id)
  THEN
    RAISE EXCEPTION 'finalized invoice is immutable except for its status';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- ── the two ends must name each other ──────────────────────────────────────
-- Both directions of a cancellation are stored, which keeps every query one
-- join deep. The partial unique indexes stop a second reference, but not a
-- half-written pair: A pointing at B while B points at nobody, or at C.
--
-- DEFERRABLE INITIALLY DEFERRED, and that is the whole point. The cancellation
-- document is inserted before the original is updated, so during the
-- transaction the pair is legitimately incomplete; only at COMMIT does it have
-- to add up. An immediate trigger would reject the correct sequence.
CREATE FUNCTION check_cancellation_pair() RETURNS trigger AS $$
BEGIN
  -- The row may have been deleted later in the same transaction — a discarded
  -- draft, say. The recorded event still fires; nothing is left to check.
  IF NOT EXISTS (SELECT 1 FROM invoice WHERE id = NEW.id) THEN
    RETURN NULL;
  END IF;

  IF NEW.cancels_invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM invoice o
     WHERE o.id = NEW.cancels_invoice_id
       AND o.cancelled_by_invoice_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'cancellation is not paired: the invoice does not point back';
  END IF;

  IF NEW.cancelled_by_invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM invoice c
     WHERE c.id = NEW.cancelled_by_invoice_id
       AND c.cancels_invoice_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'cancellation is not paired: the document does not point back';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER invoice_cancellation_pair
  AFTER INSERT OR UPDATE ON "invoice"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_cancellation_pair();
