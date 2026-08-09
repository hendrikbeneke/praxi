CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'finalized', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('invoice', 'cancellation_invoice');--> statement-breakpoint
CREATE TYPE "public"."text_template_kind" AS ENUM('intro', 'outro');--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"type" "invoice_type" DEFAULT 'invoice' NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"number" text,
	"number_prefix" text,
	"number_value" integer,
	"invoice_date" date NOT NULL,
	"payment_term_days" integer NOT NULL,
	"recipient_snapshot" jsonb,
	"intro_text" text,
	"outro_text" text,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"pdf_path" text,
	"pdf_hash" text,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "invoice_number_key" UNIQUE("tenant_id","number"),
	CONSTRAINT "invoice_number_value_key" UNIQUE("tenant_id","number_prefix","number_value"),
	CONSTRAINT "invoice_draft_fields" CHECK (("invoice"."status" = 'draft'
             and "invoice"."number" is null and "invoice"."number_value" is null
             and "invoice"."number_prefix" is null and "invoice"."pdf_path" is null
             and "invoice"."pdf_hash" is null and "invoice"."finalized_at" is null)
          or ("invoice"."status" <> 'draft'
             and "invoice"."number" is not null and "invoice"."number_value" is not null
             and "invoice"."number_prefix" is not null and "invoice"."pdf_path" is not null
             and "invoice"."pdf_hash" is not null and "invoice"."finalized_at" is not null
             and "invoice"."recipient_snapshot" is not null)),
	CONSTRAINT "invoice_pdf_hash_shape" CHECK ("invoice"."pdf_hash" is null or "invoice"."pdf_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "invoice_number_value_positive" CHECK ("invoice"."number_value" is null or "invoice"."number_value" >= 1),
	CONSTRAINT "invoice_payment_term_range" CHECK ("invoice"."payment_term_days" between 0 and 365)
);
--> statement-breakpoint
CREATE TABLE "invoice_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"activity_item_id" uuid,
	"description" text NOT NULL,
	"fee_code" text,
	"date_of_service" date,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"amount_cents" integer GENERATED ALWAYS AS ("quantity" * "unit_price_cents") STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_line_item_once_key" UNIQUE("invoice_id","activity_item_id"),
	CONSTRAINT "invoice_line_quantity_positive" CHECK ("invoice_line"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "text_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text_template_kind NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_paid_variant" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "text_template_tenant_kind_name_key" UNIQUE("tenant_id","kind","name"),
	CONSTRAINT "text_template_paid_is_outro" CHECK (not "text_template"."is_paid_variant" or "text_template"."kind" = 'outro')
);
--> statement-breakpoint
ALTER TABLE "number_range" ADD COLUMN "prefix" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "number_range" ADD COLUMN "padding" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_settings" ADD COLUMN "invoice_template_path" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_contact_tenant_fk" FOREIGN KEY ("contact_id","tenant_id") REFERENCES "public"."contact"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_invoice_tenant_fk" FOREIGN KEY ("invoice_id","tenant_id") REFERENCES "public"."invoice"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_activity_item_tenant_fk" FOREIGN KEY ("activity_item_id","tenant_id") REFERENCES "public"."activity_item"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_template" ADD CONSTRAINT "text_template_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_contact_idx" ON "invoice" USING btree ("contact_id","invoice_date");--> statement-breakpoint
CREATE INDEX "invoice_tenant_status_idx" ON "invoice" USING btree ("tenant_id","status","invoice_date");--> statement-breakpoint
CREATE INDEX "invoice_line_invoice_idx" ON "invoice_line" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE INDEX "invoice_line_activity_item_idx" ON "invoice_line" USING btree ("activity_item_id") WHERE "invoice_line"."activity_item_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "text_template_default_key" ON "text_template" USING btree ("tenant_id","kind") WHERE "text_template"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "text_template_paid_key" ON "text_template" USING btree ("tenant_id") WHERE "text_template"."is_paid_variant";--> statement-breakpoint
ALTER TABLE "number_range" ADD CONSTRAINT "number_range_padding_range" CHECK ("number_range"."padding" between 1 and 12);--> statement-breakpoint
ALTER TABLE "number_range" ADD CONSTRAINT "number_range_prefix_shape" CHECK ("number_range"."prefix" ~ '^[A-Za-z0-9._-]*$');