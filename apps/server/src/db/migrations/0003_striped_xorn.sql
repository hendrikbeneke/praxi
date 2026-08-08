CREATE TYPE "public"."contact_kind" AS ENUM('person', 'organization');--> statement-breakpoint
CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_number" integer NOT NULL,
	"kind" "contact_kind" NOT NULL,
	"salutation" text,
	"title" text,
	"first_name" text,
	"last_name" text,
	"date_of_birth" date,
	"company_name" text,
	"contact_person" text,
	"vat_id" text,
	"street" text,
	"postal_code" text,
	"city" text,
	"country" text DEFAULT 'DE' NOT NULL,
	"email" text,
	"phone" text,
	"internal_note" text,
	"archived_at" timestamp with time zone,
	"sort_name" text GENERATED ALWAYS AS (coalesce("company_name", btrim(coalesce("last_name", '') || ' ' || coalesce("first_name", '')))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_tenant_number_key" UNIQUE("tenant_id","contact_number"),
	CONSTRAINT "contact_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "contact_number_positive" CHECK ("contact"."contact_number" >= 1),
	CONSTRAINT "contact_kind_fields" CHECK ((
        "contact"."kind" = 'person'
          and "contact"."last_name" is not null
          and "contact"."company_name" is null and "contact"."contact_person" is null
      ) or (
        "contact"."kind" = 'organization'
          and "contact"."company_name" is not null
          and "contact"."salutation" is null and "contact"."title" is null
          and "contact"."first_name" is null and "contact"."last_name" is null
          and "contact"."date_of_birth" is null
      ))
);
--> statement-breakpoint
CREATE TABLE "contact_role" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"role" text NOT NULL,
	"since" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_role_contact_role_key" UNIQUE("contact_id","role"),
	CONSTRAINT "contact_role_role_check" CHECK ("contact_role"."role" in ('patient', 'prospect', 'participant', 'guardian', 'billing_recipient', 'other'))
);
--> statement-breakpoint
CREATE TABLE "number_range" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"next_value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "number_range_tenant_code_key" UNIQUE("tenant_id","code"),
	CONSTRAINT "number_range_next_value_positive" CHECK ("number_range"."next_value" >= 1)
);
--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_role" ADD CONSTRAINT "contact_role_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_role" ADD CONSTRAINT "contact_role_contact_tenant_fk" FOREIGN KEY ("contact_id","tenant_id") REFERENCES "public"."contact"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_range" ADD CONSTRAINT "number_range_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_tenant_sort_idx" ON "contact" USING btree ("tenant_id","sort_name");--> statement-breakpoint
CREATE INDEX "contact_role_tenant_role_idx" ON "contact_role" USING btree ("tenant_id","role");