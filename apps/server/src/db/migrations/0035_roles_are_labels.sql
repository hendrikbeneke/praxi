-- Roles become a plain label (D-R1).
--
-- Until here a role type carried three things that made it more than a name:
-- a `code` other rows pointed at, an `is_system` flag that froze the entry,
-- and an `active` flag. All three existed because logic was allowed to depend
-- on a particular role — `patient` was named as the one deciding what is
-- pseudonymized towards Google. It never did: nothing outside a comment ever
-- read that code. The pseudonymization is a switch on the Google connection
-- now (migration 0036), and with it the last reason for any of this is gone.
--
-- `contact_relation_type` is deliberately untouched. There the codes DO carry
-- logic — `billing_recipient` decides who an invoice goes to and is exclusive,
-- `guardian` drives the minor's notice in the contact record — so its `code`,
-- its `is_system` flag and `protect_system_type()` stay exactly as they are.

-- The target of the new composite foreign key. `contact_role` used to point at
-- (code, tenant_id); the anchor is the id from here on.
ALTER TABLE "contact_role_type"
  ADD CONSTRAINT "contact_role_type_id_tenant_key" UNIQUE ("id", "tenant_id");
--> statement-breakpoint

-- The move itself: nullable, filled, then fixed.
ALTER TABLE "contact_role" ADD COLUMN "role_type_id" uuid;
--> statement-breakpoint

UPDATE "contact_role" r
   SET "role_type_id" = t."id"
  FROM "contact_role_type" t
 WHERE t."tenant_id" = r."tenant_id" AND t."code" = r."role_code";
--> statement-breakpoint

-- Checked rather than left to SET NOT NULL. The existing foreign key
-- guarantees every assignment resolves, so this cannot fire — but learning the
-- opposite from a constraint violation names the constraint, not the rows.
DO $$
DECLARE orphans integer;
BEGIN
  SELECT count(*) INTO orphans FROM "contact_role" WHERE "role_type_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'contact_role: % rows have no role type after the move', orphans;
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "contact_role" ALTER COLUMN "role_type_id" SET NOT NULL;
--> statement-breakpoint

-- The old way out.
ALTER TABLE "contact_role" DROP CONSTRAINT "contact_role_type_fk";
--> statement-breakpoint
ALTER TABLE "contact_role" DROP CONSTRAINT "contact_role_contact_role_key";
--> statement-breakpoint
DROP INDEX "contact_role_tenant_role_idx";
--> statement-breakpoint
ALTER TABLE "contact_role" DROP COLUMN "role_code";
--> statement-breakpoint

-- And the new one. Composite, carrying tenant_id, so a role type of another
-- tenant cannot be assigned — the same shape as before, on a different anchor.
-- ON UPDATE RESTRICT has nothing to cascade: an id never changes.
ALTER TABLE "contact_role" ADD CONSTRAINT "contact_role_type_fk"
  FOREIGN KEY ("role_type_id", "tenant_id")
  REFERENCES "public"."contact_role_type" ("id", "tenant_id")
  ON UPDATE restrict ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "contact_role"
  ADD CONSTRAINT "contact_role_contact_type_key" UNIQUE ("contact_id", "role_type_id");
--> statement-breakpoint
CREATE INDEX "contact_role_tenant_type_idx" ON "contact_role" ("tenant_id", "role_type_id");
--> statement-breakpoint

-- The system protection. The FUNCTION stays — contact_relation_type's trigger
-- uses it, and it reads NEW.code and NEW.is_system, both of which still exist
-- there. Only the trigger on this table goes.
DROP TRIGGER "contact_role_type_protect_system" ON "contact_role_type";
--> statement-breakpoint
ALTER TABLE "contact_role_type" DROP COLUMN "is_system";
--> statement-breakpoint

-- The code. It was the handle contact_role pointed at, and therefore frozen;
-- without the system protection there is no reason for a semantic anchor.
ALTER TABLE "contact_role_type" DROP CONSTRAINT "contact_role_type_code_shape";
--> statement-breakpoint
ALTER TABLE "contact_role_type" DROP CONSTRAINT "contact_role_type_tenant_code_key";
--> statement-breakpoint
ALTER TABLE "contact_role_type" DROP COLUMN "code";
--> statement-breakpoint

-- `active` goes because it raises four questions and prevents nothing: is an
-- inactive role shown while editing a contact that holds it, does it stay in
-- the filter, and if not, how are those contacts found again? With `service`
-- it is different — a service on a finalized invoice can never be removed, so
-- there has to be a way to take it out of the selection. A role assignment is
-- a row of its own with nothing hanging off it: untick it everywhere, then
-- delete the type. Work, but never a dead end.
ALTER TABLE "contact_role_type" DROP COLUMN "active";
--> statement-breakpoint

-- What the label now is. With the code gone this is the only thing a role is
-- recognised by, and two roles reading "Patient" would put two identically
-- named tabs in the contact list with no way to tell them apart.
ALTER TABLE "contact_role_type"
  ADD CONSTRAINT "contact_role_type_tenant_label_key" UNIQUE ("tenant_id", "label");
