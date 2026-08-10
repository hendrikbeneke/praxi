-- Slice: contact fields for a person, and the address split.
--
-- Hand-written rather than generated, because drizzle-kit writes neither the
-- DROP/ADD swap of a check constraint nor the COMMENTs, and it would order the
-- column drop and the constraint change by its own rules.
--
-- `meta/0028_snapshot.json` beside this file is hand-written too, derived from
-- 0026 (the last generated one; 0027 was triggers and RLS, which drizzle-kit
-- does not model). It has to exist: the next `drizzle-kit generate` diffs
-- schema.ts against the newest snapshot, and without this one it would emit
-- these columns a second time.
--
-- No data is carried from `phone` to `phone_landline`. Everything in the
-- development database is development data; nothing has a phone number yet,
-- and until go-live a row that no longer fits a schema change is deleted
-- rather than nursed along in a migration.

ALTER TABLE "contact"
  ADD COLUMN "gender" text,
  ADD COLUMN "birth_place" text,
  ADD COLUMN "house_number" text,
  ADD COLUMN "phone_mobile" text,
  ADD COLUMN "phone_landline" text;

ALTER TABLE "contact" DROP COLUMN "phone";

ALTER TABLE "contact"
  ADD CONSTRAINT "contact_gender_values"
  CHECK ("gender" is null or "gender" in ('female', 'male', 'diverse'));

-- `kind` decides which fields apply, and the database says so. Gender and
-- birth place are person fields, like the salutation and the date of birth.
ALTER TABLE "contact" DROP CONSTRAINT "contact_kind_fields";
ALTER TABLE "contact" ADD CONSTRAINT "contact_kind_fields" CHECK ((
        "contact"."kind" = 'person'
          and "contact"."last_name" is not null
          and "contact"."company_name" is null and "contact"."contact_person" is null
      ) or (
        "contact"."kind" = 'organization'
          and "contact"."company_name" is not null
          and "contact"."salutation" is null and "contact"."title" is null
          and "contact"."first_name" is null and "contact"."last_name" is null
          and "contact"."date_of_birth" is null
          and "contact"."birth_place" is null and "contact"."gender" is null
      ));

COMMENT ON COLUMN "contact"."gender" IS
  'female | male | diverse — the three entries German civil status law knows. NULL means not recorded and is at the same time the fourth state the law has, "no entry"; there is deliberately no `unspecified` value beside it. The salutation is NOT derived from this: "Familie" and "Herr und Frau" have to stay possible, so it remains free text in its own column.';

COMMENT ON COLUMN "contact"."house_number" IS
  'Its own column, not part of the street. The address line is assembled by formatStreetLine() in packages/shared, shared by the screen and the invoice PDF. A recipient_snapshot written before this column existed has no house number and renders exactly as it did then.';
