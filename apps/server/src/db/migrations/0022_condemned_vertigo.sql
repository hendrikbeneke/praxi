CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'card', 'other');--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" "payment_method" DEFAULT 'bank_transfer' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "payment_amount_not_zero" CHECK ("payment"."amount_cents" <> 0)
);
--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_tenant_fk" FOREIGN KEY ("invoice_id","tenant_id") REFERENCES "public"."invoice"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_invoice_idx" ON "payment" USING btree ("invoice_id","paid_on");--> statement-breakpoint
CREATE INDEX "payment_tenant_paid_on_idx" ON "payment" USING btree ("tenant_id","paid_on");