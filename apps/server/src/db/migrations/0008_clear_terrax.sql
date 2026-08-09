CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"duration_min" integer,
	"appointment_id" uuid,
	"title" text,
	"internal_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_appointment_key" UNIQUE("appointment_id"),
	CONSTRAINT "activity_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "activity_type_check" CHECK ("activity"."type" in ('session', 'talk', 'consultation', 'other')),
	CONSTRAINT "activity_duration_positive" CHECK ("activity"."duration_min" is null or "activity"."duration_min" > 0)
);
--> statement-breakpoint
CREATE TABLE "activity_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"service_id" uuid,
	"description" text NOT NULL,
	"fee_code" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"duration_min" integer,
	"billable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_item_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "activity_item_quantity_positive" CHECK ("activity_item"."quantity" > 0),
	CONSTRAINT "activity_item_duration_positive" CHECK ("activity_item"."duration_min" is null or "activity_item"."duration_min" > 0)
);
--> statement-breakpoint
CREATE TABLE "appointment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"title" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_id_contact_tenant_key" UNIQUE("id","contact_id","tenant_id"),
	CONSTRAINT "appointment_status_check" CHECK ("appointment"."status" in ('planned', 'confirmed', 'attended', 'cancelled', 'cancelled_late', 'no_show')),
	CONSTRAINT "appointment_ends_after_starts" CHECK ("appointment"."ends_at" > "appointment"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_contact_tenant_fk" FOREIGN KEY ("contact_id","tenant_id") REFERENCES "public"."contact"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_appointment_contact_tenant_fk" FOREIGN KEY ("appointment_id","contact_id","tenant_id") REFERENCES "public"."appointment"("id","contact_id","tenant_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_item" ADD CONSTRAINT "activity_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_item" ADD CONSTRAINT "activity_item_activity_tenant_fk" FOREIGN KEY ("activity_id","tenant_id") REFERENCES "public"."activity"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_item" ADD CONSTRAINT "activity_item_service_tenant_fk" FOREIGN KEY ("service_id","tenant_id") REFERENCES "public"."service"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_contact_tenant_fk" FOREIGN KEY ("contact_id","tenant_id") REFERENCES "public"."contact"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_tenant_occurred_idx" ON "activity" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_contact_idx" ON "activity" USING btree ("contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_item_activity_idx" ON "activity_item" USING btree ("activity_id","position");--> statement-breakpoint
CREATE INDEX "appointment_tenant_starts_idx" ON "appointment" USING btree ("tenant_id","starts_at");