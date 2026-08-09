-- The `updated_at` trigger from migration 0002, on the tables just created.
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "contact_role_type"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "contact_relation_type"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "contact_relation"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Row-level security per CLAUDE.md rule 1: policies created, then explicitly
-- DISABLED. Tenant isolation is enforced by the application — the tenant id
-- comes from the session via middleware/tenant.ts. See migration 0001.
CREATE POLICY "tenant_isolation" ON "contact_role_type"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "contact_role_type" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "contact_relation_type"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "contact_relation_type" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "contact_relation"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "contact_relation" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- A system entry is one that logic may depend on: `patient` decides what
-- counts as treatment documentation, `billing_recipient` will decide who an
-- invoice goes to. It cannot be deleted and its `code` cannot change. The
-- label, the sort order, `active` and `show_as_tab` stay editable — they are
-- presentation, and the practitioner owns them.
--
-- `is_system` itself is frozen too, in both directions for a system row:
-- without that, clearing the flag would be a one-step way around the guard.
-- Turning the flag *on* is not reachable at all, because it appears in no
-- input schema; only the seed sets it.
CREATE FUNCTION protect_system_type() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'system entry is not deletable';
  END IF;
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'system entry code is immutable';
  END IF;
  IF NEW.is_system IS DISTINCT FROM OLD.is_system THEN
    RAISE EXCEPTION 'system flag is immutable';
  END IF;
  -- coalesce, not NEW: in a BEFORE DELETE trigger NEW is NULL and returning
  -- NULL cancels the operation silently. See migration 0012 — the DELETE
  -- branch above raises, so it cannot happen here today, but the next edit to
  -- this function should not have to rediscover it.
  RETURN coalesce(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER contact_role_type_protect_system
  BEFORE UPDATE OR DELETE ON "contact_role_type"
  FOR EACH ROW WHEN (OLD.is_system) EXECUTE FUNCTION protect_system_type();
--> statement-breakpoint
CREATE TRIGGER contact_relation_type_protect_system
  BEFORE UPDATE OR DELETE ON "contact_relation_type"
  FOR EACH ROW WHEN (OLD.is_system) EXECUTE FUNCTION protect_system_type();
--> statement-breakpoint

-- Copies `is_exclusive` from the type onto the row. The partial unique index
-- `contact_relation_exclusive_key` needs the value on the row, because an
-- index cannot read a second table — and exclusivity has to be a database
-- guarantee, not a check the application remembers to run.
--
-- The application never writes this column. Switching a type to exclusive
-- afterwards is an UPDATE over its relations, which passes through here again
-- and is then rejected by the index if duplicates already exist.
CREATE FUNCTION contact_relation_set_exclusive() RETURNS trigger AS $$
BEGIN
  SELECT t.is_exclusive INTO STRICT NEW.exclusive
    FROM contact_relation_type t
   WHERE t.tenant_id = NEW.tenant_id AND t.code = NEW.relation_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER contact_relation_exclusive
  BEFORE INSERT OR UPDATE ON "contact_relation"
  FOR EACH ROW EXECUTE FUNCTION contact_relation_set_exclusive();
--> statement-breakpoint

COMMENT ON COLUMN "contact_relation"."exclusive" IS
  'Mirror of contact_relation_type.is_exclusive, maintained by the trigger '
  'contact_relation_exclusive. Exists only so the partial unique index can be '
  'written; the type is the single source of truth.';
--> statement-breakpoint
COMMENT ON INDEX "contact_relation_exclusive_key" IS
  'At most one relation of an exclusive type per from_contact_id. If relations '
  'ever gain an end date, narrow this to the ones still running — otherwise a '
  'relation that ended blocks the new one forever.';
--> statement-breakpoint

-- Roles that are now relations, and the placeholder that is gone. `guardian`
-- and `billing_recipient` never were properties of one contact; they only mean
-- something with a counterpart, which is what contact_relation is for.
-- Agreed before writing this: there is no production database, and these
-- assignments carry no information that is not re-enterable.
DELETE FROM "contact_role"
 WHERE "role_code" IN ('guardian', 'billing_recipient', 'other');
--> statement-breakpoint

-- The presets, for every tenant that already exists. A frozen copy of what
-- `db/seed/contact-types.ts` creates for a new one; that file is the living
-- definition, this one is history. Ids are v4 rather than the application's
-- v7 because they are made here — nothing depends on the difference.
INSERT INTO "contact_role_type"
  ("id", "tenant_id", "code", "label", "is_system", "show_as_tab", "sort_order")
SELECT gen_random_uuid(), t."id", v."code", v."label", v."is_system", v."show_as_tab", v."sort_order"
  FROM "tenant" t
  CROSS JOIN (VALUES
    ('patient',     'Patient',     true,  true,  10),
    ('prospect',    'Interessent', false, false, 20),
    ('participant', 'Teilnehmer',  false, false, 30)
  ) AS v("code", "label", "is_system", "show_as_tab", "sort_order")
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "contact_relation_type"
  ("id", "tenant_id", "code", "label_forward", "label_inverse",
   "is_symmetric", "is_exclusive", "is_system", "sort_order")
SELECT gen_random_uuid(), t."id", v."code", v."label_forward", v."label_inverse",
       v."is_symmetric", v."is_exclusive", v."is_system", v."sort_order"
  FROM "tenant" t
  CROSS JOIN (VALUES
    ('guardian',          'Sorgeberechtigt',    'Sorgeberechtigt für',    false, false, true,  10),
    ('billing_recipient', 'Rechnungsempfänger', 'Rechnungsempfänger für', false, true,  true,  20),
    ('parent_of',         'Elternteil von',     'Kind von',               false, false, false, 30),
    ('spouse_of',         'Ehepartner von',     NULL,                     true,  false, false, 40)
  ) AS v("code", "label_forward", "label_inverse",
         "is_symmetric", "is_exclusive", "is_system", "sort_order")
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Only now: the role types exist and every remaining assignment points at one.
ALTER TABLE "contact_role" ADD CONSTRAINT "contact_role_type_fk"
  FOREIGN KEY ("role_code", "tenant_id")
  REFERENCES "public"."contact_role_type"("code", "tenant_id")
  ON DELETE restrict ON UPDATE restrict;
