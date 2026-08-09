-- Moved up by hand: drizzle-kit emitted this last, but note's three-column
-- foreign key below references exactly these columns and Postgres wants the
-- unique constraint to exist first.
ALTER TABLE "activity" ADD CONSTRAINT "activity_id_contact_tenant_key" UNIQUE("id","contact_id","tenant_id");--> statement-breakpoint
CREATE TABLE "note" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"activity_id" uuid,
	"note_date" date NOT NULL,
	"type" text NOT NULL,
	"text" text NOT NULL,
	"created_by" uuid NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"content_hash" text,
	"prev_hash" text,
	"corrects_note_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "note_id_contact_tenant_key" UNIQUE("id","contact_id","tenant_id"),
	CONSTRAINT "note_type_check" CHECK ("note"."type" in ('general', 'session', 'document', 'correspondence', 'addendum', 'other')),
	CONSTRAINT "note_lock_fields" CHECK (("note"."locked_at" is null and "note"."locked_by" is null and "note"."content_hash" is null)
          or ("note"."locked_at" is not null and "note"."locked_by" is not null and "note"."content_hash" is not null)),
	CONSTRAINT "note_prev_hash_requires_lock" CHECK ("note"."prev_hash" is null or "note"."locked_at" is not null),
	CONSTRAINT "note_hash_shape" CHECK (("note"."content_hash" is null or "note"."content_hash" ~ '^[0-9a-f]{64}$')
          and ("note"."prev_hash" is null or "note"."prev_hash" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "note_addendum_target" CHECK (("note"."type" = 'addendum') = ("note"."corrects_note_id" is not null)),
	CONSTRAINT "note_addendum_not_self" CHECK ("note"."corrects_note_id" is null or "note"."corrects_note_id" <> "note"."id")
);
--> statement-breakpoint
CREATE TABLE "note_file" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_path" text NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_file_storage_path_key" UNIQUE("tenant_id","storage_path"),
	CONSTRAINT "note_file_size_positive" CHECK ("note_file"."size_bytes" > 0),
	CONSTRAINT "note_file_sha256_shape" CHECK ("note_file"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "note_file_path_relative" CHECK ("note_file"."storage_path" !~ '^/' and "note_file"."storage_path" !~ '\.\.')
);
--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_contact_tenant_fk" FOREIGN KEY ("contact_id","tenant_id") REFERENCES "public"."contact"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_activity_contact_tenant_fk" FOREIGN KEY ("activity_id","contact_id","tenant_id") REFERENCES "public"."activity"("id","contact_id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_corrects_contact_tenant_fk" FOREIGN KEY ("corrects_note_id","contact_id","tenant_id") REFERENCES "public"."note"("id","contact_id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_created_by_tenant_fk" FOREIGN KEY ("created_by","tenant_id") REFERENCES "public"."app_user"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_locked_by_tenant_fk" FOREIGN KEY ("locked_by","tenant_id") REFERENCES "public"."app_user"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_file" ADD CONSTRAINT "note_file_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_file" ADD CONSTRAINT "note_file_note_tenant_fk" FOREIGN KEY ("note_id","tenant_id") REFERENCES "public"."note"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_contact_date_idx" ON "note" USING btree ("contact_id","note_date","created_at");--> statement-breakpoint
CREATE INDEX "note_activity_idx" ON "note" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "note_corrects_idx" ON "note" USING btree ("corrects_note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "note_chain_link_key" ON "note" USING btree ("contact_id","prev_hash") WHERE "note"."prev_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "note_chain_head_key" ON "note" USING btree ("contact_id") WHERE "note"."locked_at" is not null and "note"."prev_hash" is null;--> statement-breakpoint
CREATE INDEX "note_file_note_idx" ON "note_file" USING btree ("note_id");