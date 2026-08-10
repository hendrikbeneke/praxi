-- Generated, then edited by hand before it had ever run: two statements moved
-- to 0021 because they can only succeed once the data has moved.
--
--   * `activity_type_fk` — every existing activity has to point at a catalogue
--     entry, and the entries are created there.
--   * `appointment_status_check` — the existing rows may still say `attended`
--     or `no_show`, which the new set no longer allows. 0021 remaps them onto
--     `activity.status` first.
--
-- Dropping the old constraints stays here: a DROP cannot fail on data.
-- drizzle's snapshot describes the state after both files, as in 0016/0017.
CREATE TABLE "activity_type" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"color" text DEFAULT '#64748b' NOT NULL,
	"default_duration_min" integer,
	"default_service_id" uuid,
	"default_service_group_id" uuid,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_type_tenant_code_key" UNIQUE("tenant_id","code"),
	CONSTRAINT "activity_type_code_shape" CHECK ("activity_type"."code" ~ '^[a-z][a-z0-9_]{0,39}$'),
	CONSTRAINT "activity_type_color_shape" CHECK ("activity_type"."color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "activity_type_duration_positive" CHECK ("activity_type"."default_duration_min" is null or "activity_type"."default_duration_min" > 0),
	CONSTRAINT "activity_type_single_preset" CHECK (num_nonnulls("activity_type"."default_service_id", "activity_type"."default_service_group_id") <= 1)
);
--> statement-breakpoint
ALTER TABLE "activity" DROP CONSTRAINT "activity_type_check";--> statement-breakpoint
ALTER TABLE "activity_item" DROP CONSTRAINT "activity_item_duration_positive";--> statement-breakpoint
ALTER TABLE "appointment" DROP CONSTRAINT "appointment_status_check";--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "status" text DEFAULT 'planned' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_type" ADD CONSTRAINT "activity_type_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_type" ADD CONSTRAINT "activity_type_service_tenant_fk" FOREIGN KEY ("default_service_id","tenant_id") REFERENCES "public"."service"("id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "activity_type" ADD CONSTRAINT "activity_type_service_group_tenant_fk" FOREIGN KEY ("default_service_group_id","tenant_id") REFERENCES "public"."service_group"("id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "activity_type_tenant_sort_idx" ON "activity_type" USING btree ("tenant_id","sort_order","label");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_type_default_key" ON "activity_type" USING btree ("tenant_id") WHERE "activity_type"."is_default";--> statement-breakpoint
CREATE INDEX "activity_tenant_status_idx" ON "activity" USING btree ("tenant_id","status");--> statement-breakpoint
ALTER TABLE "activity_item" DROP COLUMN "duration_min";--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_status_check" CHECK ("activity"."status" in ('planned', 'rendered', 'no_show'));