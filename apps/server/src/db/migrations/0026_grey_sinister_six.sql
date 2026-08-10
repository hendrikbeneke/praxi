CREATE TABLE "email_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_template_tenant_name_key" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "invoice_send" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"sent_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_send_error_pair" CHECK ((not "invoice_send"."ok") = ("invoice_send"."error" is not null))
);
--> statement-breakpoint
CREATE TABLE "smtp_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"security" text DEFAULT 'starttls' NOT NULL,
	"username" text,
	"password_cipher" text,
	"key_fingerprint" text,
	"from_address" text NOT NULL,
	"from_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "smtp_settings_tenantId_unique" UNIQUE("tenant_id"),
	CONSTRAINT "smtp_settings_port_range" CHECK ("smtp_settings"."port" between 1 and 65535),
	CONSTRAINT "smtp_settings_security_check" CHECK ("smtp_settings"."security" in ('starttls', 'tls', 'none')),
	CONSTRAINT "smtp_settings_password_pair" CHECK (("smtp_settings"."password_cipher" is null) = ("smtp_settings"."key_fingerprint" is null)),
	CONSTRAINT "smtp_settings_fingerprint_shape" CHECK ("smtp_settings"."key_fingerprint" is null or "smtp_settings"."key_fingerprint" ~ '^[0-9a-f]{16}$'),
	CONSTRAINT "smtp_settings_password_needs_user" CHECK ("smtp_settings"."password_cipher" is null or "smtp_settings"."username" is not null)
);
--> statement-breakpoint
ALTER TABLE "email_template" ADD CONSTRAINT "email_template_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_send" ADD CONSTRAINT "invoice_send_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_send" ADD CONSTRAINT "invoice_send_invoice_tenant_fk" FOREIGN KEY ("invoice_id","tenant_id") REFERENCES "public"."invoice"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_send" ADD CONSTRAINT "invoice_send_user_tenant_fk" FOREIGN KEY ("sent_by","tenant_id") REFERENCES "public"."app_user"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smtp_settings" ADD CONSTRAINT "smtp_settings_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_template_default_key" ON "email_template" USING btree ("tenant_id") WHERE "email_template"."is_default";--> statement-breakpoint
CREATE INDEX "invoice_send_invoice_idx" ON "invoice_send" USING btree ("invoice_id","sent_at");--> statement-breakpoint
CREATE INDEX "invoice_send_tenant_idx" ON "invoice_send" USING btree ("tenant_id","sent_at");