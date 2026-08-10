-- The `updated_at` trigger from migration 0002, on the table just created.
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "activity_type"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Row-level security per CLAUDE.md rule 1: policy created, then explicitly
-- DISABLED. Tenant isolation is enforced by the application — the tenant id
-- comes from the session via middleware/tenant.ts. See migration 0001.
CREATE POLICY "tenant_isolation" ON "activity_type"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "activity_type" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

COMMENT ON COLUMN "activity"."status" IS
  'What became of the activity. Descriptive only: it does NOT gate billing. '
  'Anything in the past can be invoiced whatever this says, and the billable '
  'query does not read it — billability is activity_item.billable '
  '(CLAUDE.md rule 6). appointment.status says what became of the slot.';
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The status split. Read before overwriting: the first two statements take
-- what the appointment knew and put it on the activity, the next two clear the
-- two values out of appointment.status.
--
-- This loses one distinction: an `attended` appointment becomes `confirmed`
-- and a `no_show` one becomes `planned`, so afterwards it is no longer visible
-- whether the slot had been confirmed before the session took place. Agreed
-- beforehand, and folded into the plan, because the alternative — guessing a
-- confirmation that was never recorded — would invent data.
-- ---------------------------------------------------------------------------
UPDATE "activity" a SET "status" = 'rendered'
  FROM "appointment" p
 WHERE p."id" = a."appointment_id" AND p."status" = 'attended';
--> statement-breakpoint
UPDATE "activity" a SET "status" = 'no_show'
  FROM "appointment" p
 WHERE p."id" = a."appointment_id" AND p."status" = 'no_show';
--> statement-breakpoint
UPDATE "appointment" SET "status" = 'confirmed' WHERE "status" = 'attended';
--> statement-breakpoint
-- `no_show` held the slot, and `planned` still does — the exclusion constraint
-- in 0009 names only the two cancellations, so the slot stays occupied.
UPDATE "appointment" SET "status" = 'planned' WHERE "status" = 'no_show';
--> statement-breakpoint

-- The catalogue keeps `session`, `talk` and `consultation` as codes, so every
-- existing activity migrates unchanged. `other` is the one that has no
-- successor: a placeholder is not a type the practitioner would maintain, and
-- `consultation` is the closest reading of what was entered under it.
UPDATE "activity" SET "type" = 'consultation' WHERE "type" = 'other';
--> statement-breakpoint

-- The presets, for every tenant that already exists. A frozen copy of what
-- `db/seed/activity-types.ts` creates for a new one; that file is the living
-- definition, this one is history. No durations and no default service or
-- group: inventing either would put made-up defaults on real activities.
-- Ids are v4 rather than the application's v7 because they are made here.
INSERT INTO "activity_type"
  ("id", "tenant_id", "code", "label", "color", "is_default", "sort_order")
SELECT gen_random_uuid(), t."id", v."code", v."label", v."color", v."is_default", v."sort_order"
  FROM "tenant" t
  CROSS JOIN (VALUES
    ('initial',      'Erstgespräch',  '#2563eb', false, 10),
    ('session',      'Folgesitzung',  '#0d9488', true,  20),
    ('talk',         'Vortrag',       '#d97706', false, 30),
    ('consultation', 'Beratung',      '#7c3aed', false, 40)
  ) AS v("code", "label", "color", "is_default", "sort_order")
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Only now, with the catalogue in place and every activity pointing at one of
-- its codes.
ALTER TABLE "activity" ADD CONSTRAINT "activity_type_fk"
  FOREIGN KEY ("type", "tenant_id")
  REFERENCES "public"."activity_type"("code", "tenant_id")
  ON DELETE restrict ON UPDATE restrict;
--> statement-breakpoint

-- …and only now, with `attended` and `no_show` gone from the column.
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_status_check"
  CHECK ("appointment"."status" in ('requested', 'planned', 'confirmed', 'cancelled', 'cancelled_late'));
