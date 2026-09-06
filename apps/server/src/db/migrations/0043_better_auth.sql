-- S-B: the hand-rolled session mechanism is replaced by Better Auth.
--
-- The reason is the future rather than a fault in what it replaces: several
-- users and tenants, password reset, 2FA, and later a sign-in through Google
-- or Microsoft. Those are four things a tested library brings and four things
-- that would otherwise be written here. The moment is the argument as much as
-- the goal — today the migration is one user and one session; at twenty
-- tenants it would be a project of its own.
--
-- WHAT IS NOT HAPPENING HERE, because it keeps surprising people: `app_user`
-- is NOT renamed. Better Auth's `user` model is pointed at this table with
-- `modelName` (see src/auth.ts), so the table keeps its name — `user` is
-- reserved in Postgres and would force quoting everywhere — and, more
-- importantly, the four composite foreign keys onto `app_user (id, tenant_id)`
-- are untouched: note.created_by, note.locked_by, note_draft.user_id and
-- invoice_send.sent_by. Nothing is repointed.
--
-- ON TYPES. Better Auth declares its time fields as `date`, which is its own
-- abstraction and not a SQL type. Every one of them is created here as
-- `timestamptz`, because CLAUDE.md rule 3 holds without exception and the
-- adapter writes whatever the column is. `rate_limit.last_request` is the one
-- that looks like a time and is not: the library writes and compares epoch
-- milliseconds as a number, so it is `bigint`.
--
-- **After every update of `better-auth`, check that the generated shape still
-- matches this file.** The `@better-auth/cli` is two minor versions behind the
-- library and marked unsupported, so ask the installed library itself:
--
--   node -e "import('better-auth/db').then(({getAuthTables}) =>
--     console.dir(getAuthTables(<the options from src/auth.ts>), {depth:4}))"
--
-- That is how `account.issuer` and the unique index on (issuer, account_id)
-- were found — neither is in the documentation, and without the first one the
-- INSERT below fails, while without the second the wrong columns are unique
-- and nothing notices until the first OAuth account is linked.

-- 1) app_user gains the two columns Better Auth's user model requires.
--    `tenant_id`, `active` and `preferences` stay exactly as they are.
ALTER TABLE "app_user" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "image" text;--> statement-breakpoint

-- 2) `account` — one row per authentication method of a user. Today there is
--    one kind, the password; the OAuth columns are what the model IS and are
--    why a Google sign-in later needs no migration.
--
--    No `tenant_id`, here or on the two tables below: these are facts about a
--    person or a connection, not about a practice — a user who is a member of
--    two organizations still has one password. Named exception to rule 1, the
--    same one the global unique index on app_user.email is. With no tenant
--    column there is nothing for an RLS policy to key on, so they get none.
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Declared by the library itself, on `issuer` and not on `provider_id`.
CREATE UNIQUE INDEX "account_issuer_account_key" ON "account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE TRIGGER account_set_updated_at BEFORE UPDATE ON "account"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- The argon2 hash moves verbatim: Better Auth is handed this application's own
-- `hashPassword` / `verifyPassword`, so the stored string keeps verifying and
-- nobody has to set a new password. `local:credential` and the user's own id
-- are what the library writes for a password account
-- (createLocalAccountIssuer, api/routes/sign-up.mjs).
--
-- gen_random_uuid() rather than a UUIDv7: this is the one place where no
-- application is running to generate one. It happens once, over one row.
INSERT INTO "account" ("id", "user_id", "issuer", "account_id", "provider_id", "password")
SELECT gen_random_uuid(), "id", 'local:credential', "id"::text, 'credential', "password_hash"
FROM "app_user";--> statement-breakpoint
ALTER TABLE "app_user" DROP COLUMN "password_hash";--> statement-breakpoint

-- 3) `session` becomes Better Auth's session model.
--
--    The token is stored as it is from here on. Only its SHA-256 was stored
--    before, so a dump of this table did not hand out live sessions; Better
--    Auth compares the value. A step down, taken deliberately — what protects
--    it is that the cookie is signed with BETTER_AUTH_SECRET, so the token
--    alone does not make a valid cookie, and reversing it would mean writing a
--    custom session layer at exactly the spot the library was adopted to own.
ALTER TABLE "session" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "ip_address" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "user_agent" text;--> statement-breakpoint
-- Every open session ends here, and it has to: what was stored is a hash, and
-- the plaintext token Better Auth needs cannot be recovered from it. One user,
-- one sign-in.
DELETE FROM "session";--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "token" SET NOT NULL;--> statement-breakpoint
-- Drops session_token_hash_key with it.
ALTER TABLE "session" DROP COLUMN "token_hash";--> statement-breakpoint
-- Better Auth slides the expiry off `updated_at`, which set_updated_at already
-- maintains. A second column saying when the session was last used would be a
-- second truth about it.
ALTER TABLE "session" DROP COLUMN "last_seen_at";--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_key" ON "session" USING btree ("token");--> statement-breakpoint
-- session_user_tenant_fk, session_user_idx and session_expires_idx are
-- untouched, and so is `tenant_id`: the tenant still travels on the session
-- row and is still read from there and never from a request (rule 1).

-- 4) `verification` — the short-lived tokens for verifying an email address
--    and for resetting a password. Deliberately created while nothing writes
--    to it: password reset is not being built now, and this is the table it
--    will need. Not building and not blocking are different things.
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE TRIGGER verification_set_updated_at BEFORE UPDATE ON "verification"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- 5) `rate_limit` — the login rate limiter, in the database rather than in the
--    process: in memory a restart is the cheapest reset an attacker can get,
--    and there is a second process the day this is deployed twice.
--
--    It limits by IP and never locks an account. That is the right shape here
--    rather than a limitation of the library: with one practitioner, an
--    account lockout is a denial of service against exactly that person the
--    moment somebody knows the address.
--
--    No `updated_at` and therefore no trigger — the library writes `count` and
--    `last_request` and nothing else. Rows are meaningless ten minutes after
--    they are written and are swept after a day; tracing an attack pattern
--    needs a log, not a counter table.
CREATE TABLE "rate_limit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_key" ON "rate_limit" USING btree ("key");--> statement-breakpoint
ALTER TABLE "rate_limit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rate_limit" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint

COMMENT ON COLUMN "session"."token" IS
  'The cookie value, stored as it is. Better Auth compares it; what protects it is that the cookie is signed with BETTER_AUTH_SECRET.';--> statement-breakpoint
COMMENT ON COLUMN "rate_limit"."last_request" IS
  'Epoch milliseconds, written and compared as a number by Better Auth. Not a timestamp, which is why it is not timestamptz.';--> statement-breakpoint
COMMENT ON TABLE "account" IS
  'Better Auth: one row per authentication method. No tenant_id on purpose — a user who is a member of two organizations still has one password.';
