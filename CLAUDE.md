# CLAUDE.md — Practice Management Software (German HPP practice)

This file is the permanent context for this repository. Read it fully at the start of every session. It describes the whole system, including parts that do not exist yet.

## What this is

Practice management software for a German *Heilpraktiker für Psychotherapie* (HPP) practice — a non-physician psychotherapy practitioner licensed under the *Heilpraktikergesetz*. One practitioner, one tenant. It replaces an existing off-the-shelf product that is being retired.

Runs locally on a Mac, accessed in the browser at `http://localhost:3000`. It must be deployable to a server later without architectural rework, so all business logic sits behind an HTTP API and nothing depends on running on localhost.

The practice does not only treat patients. It also sells courses, exam preparation and talks, to individuals and to companies. The data model is therefore built around a generic contact, not around a patient.

## Language rules

- **Talk to me in German.** All chat responses, plans, questions, explanations and summaries are in German. The language of this file does not change that.
- **All code, identifiers, comments, commit messages, documentation and this file: English.** Domain terms use their English equivalent from the glossary below, never the German word. No `rechnungsposition`, no `festschreiben` in code.
- **All user-facing UI strings: German.** Labels, buttons, validation messages, errors shown to the user, PDF content.
- Keep German strings in `apps/web/src/lib/strings.ts` and `apps/server/src/messages.ts` rather than inlining them in components. This is not i18n — it keeps the language split enforceable.
- Database identifiers (tables, columns, enum values) are English.

## Glossary — German domain term → English identifier

| German | English | Notes |
|---|---|---|
| Mandant | `tenant` | identity only, configuration lives in `practice_settings` |
| Praxis / Stammdaten | `practice_settings` | one row per tenant |
| Behandler | `practitioner` | an `app_user` acting as practitioner |
| Kontakt | `contact` | the generic party — person or organization |
| Kontaktnummer | `contact_number` | sequential, every contact gets one |
| Rolle | `contact_role` | a property of one contact — patient, prospect, participant |
| Rollentyp | `contact_role_type` | the configurable catalogue of roles |
| Beziehung | `contact_relation` | connects two contacts — guardian, billing recipient |
| Beziehungstyp | `contact_relation_type` | the configurable catalogue of relations |
| Patient | a `contact` with role `patient` | never its own table |
| Vorgang | `activity` | a dated event where services were rendered |
| Vorgangsart | `activity_type` | the configurable catalogue of activity types |
| Vorgangsposition | `activity_item` | one rendered service within an activity |
| Sitzung | an `activity` whose type is `session` | |
| Termin / Kalendereintrag | `appointment` | separate from the activity, optional |
| Notiz / Dokumentation | `note` | attached to a contact, optionally to an activity |
| Anhang / Datei | `note_file` | files are always attached through a note |
| sperren / gesperrt | `lock` / `locked` | never "sign" — locking is not a signature |
| Nachtrag | `addendum` | a note correcting a locked note |
| Leistung | `service` | catalogue entry, acts as a template |
| Leistungsgruppe | `service_group` | selection helper, never referenced by a data row |
| Ziffer (GebüH) | `fee_code` | optional, free text |
| Rechnung | `invoice` | |
| Rechnungsposition | `invoice_line` | |
| Entwurf | `draft` | invoice status |
| festschreiben | `finalize` | |
| Stornorechnung | `cancellation_invoice` | German document title stays "Stornorechnung" |
| Gutschrift | credit note | **never used as a document type — see rule 9** |
| Zahlung | `payment` | |
| Zahlweg | `payment_method` | |
| Bezahlübersicht | `receivables` | |
| Nummernkreis | `number_range` | holds the next number, edited manually |
| Zahlungsziel | `payment_term_days` | |
| Einleitungs-/Schlusstext | `text_template` | intro and outro blocks on the invoice |
| Ausfallhonorar | a `service` like any other | no special mechanism |
| Umsatzsteuer | VAT | |
| Aufbewahrungsfrist | retention period | |
| Schweigepflicht | professional confidentiality | § 203 StGB |

## Stack — fixed, do not deviate

- Node 24 LTS, TypeScript `strict`, ESM
- pnpm workspace (monorepo)
- Backend: **Hono** (Node adapter), one process serving both the API and the built frontend
- DB: **PostgreSQL 17**, local via Docker Compose (Postgres only — never the app)
- DB access: **Drizzle ORM** + drizzle-kit
- Validation: **Zod**, schemas in `packages/shared`, imported by server and client
- Frontend: **Vite + React 19**, TanStack Router (file-based), TanStack Query
- UI: Tailwind + shadcn/ui, TanStack Table for lists
- Forms: react-hook-form with `@hookform/resolvers/zod`
- PDF: **@react-pdf/renderer** for content, **pdf-lib** to overlay it onto the uploaded template (no Puppeteer, no Chromium)
- Passwords: `@node-rs/argon2`
- Logging: pino
- Tests: Vitest
- Lint and format: **Biome** — one tool, one config, no ESLint and no Prettier

**Never introduce:** Next.js, Redis, BullMQ, Prisma, Auth.js/NextAuth, tRPC, Docker for the application itself, any cloud service or SaaS dependency.

Client-server typing via Hono's `hc<AppType>` client. No separate codegen step.

## Out of scope

Do not implement, and do not add schema for, anything beyond what is specified here:

- Bookkeeping, dunning, VAT filing, DATEV export — handled in separate accounting software
- Cash register, TSE, SumUp integration — the card terminal is operated manually
- Bank statement or CSV import of payments — payments are entered by hand
- Sending invoices by email — planned for later, purely additive when it comes
- Online booking — planned as a third-party integration much later
- Data import from the previous system — migration is manual
- Backup mechanics — handled outside the application
- Multi-user role management — the tables exist, there is exactly one user

## Architecture

```
praxi/
├─ apps/
│  ├─ server/
│  │  ├─ src/
│  │  │  ├─ db/            schema.ts, client.ts, migrations/
│  │  │  ├─ routes/        one file per resource
│  │  │  ├─ domain/        business logic, transactions
│  │  │  ├─ pdf/           invoice.tsx, overlay.ts, din5008.ts
│  │  │  ├─ google/        (last slice)
│  │  │  ├─ middleware/    error.ts, request-log.ts, auth.ts, tenant.ts
│  │  │  ├─ env.ts         Zod-validated environment
│  │  │  ├─ logger.ts      pino
│  │  │  ├─ messages.ts    German user-facing strings
│  │  │  ├─ app.ts         Hono app, exports `AppType`
│  │  │  └─ index.ts       serve() + static SPA
│  │  ├─ drizzle.config.ts
│  │  ├─ data/             invoices/, templates/, files/  (gitignored)
│  │  └─ public/           SPA build output (gitignored)
│  └─ web/
│     ├─ src/              routes/, components/, lib/api.ts, lib/strings.ts
│     ├─ components.json   shadcn/ui
│     ├─ tsr.config.json   TanStack Router file-based routing
│     └─ vite.config.ts
├─ packages/shared/        Zod schemas + derived types
├─ docker-compose.yml      Postgres 17 only, host port 55432
├─ tsconfig.base.json
├─ biome.json
├─ pnpm-workspace.yaml
├─ .env.example
├─ README.md               setup steps
├─ CLAUDE.md
└─ WORKPLAN.md             slice order and current progress
```

Dev mode runs Vite on 5173 (proxying `/api` to 3000) alongside the server on
3000. `pnpm build` writes the SPA into `apps/server/public`; `pnpm start` then
serves API and SPA from one process on 3000. The client always calls the
relative path `/api`, so no code branches on the mode.

The split between `routes/` (HTTP, auth, validation, error translation) and `domain/` (business rules, transactions) is mandatory. A route handler contains no business rule. Business rules are unit-tested; route handlers usually are not.

## Core domain rules

These rules are the actual value of this software. They live in `domain/` and are covered by tests.

### 1. Tenant scoping

Every domain table has `tenant_id uuid not null` referencing `tenant`. There is exactly one tenant for now, but every query filters on it. Row-level-security policies are created and left disabled (`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`) with a comment in the migration.

The tenant id comes from the session via `middleware/tenant.ts` and is never accepted from a request body or query string.

### 2. Money

Always `integer` cents. Never floats, never `numeric` in application logic. Formatting only in the presentation layer via `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`.

Formatted amounts are never persisted and never cross the API boundary. Cents as integers go into the database and into every request and response payload; formatting happens only when rendering to the user — in the UI or in the PDF.

### 3. Time

All timestamps `timestamptz`, stored in UTC. Display and input in `Europe/Berlin`. Pure dates (date of birth, invoice date, date of service, payment date) as `date`, not timestamps.

### 4. Contacts, kinds, roles and relations

`contact.kind` is `person` or `organization`. It is structural, decides which fields apply, and never changes.

**A role is a property of one contact.** Roles are multiple: a prospect who becomes a patient, someone who is both a patient and a course participant. They live in `contact_role`, never in a single type column on `contact`.

**A relation connects two contacts** and means nothing without the counterpart — a guardian, a billing recipient. Relations live in `contact_relation`, as **one row per fact**: both records show it, each with its own label. Two rows for one relation could drift apart.

Both sets are **configurable**. `contact_role_type` and `contact_relation_type` are catalogues the practitioner maintains, because the roles this practice needs are not known up front. Neither is an enum and neither is a check constraint; a composite foreign key carrying `tenant_id` is what validates an assignment.

Entries flagged `is_system` are the ones **logic may depend on**. They cannot be deleted and their `code` cannot change — enforced in `domain/contact-type.ts` and by the `protect_system_type` trigger. Everything about how they read stays editable: label, order, `active`, `show_as_tab`. `is_system` appears in no input schema; only the seed sets it. A `code` is fixed for every entry, system or not: it is the handle other rows point at.

**Direction of a relation**: `from` is the contact in whose record the fact is a property *of that contact*, `to` is the counterpart. A child is the `from` of `guardian`, a patient is the `from` of `billing_recipient`. This is not cosmetic — `is_exclusive` is enforced per `from_contact_id`, so with the convention exclusivity always reads as "this contact has at most one X", and the next exclusive type needs no fresh thinking. `parent_of` is the deliberate exception: with kinship neither side owns the fact, and "Elternteil von / Kind von" is the more common reading direction.

`label_forward` is what the `from` contact's record says about the `to` contact, `label_inverse` the other way round. A symmetric type has no inverse label and reads the same from both sides; it is still stored once, with the ends in a fixed order so the reverse duplicate collides.

Every contact gets a sequential `contact_number` on creation, regardless of role. There is no separate patient number.

Confidentiality follows the role, not the table: professional secrecy under § 203 StGB and the pseudonymization towards Google apply to contacts holding the role whose type is the **system entry with `code = 'patient'`** — not to a label that happens to read "Patient". A company booking a talk is not a confidential relationship.

### 5. Services are templates, never live references

`service` is a catalogue. `service_group` is a selection helper — when you pick a group, it is resolved into individual items immediately, at entry time. **No row that records what happened ever stores a reference to a group.**

The one place a group id may appear besides `service_group_item` is `activity_type.default_service_group_id` (slice 7.5): a catalogue entry naming another catalogue entry as a preset. It is resolved into individual items the moment the type is applied, exactly as picking the group by hand is, and never travels onto the activity. Nothing else may hold one, and `activity.test.ts` asserts the list against the live catalogue so a new column is caught.

When an `activity_item` is created, description, fee code and price are **copied** from the service. `service_id` remains only as a record of origin and carries no meaning for price or text afterwards. A position has no duration of its own — the length of what happened belongs to the activity.

Consequences, all of them intended:

- Editing the catalogue never changes anything that already exists — not past activities, and not future planned ones. An appointment booked today for next month keeps today's price even if the catalogue changes tomorrow. There is no automatic re-pricing and no "refresh price from catalogue" action.
- `service` therefore needs no price history, no `valid_from`/`valid_to`.
- An `activity_item` can exist without any `service_id` at all — a one-off talk, entered freely with its own description and price. The catalogue is a convenience, never a requirement.
- Prices on an `activity_item` are freely editable while it is not billed. Discounts and special rates need no separate mechanism.

### 6. Activity, appointment and billability

`activity` is a dated event where services were rendered to a contact — a session, a talk, a consultation. It is the record of what happened.

**The type of an activity is a catalogue entry**, not an enum: `activity.type` holds the `code` of an `activity_type`, through a composite foreign key carrying `tenant_id`, exactly as roles and relations do in rule 4. The practice decides which kinds of appointment it has, and it names and colours them itself. There are no system entries — nothing in the software depends on a particular type existing. A type that is in use cannot be deleted, only deactivated; the foreign key enforces that and the domain refuses first, so the message is a sentence.

An activity type may carry **presets**: a default duration, and either a default service or a default service group. They prefill a *new* activity and are read exactly once, when the type is applied. This is rule 5 one level up — changing a preset reaches nothing that already exists, and there is no re-apply mechanism anywhere in `domain/`. Changing the type of an activity that already carries a duration or positions therefore changes nothing else; the UI says so in a line and offers taking the presets over as an action with a name, rather than overwriting silently.

`activity.title` is optional. Where it is missing, every screen shows the label of the activity type instead — one implementation, `activityLabel()` in `packages/shared`, so list, calendar, contact overview and note dialog cannot drift.

`appointment` is the calendar entry. It is separate and optional: `activity.appointment_id` is nullable and unique. In practice both are created together, but an activity can be documented afterwards without ever producing a calendar entry. The foreign key sits on the activity — the appointment knows nothing about business logic, because it is ultimately just a projection towards a calendar.

**The two statuses say different things, and that is why there are two.** `appointment.status` (`requested`, `planned`, `confirmed`, `cancelled`, `cancelled_late`) says what became of the *slot*; `activity.status` (`planned`, `rendered`, `no_show`) says what became of the *treatment*. A no-show is an activity that did not happen in a slot that stayed occupied — one column could not say both, and the slot has to stay blocked, because the time really was. Only a cancellation releases it; the exclusion constraint names those two values and nothing else.

Both are **descriptive only**. Neither gates billing: anything in the past can be billed whatever they say, and `domain/billable.ts` reads neither. `activity.status` is the one that invites the mistake — it has a value that reads like a reason not to invoice — so the column carries a `COMMENT` saying so in the database, and there is a test asserting that a no-show stays billable.

Billability is a property of the item, not of a status:

- `activity_item.billable` defaults to true. On a no-show you set it to false and add an "Ausfallhonorar" item instead. The unbilled item stays on the activity, because it documents that a session was planned and did not happen.
- **An item is billable when `billable = true` and no `invoice_line` on a *non-cancelled* invoice references it.** The cancelled-invoice exclusion is essential: cancelling an invoice must return its items to the billable pool, and the lines of the cancelled invoice remain in place because finalized invoices are immutable. Getting this query wrong silently loses revenue.
- An `activity_item` referenced by a finalized, non-cancelled invoice can no longer be modified. Enforce this with a trigger, like locked notes.

The activity is the source of truth and the primary place to make corrections. Invoice lines stay editable while the invoice is a draft, but that is the exception path, not the normal workflow.

### 7. Notes: locking, hash chain, addenda, files

A note belongs to a contact, and optionally to an activity. Files are always attached through a note (`note_file`), never directly to a contact or activity — this gives attachments the same locking semantics as text without a second mechanism.

A note is freely editable until locked. On lock:

- set `locked_at`, `locked_by`
- `content_hash` = SHA-256 over a canonical JSON serialization of `{ noteDate, type, text, fileHashes, createdAt, createdBy }`, keys sorted alphabetically, no whitespace
- `prev_hash` = `content_hash` of the most recently locked note of the same contact, `null` for the first

This forms a hash chain per contact. `verifyChain(contactId)` walks it and reports deviations; there is a UI view for it.

After locking, neither the note nor its files can be changed or deleted. Enforced by trigger, not only in application code:

```sql
CREATE FUNCTION protect_locked_note() RETURNS trigger AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'locked note is immutable';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

as `BEFORE UPDATE OR DELETE`, plus an equivalent guard on `note_file` checking its parent note — that one also on `INSERT`, or a file could be attached to a note whose hash was already formed.

`coalesce(NEW, OLD)` rather than `NEW`: in a `BEFORE DELETE` trigger `NEW` is NULL, and a `BEFORE` row trigger returning NULL **silently cancels the operation**. With plain `RETURN NEW` deleting an *unlocked* note reports success and changes nothing. Found in slice 5, corrected in migration `0012`.

A locked note cannot be corrected, only supplemented: a new note of type `addendum` with `corrects_note_id` pointing at the locked one. Addenda render indented beneath the note they correct, labelled as an addendum with their own date. There is no unlock path — not for admins, not via a flag, not via a maintenance script.

*Why: § 630f BGB requires corrections to remain traceable with the original content recognizable. Lock plus append-only addenda satisfies this without a full change log. Locking is legally meaningful only for treatment documentation, but the mechanism is available on every note.*

### 8. Invoice numbering

`number_range` holds a **`next_value` that is edited by hand**. There is no automatic yearly reset — before the first invoice of a new year the practitioner edits the range. Whoever edits it is responsible for entering something sensible; on assignment the system checks that the resulting number does not already exist and refuses with a clear message if it does.

- Assignment happens only on finalization, in the same transaction, via `SELECT ... FOR UPDATE` on the `number_range` row. Never a Postgres sequence — sequences leave gaps on rollback.
- Invoices and cancellation invoices share one range.
- `number` is null while `status = 'draft'`. `unique (tenant_id, number)`.
- Discarded drafts may be deleted; they never held a number, so no gaps arise.

### 9. Finalizing, cancelling, paying

Finalization is one transaction that assigns the number, copies each line's description, fee code and unit price into `invoice_line`, resolves the selected intro and outro text templates into `invoice.intro_text` and `invoice.outro_text`, stores `recipient_snapshot`, computes the total, renders the PDF to `data/invoices/{year}/{number}.pdf`, stores its SHA-256, and sets `status = 'finalized'`.

Everything is snapshotted because everything else is editable afterwards: services, texts, contact addresses. A finalized invoice must render identically for the whole retention period, so the PDF is served from disk and never re-rendered on request.

After finalization the invoice row is immutable except for `status` and `cancelled_by_invoice_id`, enforced by trigger. Payments live in their own table and never touch the invoice row.

**Cancellation** produces a new document: `type = 'cancellation_invoice'`, negative amounts, its own number from the same range, `cancels_invoice_id` on the new one and `cancelled_by_invoice_id` on the original. There is no partial cancellation — cancel the whole invoice and write a new one. No replacement draft is created automatically; the freed items simply become billable again.

In the PDF and the UI the document is titled **"Stornorechnung"** or **"Rechnungskorrektur"**, never **"Gutschrift"**. In German VAT law that term means self-billing by the recipient (§ 14 Abs. 2 UStG); misusing it can trigger a tax liability under § 14c UStG.

**Payments** are entered by hand from the invoice. The amount is editable, so partial payments fall out of the model for free; the invoice status (open, partially paid, paid, overdue) is always derived from the sum of payments and never stored.

There is a "Betrag erhalten" action on finalization for the common case of payment by card right after the session: one transaction that finalizes, records a payment over the full amount dated to the invoice date with method `card`, and selects the outro template marked as the paid variant. All of it correctable afterwards.

### 10. VAT and invoice content

The practice bills private payers only. There is no VAT breakdown and no tax line. Any VAT note — for treatments typically the exemption under § 4 Nr. 14 lit. a UStG — is written by the practitioner into the outro text template. The software does not compute, insert or validate tax statements.

### 11. Invoice layout

The practitioner uploads a PDF template carrying the letterhead, logo, practice name, tax number and the return address line. The software renders only the variable content and overlays it onto that template with pdf-lib.

- Template with one page: that page backs every page of the document.
- Template with two pages: page 1 backs the first page, page 2 backs all following pages.

Layout follows **DIN 5008 Form B**. Put the millimetre constants (address field position and size, fold marks, hole mark, information block) in `pdf/din5008.ts` — never scattered as magic numbers.

Content order: recipient and date block, intro text, line items, total, outro text. Practice identity comes from the template, not from the code.

### 12. Logging and data protection

Health data falls under Art. 9 GDPR and professional confidentiality under § 203 StGB. Consequences for the code:

- Never log contact names, note text, file names or any clinical content — not in logs, error messages or stack traces. Logs carry IDs only.
- Uploaded files live outside the web root and are served only through an authenticated route, never by static file serving.
- No telemetry, no external fonts, no CDN references in the frontend. Bundle every asset locally.
- No outbound network requests at all, except to the Google Calendar API in the final slice.

## Target data model

**This is a sketch, not a contract.** It exists so you keep the whole system in view and do not design an early slice in a way that breaks a later one. It is not the final schema.

Tables are created slice by slice. The slice that creates a table is where its columns are decided — for real, with me, at that moment. Column names, optional fields and enum values are open to change then. Expect that some will change.

What *is* binding, because the domain rules above depend on it: `tenant_id` everywhere; integer cents; `timestamptz` in UTC; roles as their own table; `activity_item` carrying its own description and price; `activity.appointment_id` nullable and unique; `activity_item.billable`; `invoice.number` nullable for drafts; text and recipient snapshots on the invoice; `note` carrying `locked_at`, `content_hash`, `prev_hash`, `corrects_note_id`; immutability of finalized invoices and locked notes at database level.

Enum values marked `?` below are deliberately undecided and get settled in their slice.

All tables carry `id uuid primary key` (UUIDv7, generated in the application), `tenant_id`, `created_at`, `updated_at`.

```
-- as built (slice 1)
tenant                name text not null

-- as built (slice 1)
practice_settings     tenant_id uuid not null unique -> tenant(id),
                      practice_name text not null,
                      street, postal_code, city              (text, nullable)
                      country text not null default 'DE',
                      phone, email, website, tax_number      (text, nullable)
                      bank_name, iban, bic                   (text, nullable)
                      default_payment_term_days integer not null default 14
                        check (between 0 and 365)
                      invoice_template_path text            (slice 6, relative
                        -- to DATA_DIR, null until a letterhead is uploaded)
                      -- letter_template_path waits for a letter module —
                      -- nothing on spec.

-- as built (slice 1)
app_user              tenant_id uuid not null -> tenant(id),
                      email text not null,
                      password_hash text not null,           (argon2id)
                      name text not null,
                      active boolean not null default true
                      unique index on (email)                -- global, not per
                        -- tenant: the login form has no tenant context
                      check (email = lower(email))
                      unique (id, tenant_id)                 -- for the FK below
                      index on (tenant_id)

-- as built (slice 1)
session               tenant_id uuid not null -> tenant(id),
                      user_id uuid not null,
                      token_hash text not null,              (sha256 of the
                        -- cookie token; the token itself is never stored)
                      expires_at timestamptz not null,       (sliding, 14 days)
                      last_seen_at timestamptz not null default now()
                      foreign key (user_id, tenant_id)
                        -> app_user (id, tenant_id) on delete cascade
                        -- composite on purpose: tenant_id is denormalized onto
                        -- the session so auth resolves in one select, and this
                        -- key makes a mismatching tenant impossible
                      unique index on (token_hash)
                      index on (user_id), index on (expires_at)

-- as built (slice 2)
contact               tenant_id uuid not null -> tenant(id),
                      contact_number integer not null check (>= 1),
                      kind contact_kind not null                (pgEnum:
                        -- person | organization; structural, never changes)
                      -- person
                      salutation, title, first_name, last_name  (text, nullable)
                      date_of_birth date,
                      -- organization
                      company_name, contact_person              (text, nullable)
                      -- both: a sole trader is a person and can have a VAT id
                      vat_id, street, postal_code, city         (text, nullable)
                      country text not null default 'DE',
                      email, phone, internal_note               (text, nullable)
                      archived_at timestamptz                   (soft delete;
                        -- there is no hard delete path)
                      sort_name text generated always as (
                        coalesce(company_name,
                          btrim(coalesce(last_name,'') || ' ' ||
                                coalesce(first_name,'')))) stored
                        -- surname first, ordered in the ICU de-DE collation
                        -- that migration 0002 asserts. Displaying is a
                        -- different question: formatContactName() in
                        -- packages/shared, shared with the client.
                      unique (tenant_id, contact_number),
                      unique (id, tenant_id)                    -- for the FK
                      index on (tenant_id, sort_name)           -- the list's
                        -- ORDER BY. No index for the search: it is a leading
                        -- wildcard ILIKE, which no btree can serve.
                      check contact_kind_fields (
                        person       => last_name not null,
                                        company_name/contact_person null
                        organization => company_name not null,
                                        salutation/title/first_name/
                                        last_name/date_of_birth null)

-- as built (slice 6.5)
contact_role_type     tenant_id uuid not null -> tenant(id),
                      code text not null,                       -- the handle
                        -- logic points at; fixed once the row exists, for every
                        -- entry, because contact_role references it
                      label text not null,
                      is_system boolean not null default false, -- not
                        -- deletable, code frozen; set by the seed alone and
                        -- present in no input schema
                      show_as_tab boolean not null default false,
                        -- the contact list gives this role a tab of its own;
                        -- the rest stay reachable through the dropdown beside
                      sort_order integer not null default 0,
                      active boolean not null default true
                      unique (tenant_id, code)                  -- also the
                        -- target of contact_role's composite foreign key
                      index on (tenant_id, sort_order, label)
                      check contact_role_type_code_shape
                        (^[a-z][a-z0-9_]{0,39}$)
                      -- trigger protect_system_type (migration 0017) refuses
                      -- DELETE and any change to code or is_system on a system
                      -- row; set_updated_at; RLS created and disabled.

-- as built (slice 6.5)
contact_relation_type tenant_id uuid not null -> tenant(id),
                      code text not null,
                      label_forward text not null,              -- what the
                        -- `from` record says about the `to` contact
                      label_inverse text,                       -- and the
                        -- other way round; null exactly when symmetric
                      is_symmetric boolean not null default false,
                      is_exclusive boolean not null default false,
                        -- at most one per from_contact_id — which is why the
                        -- direction convention in rule 4 exists
                      is_system boolean not null default false,
                      sort_order integer not null default 0,
                      active boolean not null default true
                      unique (tenant_id, code),
                      index on (tenant_id, sort_order, label_forward)
                      check contact_relation_type_code_shape,
                      check contact_relation_type_inverse_label (
                        (label_inverse is not null) = (not is_symmetric))
                      -- same two triggers and RLS as contact_role_type

-- as built (slice 2), rebuilt in slice 6.5
contact_role          tenant_id uuid not null -> tenant(id),
                      contact_id uuid not null,
                      role_code text not null,
                      since date                                (nullable — when
                        -- an old contact is entered afterwards the start date
                        -- often cannot be reconstructed. Set to today when the
                        -- role is ticked; the form does not show it.)
                      foreign key (contact_id, tenant_id)
                        -> contact (id, tenant_id) on delete cascade
                      foreign key (role_code, tenant_id)
                        -> contact_role_type (code, tenant_id)
                        on update restrict on delete restrict
                        -- composite, so a role type of another tenant cannot
                        -- be assigned. Nothing to cascade on update: a code
                        -- never changes.
                      unique (contact_id, role_code)            -- also serves
                        -- lookups by contact and the cascade check
                      index on (tenant_id, role_code)           -- role filter

-- as built (slice 6.5)
contact_relation      tenant_id uuid not null -> tenant(id),
                      from_contact_id uuid not null,            -- the contact
                        -- the fact belongs to; see rule 4
                      to_contact_id uuid not null,
                      relation_code text not null,
                      since date,
                      exclusive boolean not null default false
                        -- a mirror of contact_relation_type.is_exclusive,
                        -- written ONLY by the trigger
                        -- contact_relation_set_exclusive. It exists because a
                        -- partial index cannot read a second table, and
                        -- exclusivity has to be a database guarantee. Never
                        -- written by application code, never in a payload.
                      foreign key (from_contact_id, tenant_id)
                        -> contact (id, tenant_id) on delete cascade,
                      foreign key (to_contact_id, tenant_id)
                        -> contact (id, tenant_id) on delete cascade,
                      foreign key (relation_code, tenant_id)
                        -> contact_relation_type (code, tenant_id)
                        on update restrict on delete restrict
                      unique (from_contact_id, to_contact_id, relation_code)
                      unique index contact_relation_exclusive_key
                        on (from_contact_id, relation_code) where exclusive
                        -- if relations ever gain an end date, narrow this to
                        -- the ones still running
                      index on (to_contact_id)                  -- the other
                        -- end; both records show the relation
                      check contact_relation_not_self
                      -- A directed relation may additionally exist in the
                      -- opposite direction — nonsense in content, but a
                      -- constraint against it costs more than the case is
                      -- worth. For a symmetric type the domain normalizes the
                      -- ends, so the reverse duplicate collides with the
                      -- unique key above.

-- as built (slice 3)
service               tenant_id uuid not null -> tenant(id),
                      short_code text                           (nullable)
                      description text not null,                -- copied onto
                        -- activity_item, and from there onto invoice_line
                      fee_code text,                            (GebüH, free
                        -- text, usually empty; nothing derives from it)
                      default_price_cents integer not null check (>= 0),
                        -- no negative catalogue entries: a discount is not a
                        -- service, rule 5 handles it by editing the price on
                        -- the activity_item
                      default_duration_min integer
                        check (null or > 0)                     -- an
                        -- Ausfallhonorar has no duration
                      active boolean not null default true
                      unique (id, tenant_id)                    -- for the FK
                      unique index (tenant_id, short_code)
                        where short_code is not null            -- unique only
                        -- where given; not every service needs a handle
                      -- deliberately absent: valid_from/valid_to, price
                      -- history. Editing the catalogue must leave everything
                      -- that already exists untouched (rule 5).

-- as built (slice 3)
service_group         tenant_id uuid not null -> tenant(id),
                      name text not null,
                      active boolean not null default true
                      unique (tenant_id, name),
                      unique (id, tenant_id)

-- as built (slice 3)
service_group_item    tenant_id uuid not null -> tenant(id),
                      service_group_id uuid not null,
                      service_id uuid not null,
                      quantity integer not null default 1 check (> 0),
                        -- integer: a session is the unit, length lives in
                        -- duration_min. activity_item.quantity matches.
                      position integer not null                 -- sort order
                        -- only, no unique constraint: reordering rewrites the
                        -- rows and renumbers from 0 without gaps
                      foreign key (service_group_id, tenant_id)
                        -> service_group (id, tenant_id) on delete cascade
                      foreign key (service_id, tenant_id)
                        -> service (id, tenant_id)              -- no cascade:
                        -- services are never deleted, only deactivated
                      unique (service_group_id, service_id),
                      index on (service_group_id, position)
                      -- This is the only table in the schema that may hold a
                      -- service_group_id (rule 5).

-- as built (slice 4), retyped and split in slice 7.5
activity              tenant_id uuid not null -> tenant(id),
                      contact_id uuid not null,
                      type text not null,                     -- the `code` of
                        -- an activity_type. Was a check constraint until 7.5;
                        -- the set is not merely expected to change, it is
                        -- maintained by the practitioner (rule 6).
                      status text not null default 'planned' check in
                        ('planned','rendered','no_show'),
                        -- what became of the TREATMENT. Descriptive only: it
                        -- does not gate billing, domain/billable.ts does not
                        -- read it, and COMMENT ON COLUMN says so in the
                        -- database too. appointment.status says what became of
                        -- the slot.
                      occurred_at timestamptz not null,
                      duration_min integer check (null or > 0)
                        -- descriptive only, nothing is derived from it;
                        -- redundant while there is an appointment, but an
                        -- activity documented afterwards has no other length
                      appointment_id uuid,
                      title, internal_note                    (text, nullable)
                        -- title optional: where it is missing every screen
                        -- shows the label of the activity type instead
                        -- (activityLabel() in packages/shared)
                      foreign key (contact_id, tenant_id)
                        -> contact (id, tenant_id)
                      foreign key (type, tenant_id)
                        -> activity_type (code, tenant_id)
                        on update restrict on delete restrict
                        -- nothing to cascade on update: a code never changes.
                        -- restrict on delete is what makes a type that is in
                        -- use undeletable; the domain refuses first so the
                        -- message is a sentence.
                      foreign key (appointment_id, contact_id, tenant_id)
                        -> appointment (id, contact_id, tenant_id)
                        on delete set null (appointment_id)
                        -- three columns so the appointment cannot belong to a
                        -- different contact than the activity. The column list
                        -- (PG 15+) is essential: a bare SET NULL would null
                        -- tenant_id too. drizzle-kit cannot express it, so
                        -- migration 0009 replaces the constraint by hand.
                      unique (appointment_id)                   -- nulls do not
                        -- collide, so any number may have no calendar entry
                      unique (id, tenant_id)
                      index (tenant_id, occurred_at), index (contact_id, occurred_at),
                      index (tenant_id, status)

-- as built (slice 4), duration dropped in slice 7.5
activity_item         tenant_id uuid not null -> tenant(id),
                      activity_id uuid not null,
                      position integer not null                 -- sort order,
                        -- rewritten from the array index on save
                      service_id uuid                           -- record of
                        -- origin only; means nothing for price or text (rule 5)
                      description text not null,                -- copied
                      fee_code text,                            -- copied
                      quantity integer not null default 1 check (> 0),
                      unit_price_cents integer not null         -- copied, then
                        -- free. No sign restriction, unlike the catalogue: a
                        -- negative one-off line is how rule 5 grants a discount
                      billable boolean not null default true
                        -- deliberately absent since 7.5: duration_min. Nothing
                        -- ever read it — the length of what happened is
                        -- activity.duration_min, and where there is a calendar
                        -- entry that is the interval the appointment spans.
                      foreign key (activity_id, tenant_id)
                        -> activity (id, tenant_id) on delete cascade
                      foreign key (service_id, tenant_id)
                        -> service (id, tenant_id)               -- no cascade
                      unique (id, tenant_id)                     -- target of
                        -- invoice_line's foreign key in slice 6
                      index (activity_id, position)
                      -- Rows are stable across an edit: `syncItems` updates in
                      -- place rather than replacing, because slice 6 points
                      -- invoice_line.activity_item_id at these ids.

-- as built (slice 7.5)
activity_type         tenant_id uuid not null -> tenant(id),
                      code text not null,                       -- the handle
                        -- activity.type points at; fixed once the row exists
                      label text not null,
                      color text not null default '#64748b'
                        check (~ '^#[0-9a-f]{6}$'),             -- the calendar
                        -- paints the entry in it; the label on top is black or
                        -- white, whichever reads better (readableTextOn)
                      default_duration_min integer check (null or > 0),
                      default_service_id uuid,
                      default_service_group_id uuid,
                        -- presets. Read once, when the type is applied to a
                        -- new activity, and never again (rule 5 one level up).
                        -- The group id here is the only one outside
                        -- service_group_item, and it never travels onto the
                        -- activity: it is resolved into items at entry time.
                      is_default boolean not null default false,
                      sort_order integer not null default 0,
                      active boolean not null default true
                      foreign key (default_service_id, tenant_id)
                        -> service (id, tenant_id)
                        on update restrict on delete restrict,
                      foreign key (default_service_group_id, tenant_id)
                        -> service_group (id, tenant_id)
                        on update restrict on delete restrict
                        -- RESTRICT, not SET NULL: a group *can* be deleted, and
                        -- a bare SET NULL on a composite key nulls tenant_id
                        -- with it — the slice-4 trap drizzle-kit cannot write a
                        -- column list for. Refusing also names what is in the
                        -- way instead of silently emptying a preset.
                      unique (tenant_id, code)                  -- also the
                        -- target of activity's composite foreign key
                      index on (tenant_id, sort_order, label),
                      unique index activity_type_default_key
                        on (tenant_id) where is_default
                      check activity_type_code_shape
                        (^[a-z][a-z0-9_]{0,39}$),
                      check activity_type_single_preset (
                        num_nonnulls(default_service_id,
                                     default_service_group_id) <= 1)
                      -- No is_system column and no protect_system_type trigger,
                      -- unlike the two catalogues of rule 4: nothing in the
                      -- software depends on a particular activity type
                      -- existing. set_updated_at; RLS created and disabled.

-- as built (slice 4), status narrowed in slice 7.5, extended in slice 9
appointment           tenant_id uuid not null -> tenant(id),
                      contact_id uuid not null                  -- NOT null,
                        -- against the sketch: every appointment belongs to an
                        -- activity for a contact, and slice 9's private
                        -- blockers arrive from Google as read-only intervals
                        -- that are never stored
                      starts_at timestamptz not null,
                      ends_at timestamptz not null check (> starts_at),
                      status text not null default 'planned' check in
                        ('requested','planned','confirmed','cancelled',
                         'cancelled_late'),
                        -- what became of the SLOT, and nothing else.
                        -- `attended` and `no_show` moved to activity.status in
                        -- slice 7.5: a no-show is an activity that did not
                        -- happen in a slot that stayed occupied.
                      title, note                               (text, nullable)
                      foreign key (contact_id, tenant_id)
                        -> contact (id, tenant_id)
                      unique (id, contact_id, tenant_id)        -- target of
                        -- activity's three-column foreign key
                      index (tenant_id, starts_at)
                      EXCLUDE USING gist (tenant_id WITH =,
                        tstzrange(starts_at, ends_at) WITH &&)
                        WHERE (status NOT IN ('cancelled','cancelled_late'))
                        -- migration 0009, needs btree_gist. tstzrange is
                        -- half-open, so back-to-back slots do not clash. Only
                        -- a cancellation releases the slot — a session that
                        -- nobody attended still occupied the time, which since
                        -- 7.5 is said by activity.status and not here.
                        -- Violations are SQLSTATE 23P01.
                      -- google_event_id / google_etag / last_pushed_at come in
                      -- slice 9 with the sync that fills them.

-- as built (slice 5)
note                  tenant_id uuid not null -> tenant(id),
                      contact_id uuid not null,
                      activity_id uuid,                         (nullable)
                      note_date date not null,                  -- the day
                        -- documented, not the day of writing; both go into the
                        -- hash
                      type text not null check in ('general','session',
                        'document','correspondence','addendum','other')
                        -- `document`, not the sketch's `file`: a note of type
                        -- "file" next to a table `note_file` reads as if it
                        -- were the attachment itself
                      text text not null,                       -- named `text`
                        -- and not `body`, so the column and the key in the
                        -- canonical serialization of rule 7 line up
                      created_by uuid not null,
                      locked_at timestamptz, locked_by uuid,
                      content_hash text, prev_hash text,        -- 64 hex,
                        -- null until locked; prev_hash also null at the head
                      corrects_note_id uuid
                      foreign key (contact_id, tenant_id)
                        -> contact (id, tenant_id)
                      foreign key (activity_id, contact_id, tenant_id)
                        -> activity (id, contact_id, tenant_id)
                        on delete restrict                      -- NOT set null:
                        -- that is an UPDATE, and on a locked note the trigger
                        -- would turn deleting an activity into "locked note is
                        -- immutable". deleteActivity checks first and refuses
                        -- readably. `activity` gained
                        -- unique (id, contact_id, tenant_id) for this key.
                      foreign key (corrects_note_id, contact_id, tenant_id)
                        -> note (id, contact_id, tenant_id) on delete restrict
                        -- three columns so an addendum cannot correct another
                        -- contact's note
                      foreign key (created_by, tenant_id)
                        -> app_user (id, tenant_id)
                      foreign key (locked_by, tenant_id)
                        -> app_user (id, tenant_id)
                      unique (id, tenant_id),
                      unique (id, contact_id, tenant_id)
                      index (contact_id, note_date, created_at),
                      index (activity_id), index (corrects_note_id)
                      unique index note_chain_link_key
                        on (contact_id, prev_hash) where prev_hash is not null
                      unique index note_chain_head_key
                        on (contact_id) where locked_at is not null
                                         and prev_hash is null
                        -- Both keep the chain linear: two locks at the same
                        -- instant would read the same tail and fork it into
                        -- two branches that each verify fine on their own.
                        -- Nothing queries them; they make a state unreachable.
                        -- COMMENT ON INDEX says so in the database too.
                      check note_lock_fields (locked_at, locked_by and
                        content_hash are all set or all null)
                      check note_prev_hash_requires_lock,
                      check note_hash_shape (^[0-9a-f]{64}$)
                      check note_addendum_target (
                        (type = 'addendum') = (corrects_note_id is not null))
                      check note_addendum_not_self
                      -- triggers protect_locked_note (migration 0011, fixed in
                      -- 0012) and set_updated_at; RLS created and disabled.

-- as built (slice 5)
note_file             tenant_id uuid not null -> tenant(id),
                      note_id uuid not null,
                      file_name text not null,                  -- as uploaded,
                        -- for display only — never a path segment, a file name
                        -- is clinical content (rule 12)
                      mime_type text not null,                  -- detected from
                        -- the bytes, not taken from the upload
                      size_bytes integer not null check (> 0),
                      storage_path text not null,               -- relative to
                        -- DATA_DIR: files/{contactId}/{noteId}/{fileId}.{ext}.
                        -- Absolute would make a move to a server a data
                        -- migration.
                      sha256 text not null check (^[0-9a-f]{64}$)
                      foreign key (note_id, tenant_id)
                        -> note (id, tenant_id) on delete cascade
                        -- safe precisely because a locked note cannot be
                        -- deleted: the cascade only reaches open ones
                      unique (tenant_id, storage_path),
                      index (note_id)
                      check note_file_path_relative (no leading /, no ..)
                      -- trigger protect_locked_note_file fires on INSERT too;
                      -- set_updated_at; RLS created and disabled.

-- as built (slice 2), extended in slice 6
number_range          tenant_id uuid not null -> tenant(id),
                      code text not null,
                      next_value integer not null check (>= 1),
                      prefix text not null default ''
                        check (~ '^[A-Za-z0-9._-]*$'),   -- the number becomes
                        -- a file name under data/invoices/{year}/
                      padding integer not null default 1 check (between 1 and 12)
                      unique (tenant_id, code)
                      --
                      -- Maintained by hand in the settings, which is the only
                      -- place next_value may move backwards. The yearly reset
                      -- lives there too: new prefix, next_value back to 1.
                      --
                      -- domain/counter.ts holds a whitelist of codes whose row
                      -- may be created on demand, starting at 1 — currently
                      -- 'contact' alone. For every other code a missing row is
                      -- an error: an invoice range is configured on purpose and
                      -- may continue a numbering from the previous system, so
                      -- starting at 1 would reissue existing numbers.

-- as built (slice 6)
invoice               tenant_id uuid not null -> tenant(id),
                      contact_id uuid not null,
                      type invoice_type not null default 'invoice'   (pgEnum:
                        -- invoice | cancellation_invoice)
                      status invoice_status not null default 'draft' (pgEnum:
                        -- draft | finalized | cancelled)
                      number text,                    -- the document number,
                        -- formatted and frozen at finalization. Text, not
                        -- derived from prefix and padding on read: changing
                        -- the padding later must never rewrite a number that
                        -- has already been issued.
                      number_prefix text, number_value integer,
                        -- frozen alongside it. The prefix is part of the
                        -- unique key because rule 8 resets the range every
                        -- year, so value 1 exists once per year and
                        -- unique (tenant_id, number_value) would reject the
                        -- first invoice of each new year. What the two are
                        -- really for is gap detection: "is a number missing
                        -- in RH-2026 between 1 and 47" stays a query.
                      invoice_date date not null,
                      payment_term_days integer not null
                        check (between 0 and 365),
                      recipient_snapshot jsonb,       -- formatContactName(),
                        -- the same function the screen uses
                      intro_text, outro_text          (text, nullable)
                        -- plain text, not a reference to a text_template: a
                        -- foreign key to a mutable table on an immutable row
                        -- would need ON DELETE SET NULL, which is an UPDATE
                        -- the trigger refuses. Picking a template fills these.
                      total_cents integer not null default 0,
                      pdf_path text, pdf_hash text,   -- relative to DATA_DIR
                      finalized_at timestamptz
                      foreign key (contact_id, tenant_id)
                        -> contact (id, tenant_id)
                      unique (id, tenant_id),
                      unique (tenant_id, number),
                      unique (tenant_id, number_prefix, number_value)
                      index (contact_id, invoice_date),
                      index (tenant_id, status, invoice_date)
                      check invoice_draft_fields (a draft has no number, no
                        -- document and no finalized_at; anything else has all
                        -- of them plus a recipient_snapshot)
                      check invoice_pdf_hash_shape, invoice_payment_term_range,
                      check invoice_number_value_positive
                      --
                      -- added in slice 7, both directions of a cancellation:
                      cancels_invoice_id uuid,      -- on the cancellation doc
                      cancelled_by_invoice_id uuid  -- on the original
                      foreign key (cancels_invoice_id, tenant_id)
                        -> invoice (id, tenant_id),
                      foreign key (cancelled_by_invoice_id, tenant_id)
                        -> invoice (id, tenant_id)
                      unique index invoice_cancels_key
                        on (cancels_invoice_id) where not null,
                      unique index invoice_cancelled_by_key
                        on (cancelled_by_invoice_id) where not null
                        -- these two are what make a double cancellation
                        -- unreachable; the domain refuses first so the message
                        -- is a sentence and not a constraint name
                      check invoice_cancellation_target (
                        (type = 'cancellation_invoice')
                          = (cancels_invoice_id is not null))
                      check invoice_cancelled_state (
                        (status = 'cancelled')
                          = (cancelled_by_invoice_id is not null)
                        and (cancelled_by_invoice_id is null
                             or type = 'invoice'))
                        -- `cancelled` is not a status of its own: it exists
                        -- because a cancellation document exists. With
                        -- invoice_draft_fields, which demands a number and a
                        -- document of everything that is not a draft, this
                        -- also settles that a draft can never be cancelled.
                      check invoice_cancellation_not_self
                      -- trigger protect_finalized_invoice (0014, replaced in
                      -- 0019): after finalization the row cannot be deleted
                      -- and only `status` and `cancelled_by_invoice_id` may
                      -- change — the latter once, from null, never back.
                      -- trigger invoice_cancellation_pair (0019), a CONSTRAINT
                      -- TRIGGER, DEFERRABLE INITIALLY DEFERRED: at COMMIT the
                      -- two ends must name each other. Deferred on purpose —
                      -- the document is written before the original is
                      -- updated, so the pair is legitimately incomplete during
                      -- the transaction.

-- as built (slice 6)
invoice_line          tenant_id uuid not null -> tenant(id),
                      invoice_id uuid not null,
                      position integer not null,
                      activity_item_id uuid,          -- record of origin, null
                        -- for a free line typed by hand
                      description text not null,      -- copied
                      fee_code text,                  -- copied
                      date_of_service date,
                      quantity integer not null check (> 0),
                      unit_price_cents integer not null,   -- no sign
                        -- restriction, like activity_item
                      amount_cents integer not null generated always as
                        (quantity * unit_price_cents) stored
                      foreign key (invoice_id, tenant_id)
                        -> invoice (id, tenant_id) on delete cascade
                      foreign key (activity_item_id, tenant_id)
                        -> activity_item (id, tenant_id) on delete restrict
                        -- an item on an invoice must not be able to disappear;
                        -- syncItems checks first so the message names it
                      unique (invoice_id, activity_item_id),
                      index (invoice_id, position),
                      index (activity_item_id) where not null
                      -- trigger protect_finalized_invoice_line, on INSERT too

-- as built (slice 6)
text_template         tenant_id uuid not null -> tenant(id),
                      kind text_template_kind not null   (pgEnum: intro|outro)
                      name text not null, body text not null,
                      is_default boolean not null default false,
                      is_paid_variant boolean not null default false,
                      active boolean not null default true
                      unique (tenant_id, kind, name)
                      unique index (tenant_id, kind) where is_default,
                      unique index (tenant_id) where is_paid_variant
                      check text_template_paid_is_outro
                      -- No invoice ever references a template: picking one
                      -- copies its body onto the draft. The paid variant is
                      -- used by the "Betrag erhalten" action, which arrives in
                      -- slice 8 with the payment table.

payment               tenant_id, invoice_id, paid_on, amount_cents,
                      method (bank_transfer|card|other), note

google_sync_queue     tenant_id, appointment_id, operation (create|update|delete),
                      attempts, last_error, next_attempt_at
```

`app_user` is deliberately not called `user` — `user` is reserved in Postgres and would force quoting everywhere.

## How we work

Development proceeds in **vertical slices**. One slice covers one or a few closely related entities end to end: Zod schema → migration → domain functions → API routes → UI → tests. A slice is finished and committed before the next begins. `WORKPLAN.md` holds the slice order and marks progress.

For every slice:

1. Propose a short plan first and wait for my confirmation. Name explicitly which tables, routes, files and UI screens you will touch.
2. **If the slice creates or alters a table, show me the concrete DDL first** — every column with its type, nullability, defaults, enum values, indexes and constraints — and wait for my approval before writing the migration. Do not treat the sketch above as settled. Where you think it is wrong, incomplete or badly named, say so at this point; that is what this step is for.
3. Implement it. Migrations are additive — never edit an existing migration file, always add a new one.
4. Run `pnpm typecheck`, `pnpm test`, `pnpm lint` yourself and fix what fails. Do not hand me failing output.
5. Replace that table's block in the data model above with the schema as actually built and mark it `-- as built`. The sketch converges into documentation as we go.
6. Give me a short German summary of what changed and what I should click through to verify.
7. Wait. Do not start the next slice unprompted.

If a slice reveals that a table built earlier was wrong, say so instead of working around it. Renaming a column in slice 3 costs a migration; living with a bad name until slice 9 costs far more.

## Conventions

- No `any`, no `@ts-ignore`. Fix the root cause.
- One Zod schema per entity in `packages/shared`, types derived from it. No hand-maintained parallel interfaces.
- Migrations are immutable once applied: never edit a migration file that has run, always add a new one. But do not contort a design to avoid a migration — there is no production database yet, and a migration during development is cheap. Prefer the correct schema over the one that avoids an `ALTER TABLE`.
- Before going live the migration history will be squashed into a single baseline. That baseline must be produced with `pg_dump --schema-only` against the real database, never regenerated from the Drizzle schema: Drizzle does not know the hand-written parts — triggers, the `EXCLUDE` constraint, RLS policies, the ICU locale check, partial indexes — and would silently drop them.
- Every new entity follows the structure of the entity built before it. Consistency beats local cleverness — if you want to deviate from an established pattern, say so and explain why before doing it.
- Tests are mandatory for everything in `domain/`. UI and simple CRUD routes need none.
- Do not add optimizations, caching or short-circuits that were not asked for. If you think one is warranted, propose it separately instead of building it in.
- No realistic person names in seeds or fixtures. Use obviously fake test names.
- Conventional Commits, in English, one commit per slice.

**Read mode first.** Detail views and dialogs open in read mode. Editing is a deliberate step: the user presses "Bearbeiten", the fields become editable, and "Speichern" / "Abbrechen" appear. Never open a record with editable fields. The exception is creating a new record — there is nothing to read yet, so the form is editable from the start.

*Why: opening a record is the common case, and reading it must not risk changing it. It also makes a stray keystroke harmless.*

A control that explicitly means *edit* — the pencil on a note — may lead straight into edit mode; every other way into a record opens it in read mode. That is a property of the way in, not of the dialog: the dialog can do both and takes it as a parameter, defaulting to read mode.

In practice: a `<fieldset disabled={!editing}>` around the fields, `editing` initialised to "this is a new record, or the caller asked for edit mode" and reset whenever a dialog opens. Dialogs use `ReadModeFooter` so every record looks the same once open, regardless of which button opened it. What this does **not** cover are single decisions that are not a record — ticking a role in the contact header, adding or removing a relation, uploading a file. Those act immediately and have no save button at all.

**Closed value sets.** Use a `pgEnum` when the set is structurally fixed and a value will never be renamed or removed — `contact.kind`, `invoice.type`, `invoice.status`, `payment.method`, `text_template.kind`, `google_sync_queue.operation`. Use `text` with a **named** check constraint for sets that are expected to change — `activity.status`, `appointment.status`, `note.type`. Where the set is not merely expected to change but is *maintained by the practitioner*, neither applies: `contact_role.role_code`, `contact_relation.relation_code` and `activity.type` point at a catalogue table through a composite foreign key (rules 4 and 6). `activity.type` began as a check constraint and became a catalogue in slice 7.5 — one DROP and one ADD, which is the whole argument for not reaching for an enum when in doubt. `ALTER TYPE … ADD VALUE` is awkward in a migration and the new value cannot be used in the same transaction; renaming or removing an enum value is effectively impossible. A check constraint is replaced with DROP/ADD in one migration. In both cases the TypeScript union is defined by the Zod schema in `packages/shared`, and the Drizzle column type is derived from it (`text().$type<ContactRole>()`) — never maintained twice.

**`updated_at`.** Maintained by the database, by the generic `set_updated_at()` trigger created in migration `0002`. Every table gets that trigger in the migration that creates it; nothing sets `updated_at` from application code. A value that silently stays behind on a `psql` update during maintenance is worse than no value at all. It means **last write**: an UPDATE storing identical values still moves it. Skipping no-op writes was tried and removed — Postgres fills generated columns after `BEFORE` triggers, so `NEW IS DISTINCT FROM OLD` is always true on a table with one, and the guard would have behaved differently per table (see migration `0005`).

**Database collation.** The cluster is initialised with the ICU provider and locale `de-DE`, so `ORDER BY` puts umlauts where a German card index does. Migration `0002` asserts this and fails with instructions if it is missing. Check `datlocprovider`/`datlocale`, never `datcollate` — under the ICU provider `datcollate` still shows the libc locale the cluster was built with and says nothing about how text sorts.
