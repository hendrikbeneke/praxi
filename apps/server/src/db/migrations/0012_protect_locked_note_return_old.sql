-- ── the guard was cancelling every delete ──────────────────────────────────
-- `protect_locked_note()` in migration 0011 ended with `RETURN NEW`, copied
-- from the sketch in CLAUDE.md rule 7. In a BEFORE DELETE trigger `NEW` is
-- NULL, and a BEFORE row trigger that returns NULL **silently cancels the
-- operation**: no error, no rows affected, the delete simply does not happen.
--
-- So deleting an *unlocked* note reported success and left the row in place.
-- The locked case worked by accident — it raises before reaching the return.
--
-- `coalesce(NEW, OLD)` is the form that serves both: NEW on UPDATE, OLD on
-- DELETE. `protect_locked_note_file()` already had it and was unaffected.
CREATE OR REPLACE FUNCTION protect_locked_note() RETURNS trigger AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'locked note is immutable';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
