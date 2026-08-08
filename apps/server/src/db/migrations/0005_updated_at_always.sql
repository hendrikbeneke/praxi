-- Corrects `set_updated_at()` from migration 0002, which tried to skip writes
-- that change nothing:
--
--   IF NEW IS DISTINCT FROM OLD THEN NEW.updated_at := now(); END IF;
--
-- That guard cannot work. Postgres fills generated columns *after* BEFORE
-- triggers run, so inside the trigger `NEW.sort_name` is NULL while
-- `OLD.sort_name` holds the stored value — on `contact` the rows always differ
-- and the branch always fired. The guard therefore behaved one way on tables
-- with a generated column and another way on the rest, which is worse than not
-- having it: a value that means "last change" on four tables and "last write"
-- on the others cannot be reasoned about.
--
-- So `updated_at` now means **last write**, uniformly, on every table. An
-- UPDATE that stores identical values still moves it.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
