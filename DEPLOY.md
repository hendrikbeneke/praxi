# Deployment

A checklist from an empty database to the first sign-in. Work through it top to
bottom; every step says how to tell it worked.

## Where this runs

Two providers, and they do different things.

- **The application** runs on a server of its own with
  [Coolify](https://coolify.io) installed. Coolify deploys this GitHub
  repository: it builds the `Dockerfile` at the repository root, terminates TLS
  with its bundled Traefik, and runs the container.
- **Postgres is hosted at [Sliplane](https://sliplane.io)** and runs nowhere
  near it. Sliplane hosts the database and nothing else — it is not a Coolify
  provider and there is no Coolify database resource in this setup.

**So the connection between the two crosses the public internet**, which is the
single fact section 1 and section 3 are built around: there is no internal
Docker network, the host in both connection strings is a public name, and both
of them carry TLS parameters that are not optional.

`docker-compose.yml` in this repository is **not** used for either. It is
Postgres for local development and nothing else.

Nothing in the application code branches on any of it. Business logic sits
behind an HTTP API, and the only value in the whole system that names a host is
`GOOGLE_REDIRECT_URI`.

---

## 1. Postgres

Sliplane gives you a database and one role. Everything below is done **once, by
hand, with `psql`** — there is no Coolify database resource to configure, and
the four steps are in this order for a reason.

### 1.0 What Sliplane hands you

A database called **`app`** and a role called **`owner`**. We use neither: the
database is created below with the right collation, and `owner` stays *your*
access and goes into no environment variable of the application.

Measured on the actual instance:

```sql
select rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
  from pg_roles where rolname = current_user;
```

```
 rolname | rolsuper | rolbypassrls | rolcreatedb | rolcreaterole
---------+----------+--------------+-------------+---------------
 owner   | f        | f            | t           | t
```

**No superuser and no `BYPASSRLS`** — which is good news, because it means
nothing here needs either. `CREATEDB` and `CREATEROLE` are enough for all four
steps.

The connection string Sliplane shows points at `app`. Change the database name
to `praxi` once step 2 has created it, and add the TLS parameters from section
3.1.

### 1.1 Step 1 — the two roles the application will use

Three roles in total, and only the last two are ever entered anywhere:

| Role | Rights | What for | Where it is entered |
|---|---|---|---|
| `owner` | `CREATEDB`, `CREATEROLE` | creating the database and the roles — once, by hand | **nowhere** |
| `praxi_owner` | owns the database and all 39 tables | migrations, `praxi` CLI, maintenance scripts | `DATABASE_URL` |
| `praxi_app` | `LOGIN`, DML on every table, owns nothing | **every request the server makes** | `APP_DATABASE_URL` |

Connect **as `owner`** to the `app` database and run, with two passwords you
generated (`openssl rand -hex 24` each):

```sql
CREATE ROLE praxi_owner LOGIN PASSWORD '<generated>';
CREATE ROLE praxi_app   LOGIN PASSWORD '<generated>';
```

→ *Check*: `\du` lists both, neither with any attribute.

### 1.2 Step 2 — the database, owned by `praxi_owner` from the start

`praxi_owner` has to **own** the tables: it creates them, and a table's owner is
exempt from its own policies unless `FORCE ROW LEVEL SECURITY` is set, which it
is not — that exemption is what lets migrations and the CLI work at all. So the
database is created with it as the owner rather than transferred afterwards.

One line has to come first, and it is the one that is easy to miss:

```sql
GRANT praxi_owner TO CURRENT_USER WITH SET TRUE, INHERIT FALSE;

CREATE DATABASE praxi OWNER praxi_owner
  TEMPLATE template0 ENCODING 'UTF8'
  LOCALE_PROVIDER icu ICU_LOCALE 'de-DE' LOCALE 'C';
```

**Why the `GRANT`.** `CREATE DATABASE … OWNER x` requires being able to
`SET ROLE` to `x`. Since Postgres 16 a `CREATEROLE` role is granted membership
in the roles it creates — but with `ADMIN` only, not `SET`:

```
 member_of   | member | admin_option | inherit_option | set_option
-------------+--------+--------------+----------------+------------
 praxi_owner | owner  | t            | f              | f
```

Without the `GRANT` both routes fail with the same message, measured:

```
ERROR:  must be able to SET ROLE "praxi_owner"
```

— and that is true of `ALTER DATABASE praxi OWNER TO praxi_owner` after the
fact as well, so creating the database first and re-owning it later is not a way
around it. The `ADMIN` option is what lets you grant yourself the missing
`SET`, which is why one line is enough.

→ *Check*:

```sql
select d.datname, pg_get_userbyid(d.datdba) as owner,
       d.datlocprovider, d.datlocale
  from pg_database d where d.datname = 'praxi';
```

```
 datname |    owner    | datlocprovider | datlocale
---------+-------------+----------------+-----------
 praxi   | praxi_owner | i              | de-DE
```

`datlocprovider = i` and `datlocale = de-DE` are the two the baseline checks —
see 1.5. Do **not** read `datcollate`/`datctype`: under the ICU provider those
still show the libc locale the cluster was built with and say nothing about how
text sorts.

### 1.3 Step 3 — what the baseline needs in order to run

The baseline contains one statement that is not about this database at all:

```sql
ALTER ROLE praxi_app SET idle_in_transaction_session_timeout = '30s';
```

A role property, not a database object. Altering another role needs
`CREATEROLE` **and** `ADMIN OPTION` on that role, and `praxi_owner` has neither
by default. Still as `owner`:

```sql
ALTER ROLE praxi_owner CREATEROLE;
GRANT praxi_app TO praxi_owner WITH ADMIN OPTION;
```

**Without these two lines the first deployment fails and leaves nothing
behind.** The baseline is handed to Postgres as a single statement — all or
nothing — so it stops here and no table is created at all:

```
ERROR:  permission denied to alter role
DETAIL:  Only roles with the CREATEROLE attribute and the ADMIN option on
         role "praxi_app" may alter this role.
```

Measured both ways: with the two lines the unchanged baseline applies and
produces 39 tables and 34 policies, all owned by `praxi_owner`; without them,
zero of each.

→ *Check*:

```sql
select r.rolname, r.rolcreaterole, m.admin_option
  from pg_roles r
  left join pg_auth_members m
    on m.member = r.oid and m.roleid = 'praxi_app'::regrole
 where r.rolname = 'praxi_owner';
```

```
   rolname   | rolcreaterole | admin_option
-------------+---------------+--------------
 praxi_owner | t             | t
```

Both columns `t`. A `NULL` in the second means the `GRANT` did not happen.

It is deliberately a grant rather than a change to the migration. The
alternative — wrapping that `ALTER ROLE` in a check so it can be skipped — would
mean a security-relevant setting could silently not be applied, and this
document would have no way to tell you whether it was. A named grant is
checkable (1.6).

The same two rights are what lets `praxi_owner` rotate the `praxi_app` password
later; see 2.2.

### 1.4 Step 4 — the extension, **in the right database**

Connect **as `praxi_owner` to `praxi`** — not to `app`, not to `postgres`:

```sql
CREATE EXTENSION btree_gist;
```

→ *Check*: `select extname from pg_extension order by 1;` lists `btree_gist`
and `plpgsql`.

**This is the step that looks like a permissions problem and is not.** Run in
the wrong database it fails like this, verbatim:

```
ERROR:  permission denied to create extension "btree_gist"
HINT:  Must have CREATE privilege on current database to create this extension.
```

That message reads as "my provider does not allow extensions". It means "you are
in a database you do not own". In its own database `praxi_owner` installs it
without any special right — measured against a role with neither `SUPERUSER`
nor `CREATEDB`.

`btree_gist` is needed by `opening_hour_no_overlap`, the `EXCLUDE` constraint
that keeps two opening-hour intervals on one weekday from overlapping.

**From here on `owner` is not needed again.** Its password stays with you and
goes into no environment variable; everything the application does is
`praxi_owner` or `praxi_app`.

### 1.5 The ICU collation — the one thing that stops everything

`contact.sort_name` inherits the database collation, and the order of the
contact list depends on it. Initialised without ICU, the list puts *Öztürk*
after *Zimmermann*. So migration `0000_baseline.sql` checks it before it
creates a single table, and refuses otherwise:

```
ERROR:  Database must use the ICU provider with locale de-DE.
DETAIL:  found provider=i, locale=C
```

Step 2 above is what satisfies it — **creating the *database* with the locale,
not the cluster**, which is exactly the path a hosted Postgres leaves open: any
role with `CREATEDB` can do it, and it needs no `initdb` arguments and no
access to the server's disk.

If you want to know before trying whether ICU is compiled in at all:

```sql
select count(*) > 0 as icu_available from pg_collation where collprovider = 'i';
-- t
```

If that answers `f`, no `CREATE DATABASE` will help and the provider is the
wrong one.

### 1.6 The three checks in one place

Run these after step 4 and keep them — together they say whether the ground the
rest of this document stands on is actually there:

```sql
-- 1. the database, its owner and its collation
select d.datname, pg_get_userbyid(d.datdba) as owner, d.datlocprovider, d.datlocale
  from pg_database d where d.datname = 'praxi';
--  praxi | praxi_owner | i | de-DE

-- 2. the roles (connect to `praxi`)
select rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin
  from pg_roles where rolname in ('owner','praxi_owner','praxi_app') order by rolname;
--  owner       | f | f | t | t | t
--  praxi_app   | f | f | f | f | t
--  praxi_owner | f | f | f | t | t

-- 3. the extension
select extname from pg_extension order by 1;
--  btree_gist, plpgsql
```

**The `praxi_app` row is the one that matters: four `f` and one `t`.**
`praxi_owner` carries `rolcreaterole = t` on purpose — step 3 — and that is the
only attribute it has.

---

## 2. Why the roles are split this way

Section 1 created them. This section is what they are *for*, and it is the part
that decides whether row-level security is real or decoration.

`praxi_app` must **not** have `SUPERUSER`, `BYPASSRLS`, `CREATEDB` or
`CREATEROLE`, and it must own nothing. Each of those on its own walks past every
policy ever written here — a table's owner is exempt from its own policies
unless `FORCE ROW LEVEL SECURITY` is set, and it is not. Running the server
under such a role changes nothing visible: every query answers exactly as it did
before, nothing fails, nothing is logged, and the isolation is simply gone.
**That is the worst outcome a safeguard can have: one that is believed.**

`praxi_owner` is the opposite and deliberately so. It owns the tables, so the
policies do not apply to it — which is what migrations, `praxi tenant create`
and `files:orphans` need, because they legitimately work across tenants or
before any tenant exists.

### 2.1 The owner may be called anything

`praxi_owner` is a name this document chose. If you already have an owner role
under another name, only the connection strings have to say so.

Worth knowing because it was not always true: `pg_dump` writes the owner's name
into the two `ALTER DEFAULT PRIVILEGES` statements at the end of the baseline,
and the first draft of that file carried `FOR ROLE praxi`. On a cluster with no
role of that name it fails outright — and since the baseline applies as one
statement, all or nothing, the whole schema would have failed and the container
never started. Worse under a superuser owner of another name: there it
*succeeds* and hangs the privileges on `praxi`, so the first table a later
migration creates is unreachable for `praxi_app` and nothing says so until a
request touches it.

The clause is gone, the reason stands at those two statements, and it says that
**pg_dump will put it back the next time this file is regenerated.** If you ever
produce a new baseline, that is the one edit to make by hand besides stripping
`\restrict`.

### 2.2 Rotating the `praxi_app` password

`praxi_app` is created **with** a password in section 1.1, and that is not the
same as it used to be: the baseline creates the role `NOLOGIN` and grants it
what it needs, but deliberately sets no password, because a migration is
committed to git. The `IF NOT EXISTS` around its `CREATE ROLE` finds your role
and leaves it alone.

That matters for the first deployment: the server calls
`verifyDatabaseConnection()` at startup and exits if it fails, so a deployment
against a role that cannot log in never comes up — which also means you cannot
exec into the container to fix it.

To change the password **later**:

```sql
-- as praxi_owner, which section 1.3 gave CREATEROLE and ADMIN on praxi_app
ALTER ROLE praxi_app LOGIN PASSWORD '<new>';
```

`pnpm db:app-role` (in the container:
`node apps/server/dist/scripts/app-role.js`) does exactly this from
`APP_DATABASE_PASSWORD`, connecting through `DATABASE_URL`. It works here
**only because of the two grants in section 1.3** — without them it fails with
`permission denied to alter role`, the same message the baseline would give.

Remember to change `APP_DATABASE_URL` at the same time; they are two places
holding one password.

### 2.3 Verifying it has no special rights

Section 1.6 has the query. Run it again after the first migration, and add the
one it cannot answer before the tables exist:

```sql
select tableowner, count(*) from pg_tables where schemaname = 'public'
 group by tableowner;
-- praxi_owner | 39
```

If `praxi_app` appears in that result at all, stop and fix it before real data
goes in.

### 2.4 The proof, if you want to see it

Connect **as `praxi_app`** and ask for rows without setting a tenant:

```sql
select count(*) from contact;   -- 0
select count(*) from service;   -- 0
```

Then with one:

```sql
begin;
  select set_config('app.tenant_id', '<tenant uuid>', true);
  select count(*) from service;   -- as many as that tenant has
commit;
```

Zero without, rows with. That is the policy working. As `praxi_owner` both
answer the same, which is exactly why the server does not connect as
`praxi_owner`.

---

## 3. Environment variables

All of these go on the **application** resource in Coolify. There is no
database resource here — Postgres is at Sliplane and is configured with `psql`,
in section 1.

| Variable | Value | Where from | Required |
|---|---|---|---|
| `NODE_ENV` | `production` | fixed | no, but set it — it is what makes the server serve the built SPA |
| `PORT` | `3000` | fixed | no (default `3000`) |
| `DATABASE_URL` | `postgres://praxi_owner:<pw>@<host>:<port>/praxi?sslmode=verify-full&sslrootcert=system` | the roles from 1.1, Sliplane's host | **yes** |
| `APP_DATABASE_URL` | `postgres://praxi_app:<pw>@<host>:<port>/praxi?sslmode=verify-full&sslrootcert=system` | same database, the other role | **yes** |
| `BETTER_AUTH_SECRET` | 64 hex characters | `openssl rand -hex 32` | **yes**, at least 32 characters |
| `DATA_DIR` | `/data` | matches the mount in section 4 | no (default is inside the image and would be lost on redeploy) — **set it** |
| `LOG_LEVEL` | `info` | fixed | no (default `info`) |
| `ENCRYPTION_KEY` | 64 hex characters | `openssl rand -hex 32` | only for Google and SMTP — but see below |
| `GOOGLE_CLIENT_ID` | the **Web application** client's id | Google Cloud, section 5 | only for the calendar |
| `GOOGLE_CLIENT_SECRET` | that client's secret | Google Cloud, section 5 | only for the calendar |
| `GOOGLE_REDIRECT_URI` | `https://<domain>/api/google/oauth/callback` | your domain | only for the calendar |
| `APP_DATABASE_PASSWORD` | the `praxi_app` password | you | only if you use `db:app-role` to rotate it (2.2) |

**`SEED_USER_EMAIL`, `SEED_USER_NAME` and `SEED_USER_PASSWORD` do not belong
here.** They are read by `praxi dev seed`, which is local development only and
refuses to run under `NODE_ENV=production` — and whose data is not in the image
at all. The practice is created with `praxi tenant create`, which asks for the
address and the password, or takes them as arguments (section 6, step 7). No
plaintext password of a person ever has to sit in the secret store.

Mark `DATABASE_URL`, `APP_DATABASE_URL`, `BETTER_AUTH_SECRET`,
`ENCRYPTION_KEY` and `GOOGLE_CLIENT_SECRET` as secrets in Coolify.

**What happens when a required one is missing**: `getEnv()` refuses at startup
with `Invalid environment configuration. Check these variables: <names>` — it
names the variables and never their values, because `DATABASE_URL` contains a
password. `migrate.js` exits non-zero, the server never listens, the health
check never turns green, and Coolify keeps the previous container running. The
message is in the deployment log.

Nothing here is read lazily at the first request; the environment is parsed
once, at startup, on purpose.

### 3.1 The two connection strings, and the TLS parameters on both

They point at the same database and differ only in the role. They are
deliberately not interchangeable.

- **`DATABASE_URL` — `praxi_owner`.** Used by `migrate.js` at container start,
  by the `praxi` CLI, and by `files:orphans` / `invoices:verify`. Those
  legitimately work across tenants or before any tenant exists.
- **`APP_DATABASE_URL` — `praxi_app`.** Every HTTP request. Row-level security
  applies to this role, and every request runs inside a transaction that sets
  `app.tenant_id` for the policies to read.

There is **no fallback** from one to the other, and that is the point rather
than strictness. With the policies on, falling back to the owner bypasses all
of them and answers every query exactly as it did before: nothing fails,
nothing is logged, and the isolation is simply gone. A server that refuses to
start says so at the only moment anyone would notice.

#### Both of them end in `?sslmode=verify-full&sslrootcert=system`

The database is not on this machine and not on a private network. Every row
that crosses this connection is patient data, so the connection is encrypted
*and* the certificate is verified.

Sliplane presents a publicly trusted certificate, so `verify-full` costs
nothing — no certificate file to distribute, no `sslrootcert` pointing at a
copy. Measured with `psql` against the actual host:

```
psql "…?sslmode=verify-full&sslrootcert=system"
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, …)
```

**`sslrootcert=system` is the one that gets forgotten.** Without it `psql` looks
for `~/.postgresql/root.crt`, does not find it, and refuses — with a certificate
that is perfectly valid.

**What the driver does with them**, because the answer is not obvious and the
cost of being wrong is silent. `postgres.js` reads both out of the query string
in `parseOptions`. Measured against the installed version, with the same options
object `db/client.ts` passes:

```
(no query)                              ssl = false        → PLAINTEXT
sslmode=require                         ssl = require      → TLS, certificate NOT verified
sslmode=verify-full                     ssl = verify-full  → TLS, certificate verified
sslmode=verify-full&sslrootcert=system  ssl = verify-full  → TLS, certificate verified
sslrootcert=system                      ssl = verify-full  → TLS, certificate verified
```

Two things follow, and both are traps:

- **No parameters at all means plaintext**, silently, over the public internet.
  Nothing in the application refuses that today.
- **`sslmode=require` is not enough.** In this driver it sets
  `rejectUnauthorized: false` — encrypted, but against whatever certificate
  answers. `verify-full` is what leaves `rejectUnauthorized` at its default and
  checks the chain and the hostname against Node's own CA store.

→ *Check, and this is the only one that speaks for the **application's** own
connection rather than for `psql`.* With the server running and having served at
least one request, connect as `owner` or `praxi_owner` and ask:

```sql
select a.usename, s.ssl, s.version, s.cipher
  from pg_stat_ssl s join pg_stat_activity a using (pid)
 where a.datname = 'praxi';
```

Every row for `praxi_app` must say `ssl = t`. A row with `ssl = f` is the
application talking in the clear, and it will not announce itself any other
way.

### 3.2 Generating the two keys

```bash
openssl rand -hex 32     # BETTER_AUTH_SECRET
openssl rand -hex 32     # ENCRYPTION_KEY
openssl rand -hex 24     # the praxi_app password
```

Both keys obey the same rule, and the rule is the point: **each holds a key
things are protected *with*, never a credential being protected.** No password
of yours belongs in either. The SMTP password and the Google token are entered
in the application and stored encrypted with `ENCRYPTION_KEY`.

- **`BETTER_AUTH_SECRET`** signs the session cookie. Changing it signs everyone
  out. That is the whole cost.
- **`ENCRYPTION_KEY`** encrypts the Google refresh token and the SMTP password
  at rest (AES-256-GCM). Losing or replacing it makes both permanently
  unreadable — not corrupted, just undecryptable — and the way back is
  re-entering both: a new SMTP password in the settings and a fresh Google
  authorization. The software notices a changed key and says so
  (`key_fingerprint`), rather than failing at an authentication tag nobody can
  interpret. Nothing is deleted automatically, because a key set wrongly by
  accident must not throw a working connection away.

Generate them once. Do not let a "regenerate all secrets" habit from another
project touch this one.

**Set `ENCRYPTION_KEY` now even if you are not connecting Google yet.** Adding
it later is free; discovering after six months of stored SMTP credentials that
it was never set is not.

---

## 4. Persistent storage for `DATA_DIR`

Invoice PDFs and note attachments live on disk, outside the web root, served
only through an authenticated route. They are not in the database and not in
the image — without a volume they are gone at the next deployment.

In the application resource's **Persistent Storage**, add a mount: host path
e.g. `/data/coolify-volumes/praxi-data`, container path `/data`. Set
`DATA_DIR=/data` to match.

The container runs as the image's `node` user (uid 1000), not root, and a host
directory Docker creates on first mount is owned by `root` — every write would
fail. On the server, before the first deployment:

```bash
mkdir -p /data/coolify-volumes/praxi-data
chown -R 1000:1000 /data/coolify-volumes/praxi-data
```

Nothing needs to be created inside it. The subdirectories `invoices/`,
`files/` and the template directory are created on first write.

---

## 5. Google Cloud

The code needs no change: `google/oauth.ts` takes the redirect URI from
`GOOGLE_REDIRECT_URI` and runs the same PKCE flow either way.

### 5.1 A new Web application client

The local client is type **Desktop app**, which only ever accepts a loopback
redirect — pointing `GOOGLE_REDIRECT_URI` at a public HTTPS URL with its
credentials is rejected by Google outright.

1. In the same Google Cloud project, create a **new** OAuth client of type
   **Web application**. The Desktop client stays and keeps working locally.
2. Under **Authorized redirect URIs**, add exactly:
   `https://<domain>/api/google/oauth/callback`
   No trailing slash, `https`, the production domain. It must match
   `GOOGLE_REDIRECT_URI` character for character.
3. Use that client's id and secret for `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`.

The three scopes are unchanged and are asserted by a test:
`calendar.events`, `calendar.freebusy`, `calendar.calendarlist.readonly`.
Deliberately **not** `calendar.readonly` — the token cannot read the content of
any calendar. There is no identity scope either.

### 5.2 The existing connection does not carry over

It cannot, and nothing is lost:

- The production database is new, and `google_connection` is one row per
  tenant, created by connecting. There is nothing there to migrate.
- The stored refresh token is encrypted with `ENCRYPTION_KEY`, and the
  production key is a different one.
- It was issued to the Desktop client, and this is a different client.

So: after the first deployment, connect once from *Einstellungen →
Google-Kalender* on the production instance. Disconnecting deletes the row and
with it the event-title template, which resets to `{{contactNumber}}` — the
point rather than a side effect, since a new grant can go to a different
account.

### 5.3 The consent screen: is "Internal" enough?

**Yes, if the Google account is in a Google Workspace organisation** — which is
what "Internal" requires and what it means. An Internal app needs no Google
verification, and its refresh tokens do not expire on a timer. For one
practitioner signing in with their own Workspace account, that is exactly
right, and it is the configuration to keep.

**If the account is an ordinary `@gmail.com`**, "Internal" is not offered at
all, and the alternative has a trap worth knowing before you hit it:

- **External + Testing** issues refresh tokens that **expire after seven
  days**. The calendar sync would work for a week and then stop. In this
  software that failure is visible — the settings show the connection's last
  error and the queue rows count as stuck from five attempts — but it would
  need reconnecting every week, which is not a way to run a practice.
- **External + In production** does not expire tokens, but `calendar.events`
  is a *sensitive* scope, so Google requires app verification before it can be
  published.

Check which kind of account it is before the first deployment. If it is not a
Workspace account, that is a decision to take deliberately, not one to discover
on day eight.

---

## 6. From an empty database to the first sign-in

Numbered, with what tells you each step worked.

**1. Set up the database** at Sliplane and do the four steps of section 1 with
`psql`, as `owner`: the two roles, the database with ICU, the two grants the
baseline needs, the extension as `praxi_owner` inside `praxi`.
→ *Check*: the three queries in 1.6.

**2. Create the application resource** in Coolify: this repository, branch
`main`, build pack **Dockerfile**, port `3000`, health check path
`/api/health`, your domain with automatic TLS.

**3. Add the persistent volume** and `chown` it (section 4).

**4. Set the environment variables** (section 3). Both connection strings point
at Sliplane's host and end in `?sslmode=verify-full&sslrootcert=system`.
→ *Check*: the database name in them is `praxi`, not the `app` Sliplane's own
connection string names.

**5. Deploy.**
The image's `CMD` runs `node apps/server/dist/db/migrate.js` and only then
`node apps/server/dist/index.js`. There is no separate migration step to
configure, and deliberately no Coolify pre/post-deployment hook: the
pre-deployment command runs inside the *previous* container (skipped entirely
on a first deployment, and on any later one it would run the *old* code's
migrations), and the post-deployment command runs only after traffic has
already been switched, where a failure is logged as a warning rather than
failing the deployment. Neither gives what a schema migration needs — run with
the new code, before it takes traffic, and hard-fail if it does not apply.

→ *Check*: `https://<domain>/api/health` answers `{"status":"ok","time":...}`.
→ *Check*: the deployment log shows `migrations applied` and `server listening`.
→ *Check*: the queries in 1.6 and 2.3 — 39 tables owned by `praxi_owner`,
`praxi_app` with four `f`.
→ *Check*: the TLS query in 3.1 — every `praxi_app` row says `ssl = t`.

If the container does not come up, go to section 9. It will be one of five
things and they all name themselves in the log.

**6. Create the practice.** In Coolify's *Execute Command* against the running
container:

```bash
praxi tenant create
```

It asks for the practice name, the practitioner's email and name, and a
password — typed, not echoed, and asked twice.

**If Coolify's *Execute Command* does not give you a real terminal, it will not
ask.** A command with nothing to ask at behaves exactly as if `--no-input` had
been passed: it aborts naming the flag it is missing, rather than hanging on an
answer that cannot come. Then use the unattended form, where the password goes
through `--password-stdin` rather than `--password` — the latter lands in the
shell history and in Coolify's own command log:

```bash
printf '%s' '<password>' | praxi tenant create \
  --practice-name '<practice>' --email '<address>' --name '<name>' \
  --password-stdin --no-input
```

This creates the tenant, its practice settings carrying **only the name**, the
practitioner as the first user, the two system relation types, and the starting
catalogues — roles, relation types, salutations, genders, countries, note types,
activity types.

**It invents nothing.** Address, tax number, bank details and the whole service
catalogue stay empty, because a placeholder in a real practice's settings is
read as a record that exists rather than as a gap to fill. Section 7 is the list
of what is still to be filled in.

**Running it again is safe.** It asks whether an existing practice of that name
is the one meant, and then continues: every step reads what is already there and
creates only what is missing. A run that broke off halfway is finished by
running it again — there is no log file that could disagree with the database.

```
  structure         tenant, practice settings, user, 2 system relation types
  roles             3 created
  …
  services          none — enter your own under "Leistungen"
```

**`praxi dev seed` and `praxi dev demo` cannot run here**, and not only by
convention: both are refused under `NODE_ENV=production`, and their data
(a made-up practice, seven invented prices, demo patients) is not copied into
the container image at all, so they fail naming the file they cannot find even
if `NODE_ENV` is set by hand.

→ *Check*: the command prints the tenant id and the email, and ends with the
list of what to enter by hand.

**7. Sign in** at `https://<domain>` with that email and password.

→ *Check*: the practice name in the sidebar is the one you just typed.

Note the login rate limit: five attempts a minute, by IP, and it never locks an
account — with one practitioner an account lockout would be a denial of service
against exactly that person the moment somebody knows the address.

**8. Add further users**, if there are any, with `praxi user add`. The email is
unique across all tenants, not per tenant, because the sign-in form has no
tenant context; the command says so if it collides.

---

## 7. What you enter by hand afterwards

Everything below is configuration, not deployment: it lives in the database and
is entered in the application.

**The fields are empty, not wrong.** `praxi tenant create` stores the practice
name and nothing else, so there is no placeholder to spot and overwrite — what
is not filled in is visibly not filled in. That is the only thing this list asks
of you.

- [ ] **Praxis-Stammdaten** — *Einstellungen → Praxis*. Address, phone, email,
      website.
- [ ] **Bankverbindung** — same screen. IBAN and BIC.
- [ ] **Steuernummer** — same screen.
- [ ] **Zahlungsziel** — same screen, default 14 days.
- [ ] **Öffnungszeiten** — same screen, below the form. Empty means *not
      configured*, and the slot finder says so rather than assuming a working
      day. One row per interval: a lunch break is two rows, a day off is no rows.
- [ ] **Briefbogen (PDF-Vorlage)** — *Einstellungen → Rechnungsstellung*. The
      letterhead the invoice is printed onto: practice identity comes from this
      file, not from the code. One page backs every page; two pages means page 1
      backs the first and page 2 all the following ones.
- [ ] **Rechnungs-Nummernkreis** — *Einstellungen → Rechnungsstellung*. See below.
- [ ] **Textbausteine** — *Einstellungen → Textbausteine*. You need at least one
      intro and one outro, one of each marked as the default. Mark one outro as
      the *paid variant* if you use the "Betrag erhalten" action — without it
      that action still works but reports that the text was not found. The VAT
      note belongs in the outro text: the software computes, inserts and
      validates no tax statement at all, so for treatments the exemption under
      § 4 Nr. 14 lit. a UStG is a sentence you write there.
- [ ] **Leistungen** — *Leistungen*. Empty on purpose. See below.
- [ ] **Mailkonto** — *Einstellungen → Mailversand*. Host, port, security, user,
      password, sender address. The password is stored encrypted with
      `ENCRYPTION_KEY`. The test send has exactly one possible recipient, the
      configured sender address; it is not a field and cannot be redirected.
- [ ] **Mailvorlagen** — same screen.
- [ ] **Google-Kalender** — *Einstellungen → Google-Kalender*. Connect, choose
      the practice calendar, and look at the event-title template: it starts at
      `{{contactNumber}}`, and the title is all Google ever learns. The preview
      beside it shows what an event will be called before anything is written.

The catalogues that *are* filled — roles, relation types, salutations, genders,
countries, note types, activity types — are starting values, not a
specification. Rename them, delete them, add your own. Two of the relation types
cannot go: `Sorgeberechtigt` and `Rechnungsempfänger` are what the software
resolves when it needs a guardian or a billing recipient.

### The number range is the one that cannot be corrected later

It does **not** create itself. Only the contact counter does; an invoice range
is configured on purpose, because it may continue a numbering from the previous
system, and starting silently at 1 would reissue numbers that already exist on
paper.

Under *Einstellungen → Rechnungsstellung*, create the range with code `invoice`:
prefix, padding, next value. If you are continuing the old system's numbering,
this is where you say so, and it is the last comfortable moment to decide.

Without it, finalizing an invoice answers:

```
Für diesen Nummernkreis ist kein Startwert hinterlegt.
Bitte richten Sie ihn in den Einstellungen ein.
```

There is no automatic yearly reset either: before the first invoice of a new
year you edit the range yourself — new prefix, next value back to 1. The prefix
is part of the uniqueness key precisely so that value 1 may exist once per year.

### The service catalogue starts empty, and that is deliberate

Every other catalogue is structural: without a note type no note can be written,
without an activity type no activity exists. A service is not — an
`activity_item` may carry no service reference at all — so an empty catalogue is
a state the software fully supports, and *Leistungen* is a screen you fill in
with your own prices.

The reason it is not seeded with examples is that **a wrong price cannot be
corrected after the fact**: an `activity_item` copies description, fee code and
price at the moment it is created and never looks back, so three sessions billed
from an invented figure stay at that figure after the catalogue is fixed. Your
own prices are the one thing you certainly know.

Later, when deleting is no longer possible because something references an
entry, deactivating (`aktiv` off) takes a service out of the picker without
touching anything that already exists.

---

## 8. Backup — not solved, and this says so rather than pretending

**There is no backup procedure in this document, and that is deliberate.**

What stood here was written for a Postgres container on the same server as the
application (`docker exec <pg> pg_dump`, a `tar` of the volume beside it). None
of that holds now: the database is hosted elsewhere and reached over the public
internet. A corrected version would have been worse than none — it would have
looked like a procedure while nobody had run it.

What is actually needed is its own piece of work, and it has four parts:

- **The database.** A dump taken from outside, encrypted, stored off the server.
- **`DATA_DIR`.** Invoice PDFs under `invoices/{year}/` and note attachments
  under `files/{contactId}/{noteId}/`. **A database backup without this
  directory restores rows that point at documents that are gone** — a finalized
  invoice is served from disk and never re-rendered, precisely so that it looks
  the same for the whole retention period.
- **Somewhere that is not this machine.** A copy on the same disk is a copy.
- **A restore that has been performed.** Three things a restore forgets, in the
  order they will bite: the ICU collation (a database created without it sorts
  wrongly and the next migration refuses — section 1.5), the roles (`pg_dump`
  writes grants and policies but no `CREATE ROLE`), and `ENCRYPTION_KEY`
  (the rows come back; the Google token and the SMTP password inside them are
  only readable with the same key).

**Sliplane takes backups of its own, and they are not verified here.** Two
questions are open and both belong to that piece of work: whether restoring one
reproduces the ICU collation this schema requires — Sliplane provisions a new
database on restore, and section 1.2 is what gives ours its locale — and whether
their snapshot is consistent in the sense a `pg_dump` is. Neither is a property
of this application, and neither should be assumed.

**This has to be settled before the first real patient record exists**, not
before go-live in general: up to that point the only loss is configuration you
can retype. It is on the list in `WORKPLAN.md`.

---

## 9. What can go wrong

The failures found while building this, with the error you will actually see.

### `permission denied to alter role` on the first deployment

The deployment log stops there and no table exists. The baseline sets
`idle_in_transaction_session_timeout` on `praxi_app`, which needs `CREATEROLE`
**and** `ADMIN OPTION` on that role — section 1.3, the two lines that are easy
to skip because they look like they belong to somebody else's problem:

```sql
ALTER ROLE praxi_owner CREATEROLE;
GRANT praxi_app TO praxi_owner WITH ADMIN OPTION;
```

The baseline applies as one statement, so this is all-or-nothing: run the two
lines as `owner` and deploy again, nothing has to be cleaned up first.

### `must be able to SET ROLE "praxi_owner"`

Section 1.2. `CREATE DATABASE … OWNER x` needs `SET ROLE` on `x`, and a
`CREATEROLE` role gets only `ADMIN` on the roles it creates, not `SET`. The
`GRANT … WITH SET TRUE` line before it is what supplies the missing half.
`ALTER DATABASE … OWNER TO` afterwards fails on exactly the same thing, so it is
not a way around it.

### `permission denied to create extension "btree_gist"`

Almost always the right permissions in the wrong database — section 1.4. As the
owner of `praxi`, `praxi_owner` installs it without any special right; in `app`
or `postgres` it cannot, and the message reads like a restriction of the
provider.

### `type "contact_kind" already exists`

The database is not empty, or it was created before the migration squash. Its
`drizzle.__drizzle_migrations` holds the old 47 entries, the baseline's
timestamp is newer than all of them, so the migrator tries to create a schema
that is already there. The container never starts.

There is nothing in a pre-go-live database that the seed does not put back:
drop it, recreate it per section 1, and deploy again.

### `Invalid environment configuration. Check these variables: APP_DATABASE_URL`

A required variable is missing or malformed. The message names them and never
their values. `migrate.js` exits non-zero, nothing listens, Coolify keeps the
previous container. Fix the variable and redeploy.

### `Database must use the ICU provider with locale de-DE.`

Section 1.5, and the fix is section 1.2: the database was created without
`LOCALE_PROVIDER icu ICU_LOCALE 'de-DE'`. The migration refuses before creating
a single table, which is the loud version of a defect that would otherwise
surface as a wrongly sorted contact list months later. Nothing is in the
database yet at that point — drop it and create it again.

### `role "praxi" does not exist` or `permission denied to change default privileges`

A baseline regenerated with `pg_dump` and not edited: it wrote `FOR ROLE <the
owner it was dumped under>` back into the last two statements. Section 2.1.

### `cannot reach the database …` at startup

Two causes, and the `code` beside the message tells them apart:

- **`28P01`** — Postgres refused the credentials. Either the password in the
  connection string is not the one section 1.1 set, or the role was never given
  `LOGIN`. Section 2.2.
- **`ECONNREFUSED`** — Postgres is not there at all. Check the host and port in
  `APP_DATABASE_URL`: it is Sliplane's public hostname and its port, never
  `localhost` and never the `55432` from local development.

The message names both, because the container exits before anything else can be
asked of it.

### The application is connected but not encrypted

Nothing announces this — it is the reason 3.1 carries a query. If

```sql
select a.usename, s.ssl from pg_stat_ssl s join pg_stat_activity a using (pid)
 where a.datname = 'praxi';
```

shows `ssl = f` for `praxi_app`, the connection string is missing its TLS
parameters or carries `sslmode=require`, which in this driver means encrypted
without verifying anything. `sslmode=verify-full&sslrootcert=system` on **both**
URLs, then redeploy so the pool is rebuilt.

### The Google button says the connection is not set up

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `ENCRYPTION_KEY` must **all**
three be present. With any of them missing the settings say so rather than
offering a button that cannot work.

### `redirect_uri_mismatch` from Google

`GOOGLE_REDIRECT_URI` and the URI registered on the Web application client
differ — a trailing slash, `http` against `https`, or the Desktop client's
credentials still in place. Section 5.1.

### The calendar sync stops after a week

An External OAuth app in *Testing* mode. Section 5.3.

### `ENCRYPTION_KEY` lost or replaced

The Google refresh token and the SMTP password become permanently
undecryptable. Nothing else is damaged and no row is deleted — the software
notices the key does not match what it stored and says so. The way back is one
reconnect and one re-entered password. Section 3.2.

### `BETTER_AUTH_SECRET` changed

Everyone is signed out. That is the whole consequence; sign in again.

### Everybody sees an empty list

If it happens after a change to the connection strings: the server is running
as a role no policy exempts and no tenant is reaching the database, or it is
running as `praxi_owner` and the isolation is silently gone. Section 2.3 and 2.4
tell the two apart in one query each.

---

## 10. What this document does not know

Named rather than guessed at. The list is short now — most of what stood here
was about how the hosted Postgres behaves, and section 1 answers it with
measurements.

- **Whether the Google account is a Workspace account.** Section 5.3 turns on
  it, and only you can look. If it is not, an External app in *Testing* mode
  expires the refresh token after seven days and the calendar sync stops — a
  decision to take deliberately, not to discover on day eight.
- **Backup and restore.** Section 8: not solved, not written down as if it
  were, and to be settled before the first real patient record.
- **The domain and DNS.** Not covered here: an `A` record at the Coolify server
  and Coolify's automatic TLS are the whole of it, and they are the same as for
  any other application.


## Still open after go-live

`WORKPLAN.md`'s "Before going live" section holds what is deliberately not part
of this: a backup and restore procedure (section 8), an access log, a retention
and deletion concept, a route-level tenant test, and the decision whether the
database itself is encrypted at rest. Rate limiting arrived with S-B,
row-level security with S-C2, the migration history was squashed into
`0000_baseline.sql` in S-E, and `praxi tenant create` replaced the seed as the
way a practice comes into being in S-CLI.
