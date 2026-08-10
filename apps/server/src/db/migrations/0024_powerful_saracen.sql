-- Slice 9 — the Google Calendar projection.
--
-- Reordered by hand against what drizzle-kit generated: the two composite
-- foreign keys point at `appointment (id, tenant_id)`, so that unique
-- constraint has to exist before they are added. Everything else is as
-- generated. The triggers, RLS policies and comments follow in 0025.

ALTER TABLE "appointment" ADD COLUMN "google_event_id" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "google_etag" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "last_pushed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_google_event_key" ON "appointment" USING btree ("tenant_id","google_event_id") WHERE "appointment"."google_event_id" is not null;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_id_tenant_key" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_google_etag_requires_event" CHECK ("appointment"."google_etag" is null or "appointment"."google_event_id" is not null);--> statement-breakpoint
CREATE TABLE "appointment_sync_conflict" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"remote_starts_at" timestamp with time zone NOT NULL,
	"remote_ends_at" timestamp with time zone NOT NULL,
	"remote_cancelled" boolean DEFAULT false NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_sync_conflict_appointment_key" UNIQUE("appointment_id"),
	CONSTRAINT "appointment_sync_conflict_reason_check" CHECK ("appointment_sync_conflict"."reason" in ('both_changed', 'overlap')),
	CONSTRAINT "appointment_sync_conflict_ends_after_starts" CHECK ("appointment_sync_conflict"."remote_ends_at" > "appointment_sync_conflict"."remote_starts_at")
);
--> statement-breakpoint
CREATE TABLE "google_connection" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_email" text,
	"refresh_token_cipher" text NOT NULL,
	"key_fingerprint" text NOT NULL,
	"calendar_id" text,
	"freebusy_calendar_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sync_token" text,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_connection_tenantId_unique" UNIQUE("tenant_id"),
	CONSTRAINT "google_connection_fingerprint_shape" CHECK ("google_connection"."key_fingerprint" ~ '^[0-9a-f]{16}$')
);
--> statement-breakpoint
CREATE TABLE "google_sync_queue" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"appointment_id" uuid,
	"operation" text NOT NULL,
	"calendar_id" text NOT NULL,
	"google_event_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_sync_queue_operation_check" CHECK ("google_sync_queue"."operation" in ('upsert', 'delete')),
	CONSTRAINT "google_sync_queue_delete_shape" CHECK (("google_sync_queue"."operation" = 'delete') = ("google_sync_queue"."google_event_id" is not null)),
	CONSTRAINT "google_sync_queue_upsert_shape" CHECK (("google_sync_queue"."operation" = 'upsert') = ("google_sync_queue"."appointment_id" is not null)),
	CONSTRAINT "google_sync_queue_attempts_positive" CHECK ("google_sync_queue"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "appointment_sync_conflict" ADD CONSTRAINT "appointment_sync_conflict_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_sync_conflict" ADD CONSTRAINT "appointment_sync_conflict_appointment_tenant_fk" FOREIGN KEY ("appointment_id","tenant_id") REFERENCES "public"."appointment"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_connection" ADD CONSTRAINT "google_connection_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_sync_queue" ADD CONSTRAINT "google_sync_queue_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_sync_queue" ADD CONSTRAINT "google_sync_queue_appointment_tenant_fk" FOREIGN KEY ("appointment_id","tenant_id") REFERENCES "public"."appointment"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_sync_conflict_tenant_idx" ON "appointment_sync_conflict" USING btree ("tenant_id","detected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "google_sync_queue_appointment_key" ON "google_sync_queue" USING btree ("appointment_id") WHERE "google_sync_queue"."appointment_id" is not null;--> statement-breakpoint
CREATE INDEX "google_sync_queue_due_idx" ON "google_sync_queue" USING btree ("tenant_id","next_attempt_at");
