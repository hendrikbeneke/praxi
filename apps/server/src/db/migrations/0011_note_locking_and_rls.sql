-- ── locking is a database rule, not an application rule ────────────────────
-- CLAUDE.md rule 7: after locking, neither the note nor its files can be
-- changed or deleted. Enforced here rather than only in `domain/`, because a
-- guarantee that a `psql` session can walk around is not a guarantee.
--
-- There is deliberately no unlock path — no flag, no admin route, no
-- maintenance script. A locked note is corrected by supplementing it with an
-- addendum (§ 630f BGB: corrections stay traceable, the original stays
-- recognizable).
CREATE FUNCTION protect_locked_note() RETURNS trigger AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'locked note is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Locking itself is an UPDATE that sets `locked_at`; at that moment OLD is
-- still unlocked, so it passes. Every UPDATE after it does not.
CREATE TRIGGER protect_locked_note BEFORE UPDATE OR DELETE ON "note"
  FOR EACH ROW EXECUTE FUNCTION protect_locked_note();
--> statement-breakpoint

-- The guard on the attachments fires on INSERT as well, which the one on
-- `note` does not need to. Without it a file could be hung on an already
-- locked note — and that file would appear in no `content_hash`, because the
-- hash was formed over the state at the moment of locking. The note would then
-- carry an attachment its own hash does not cover, which is exactly the kind
-- of silent gap the chain exists to rule out.
CREATE FUNCTION protect_locked_note_file() RETURNS trigger AS $$
DECLARE
  parent uuid := coalesce(NEW.note_id, OLD.note_id);
BEGIN
  IF EXISTS (SELECT 1 FROM note WHERE id = parent AND locked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'locked note is immutable';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER protect_locked_note_file BEFORE INSERT OR UPDATE OR DELETE ON "note_file"
  FOR EACH ROW EXECUTE FUNCTION protect_locked_note_file();
--> statement-breakpoint

-- ── why the two chain indexes exist ────────────────────────────────────────
-- Nothing queries them. They exist to make a state unreachable, and that is
-- invisible from a query plan — so the reason is written into the database
-- itself, where a future cleanup will find it before dropping them.
COMMENT ON INDEX "note_chain_link_key" IS
  'Keeps the hash chain linear: no two notes of one contact may claim the same predecessor. '
  'Two locks running concurrently would both read the same tail and both write its hash into '
  'prev_hash, forking the chain into two branches that each verify fine on their own. '
  'Not a performance index — do not drop as unused.';
--> statement-breakpoint
COMMENT ON INDEX "note_chain_head_key" IS
  'The other half of note_chain_link_key: a contact has exactly one first link. NULLs do not '
  'collide in a unique index, so without this the fork could happen at the head instead. '
  'Not a performance index — do not drop as unused.';
--> statement-breakpoint

-- ── updated_at, per migration 0002 ─────────────────────────────────────────
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "note"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "note_file"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- ── row-level security, created and disabled (CLAUDE.md rule 1) ────────────
CREATE POLICY "tenant_isolation" ON "note"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "note" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "note_file"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "note_file" DISABLE ROW LEVEL SECURITY;
