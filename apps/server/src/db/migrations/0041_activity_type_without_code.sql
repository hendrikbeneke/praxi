-- B1: the activity type loses its `code`, exactly as the role catalogue did in
-- migration 0035, and for the same reason: the code was a stable anchor for
-- logic that might key off a particular entry, and no such logic exists.
-- CLAUDE.md rule 6 says it in as many words — "there are no system entries,
-- nothing in the software depends on a particular type existing" — so the code
-- was one more name to keep in step, and it showed on screen as a field that
-- could be looked at and not edited.
--
-- The label becomes what an entry is recognised by, hence unique per tenant.
-- `contact_relation_type` keeps its code: there the codes carry real logic
-- (`billing_recipient` decides who an invoice goes to), which is the whole
-- distinction.

-- 1 · activity points at the id -------------------------------------------

ALTER TABLE "activity" ADD COLUMN "activity_type_id" uuid;--> statement-breakpoint

UPDATE "activity" a
   SET "activity_type_id" = t."id"
  FROM "activity_type" t
 WHERE t."tenant_id" = a."tenant_id" AND t."code" = a."type";--> statement-breakpoint

-- Every activity has a type — `activity.type` was `not null` behind a foreign
-- key, so the update above cannot have left a gap.
ALTER TABLE "activity" ALTER COLUMN "activity_type_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "activity" DROP CONSTRAINT "activity_type_fk";--> statement-breakpoint
ALTER TABLE "activity" DROP COLUMN "type";--> statement-breakpoint

-- Composite, carrying the tenant, so a type of another tenant cannot be
-- assigned. RESTRICT on delete is what makes a type that is in use
-- undeletable; the domain refuses first so the message is a sentence.
ALTER TABLE "activity" ADD CONSTRAINT "activity_activity_type_fk"
  FOREIGN KEY ("activity_type_id","tenant_id")
  REFERENCES "public"."activity_type"("id","tenant_id")
  ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint

-- On the child side, so deleting a type does not seq-scan `activity` — the
-- same index `note` gained for `note_type_id` in 0038.
CREATE INDEX "activity_activity_type_idx" ON "activity" USING btree ("activity_type_id");--> statement-breakpoint

-- 2 · the code itself ------------------------------------------------------

ALTER TABLE "activity_type" DROP CONSTRAINT "activity_type_tenant_code_key";--> statement-breakpoint
ALTER TABLE "activity_type" DROP CONSTRAINT "activity_type_code_shape";--> statement-breakpoint
ALTER TABLE "activity_type" DROP COLUMN "code";--> statement-breakpoint

-- What a type is recognised by now that there is no code. Two types reading
-- "Erstgespräch" would be indistinguishable in the calendar and in every
-- picker.
ALTER TABLE "activity_type" ADD CONSTRAINT "activity_type_tenant_label_key"
  UNIQUE("tenant_id","label");--> statement-breakpoint

COMMENT ON COLUMN "activity"."activity_type_id" IS
  'The catalogue entry this activity is of (CLAUDE.md rule 6). Pointed at activity_type.code until migration 0041; a type has no code anymore, so the id is the anchor.';
