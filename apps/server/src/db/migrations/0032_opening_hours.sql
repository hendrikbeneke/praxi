CREATE TABLE "opening_hour" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"starts_at" time NOT NULL,
	"ends_at" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_hour_weekday_range" CHECK ("opening_hour"."weekday" between 1 and 7),
	CONSTRAINT "opening_hour_ends_after_starts" CHECK ("opening_hour"."ends_at" > "opening_hour"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "opening_hour" ADD CONSTRAINT "opening_hour_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opening_hour_tenant_weekday_idx" ON "opening_hour" USING btree ("tenant_id","weekday","starts_at");--> statement-breakpoint
-- Two windows on the same weekday must not overlap. The same mechanism as
-- `appointment_no_overlap` in 0009, and for the same reason: the form will
-- prevent it and the domain refuses first so the message is a sentence, but
-- "they cannot overlap" should be a property of the table rather than an
-- intention held in three places.
--
-- `time` is not directly gist-indexable, so both ends are anchored on a
-- constant date; `date + time -> timestamp` and `tsrange` are both immutable,
-- which is what an index expression needs. The date itself means nothing.
-- btree_gist (installed in 0009) is what lets the two `=` columns sit in a
-- GiST index beside the range.
ALTER TABLE "opening_hour" ADD CONSTRAINT "opening_hour_no_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "weekday" WITH =,
    tsrange(DATE '2000-01-01' + "starts_at", DATE '2000-01-01' + "ends_at") WITH &&
  );
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "opening_hour"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- Created and left disabled, like every other table (CLAUDE.md rule 1).
ALTER TABLE "opening_hour" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "opening_hour"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "opening_hour" DISABLE ROW LEVEL SECURITY;
