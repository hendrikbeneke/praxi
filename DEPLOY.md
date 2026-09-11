# Deployment

A checklist from an empty database to the first sign-in. Work through it top to
bottom; every step says how to tell it worked.

## Where this runs

praxi runs on a **Sliplane** server. [Coolify](https://coolify.io) is installed
there and deploys this GitHub repository: it builds the `Dockerfile` at the
repository root, terminates TLS with its bundled Traefik, and Postgres runs
beside the application in the same Coolify environment.

`docker-compose.yml` in this repository is **not** used for this. It is
Postgres for local development and nothing else.

Nothing in the application code branches on any of it. Business logic sits
behind an HTTP API, and the only value in the whole system that names a host is
`GOOGLE_REDIRECT_URI`.

### One Coolify project, one environment

The database and the application go into the same environment. Coolify only
attaches resources to each other's internal Docker network within one
environment, and the application reaches Postgres by service name over that
network — never over the public internet.

---

## 1. Postgres

### 1.1 The resource

Add a PostgreSQL database resource in Coolify:

| Setting | Value | Why |
|---|---|---|
| Image | `postgres:17-alpine` | the same major version as local development |
| `POSTGRES_USER` | `praxi` | any name works; this one matches local development (2.1) |
| `POSTGRES_DB` | `praxi` | |
| `POSTGRES_PASSWORD` | generated, `openssl rand -hex 24` | goes into `DATABASE_URL` |
| `POSTGRES_INITDB_ARGS` | `--locale-provider=icu --icu-locale=de-DE --encoding=UTF8` | see 1.2 |
| Public port | **off** | nothing outside the Docker network needs to reach it |

`POSTGRES_INITDB_ARGS` only takes effect while the data directory is still
empty. Set it **before the first start**, not after.

Note the internal connection string Coolify shows. It is a service hostname and
port `5432` — not `localhost`, and not the `55432` from local development.

### 1.2 The ICU collation — the one thing that stops everything

`contact.sort_name` inherits the database collation, and the order of the
contact list depends on it. Initialised without ICU, the list puts *Öztürk*
after *Zimmermann*. So migration `0000_baseline.sql` checks it before it
creates a single table, and refuses otherwise.

**Check it** — connect to the database and run:

```sql
select datname, datlocprovider, datlocale, datcollate, datctype
  from pg_database where datname = current_database();
```

What it must say:

```
 datname | datlocprovider | datlocale | datcollate | datctype
---------+----------------+-----------+------------+----------
 praxi   | i              | de-DE     | C          | C
```

`datlocprovider = i` and `datlocale = de-DE` are the two the migration tests.
`datcollate`/`datctype` are the libc locale the cluster was built with and say
nothing about how text sorts — do not read them.

**If it says something else**, this is the error you will get on the first
deployment, verbatim:

```
ERROR:  Database must use the ICU provider with locale de-DE.
DETAIL:  found provider=i, locale=C
```

There are two ways out, and the second one works even on a managed Postgres
where you cannot touch `initdb`.

**(a) The data directory is still empty.** Set `POSTGRES_INITDB_ARGS` as above
and let the container initialise again. On Coolify this means deleting the
volume, which is only safe because nothing is in it yet.

**(b) You cannot set `initdb` arguments.** Then create the *database* with the
locale instead of the *cluster* — any role with `CREATEDB` can do this, and it
satisfies the check exactly the same way:

```sql
CREATE DATABASE praxi
  TEMPLATE template0
  ENCODING 'UTF8'
  LOCALE_PROVIDER icu
  ICU_LOCALE 'de-DE'
  LOCALE 'C';
```

Verified: a database created this way reports `datlocprovider = i`,
`datlocale = de-DE`, and the baseline applies.

This needs ICU compiled into the server, which every official `postgres` image
has. Check first if you want to know before trying:

```sql
select count(*) > 0 as icu_available from pg_collation where collprovider = 'i';
-- t
```

If that answers `f`, the image has no ICU and no `CREATE DATABASE` will help.
Use a different image.

---

## 2. The two database users

This is the part that decides whether row-level security is real or decoration,
so it gets its own section.

| User | Rights | What for | Where it is entered |
|---|---|---|---|
| `praxi` | owner of the database and all 39 tables; superuser as the Postgres image creates it | migrations, the seed, `db:app-role`, maintenance scripts, backups | `DATABASE_URL` |
| `praxi_app` | `LOGIN`, `USAGE` on schema `public`, `SELECT/INSERT/UPDATE/DELETE` on every table, `SELECT/USAGE` on sequences, `EXECUTE` on `google_connection_tenant_ids()` | **every request the server makes** | `APP_DATABASE_URL` |

`praxi_app` must **not** have: `SUPERUSER`, `BYPASSRLS`, `CREATEDB`,
`CREATEROLE`, and it must own nothing. Each of those three on its own walks
past every policy ever written here — a table's owner is exempt from its own
policies unless `FORCE ROW LEVEL SECURITY` is set, and it is not. Enabling RLS
under such a role changes nothing, with no error and no hint, which is the
worst outcome a safeguard can have: one that is believed.

### 2.1 The owner may be called anything

`POSTGRES_USER=praxi` in section 1.1 is for consistency with local development
and nothing more. If your Postgres hands you an owner whose name you cannot
choose — `postgres`, or something generated — that is fine, and only the two
connection strings have to say so.

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

### 2.2 Creating `praxi_app`

**Do this before the first deployment.** The baseline creates the role
`NOLOGIN` and grants it what it needs, but it deliberately sets no password —
a migration is committed to git. And the server calls
`verifyDatabaseConnection()` at startup and exits if it fails, so a first
deployment against a role that cannot log in never comes up, which also means
you cannot exec into the container to fix it.

Connect as `praxi` and run, with a password you generated (`openssl rand -hex 24`):

```sql
CREATE ROLE praxi_app LOGIN PASSWORD '<the generated password>';
```

That is all. The baseline's own `CREATE ROLE` is wrapped in
`IF NOT EXISTS`, so it will find your role and leave it alone, and the grants
land on it during the first migration.

`pnpm db:app-role` (in the container: `node apps/server/dist/scripts/app-role.js`)
does the same thing from `APP_DATABASE_PASSWORD` and is what you use **later**,
to rotate the password — it connects as the owner through `DATABASE_URL`,
because only a role with `CREATEROLE` or superuser may alter another role. It
cannot help with the first deployment for the reason above.

### 2.3 Verifying it has no special rights

Run this after the first migration and keep it for later — it is the check
that says whether the isolation exists at all:

```sql
select rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin
  from pg_roles where rolname in ('praxi', 'praxi_app') order by rolname;
```

Expected:

```
  rolname  | rolsuper | rolbypassrls | rolcreatedb | rolcreaterole | rolcanlogin
-----------+----------+--------------+-------------+---------------+-------------
 praxi     | t        | t            | t           | t             | t
 praxi_app | f        | f            | f           | f             | t
```

**The `praxi_app` row is the one that matters: three `f` and one `t`.**

And that it owns nothing:

```sql
select tableowner, count(*) from pg_tables where schemaname = 'public'
 group by tableowner;
-- praxi | 39
```

If `praxi_app` appears in that second result at all, stop and fix it before
real data goes in.

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
  select count(*) from service;   -- 7
commit;
```

Zero without, rows with. That is the policy working. As `praxi` both answer the
same, which is exactly why the server does not connect as `praxi`.

---

## 3. Environment variables

All of these go on the **application** resource in Coolify, not on the database
resource — except where the table says otherwise.

| Variable | Value | Where from | Required |
|---|---|---|---|
| `NODE_ENV` | `production` | fixed | no, but set it — it is what makes the server serve the built SPA |
| `PORT` | `3000` | fixed | no (default `3000`) |
| `DATABASE_URL` | `postgres://praxi:<pw>@<service>:5432/praxi` | the Postgres resource | **yes** |
| `APP_DATABASE_URL` | `postgres://praxi_app:<pw>@<service>:5432/praxi` | same database, the role from 2.2 | **yes** |
| `BETTER_AUTH_SECRET` | 64 hex characters | `openssl rand -hex 32` | **yes**, at least 32 characters |
| `DATA_DIR` | `/data` | matches the mount in section 4 | no (default is inside the image and would be lost on redeploy) — **set it** |
| `LOG_LEVEL` | `info` | fixed | no (default `info`) |
| `ENCRYPTION_KEY` | 64 hex characters | `openssl rand -hex 32` | only for Google and SMTP — but see below |
| `GOOGLE_CLIENT_ID` | the **Web application** client's id | Google Cloud, section 5 | only for the calendar |
| `GOOGLE_CLIENT_SECRET` | that client's secret | Google Cloud, section 5 | only for the calendar |
| `GOOGLE_REDIRECT_URI` | `https://<domain>/api/google/oauth/callback` | your domain | only for the calendar |
| `SEED_USER_EMAIL` | the practitioner's login address | you | seed only, temporarily |
| `SEED_USER_NAME` | the practitioner's name | you | seed only, temporarily |
| `SEED_USER_PASSWORD` | at least 12 characters | you | seed only, temporarily |
| `APP_DATABASE_PASSWORD` | the password from 2.2 | you | only if you use `db:app-role` to rotate it |

Mark `DATABASE_URL`, `APP_DATABASE_URL`, `BETTER_AUTH_SECRET`,
`ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET` and `SEED_USER_PASSWORD` as secrets in
Coolify.

**What happens when a required one is missing**: `getEnv()` refuses at startup
with `Invalid environment configuration. Check these variables: <names>` — it
names the variables and never their values, because `DATABASE_URL` contains a
password. `migrate.js` exits non-zero, the server never listens, the health
check never turns green, and Coolify keeps the previous container running. The
message is in the deployment log.

Nothing here is read lazily at the first request; the environment is parsed
once, at startup, on purpose.

### 3.1 The two connection strings point at the same database

They differ only in the user, and they are deliberately not interchangeable.

- **`DATABASE_URL` — the owner.** Used by `migrate.js` at container start, by
  the seed, by `db:app-role`, and by `files:orphans` / `invoices:verify`. Those
  legitimately work across tenants: the seed creates the tenant it is about to
  fill, and the orphan sweep compares every stored file against every note
  there is.
- **`APP_DATABASE_URL` — the server.** Every HTTP request. Row-level security
  applies to this role, and every request runs inside a transaction that sets
  `app.tenant_id` for the policies to read.

There is **no fallback** from one to the other, and that is the point rather
than strictness. With the policies on, falling back to the owner bypasses all
of them and answers every query exactly as it did before: nothing fails,
nothing is logged, and the isolation is simply gone. A server that refuses to
start says so at the only moment anyone would notice.

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

**1. Create the Postgres resource** (section 1), with `POSTGRES_USER=praxi` and
the ICU `INITDB_ARGS`.
→ *Check*: the ICU query in 1.2 says `i` / `de-DE`.

**2. Create the role `praxi_app`** with a password (section 2.2), connected as
`praxi`.
→ *Check*: `select rolcanlogin from pg_roles where rolname = 'praxi_app';` says `t`.

**3. Create the application resource** in Coolify: this repository, branch
`main`, build pack **Dockerfile**, port `3000`, health check path
`/api/health`, your domain with automatic TLS.

**4. Add the persistent volume** and `chown` it (section 4).

**5. Set the environment variables** (section 3), including
`SEED_USER_EMAIL`, `SEED_USER_NAME` and `SEED_USER_PASSWORD` — you need them
for step 7 and remove them in step 8.

**6. Deploy.**
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
→ *Check*: the queries in 2.3 — 39 tables owned by `praxi`, `praxi_app` with
three `f`.

If the container does not come up, go to section 9. It will be one of four
things and they all name themselves in the log.

**7. Seed.** In Coolify's *Execute Command* against the running container:

```bash
node apps/server/dist/db/seed/run.js
```

This creates the tenant, the practice settings, the one user with their
password, and the catalogues — roles, relation types, salutations, genders,
countries, note types, activity types, the example services and one service
group.

It connects **as the owner**, through `DATABASE_URL` — it has to, because its
very first statement creates the tenant that row-level security keys on, and
under `praxi_app` with no tenant set every query would answer with nothing.

**Running it twice is safe.** Every section is idempotent, and the one thing
worth knowing is what it does *not* do:

```
user live@praxi.invalid already exists — password left unchanged
services: 0 created, 7 already present
service group "…" already exists — left unchanged
```

It never overwrites the password of a user that already exists. Changing
`SEED_USER_PASSWORD` and running it again does nothing.

**`pnpm db:seed:demo` must never run on the server.** It creates invented
contacts with treatment histories, notes and invoices, and a second practice.
It is a convenience for development. There is no undo, and the contact numbers
it burns are gone.

`pnpm db:seed:services` needs no separate run either — it is part of
`db:seed`.

→ *Check*: the command prints `seed complete`.

**8. Remove `SEED_USER_PASSWORD`** (and the other two, if you like) from the
environment variables. The seed refuses an empty password and never overwrites
an existing user, so leaving them would be harmless rather than dangerous —
taking them out is just keeping a plaintext password out of the secret store.

**9. Sign in** at `https://<domain>` with `SEED_USER_EMAIL` and the password.

→ *Check*: the practice name in the sidebar. It will read *Praxis Musterfrau —
Heilpraktikerin für Psychotherapie*, which is the seed's placeholder and the
first thing section 7 replaces.

Note the login rate limit: five attempts a minute, by IP, and it never locks an
account — with one practitioner an account lockout would be a denial of service
against exactly that person the moment somebody knows the address.

---

## 7. What you enter by hand afterwards

Everything below is configuration, not deployment: it lives in the database and
is entered in the application.

**The practice master data is not empty — it is seeded with placeholders**, and
they are wrong rather than missing. Overwrite them, do not merely check them.

- [ ] **Praxis-Stammdaten** — *Einstellungen → Praxis*. Name, address, phone,
      email, website. The seed put *Praxis Musterfrau*, *Beispielweg 1*,
      *12345 Musterstadt*, `kontakt@praxi.invalid` there.
- [ ] **Bankverbindung** — same screen. The seed put a made-up IBAN
      (`DE02120300000000202051`) and BIC there.
- [ ] **Steuernummer** — same screen. The seed put `00/000/00000` there.
- [ ] **Zahlungsziel** — same screen, default 14 days.
- [ ] **Öffnungszeiten** — same screen, below the form. Empty means *not
      configured*, and the slot finder says so rather than assuming a working
      day. One row per interval: a lunch break is two rows, a day off is no rows.
- [ ] **Briefbogen (PDF-Vorlage)** — *Einstellungen → Rechnungsstellung*. The
      letterhead the invoice is printed onto: practice identity comes from this
      file, not from the code. One page backs every page; two pages means page 1
      backs the first and page 2 all the following ones.
- [ ] **Rechnungs-Nummernkreis** — *Einstellungen → Rechnungsstellung*. See below.
- [ ] **Textbausteine** — *Einstellungen → Textbausteine*. **Nothing is seeded
      here.** You need at least one intro and one outro, one of each marked as
      the default. Mark one outro as the *paid variant* if you use the "Betrag
      erhalten" action — without it that action still works but reports that the
      text was not found. The VAT note belongs in the outro text: the software
      computes, inserts and validates no tax statement at all, so for treatments
      the exemption under § 4 Nr. 14 lit. a UStG is a sentence you write there.
- [ ] **Leistungen** — *Leistungen*. See below.
- [ ] **Mailkonto** — *Einstellungen → Mailversand*. Host, port, security, user,
      password, sender address. The password is stored encrypted with
      `ENCRYPTION_KEY`. The test send has exactly one possible recipient, the
      configured sender address; it is not a field and cannot be redirected.
- [ ] **Mailvorlagen** — same screen. Nothing is seeded here either.
- [ ] **Google-Kalender** — *Einstellungen → Google-Kalender*. Connect, choose
      the practice calendar, and look at the event-title template: it starts at
      `{{contactNumber}}`, and the title is all Google ever learns. The preview
      beside it shows what an event will be called before anything is written.

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

### The example services have invented prices

The seed creates seven: Erstgespräch 135,00 €, Folgesitzung 90,00 €,
Kurzsitzung 50,00 €, Telefonische Beratung 35,00 €, Ausfallhonorar 60,00 €,
Prüfungsvorbereitung 150,00 €, Vortrag 350,00 € — and one group,
*Prüfungsvorbereitung Kompakttag*. Every figure is made up.

Under *Leistungen* you can **edit** them (description, short code, price,
duration) or **delete** them outright — the bin is there, and a service can be
deleted as long as nothing references it. Do this before the first invoice: an
`activity_item` copies description, fee code and price from the catalogue at
the moment it is created and never looks back, so a wrong price that made it
onto a rendered service stays there. Deactivating (`aktiv` off) takes a service
out of the picker without touching anything that already exists — that is the
tool for later, when deleting is no longer possible.

---

## 8. Backup

Two things have to be backed up, and one of them is not the database.

- **Postgres** — everything except the files.
- **`DATA_DIR`** — invoice PDFs under `invoices/{year}/` and note attachments
  under `files/{contactId}/{noteId}/`. A finalized invoice must render
  identically for the whole retention period, so it is served from disk and
  never re-rendered. A database backup without this directory restores rows
  that point at documents that are gone.

### Making one

On the server, with `<pg>` the Postgres container's name:

```bash
# database — custom format, so pg_restore can be selective
docker exec <pg> pg_dump -U praxi -Fc praxi \
  | gpg --symmetric --cipher-algo AES256 \
        -o praxi-db-$(date +%F).dump.gpg

# the files
tar czf - -C /data/coolify-volumes/praxi-data . \
  | gpg --symmetric --cipher-algo AES256 \
        -o praxi-data-$(date +%F).tar.gz.gpg
```

`gpg --symmetric` asks for a passphrase. Keep it where you keep
`ENCRYPTION_KEY` — and note that they are different things: this one protects
the backup, that one protects two credentials *inside* the backup. A restore
needs both.

Take the two files off the server. A backup on the same disk is a copy, not a
backup.

### Restoring

```bash
# 1. an empty database with the right collation — see 1.2
psql -U praxi -d postgres -c "CREATE DATABASE praxi TEMPLATE template0 \
  ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'de-DE' LOCALE 'C';"

# 2. the role, if this is a new cluster — a dump does not carry roles
psql -U praxi -d postgres -c "CREATE ROLE praxi_app LOGIN PASSWORD '<pw>';"

# 3. the rows
gpg -d praxi-db-YYYY-MM-DD.dump.gpg | pg_restore -U praxi -d praxi --no-owner

# 4. the files
gpg -d praxi-data-YYYY-MM-DD.tar.gz.gpg \
  | tar xzf - -C /data/coolify-volumes/praxi-data
chown -R 1000:1000 /data/coolify-volumes/praxi-data
```

Three things a restore forgets, in the order they will bite:

1. **The collation.** A restored database created without ICU sorts wrongly and
   the next migration refuses. Step 1 is not optional.
2. **The roles.** `pg_dump` writes grants and policies but no `CREATE ROLE`. A
   restore into a fresh cluster with no `praxi_app` leaves a schema whose grants
   name a role that does not exist.
3. **`ENCRYPTION_KEY`.** The rows come back; the Google token and the SMTP
   password inside them are only readable with the same key.

Then check the way in from section 6: health, sign in, open an invoice PDF.

### Do it once now

Before real data exists, make a backup and restore it into a scratch database.
It costs twenty minutes today and it is the only way to know the three points
above are handled in *your* environment rather than in this document.

**A backup that has never been restored is a guess.**

---

## 9. What can go wrong

The failures found while building this, with the error you will actually see.

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

Section 1.2. The migration refuses before creating a single table, which is the
loud version of a defect that would otherwise surface as a wrongly sorted
contact list months later.

### `role "praxi" does not exist` or `permission denied to change default privileges`

A baseline regenerated with `pg_dump` and not edited: it wrote `FOR ROLE praxi`
back into the last two statements. Section 2.1.

### `cannot reach the database …` at startup

Two causes, and the `code` beside the message tells them apart:

- **`28P01`** — Postgres refused the credentials. On a server this is almost
  always `praxi_app` with no password or no `LOGIN`, because the baseline
  creates it `NOLOGIN` on purpose. Section 2.2.
- **`ECONNREFUSED`** — Postgres is not there at all. Check the service name and
  port in `APP_DATABASE_URL`; inside Coolify's network it is not `localhost`.

The message names both, because the container exits before anything else can be
asked of it.

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
running as the owner and the isolation is silently gone. Section 2.3 and 2.4
tell the two apart in one query each.

---

## 10. What this document does not know

Named rather than guessed at.

- **How Sliplane exposes Postgres.** This file assumes Postgres is a *Coolify
  database resource* — a container in the same Coolify environment, where you
  set `POSTGRES_USER`, `POSTGRES_INITDB_ARGS` and so on. If you are instead
  using a Postgres that Sliplane manages for you, two things need checking
  before section 1 applies: whether you can create a role (2.2), and whether
  ICU is available (1.2, path (b) is the fallback and needs only `CREATEDB`).
  The owner's name is not one of them any more (2.1).
- **Sliplane's own volume and backup mechanics.** Section 4 is written for a
  host path on the server's disk, which is what Coolify's persistent storage
  gives you. If Sliplane provides volumes or snapshots of its own, they may be
  a better answer than section 8 — but a volume snapshot is not a substitute
  for the database dump unless it is consistent, and that is a property of
  their implementation, not of this application.
- **Whether the Google account is a Workspace account.** Section 5.3 turns on
  it, and only you can look.
- **The domain and DNS.** Not covered here: an `A` record at the Sliplane
  server and Coolify's automatic TLS are the whole of it, and they are the same
  as for any other application.

## Still open after go-live

`WORKPLAN.md`'s "Before going live" section holds what is deliberately not part
of this: an access log, a retention and deletion concept, a route-level tenant
test, and the decision whether the database itself is encrypted at rest. Rate
limiting arrived with S-B, row-level security with S-C2, and the migration
history was squashed into `0000_baseline.sql` in S-E.
