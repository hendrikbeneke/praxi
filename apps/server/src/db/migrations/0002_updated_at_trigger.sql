-- Two things every later migration relies on: the database collation, and
-- `updated_at` being maintained by the database rather than by whoever writes.

-- ── collation guard ────────────────────────────────────────────────────────
-- `contact.sort_name` (migration 0003) inherits the database collation, and
-- the order of the contact list depends on it. Initialised without ICU, the
-- list would put "Öztürk" after "Zimmermann" — a defect nobody notices until
-- the data is real. Fail here instead, while the fix is still cheap.
--
-- Checked against `datlocprovider`/`datlocale`, not `datcollate`: with the ICU
-- provider `datcollate` still shows the libc locale the cluster was built with
-- and says nothing about how text actually sorts.
DO $$
DECLARE
  provider "char";
  locale   text;
BEGIN
  SELECT datlocprovider, datlocale INTO provider, locale
    FROM pg_database WHERE datname = current_database();

  IF provider IS DISTINCT FROM 'i' OR locale IS DISTINCT FROM 'de-DE' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Database must use the ICU provider with locale de-DE.',
      DETAIL  = format('found provider=%s, locale=%s',
                       provider, coalesce(locale, '<null>')),
      HINT    = 'The cluster was initialised without ICU. Stop Postgres, remove '
                '.docker-data/postgres, run pnpm db:up (initdb then uses '
                '--locale-provider=icu --icu-locale=de-DE), then migrate and seed.';
  END IF;
END $$;
--> statement-breakpoint

-- ── updated_at ─────────────────────────────────────────────────────────────
-- Set by the database, never by the application. An UPDATE issued from psql
-- during maintenance has to move the timestamp too, otherwise half the rows
-- carry a value nobody can trust.
--
-- The guard on `NEW IS DISTINCT FROM OLD` keeps a write that changes nothing
-- from touching the timestamp, so `updated_at` means "last actual change".
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Retrofitted onto the slice 1 tables, which set `updated_at` from the
-- application until now. Every table created from here on gets the same
-- trigger in the migration that creates it.
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "tenant"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "practice_settings"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "app_user"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "session"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
