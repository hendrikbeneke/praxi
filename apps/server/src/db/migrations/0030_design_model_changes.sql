CREATE TABLE "activity_type_preset_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"activity_type_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_type_preset_item_type_service_key" UNIQUE("activity_type_id","service_id"),
	CONSTRAINT "activity_type_preset_item_quantity_positive" CHECK ("activity_type_preset_item"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "activity_type" DROP CONSTRAINT "activity_type_single_preset";--> statement-breakpoint
ALTER TABLE "activity_type" DROP CONSTRAINT "activity_type_service_tenant_fk";
--> statement-breakpoint
ALTER TABLE "activity_type" DROP CONSTRAINT "activity_type_service_group_tenant_fk";
--> statement-breakpoint
-- Moved ahead of the `activity_type_preset_item` foreign keys below, which
-- need this to exist first — drizzle-kit ordered it after them.
ALTER TABLE "activity_type" ADD CONSTRAINT "activity_type_id_tenant_key" UNIQUE("id","tenant_id");
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "diagnosis" text;--> statement-breakpoint
ALTER TABLE "email_template" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "diagnosis" text;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_group" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "text_template" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_type_preset_item" ADD CONSTRAINT "activity_type_preset_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_type_preset_item" ADD CONSTRAINT "activity_type_preset_item_type_tenant_fk" FOREIGN KEY ("activity_type_id","tenant_id") REFERENCES "public"."activity_type"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_type_preset_item" ADD CONSTRAINT "activity_type_preset_item_service_tenant_fk" FOREIGN KEY ("service_id","tenant_id") REFERENCES "public"."service"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_type_preset_item_type_idx" ON "activity_type_preset_item" USING btree ("activity_type_id","position");--> statement-breakpoint
ALTER TABLE "activity_type" DROP COLUMN "default_service_id";--> statement-breakpoint
ALTER TABLE "activity_type" DROP COLUMN "default_service_group_id";
--> statement-breakpoint

-- The `updated_at` trigger from migration 0002, on the table just created.
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "activity_type_preset_item"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Row-level security per CLAUDE.md rule 1: policy created, then explicitly
-- DISABLED. Tenant isolation is enforced by the application — the tenant id
-- comes from the session via middleware/tenant.ts. See migration 0001.
CREATE POLICY "tenant_isolation" ON "activity_type_preset_item"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "activity_type_preset_item" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

COMMENT ON TABLE "activity_type_preset_item" IS
  'References only — service_id, quantity, position, nothing else. Never a '
  'price or a description: a type is a template for a template, and freezing '
  'either here would mean the catalogue price could never take effect. '
  'Resolved into activity_item rows exactly once, when the type is applied '
  '(CLAUDE.md rule 5). Never holds a service_group_id: picking a group in the '
  'settings resolves it into these rows immediately, so nothing here can '
  'drift when the group is renamed or emptied later.';
--> statement-breakpoint

COMMENT ON COLUMN "contact"."diagnosis" IS
  'A health datum under Art. 9 GDPR. Never logged, never in an error message, '
  'and never in the contact list — domain/contact.ts keeps it out of the list '
  'query''s column set, not just out of the response schema. Only master '
  'data, the invoice draft and the invoice PDF show it (CLAUDE.md rule 12).';
--> statement-breakpoint

COMMENT ON COLUMN "invoice"."diagnosis" IS
  'Prefilled from contact.diagnosis when the draft is created, then free to '
  'edit for this one invoice — plain text, not a reference, same as intro '
  'and outro. Frozen at finalization along with everything else on this row; '
  'protect_finalized_invoice compares the whole row rather than naming '
  'columns, so this needed no change to that trigger.';
--> statement-breakpoint

-- ── protect_finalized_invoice, third replacement (0014, 0019) ──────────────
-- Was an explicit list of protected columns, which meant every new column on
-- `invoice` was unprotected by default until someone remembered to add it
-- here — `diagnosis` above would have been exactly that trap. Inverted: diff
-- the whole row and name what is ALLOWED to change instead. A new column is
-- now frozen automatically; whoever needs it writable has to say so here.
--
-- `updated_at` has to be excluded — it changes on every UPDATE regardless of
-- what else does, so leaving it in would make this reject any update at all,
-- including the ones below that are supposed to pass. `id` and `tenant_id`
-- are included in the diff on purpose: neither should ever change on a
-- finalized invoice, and there was no reason to carve out an exception that
-- was never intended.
--
-- `RETURN coalesce(NEW, OLD)`, not `RETURN NEW`: see migration 0012.
CREATE OR REPLACE FUNCTION protect_finalized_invoice() RETURNS trigger AS $$
BEGIN
  -- Finalization itself is an UPDATE out of 'draft', so it passes here.
  IF OLD.status = 'draft' THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'finalized invoice cannot be deleted';
  END IF;

  IF OLD.cancelled_by_invoice_id IS NOT NULL
     AND NEW.cancelled_by_invoice_id IS DISTINCT FROM OLD.cancelled_by_invoice_id THEN
    RAISE EXCEPTION 'a cancelled invoice cannot be uncancelled';
  END IF;

  IF (to_jsonb(NEW) - 'status' - 'cancelled_by_invoice_id' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'status' - 'cancelled_by_invoice_id' - 'updated_at')
  THEN
    RAISE EXCEPTION 'finalized invoice is immutable except for its status';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;