-- Generated, then edited by hand before it had ever run — twice:
--
-- 1. drizzle-kit cannot see a rename without being asked interactively, so it
--    emitted ADD COLUMN "role_code" / DROP COLUMN "role", which would have
--    thrown every assigned role away. Replaced by a RENAME.
-- 2. the foreign key from contact_role to contact_role_type moved to 0017: it
--    can only be created once the role types exist and the values that are no
--    longer roles are gone, and both of those are data, which belongs in the
--    hand-written file. The snapshot describes the state after both
--    migrations, so no drift appears.
CREATE TABLE "contact_relation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"from_contact_id" uuid NOT NULL,
	"to_contact_id" uuid NOT NULL,
	"relation_code" text NOT NULL,
	"since" date,
	"exclusive" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_relation_pair_key" UNIQUE("from_contact_id","to_contact_id","relation_code"),
	CONSTRAINT "contact_relation_not_self" CHECK ("contact_relation"."from_contact_id" <> "contact_relation"."to_contact_id")
);
--> statement-breakpoint
CREATE TABLE "contact_relation_type" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label_forward" text NOT NULL,
	"label_inverse" text,
	"is_symmetric" boolean DEFAULT false NOT NULL,
	"is_exclusive" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_relation_type_tenant_code_key" UNIQUE("tenant_id","code"),
	CONSTRAINT "contact_relation_type_code_shape" CHECK ("contact_relation_type"."code" ~ '^[a-z][a-z0-9_]{0,39}$'),
	CONSTRAINT "contact_relation_type_inverse_label" CHECK (("contact_relation_type"."label_inverse" is not null) = (not "contact_relation_type"."is_symmetric"))
);
--> statement-breakpoint
CREATE TABLE "contact_role_type" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"show_as_tab" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_role_type_tenant_code_key" UNIQUE("tenant_id","code"),
	CONSTRAINT "contact_role_type_code_shape" CHECK ("contact_role_type"."code" ~ '^[a-z][a-z0-9_]{0,39}$')
);
--> statement-breakpoint
ALTER TABLE "contact_role" DROP CONSTRAINT "contact_role_contact_role_key";--> statement-breakpoint
ALTER TABLE "contact_role" DROP CONSTRAINT "contact_role_role_check";--> statement-breakpoint
DROP INDEX "contact_role_tenant_role_idx";--> statement-breakpoint
ALTER TABLE "contact_role" RENAME COLUMN "role" TO "role_code";--> statement-breakpoint
ALTER TABLE "contact_relation" ADD CONSTRAINT "contact_relation_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_relation" ADD CONSTRAINT "contact_relation_from_fk" FOREIGN KEY ("from_contact_id","tenant_id") REFERENCES "public"."contact"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_relation" ADD CONSTRAINT "contact_relation_to_fk" FOREIGN KEY ("to_contact_id","tenant_id") REFERENCES "public"."contact"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_relation" ADD CONSTRAINT "contact_relation_type_fk" FOREIGN KEY ("relation_code","tenant_id") REFERENCES "public"."contact_relation_type"("code","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "contact_relation_type" ADD CONSTRAINT "contact_relation_type_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_role_type" ADD CONSTRAINT "contact_role_type_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_relation_exclusive_key" ON "contact_relation" USING btree ("from_contact_id","relation_code") WHERE "contact_relation"."exclusive";--> statement-breakpoint
CREATE INDEX "contact_relation_to_idx" ON "contact_relation" USING btree ("to_contact_id");--> statement-breakpoint
CREATE INDEX "contact_relation_type_tenant_sort_idx" ON "contact_relation_type" USING btree ("tenant_id","sort_order","label_forward");--> statement-breakpoint
CREATE INDEX "contact_role_type_tenant_sort_idx" ON "contact_role_type" USING btree ("tenant_id","sort_order","label");--> statement-breakpoint
CREATE INDEX "contact_role_tenant_role_idx" ON "contact_role" USING btree ("tenant_id","role_code");--> statement-breakpoint
ALTER TABLE "contact_role" ADD CONSTRAINT "contact_role_contact_role_key" UNIQUE("contact_id","role_code");
