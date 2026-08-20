-- Salutation, gender and country become catalogues (D-R3).
--
-- All three were fixed until here: the salutation was free text, the gender a
-- check constraint over three English identifiers, the country an ISO code
-- validated against a list of eight in packages/shared/src/country.ts. None of
-- the three is a rule the software depends on — they are the values a field at
-- a contact can take — so the practitioner maintains them.
--
-- Built like contact_role_type after 0035: id, tenant_id, label, sort_order.
-- No code as an anchor, so a label stays renamable and every contact follows;
-- no `active` flag, because an assignment is one nullable column that can
-- always be cleared, so there is no dead end for a flag to manage.
--
-- Three tables rather than one with a `kind`: one catalogue, one table, the
-- way every other catalogue in this schema is built.

CREATE TABLE "salutation" (
  "id"         uuid PRIMARY KEY NOT NULL,
  "tenant_id"  uuid NOT NULL REFERENCES "tenant"("id"),
  "label"      text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  -- What an entry is recognised by, now that there is no code.
  CONSTRAINT "salutation_tenant_label_key" UNIQUE ("tenant_id", "label"),
  -- The target of contact's composite foreign key.
  CONSTRAINT "salutation_id_tenant_key" UNIQUE ("id", "tenant_id")
);
--> statement-breakpoint
CREATE INDEX "salutation_tenant_sort_idx" ON "salutation" ("tenant_id", "sort_order", "label");
--> statement-breakpoint

CREATE TABLE "gender" (
  "id"         uuid PRIMARY KEY NOT NULL,
  "tenant_id"  uuid NOT NULL REFERENCES "tenant"("id"),
  "label"      text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gender_tenant_label_key" UNIQUE ("tenant_id", "label"),
  CONSTRAINT "gender_id_tenant_key" UNIQUE ("id", "tenant_id")
);
--> statement-breakpoint
CREATE INDEX "gender_tenant_sort_idx" ON "gender" ("tenant_id", "sort_order", "label");
--> statement-breakpoint

-- The odd one out: no label. A country's name is not maintained here, it is
-- resolved from the ISO code by countryName() in packages/shared. A renamed
-- country in a billing address would simply be wrong, and a second place
-- holding the same name would eventually hold a different one. What is
-- configured here is a SELECTION — which countries the contact form offers.
CREATE TABLE "country" (
  "id"         uuid PRIMARY KEY NOT NULL,
  "tenant_id"  uuid NOT NULL REFERENCES "tenant"("id"),
  "iso_code"   text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "country_tenant_iso_key" UNIQUE ("tenant_id", "iso_code"),
  CONSTRAINT "country_id_tenant_key" UNIQUE ("id", "tenant_id"),
  -- ISO 3166-1 alpha-2, upper case. A field of the row, not an anchor: the
  -- reference still runs over the id.
  CONSTRAINT "country_iso_code_shape" CHECK ("iso_code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE INDEX "country_tenant_sort_idx" ON "country" ("tenant_id", "sort_order", "iso_code");
--> statement-breakpoint

CREATE TRIGGER set_updated_at BEFORE UPDATE ON "salutation"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "gender"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "country"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Row-level security per CLAUDE.md rule 1: policies created, then explicitly
-- DISABLED. Tenant isolation is enforced by the application.
CREATE POLICY "tenant_isolation" ON "salutation"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "salutation" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "gender"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "gender" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "country"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "country" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ---------------------------------------------------------------- the move

ALTER TABLE "contact" ADD COLUMN "salutation_id" uuid;
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "gender_id" uuid;
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "country_id" uuid;
--> statement-breakpoint

-- The presets, for every tenant that already exists. A frozen copy of what
-- db/seed/value-lists.ts creates for a new one; that file is the living
-- definition, this one is history — the same split as migration 0017.
INSERT INTO "salutation" ("id", "tenant_id", "label", "sort_order")
SELECT gen_random_uuid(), t."id", v."label", v."sort_order"
  FROM "tenant" t
  CROSS JOIN (VALUES ('Herr', 10), ('Frau', 20), ('Firma', 30))
    AS v("label", "sort_order")
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "gender" ("id", "tenant_id", "label", "sort_order")
SELECT gen_random_uuid(), t."id", v."label", v."sort_order"
  FROM "tenant" t
  CROSS JOIN (VALUES ('weiblich', 10), ('männlich', 20), ('divers', 30))
    AS v("label", "sort_order")
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Whatever already stands in the free-text field, each distinct value once.
-- After the presets, so an existing "Herr" does not become a second entry, and
-- numbered from 100 so the presets stay at the top.
INSERT INTO "salutation" ("id", "tenant_id", "label", "sort_order")
SELECT gen_random_uuid(), c."tenant_id", c."label",
       100 + row_number() OVER (PARTITION BY c."tenant_id" ORDER BY c."label")
  FROM (SELECT DISTINCT "tenant_id", btrim("salutation") AS "label"
          FROM "contact"
         WHERE "salutation" IS NOT NULL AND btrim("salutation") <> '') c
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Every country code in use, so no contact ends up pointing at a country the
-- selection does not offer.
INSERT INTO "country" ("id", "tenant_id", "iso_code", "sort_order")
SELECT gen_random_uuid(), c."tenant_id", c."country",
       row_number() OVER (PARTITION BY c."tenant_id" ORDER BY c."country")
  FROM (SELECT DISTINCT "tenant_id", "country" FROM "contact") c
ON CONFLICT DO NOTHING;
--> statement-breakpoint

UPDATE "contact" c SET "salutation_id" = s."id"
  FROM "salutation" s
 WHERE s."tenant_id" = c."tenant_id" AND s."label" = btrim(c."salutation");
--> statement-breakpoint

UPDATE "contact" c SET "gender_id" = g."id"
  FROM "gender" g
 WHERE g."tenant_id" = c."tenant_id"
   AND g."label" = CASE c."gender"
                     WHEN 'female'  THEN 'weiblich'
                     WHEN 'male'    THEN 'männlich'
                     WHEN 'diverse' THEN 'divers'
                   END;
--> statement-breakpoint

UPDATE "contact" c SET "country_id" = k."id"
  FROM "country" k
 WHERE k."tenant_id" = c."tenant_id" AND k."iso_code" = c."country";
--> statement-breakpoint

-- Not "is everything filled" — all three are optional. The question is whether
-- every row that HAD a value has one now. Checked here rather than left to a
-- constraint, which could only name itself and not the rows.
DO $$
DECLARE lost integer;
BEGIN
  SELECT count(*) INTO lost FROM "contact"
   WHERE ("salutation" IS NOT NULL AND btrim("salutation") <> ''
          AND "salutation_id" IS NULL)
      OR ("gender" IS NOT NULL AND "gender_id" IS NULL)
      OR ("country" IS NOT NULL AND "country_id" IS NULL);
  IF lost > 0 THEN
    RAISE EXCEPTION 'contact: % rows lost a value in the move', lost;
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "contact" DROP CONSTRAINT "contact_kind_fields";
--> statement-breakpoint
ALTER TABLE "contact" DROP CONSTRAINT "contact_gender_values";
--> statement-breakpoint
ALTER TABLE "contact" DROP COLUMN "salutation";
--> statement-breakpoint
ALTER TABLE "contact" DROP COLUMN "gender";
--> statement-breakpoint
-- Loses NOT NULL and DEFAULT 'DE' with it. The country is genuinely optional
-- now: empty means not recorded, not "Germany assumed".
ALTER TABLE "contact" DROP COLUMN "country";
--> statement-breakpoint

ALTER TABLE "contact" ADD CONSTRAINT "contact_kind_fields" CHECK ((
  "contact"."kind" = 'person'
    and "contact"."last_name" is not null
    and "contact"."company_name" is null and "contact"."contact_person" is null
) or (
  "contact"."kind" = 'organization'
    and "contact"."company_name" is not null
    and "contact"."title" is null
    and "contact"."first_name" is null and "contact"."last_name" is null
    and "contact"."date_of_birth" is null
    and "contact"."birth_place" is null and "contact"."gender_id" is null
));
--> statement-breakpoint

-- The salutation is deliberately NOT named above anymore. "Firma Mustermann
-- GmbH" is the usual first line of a German address, and there the salutation
-- is what it is for a person too — a prefix to the name, not a personal
-- attribute. `title`, `first_name`, `date_of_birth` and `gender_id` stay
-- forbidden for an organization, because those really do apply to people only.
ALTER TABLE "contact" ADD CONSTRAINT "contact_salutation_fk"
  FOREIGN KEY ("salutation_id", "tenant_id")
  REFERENCES "public"."salutation" ("id", "tenant_id")
  ON UPDATE restrict ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_gender_fk"
  FOREIGN KEY ("gender_id", "tenant_id")
  REFERENCES "public"."gender" ("id", "tenant_id")
  ON UPDATE restrict ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_country_fk"
  FOREIGN KEY ("country_id", "tenant_id")
  REFERENCES "public"."country" ("id", "tenant_id")
  ON UPDATE restrict ON DELETE restrict;
--> statement-breakpoint

-- On the child side, so deleting a catalogue entry does not seq-scan `contact`
-- — and neither does the count the domain runs first for its message.
CREATE INDEX "contact_salutation_idx" ON "contact" ("salutation_id");
--> statement-breakpoint
CREATE INDEX "contact_gender_idx" ON "contact" ("gender_id");
--> statement-breakpoint
CREATE INDEX "contact_country_idx" ON "contact" ("country_id");
--> statement-breakpoint

-- The practice's own country is NOT one of the catalogues above. It is a
-- system property — which law applies hangs on it: VAT, what an invoice must
-- state, how long records are kept — so the set is given, not configured.
-- `practiceCountries` in packages/shared holds it, and this constraint is what
-- makes the claim enforceable: an entry there is an assertion that those rules
-- were implemented, so adding one is a commit and a migration, never a screen.
ALTER TABLE "practice_settings" ADD CONSTRAINT "practice_settings_country_supported"
  CHECK ("country" IN ('DE'));
