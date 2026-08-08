CREATE TABLE "service" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"short_code" text,
	"description" text NOT NULL,
	"fee_code" text,
	"default_price_cents" integer NOT NULL,
	"default_duration_min" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "service_price_not_negative" CHECK ("service"."default_price_cents" >= 0),
	CONSTRAINT "service_duration_positive" CHECK ("service"."default_duration_min" is null or "service"."default_duration_min" > 0)
);
--> statement-breakpoint
CREATE TABLE "service_group" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_group_tenant_name_key" UNIQUE("tenant_id","name"),
	CONSTRAINT "service_group_id_tenant_key" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "service_group_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"service_group_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_group_item_group_service_key" UNIQUE("service_group_id","service_id"),
	CONSTRAINT "service_group_item_quantity_positive" CHECK ("service_group_item"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_group" ADD CONSTRAINT "service_group_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_group_item" ADD CONSTRAINT "service_group_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_group_item" ADD CONSTRAINT "service_group_item_group_tenant_fk" FOREIGN KEY ("service_group_id","tenant_id") REFERENCES "public"."service_group"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_group_item" ADD CONSTRAINT "service_group_item_service_tenant_fk" FOREIGN KEY ("service_id","tenant_id") REFERENCES "public"."service"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_tenant_short_code_key" ON "service" USING btree ("tenant_id","short_code") WHERE "service"."short_code" is not null;--> statement-breakpoint
CREATE INDEX "service_group_item_group_idx" ON "service_group_item" USING btree ("service_group_id","position");