-- `contact_relation` points at the type's id, and the code becomes system-only.
--
-- The last catalogue reference in the schema that still ran over a `code`. The
-- roles went to the id in 0035 and the activity types in B1/0041; three tables
-- and two patterns is what was left, for no reason anyone could name.
--
-- WHAT THE CODE IS STILL FOR, and why it is not simply dropped: `guardian` and
-- `billing_recipient` are looked up BY CODE in the application — a uuid reads
-- differently in every installation, so it cannot be written into
-- `domain/invoice.ts`. What changes is that only the entries logic points at
-- have to carry one. A practitioner-made type gets NULL, and the check
-- constraint below turns "a system entry has an anchor" from a habit into
-- something the database refuses to break.
--
-- The label takes over as what an entry is recognised by, which is what the
-- roles (0035) and the note types (0038) already do — and what the seed needs
-- once the codes are NULL, because NULL does not collide in a unique index and
-- a second run would insert `parent_of` all over again.
--
-- ON THE ORDER OF THE STATEMENTS. The backfill comes first, while the code is
-- still there to join on; then the old foreign key goes, and only then may the
-- unique key it depended on be dropped — Postgres refuses it the other way
-- round, which is the dependency saying so out loud. Nulling the codes is last,
-- because until `relation_code` is gone every one of them is still load-bearing.

-- 1) The relation gets its new column and the values to fill it, while the
--    code is still there to join on.
ALTER TABLE "contact_relation" ADD COLUMN "relation_type_id" uuid;--> statement-breakpoint

UPDATE "contact_relation" r
   SET "relation_type_id" = t."id"
  FROM "contact_relation_type" t
 WHERE t."tenant_id" = r."tenant_id" AND t."code" = r."relation_code";--> statement-breakpoint

-- The SET NOT NULL *is* the check on the backfill: a row the join did not
-- reach is still NULL and the statement fails, taking the whole migration with
-- it. A separate count would be a second statement about the same thing, and
-- two statements about one thing can disagree.
ALTER TABLE "contact_relation" ALTER COLUMN "relation_type_id" SET NOT NULL;--> statement-breakpoint

-- 2) The old reference goes, which is what frees the key it hangs from.
ALTER TABLE "contact_relation" DROP CONSTRAINT "contact_relation_type_fk";--> statement-breakpoint
ALTER TABLE "contact_relation" DROP CONSTRAINT "contact_relation_pair_key";--> statement-breakpoint
DROP INDEX "contact_relation_exclusive_key";--> statement-breakpoint

-- 3) The code becomes optional.
ALTER TABLE "contact_relation_type" ALTER COLUMN "code" DROP NOT NULL;--> statement-breakpoint

-- A plain unique constraint already tolerates several NULLs; the partial index
-- says out loud that this is the normal case rather than a gap.
ALTER TABLE "contact_relation_type" DROP CONSTRAINT "contact_relation_type_tenant_code_key";--> statement-breakpoint
CREATE UNIQUE INDEX "contact_relation_type_tenant_code_key"
  ON "contact_relation_type" ("tenant_id", "code") WHERE "code" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "contact_relation_type"
  ADD CONSTRAINT "contact_relation_type_tenant_label_key" UNIQUE ("tenant_id", "label_forward");--> statement-breakpoint

ALTER TABLE "contact_relation_type"
  ADD CONSTRAINT "contact_relation_type_system_needs_code"
  CHECK (NOT "is_system" OR "code" IS NOT NULL);--> statement-breakpoint

-- The target of the new composite foreign key. The table never needed one
-- while the reference ran over the code.
ALTER TABLE "contact_relation_type"
  ADD CONSTRAINT "contact_relation_type_id_tenant_key" UNIQUE ("id", "tenant_id");--> statement-breakpoint

-- 4) The relation's constraints, rebuilt on the id.
ALTER TABLE "contact_relation" ADD CONSTRAINT "contact_relation_type_fk"
  FOREIGN KEY ("relation_type_id", "tenant_id")
  REFERENCES "contact_relation_type" ("id", "tenant_id")
  ON UPDATE RESTRICT ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE "contact_relation" ADD CONSTRAINT "contact_relation_pair_key"
  UNIQUE ("from_contact_id", "to_contact_id", "relation_type_id");--> statement-breakpoint

CREATE UNIQUE INDEX "contact_relation_exclusive_key"
  ON "contact_relation" ("from_contact_id", "relation_type_id") WHERE "exclusive";--> statement-breakpoint

CREATE INDEX "contact_relation_type_idx" ON "contact_relation" ("relation_type_id");--> statement-breakpoint

-- 5) The mirror trigger reads the type by id.
CREATE OR REPLACE FUNCTION contact_relation_set_exclusive() RETURNS trigger AS $$
BEGIN
  SELECT t.is_exclusive INTO STRICT NEW.exclusive
    FROM contact_relation_type t
   WHERE t.tenant_id = NEW.tenant_id AND t.id = NEW.relation_type_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

ALTER TABLE "contact_relation" DROP COLUMN "relation_code";--> statement-breakpoint

-- 6) Last, and only safe now that nothing references the code: the codes of
-- everything that is not a system entry. `protect_system_type` fires
-- `WHEN (old.is_system)`, so it does not object to these rows.
UPDATE "contact_relation_type" SET "code" = NULL WHERE NOT "is_system";--> statement-breakpoint

COMMENT ON COLUMN "contact_relation_type"."code" IS
  'Only system entries carry one. guardian and billing_recipient are looked up by this in the application, because a uuid differs per installation; every other entry is recognised by label_forward. See migration 0046.';--> statement-breakpoint
COMMENT ON COLUMN "contact_relation"."relation_type_id" IS
  'The type, by id. Ran over contact_relation_type.code until 0046 — the last catalogue reference in the schema that did.';
