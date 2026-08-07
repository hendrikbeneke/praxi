CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "app_user_email_lowercase" CHECK ("app_user"."email" = lower("app_user"."email"))
);
--> statement-breakpoint
CREATE TABLE "practice_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"practice_name" text NOT NULL,
	"street" text,
	"postal_code" text,
	"city" text,
	"country" text DEFAULT 'DE' NOT NULL,
	"phone" text,
	"email" text,
	"website" text,
	"tax_number" text,
	"bank_name" text,
	"iban" text,
	"bic" text,
	"default_payment_term_days" integer DEFAULT 14 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_settings_tenantId_unique" UNIQUE("tenant_id"),
	CONSTRAINT "practice_settings_payment_term_range" CHECK ("practice_settings"."default_payment_term_days" between 0 and 365)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_settings" ADD CONSTRAINT "practice_settings_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_tenant_fk" FOREIGN KEY ("user_id","tenant_id") REFERENCES "public"."app_user"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "app_user_tenant_idx" ON "app_user" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_hash_key" ON "session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_idx" ON "session" USING btree ("expires_at");