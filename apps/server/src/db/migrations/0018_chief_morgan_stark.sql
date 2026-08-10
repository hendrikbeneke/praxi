ALTER TABLE "invoice" ADD COLUMN "cancels_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "cancelled_by_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_cancels_fk" FOREIGN KEY ("cancels_invoice_id","tenant_id") REFERENCES "public"."invoice"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_cancelled_by_fk" FOREIGN KEY ("cancelled_by_invoice_id","tenant_id") REFERENCES "public"."invoice"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_cancels_key" ON "invoice" USING btree ("cancels_invoice_id") WHERE "invoice"."cancels_invoice_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_cancelled_by_key" ON "invoice" USING btree ("cancelled_by_invoice_id") WHERE "invoice"."cancelled_by_invoice_id" is not null;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_cancellation_target" CHECK (("invoice"."type" = 'cancellation_invoice') = ("invoice"."cancels_invoice_id" is not null));--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_cancelled_state" CHECK (("invoice"."status" = 'cancelled') = ("invoice"."cancelled_by_invoice_id" is not null)
          and ("invoice"."cancelled_by_invoice_id" is null or "invoice"."type" = 'invoice'));--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_cancellation_not_self" CHECK ("invoice"."cancels_invoice_id" is distinct from "invoice"."id"
          and "invoice"."cancelled_by_invoice_id" is distinct from "invoice"."id");