-- S-C2: row-level security on.
--
-- This is the whole of it. Everything that had to be true first happened in
-- S-C1 and changed nothing observable; this migration is the one moment the
-- database starts withholding rows, which is why it is alone in here.
--
-- What it means for a query that forgets its `WHERE tenant_id`: it now answers
-- with NO rows rather than with somebody else's. The failure becomes visible
-- instead of silent, which is the entire point — the same direction as the
-- immutability triggers and the opening-hour EXCLUDE constraint. Do not trust
-- the code to get it right; make getting it wrong impossible.
--
-- FIVE TABLES ARE DELIBERATELY NOT HERE: app_user, session, account,
-- verification and rate_limit. Authentication precedes tenancy — the user is
-- found by email before any tenant is known, and the tenant is read out of the
-- session row — so a policy over them could never be satisfied and nobody could
-- sign in. Their dormant policies were deleted in 0044 rather than left lying,
-- and `domain/session.test.ts` covers `tenantOfUser`, the one function that
-- decides which tenant applies at all.
--
-- The 34 below are every table that has a tenant to be isolated by. The list is
-- not maintained by hand: `routes/rls.test.ts` reads `pg_policies` and asserts
-- that every table with a policy actually has RLS enabled, so a table added
-- later with a policy and without this line fails the suite.

ALTER TABLE "activity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_type" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_type_preset_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "appointment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "appointment_sync_conflict" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_relation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_relation_type" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_role" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_role_type" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "country" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gender" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "google_connection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "google_sync_queue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_send" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note_draft" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note_file" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note_type" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "number_range" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "opening_hour" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "practice_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "salutation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_group" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_group_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "smtp_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "text_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- And the owner keeps bypassing them, on purpose. `praxi` runs the migrations
-- and the seed, both of which legitimately work across tenants; the server
-- process is `praxi_app`, which is neither superuser nor owner nor BYPASSRLS.
-- FORCE ROW LEVEL SECURITY would close that too and is deliberately NOT set:
-- it would break every migration that backfills a column and the seed itself,
-- for a role no request ever runs as.
COMMENT ON SCHEMA public IS
  'Row-level security is ON for every table with a tenant. The server connects as praxi_app, which no policy exempts; the owner praxi bypasses them and runs migrations and the seed. See migrations 0044 and 0045.';
