-- The baseline: the whole schema as of go-live, in one file.
--
-- It replaces migrations 0000-0046, which are in git history and nowhere else.
-- Squashing was deliberately left until now: it is a one-way door, and there
-- was no benefit before the day real patient data starts flowing through the
-- system.
--
-- ## Where this file came from, and where it must never come from
--
-- `pg_dump --schema-only --no-owner --exclude-schema=drizzle`, run against a
-- database the 47 migrations had actually built. **Never regenerated from the
-- Drizzle schema**, and that is not a preference: drizzle-kit sees neither the
-- triggers, nor the row-level-security policies, nor the EXCLUDE constraint,
-- nor the partial indexes, because none of them is expressible in
-- `db/schema.ts`. A generated baseline would have looked complete and been
-- half a schema.
--
-- The proof it is faithful is a diff, not a reading: this file applied to an
-- empty database and dumped again is byte-identical to the dump of the
-- migrated one. Zero lines.
--
-- ## Three things pg_dump does not carry, added by hand above its output
--
-- 1. **The ICU collation guard** (was migration 0002). It is an assertion, not
--    an object — there is nothing in the catalogue for a dump to find. Without
--    it a cluster initialised without ICU sorts "Öztürk" after "Zimmermann"
--    and nobody notices until the card index is real.
-- 2. **`CREATE ROLE praxi_app`** (was 0044). Roles are cluster-wide, so they
--    live in `pg_dumpall --globals` rather than here. It has to come *before*
--    the GRANTs further down, which name it.
-- 3. **`ALTER ROLE praxi_app SET idle_in_transaction_session_timeout`** (was
--    0044), for the same reason: a role property, not a database object.
--
-- Three edits to pg_dump's own output. `\restrict` and `\unrestrict` are
-- removed — psql meta-commands, not SQL, and a driver stops at them. And the
-- two `ALTER DEFAULT PRIVILEGES` statements at the very end lose their
-- `FOR ROLE praxi`, so that they apply to whoever runs the migration rather
-- than to a role that may not exist there; the reason stands at the statements
-- themselves, because that is where pg_dump will put the clause back.
--
-- ## It runs as one statement
--
-- The file carries no statement-breakpoint markers at all, so the migrator
-- hands it to Postgres in one piece: it applies whole or not at all, which is
-- the right property for a baseline.
--
-- Do not write that marker's literal spelling anywhere in this file, not even
-- inside a comment. The migrator splits the file on the string itself and does
-- not care that it is commented out — this paragraph named it once and cut the
-- baseline in half at exactly this line, which is how the rule was found.
--
-- ## What a new table still needs, every time
--
-- The generated part of `db/schema.ts` will give you columns, keys and
-- indexes. It will not give you `set_updated_at`, `ENABLE ROW LEVEL SECURITY`,
-- or the tenant policy — those are written by hand in the migration, as they
-- have been since 0033. `routes/rls.test.ts` walks `pg_policies` rather than a
-- list, so a table added with a policy and without the ALTER fails there.

-- ── the ICU collation guard (migration 0002) ───────────────────────────────
-- ── collation guard ────────────────────────────────────────────────────────
-- `contact.sort_name` (migration 0003) inherits the database collation, and
-- the order of the contact list depends on it. Initialised without ICU, the
-- list would put "Öztürk" after "Zimmermann" — a defect nobody notices until
-- the data is real. Fail here instead, while the fix is still cheap.
--
-- Checked against `datlocprovider`/`datlocale`, not `datcollate`: with the ICU
-- provider `datcollate` still shows the libc locale the cluster was built with
-- and says nothing about how text actually sorts.
DO $$
DECLARE
  provider "char";
  locale   text;
BEGIN
  SELECT datlocprovider, datlocale INTO provider, locale
    FROM pg_database WHERE datname = current_database();

  IF provider IS DISTINCT FROM 'i' OR locale IS DISTINCT FROM 'de-DE' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Database must use the ICU provider with locale de-DE.',
      DETAIL  = format('found provider=%s, locale=%s',
                       provider, coalesce(locale, '<null>')),
      HINT    = 'The cluster was initialised without ICU. Stop Postgres, remove '
                '.docker-data/postgres, run pnpm db:up (initdb then uses '
                '--locale-provider=icu --icu-locale=de-DE), then migrate and seed.';
  END IF;
END $$;

-- ── the application role (migration 0044) ──────────────────────────────────
-- NOLOGIN here on purpose: a password does not belong in a file committed to
-- git. `pnpm db:app-role` sets it from APP_DATABASE_PASSWORD and grants LOGIN.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'praxi_app') THEN
    CREATE ROLE praxi_app NOLOGIN;
  END IF;
END
$$;

-- A request holds its transaction open across a call to Google or an SMTP
-- server (see "Before going live" in WORKPLAN.md). This bounds it.
ALTER ROLE praxi_app SET idle_in_transaction_session_timeout = '30s';

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.10
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'Row-level security is ON for every table with a tenant. The server connects as praxi_app, which no policy exempts; the owner praxi bypasses them and runs migrations and the seed. See migrations 0044 and 0045.';


--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: contact_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contact_kind AS ENUM (
    'person',
    'organization'
);


--
-- Name: invoice_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_status AS ENUM (
    'draft',
    'finalized',
    'cancelled'
);


--
-- Name: invoice_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_type AS ENUM (
    'invoice',
    'cancellation_invoice'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'bank_transfer',
    'card',
    'other'
);


--
-- Name: text_template_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.text_template_kind AS ENUM (
    'intro',
    'outro'
);


--
-- Name: check_cancellation_pair(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_cancellation_pair() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- The row may have been deleted later in the same transaction — a discarded
  -- draft, say. The recorded event still fires; nothing is left to check.
  IF NOT EXISTS (SELECT 1 FROM invoice WHERE id = NEW.id) THEN
    RETURN NULL;
  END IF;

  IF NEW.cancels_invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM invoice o
     WHERE o.id = NEW.cancels_invoice_id
       AND o.cancelled_by_invoice_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'cancellation is not paired: the invoice does not point back';
  END IF;

  IF NEW.cancelled_by_invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM invoice c
     WHERE c.id = NEW.cancelled_by_invoice_id
       AND c.cancels_invoice_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'cancellation is not paired: the document does not point back';
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: contact_relation_set_exclusive(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.contact_relation_set_exclusive() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  SELECT t.is_exclusive INTO STRICT NEW.exclusive
    FROM contact_relation_type t
   WHERE t.tenant_id = NEW.tenant_id AND t.id = NEW.relation_type_id;
  RETURN NEW;
END;
$$;


--
-- Name: google_connection_tenant_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.google_connection_tenant_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT tenant_id FROM google_connection;
$$;


--
-- Name: FUNCTION google_connection_tenant_ids(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.google_connection_tenant_ids() IS 'Crosses tenants on purpose: the Google worker has no request and therefore no tenant. Hands out one column of one table and nothing else.';


--
-- Name: note_draft_requires_open_note(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.note_draft_requires_open_note() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."note_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "note" WHERE "id" = NEW."note_id" AND "locked_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'a locked note has no draft';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: payment_requires_finalized_invoice(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.payment_requires_finalized_invoice() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  invoice_status text;
BEGIN
  SELECT i."status"::text INTO invoice_status
    FROM "invoice" i WHERE i."id" = NEW."invoice_id";

  IF invoice_status = 'draft' THEN
    RAISE EXCEPTION 'a draft cannot be paid';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: protect_billed_activity_item(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_billed_activity_item() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM invoice_line il
      JOIN invoice i ON i.id = il.invoice_id
     WHERE il.activity_item_id = OLD.id
       AND i.status = 'finalized'
       AND i.type <> 'cancellation_invoice'
  ) THEN
    RAISE EXCEPTION 'activity item is billed and cannot be modified';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;


--
-- Name: protect_finalized_invoice(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_finalized_invoice() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Finalization itself is an UPDATE out of 'draft', so it passes here.
  IF OLD.status = 'draft' THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'finalized invoice cannot be deleted';
  END IF;

  IF OLD.cancelled_by_invoice_id IS NOT NULL
     AND NEW.cancelled_by_invoice_id IS DISTINCT FROM OLD.cancelled_by_invoice_id THEN
    RAISE EXCEPTION 'a cancelled invoice cannot be uncancelled';
  END IF;

  IF (to_jsonb(NEW) - 'status' - 'cancelled_by_invoice_id' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'status' - 'cancelled_by_invoice_id' - 'updated_at')
  THEN
    RAISE EXCEPTION 'finalized invoice is immutable except for its status';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: protect_finalized_invoice_line(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_finalized_invoice_line() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  parent uuid := coalesce(NEW.invoice_id, OLD.invoice_id);
BEGIN
  IF EXISTS (SELECT 1 FROM invoice WHERE id = parent AND status <> 'draft') THEN
    RAISE EXCEPTION 'finalized invoice is immutable';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;


--
-- Name: protect_locked_note(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_locked_note() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'locked note is immutable';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;


--
-- Name: protect_locked_note_file(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_locked_note_file() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  parent uuid := coalesce(NEW.note_id, OLD.note_id);
BEGIN
  IF EXISTS (SELECT 1 FROM note WHERE id = parent AND locked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'locked note is immutable';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;


--
-- Name: protect_system_type(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_system_type() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'system entry is not deletable';
  END IF;
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'system entry code is immutable';
  END IF;
  IF NEW.is_system IS DISTINCT FROM OLD.is_system THEN
    RAISE EXCEPTION 'system flag is immutable';
  END IF;
  -- coalesce, not NEW: in a BEFORE DELETE trigger NEW is NULL and returning
  -- NULL cancels the operation silently. See migration 0012 — the DELETE
  -- branch above raises, so it cannot happen here today, but the next edit to
  -- this function should not have to rediscover it.
  RETURN coalesce(NEW, OLD);
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    issuer text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    password text,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp with time zone,
    refresh_token_expires_at timestamp with time zone,
    scope text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE account; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.account IS 'Better Auth: one row per authentication method. Deliberately not under row-level security, and it has no tenant_id. See migration 0044.';


--
-- Name: activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    duration_min integer,
    appointment_id uuid,
    title text,
    internal_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    activity_type_id uuid NOT NULL,
    CONSTRAINT activity_duration_positive CHECK (((duration_min IS NULL) OR (duration_min > 0))),
    CONSTRAINT activity_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'rendered'::text, 'no_show'::text])))
);


--
-- Name: COLUMN activity.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.activity.status IS 'What became of the activity. Descriptive only: it does NOT gate billing. Anything in the past can be invoiced whatever this says, and the billable query does not read it — billability is activity_item.billable (CLAUDE.md rule 6). appointment.status says what became of the slot.';


--
-- Name: COLUMN activity.activity_type_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.activity.activity_type_id IS 'The catalogue entry this activity is of (CLAUDE.md rule 6). Pointed at activity_type.code until migration 0041; a type has no code anymore, so the id is the anchor.';


--
-- Name: activity_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_item (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    "position" integer NOT NULL,
    service_id uuid,
    description text NOT NULL,
    fee_code text,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price_cents integer NOT NULL,
    billable boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_item_quantity_positive CHECK ((quantity > 0))
);


--
-- Name: activity_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_type (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    label text NOT NULL,
    color text DEFAULT '#64748b'::text NOT NULL,
    default_duration_min integer,
    is_default boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_type_color_shape CHECK ((color ~ '^#[0-9a-f]{6}$'::text)),
    CONSTRAINT activity_type_duration_positive CHECK (((default_duration_min IS NULL) OR (default_duration_min > 0)))
);


--
-- Name: activity_type_preset_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_type_preset_item (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    activity_type_id uuid NOT NULL,
    service_id uuid NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_type_preset_item_quantity_positive CHECK ((quantity > 0))
);


--
-- Name: TABLE activity_type_preset_item; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.activity_type_preset_item IS 'References only — service_id, quantity, position, nothing else. Never a price or a description: a type is a template for a template, and freezing either here would mean the catalogue price could never take effect. Resolved into activity_item rows exactly once, when the type is applied (CLAUDE.md rule 5). Never holds a service_group_id: picking a group in the settings resolves it into these rows immediately, so nothing here can drift when the group is renamed or emptied later.';


--
-- Name: app_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_user (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    image text,
    CONSTRAINT app_user_email_lowercase CHECK ((email = lower(email))),
    CONSTRAINT app_user_preferences_is_object CHECK ((jsonb_typeof(preferences) = 'object'::text))
);


--
-- Name: TABLE app_user; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_user IS 'Deliberately NOT under row-level security: authentication precedes tenancy - the user is found by email before any tenant is known. See migration 0044.';


--
-- Name: appointment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    contact_id uuid,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    title text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    google_event_id text,
    google_etag text,
    last_pushed_at timestamp with time zone,
    CONSTRAINT appointment_ends_after_starts CHECK ((ends_at > starts_at)),
    CONSTRAINT appointment_google_etag_requires_event CHECK (((google_etag IS NULL) OR (google_event_id IS NOT NULL))),
    CONSTRAINT appointment_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'planned'::text, 'confirmed'::text, 'cancelled'::text, 'cancelled_late'::text])))
);


--
-- Name: COLUMN appointment.contact_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.appointment.contact_id IS 'Optional since 0034. An appointment is a calendar entry in its own right: a blocker, documentation time, a team meeting. An activity still always has a contact, and the composite key activity -> appointment carries contact_id through, so an appointment without one can never be carried by an activity.';


--
-- Name: COLUMN appointment.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.appointment.status IS 'What became of the SLOT. Descriptive only, and since 0034 that is complete: it gates nothing at all. It used to decide the exclusion constraint of migration 0009, which is gone. Overlapping appointments are allowed; the screen warns and the practitioner decides. findFreeSlots still refuses to suggest a time that is taken.';


--
-- Name: COLUMN appointment.google_event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.appointment.google_event_id IS 'The event in the practice calendar. Derived from this row''s own id (see googleEventId() in google/payload.ts), so a lost answer after a successful insert cannot produce a duplicate. The event carries the contact number and nothing else — Google never receives data identifying a patient (§ 203 StGB).';


--
-- Name: appointment_sync_conflict; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_sync_conflict (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    remote_starts_at timestamp with time zone NOT NULL,
    remote_ends_at timestamp with time zone NOT NULL,
    remote_cancelled boolean DEFAULT false NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT appointment_sync_conflict_ends_after_starts CHECK ((remote_ends_at > remote_starts_at)),
    CONSTRAINT appointment_sync_conflict_reason_check CHECK ((reason = 'both_changed'::text))
);


--
-- Name: TABLE appointment_sync_conflict; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.appointment_sync_conflict IS 'An appointment changed here and in Google before our change got out. The two sides are never merged: which one is right is a decision, and merging would invent a third version nobody chose. Resolved by being deleted — the list sits in the calendar, where scheduling happens.';


--
-- Name: contact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    contact_number integer NOT NULL,
    kind public.contact_kind NOT NULL,
    title text,
    first_name text,
    last_name text,
    date_of_birth date,
    company_name text,
    contact_person text,
    vat_id text,
    street text,
    postal_code text,
    city text,
    email text,
    internal_note text,
    archived_at timestamp with time zone,
    sort_name text GENERATED ALWAYS AS (COALESCE(company_name, btrim(((COALESCE(last_name, ''::text) || ' '::text) || COALESCE(first_name, ''::text))))) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    birth_place text,
    house_number text,
    phone_mobile text,
    phone_landline text,
    diagnosis text,
    salutation_id uuid,
    gender_id uuid,
    country_id uuid,
    CONSTRAINT contact_kind_fields CHECK ((((kind = 'person'::public.contact_kind) AND (last_name IS NOT NULL) AND (company_name IS NULL) AND (contact_person IS NULL)) OR ((kind = 'organization'::public.contact_kind) AND (company_name IS NOT NULL) AND (title IS NULL) AND (first_name IS NULL) AND (last_name IS NULL) AND (date_of_birth IS NULL) AND (birth_place IS NULL) AND (gender_id IS NULL)))),
    CONSTRAINT contact_number_positive CHECK ((contact_number >= 1))
);


--
-- Name: COLUMN contact.house_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contact.house_number IS 'Its own column, not part of the street. The address line is assembled by formatStreetLine() in packages/shared, shared by the screen and the invoice PDF. A recipient_snapshot written before this column existed has no house number and renders exactly as it did then.';


--
-- Name: COLUMN contact.diagnosis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contact.diagnosis IS 'A health datum under Art. 9 GDPR. Never logged, never in an error message, and never in the contact list — domain/contact.ts keeps it out of the list query''s column set, not just out of the response schema. Only master data, the invoice draft and the invoice PDF show it (CLAUDE.md rule 12).';


--
-- Name: contact_relation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_relation (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    from_contact_id uuid NOT NULL,
    to_contact_id uuid NOT NULL,
    since date,
    exclusive boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    relation_type_id uuid NOT NULL,
    CONSTRAINT contact_relation_not_self CHECK ((from_contact_id <> to_contact_id))
);


--
-- Name: COLUMN contact_relation.exclusive; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contact_relation.exclusive IS 'Mirror of contact_relation_type.is_exclusive, maintained by the trigger contact_relation_exclusive. Exists only so the partial unique index can be written; the type is the single source of truth.';


--
-- Name: COLUMN contact_relation.relation_type_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contact_relation.relation_type_id IS 'The type, by id. Ran over contact_relation_type.code until 0046 — the last catalogue reference in the schema that did.';


--
-- Name: contact_relation_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_relation_type (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text,
    label_forward text NOT NULL,
    label_inverse text,
    is_symmetric boolean DEFAULT false NOT NULL,
    is_exclusive boolean DEFAULT false NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contact_relation_type_code_shape CHECK ((code ~ '^[a-z][a-z0-9_]{0,39}$'::text)),
    CONSTRAINT contact_relation_type_inverse_label CHECK (((label_inverse IS NOT NULL) = (NOT is_symmetric))),
    CONSTRAINT contact_relation_type_system_needs_code CHECK (((NOT is_system) OR (code IS NOT NULL)))
);


--
-- Name: COLUMN contact_relation_type.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contact_relation_type.code IS 'Only system entries carry one. guardian and billing_recipient are looked up by this in the application, because a uuid differs per installation; every other entry is recognised by label_forward. See migration 0046.';


--
-- Name: contact_role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_role (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    since date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role_type_id uuid NOT NULL
);


--
-- Name: contact_role_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_role_type (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    label text NOT NULL,
    show_as_tab boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: country; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.country (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    iso_code text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT country_iso_code_shape CHECK ((iso_code ~ '^[A-Z]{2}$'::text))
);


--
-- Name: email_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_template (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: TABLE email_template; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.email_template IS 'The subject and body an invoice is sent with. Its own table rather than two new values in text_template_kind: a subject and a body are ONE message, and two independent rows of the generic table could be picked apart into a state that means nothing.';


--
-- Name: gender; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gender (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: google_connection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_connection (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    account_email text,
    refresh_token_cipher text NOT NULL,
    key_fingerprint text NOT NULL,
    calendar_id text,
    freebusy_calendar_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    sync_token text,
    last_sync_at timestamp with time zone,
    last_error text,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    event_title_template text DEFAULT '{{contactNumber}}'::text NOT NULL,
    CONSTRAINT google_connection_event_title_template_length CHECK (((char_length(event_title_template) >= 1) AND (char_length(event_title_template) <= 200))),
    CONSTRAINT google_connection_fingerprint_shape CHECK ((key_fingerprint ~ '^[0-9a-f]{16}$'::text))
);


--
-- Name: TABLE google_connection; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.google_connection IS 'The connection to one Google account. One row per tenant; deleting it IS disconnecting. The refresh token is stored encrypted with a key from the environment, the access token is never stored at all. key_fingerprint exists so a changed key can be named rather than surfacing as an authentication tag mismatch (CLAUDE.md slice 9).';


--
-- Name: COLUMN google_connection.freebusy_calendar_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.google_connection.freebusy_calendar_ids IS 'The calendars asked for busy intervals. Their CONTENT is never read: the token carries calendar.freebusy, not calendar.readonly, so the API can only ever answer with intervals — no titles, no participants.';


--
-- Name: COLUMN google_connection.event_title_template; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.google_connection.event_title_template IS 'Governs the TITLE of a Google event and nothing else — and the title is all Google ever learns. Read by buildEvent() and by nothing besides. Resets to the contact number when the connection is deleted.';


--
-- Name: google_sync_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_sync_queue (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    appointment_id uuid,
    operation text NOT NULL,
    calendar_id text NOT NULL,
    google_event_id text,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT google_sync_queue_attempts_positive CHECK ((attempts >= 0)),
    CONSTRAINT google_sync_queue_delete_shape CHECK (((operation = 'delete'::text) = (google_event_id IS NOT NULL))),
    CONSTRAINT google_sync_queue_operation_check CHECK ((operation = ANY (ARRAY['upsert'::text, 'delete'::text]))),
    CONSTRAINT google_sync_queue_upsert_shape CHECK (((operation = 'upsert'::text) = (appointment_id IS NOT NULL)))
);


--
-- Name: TABLE google_sync_queue; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.google_sync_queue IS 'The outbox. A row is written in the same transaction as the change it describes, so a failed push never blocks entering or moving an appointment — the software works with the network cable pulled. `upsert` reads the appointment fresh at push time, so a burst of edits collapses into one call; `delete` exists for the one case where there is nothing left to read.';


--
-- Name: COLUMN google_sync_queue.calendar_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.google_sync_queue.calendar_id IS 'Frozen when the row is written. Without it, changing the practice calendar would send a pending deletion to the wrong calendar and leave the event standing in the old one.';


--
-- Name: invoice; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    type public.invoice_type DEFAULT 'invoice'::public.invoice_type NOT NULL,
    status public.invoice_status DEFAULT 'draft'::public.invoice_status NOT NULL,
    number text,
    number_prefix text,
    number_value integer,
    invoice_date date NOT NULL,
    payment_term_days integer NOT NULL,
    recipient_snapshot jsonb,
    intro_text text,
    outro_text text,
    total_cents integer DEFAULT 0 NOT NULL,
    pdf_path text,
    pdf_hash text,
    finalized_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cancels_invoice_id uuid,
    cancelled_by_invoice_id uuid,
    diagnosis text,
    recipient_contact_id uuid,
    CONSTRAINT invoice_cancellation_not_self CHECK (((cancels_invoice_id IS DISTINCT FROM id) AND (cancelled_by_invoice_id IS DISTINCT FROM id))),
    CONSTRAINT invoice_cancellation_target CHECK (((type = 'cancellation_invoice'::public.invoice_type) = (cancels_invoice_id IS NOT NULL))),
    CONSTRAINT invoice_cancelled_state CHECK ((((status = 'cancelled'::public.invoice_status) = (cancelled_by_invoice_id IS NOT NULL)) AND ((cancelled_by_invoice_id IS NULL) OR (type = 'invoice'::public.invoice_type)))),
    CONSTRAINT invoice_draft_fields CHECK ((((status = 'draft'::public.invoice_status) AND (number IS NULL) AND (number_value IS NULL) AND (number_prefix IS NULL) AND (pdf_path IS NULL) AND (pdf_hash IS NULL) AND (finalized_at IS NULL)) OR ((status <> 'draft'::public.invoice_status) AND (number IS NOT NULL) AND (number_value IS NOT NULL) AND (number_prefix IS NOT NULL) AND (pdf_path IS NOT NULL) AND (pdf_hash IS NOT NULL) AND (finalized_at IS NOT NULL) AND (recipient_snapshot IS NOT NULL)))),
    CONSTRAINT invoice_number_value_positive CHECK (((number_value IS NULL) OR (number_value >= 1))),
    CONSTRAINT invoice_payment_term_range CHECK (((payment_term_days >= 0) AND (payment_term_days <= 365))),
    CONSTRAINT invoice_pdf_hash_shape CHECK (((pdf_hash IS NULL) OR (pdf_hash ~ '^[0-9a-f]{64}$'::text)))
);


--
-- Name: COLUMN invoice.diagnosis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice.diagnosis IS 'Prefilled from contact.diagnosis when the draft is created, then free to edit for this one invoice — plain text, not a reference, same as intro and outro. Frozen at finalization along with everything else on this row; protect_finalized_invoice compares the whole row rather than naming columns, so this needed no change to that trigger.';


--
-- Name: COLUMN invoice.recipient_contact_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice.recipient_contact_id IS 'Who the invoice is addressed to; NULL means the contact itself. Read only while the invoice is a draft — after finalization recipient_snapshot is what the document was addressed to.';


--
-- Name: invoice_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_line (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    "position" integer NOT NULL,
    activity_item_id uuid,
    description text NOT NULL,
    fee_code text,
    date_of_service date,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price_cents integer NOT NULL,
    amount_cents integer GENERATED ALWAYS AS ((quantity * unit_price_cents)) STORED NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_line_quantity_positive CHECK ((quantity > 0))
);


--
-- Name: invoice_send; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_send (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    recipient text NOT NULL,
    subject text NOT NULL,
    ok boolean NOT NULL,
    error text,
    sent_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_send_error_pair CHECK (((NOT ok) = (error IS NOT NULL)))
);


--
-- Name: TABLE invoice_send; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.invoice_send IS 'One send attempt, successful or not. Failed attempts stay — that is what makes "I tried three times" answerable, and it is what a synchronous send has instead of a retry mechanism: sending is an act, and an automatic retry would mean possibly delivering twice with nobody able to tell. The last successful send is DERIVED from these rows; there are deliberately no sent_at/sent_to columns on invoice, which would also have meant widening the allowlist of protect_finalized_invoice.';


--
-- Name: COLUMN invoice_send.error; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_send.error IS 'The server''s answer, raw — it usually quotes the recipient address. That is correct here: this is a record inside the protected database, not a log line. Rule 12 governs the log stream, where neither this nor the recipient ever appears.';


--
-- Name: note; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    activity_id uuid,
    note_date date NOT NULL,
    text text NOT NULL,
    created_by uuid NOT NULL,
    locked_at timestamp with time zone,
    locked_by uuid,
    content_hash text,
    prev_hash text,
    corrects_note_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    note_type_id uuid NOT NULL,
    CONSTRAINT note_addendum_not_self CHECK (((corrects_note_id IS NULL) OR (corrects_note_id <> id))),
    CONSTRAINT note_hash_shape CHECK ((((content_hash IS NULL) OR (content_hash ~ '^[0-9a-f]{64}$'::text)) AND ((prev_hash IS NULL) OR (prev_hash ~ '^[0-9a-f]{64}$'::text)))),
    CONSTRAINT note_lock_fields CHECK ((((locked_at IS NULL) AND (locked_by IS NULL) AND (content_hash IS NULL)) OR ((locked_at IS NOT NULL) AND (locked_by IS NOT NULL) AND (content_hash IS NOT NULL)))),
    CONSTRAINT note_prev_hash_requires_lock CHECK (((prev_hash IS NULL) OR (locked_at IS NOT NULL)))
);


--
-- Name: note_draft; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_draft (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    note_id uuid,
    corrects_note_id uuid,
    activity_id uuid,
    note_type_id uuid,
    note_date date,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT note_draft_text_not_blank CHECK ((btrim(text) <> ''::text))
);


--
-- Name: TABLE note_draft; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.note_draft IS 'The unsaved state of a note being written (L2). A draft is NOT the note: on an existing note the editor cannot write into the row, because what stands there is the last saved version — writing into it would make cancelling impossible, and a crash halfway through a rephrasing would turn half a sentence into the valid documentation. Saving makes a note of the draft and deletes it; cancelling leaves it lying. One draft per key, the newer overwrites the older — no versioning, no history, no merge.';


--
-- Name: COLUMN note_draft.note_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.note_draft.note_date IS 'Nullable on purpose, like note_type_id: the draft mirrors the form, gaps included. Were it required, a save running while the field is briefly blank during retyping would fail and take the text with it — the one thing this table exists to keep.';


--
-- Name: note_file; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_file (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    note_id uuid NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    storage_path text NOT NULL,
    sha256 text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT note_file_path_relative CHECK (((storage_path !~ '^/'::text) AND (storage_path !~ '\.\.'::text))),
    CONSTRAINT note_file_sha256_shape CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT note_file_size_positive CHECK ((size_bytes > 0))
);


--
-- Name: note_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_type (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    label text NOT NULL,
    show_as_tab boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: number_range; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.number_range (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    next_value integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    prefix text DEFAULT ''::text NOT NULL,
    padding integer DEFAULT 1 NOT NULL,
    CONSTRAINT number_range_next_value_positive CHECK ((next_value >= 1)),
    CONSTRAINT number_range_padding_range CHECK (((padding >= 1) AND (padding <= 12))),
    CONSTRAINT number_range_prefix_shape CHECK ((prefix ~ '^[A-Za-z0-9._-]*$'::text))
);


--
-- Name: opening_hour; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opening_hour (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    weekday integer NOT NULL,
    starts_at time without time zone NOT NULL,
    ends_at time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT opening_hour_ends_after_starts CHECK ((ends_at > starts_at)),
    CONSTRAINT opening_hour_weekday_range CHECK (((weekday >= 1) AND (weekday <= 7)))
);


--
-- Name: payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    paid_on date NOT NULL,
    amount_cents integer NOT NULL,
    method public.payment_method DEFAULT 'bank_transfer'::public.payment_method NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_amount_not_zero CHECK ((amount_cents <> 0))
);


--
-- Name: TABLE payment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payment IS 'What was received on an invoice, entered by hand. The invoice status — open, partly paid, paid, overdue — is DERIVED from the sum of these rows and never stored: invoicePaymentState() in packages/shared is the only place that decides it. Cancelling an invoice leaves its payments standing; refunding is a step outside this software (CLAUDE.md rule 9).';


--
-- Name: CONSTRAINT payment_amount_not_zero ON payment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT payment_amount_not_zero ON public.payment IS 'Not zero, but any sign. A negative payment records a refund without inventing a second concept, the same way a negative activity_item price grants a discount (rule 5). Zero records nothing and is always a typo.';


--
-- Name: practice_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_settings (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    practice_name text NOT NULL,
    street text,
    postal_code text,
    city text,
    country text DEFAULT 'DE'::text NOT NULL,
    phone text,
    email text,
    website text,
    tax_number text,
    bank_name text,
    iban text,
    bic text,
    default_payment_term_days integer DEFAULT 14 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    invoice_template_path text,
    vat_id text,
    CONSTRAINT practice_settings_country_supported CHECK ((country = 'DE'::text)),
    CONSTRAINT practice_settings_payment_term_range CHECK (((default_payment_term_days >= 0) AND (default_payment_term_days <= 365)))
);


--
-- Name: rate_limit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit (
    id uuid NOT NULL,
    key text NOT NULL,
    count integer NOT NULL,
    last_request bigint NOT NULL
);


--
-- Name: COLUMN rate_limit.last_request; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rate_limit.last_request IS 'Epoch milliseconds, written and compared as a number by Better Auth. Not a timestamp, which is why it is not timestamptz.';


--
-- Name: salutation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salutation (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    short_code text,
    description text NOT NULL,
    fee_code text,
    default_price_cents integer NOT NULL,
    default_duration_min integer,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT service_duration_positive CHECK (((default_duration_min IS NULL) OR (default_duration_min > 0))),
    CONSTRAINT service_price_not_negative CHECK ((default_price_cents >= 0))
);


--
-- Name: service_group; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_group (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: service_group_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_group_item (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    service_group_id uuid NOT NULL,
    service_id uuid NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT service_group_item_quantity_positive CHECK ((quantity > 0))
);


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    token text NOT NULL,
    ip_address text,
    user_agent text
);


--
-- Name: TABLE session; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.session IS 'Deliberately NOT under row-level security: the tenant is read OUT of this row, so a policy over it could never be satisfied. See migration 0044.';


--
-- Name: COLUMN session.token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session.token IS 'The cookie value, stored as it is. Better Auth compares it; what protects it is that the cookie is signed with BETTER_AUTH_SECRET.';


--
-- Name: smtp_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.smtp_settings (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    host text NOT NULL,
    port integer NOT NULL,
    security text DEFAULT 'starttls'::text NOT NULL,
    username text,
    password_cipher text,
    key_fingerprint text,
    from_address text NOT NULL,
    from_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT smtp_settings_fingerprint_shape CHECK (((key_fingerprint IS NULL) OR (key_fingerprint ~ '^[0-9a-f]{16}$'::text))),
    CONSTRAINT smtp_settings_password_needs_user CHECK (((password_cipher IS NULL) OR (username IS NOT NULL))),
    CONSTRAINT smtp_settings_password_pair CHECK (((password_cipher IS NULL) = (key_fingerprint IS NULL))),
    CONSTRAINT smtp_settings_port_range CHECK (((port >= 1) AND (port <= 65535))),
    CONSTRAINT smtp_settings_security_check CHECK ((security = ANY (ARRAY['starttls'::text, 'tls'::text, 'none'::text])))
);


--
-- Name: TABLE smtp_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.smtp_settings IS 'The SMTP account invoices are sent from. Its own table rather than columns on practice_settings, and the reason is structural: updatePracticeSettings writes the whole form object, so a password living there would travel to the client and back on every save of the master data. The password is encrypted by src/secrets.ts — the same mechanism and the same key as the Google refresh token, not a second one.';


--
-- Name: COLUMN smtp_settings.from_address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.smtp_settings.from_address IS 'The sender, and the ONLY address the test send can ever reach. It is not a form field and not a request parameter — a button that exists to check the configuration must not double as a way to send an invoice somewhere by accident (CLAUDE.md rule 14).';


--
-- Name: tenant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: text_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.text_template (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    kind public.text_template_kind NOT NULL,
    name text NOT NULL,
    body text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_paid_variant boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT text_template_paid_is_outro CHECK (((NOT is_paid_variant) OR (kind = 'outro'::public.text_template_kind)))
);


--
-- Name: verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification (
    id uuid NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: activity activity_appointment_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_appointment_key UNIQUE (appointment_id);


--
-- Name: activity activity_id_contact_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_id_contact_tenant_key UNIQUE (id, contact_id, tenant_id);


--
-- Name: activity activity_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: activity_item activity_item_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_item
    ADD CONSTRAINT activity_item_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: activity_item activity_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_item
    ADD CONSTRAINT activity_item_pkey PRIMARY KEY (id);


--
-- Name: activity activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_pkey PRIMARY KEY (id);


--
-- Name: activity_type activity_type_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_type
    ADD CONSTRAINT activity_type_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: activity_type activity_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_type
    ADD CONSTRAINT activity_type_pkey PRIMARY KEY (id);


--
-- Name: activity_type_preset_item activity_type_preset_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_type_preset_item
    ADD CONSTRAINT activity_type_preset_item_pkey PRIMARY KEY (id);


--
-- Name: activity_type_preset_item activity_type_preset_item_type_service_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_type_preset_item
    ADD CONSTRAINT activity_type_preset_item_type_service_key UNIQUE (activity_type_id, service_id);


--
-- Name: activity_type activity_type_tenant_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_type
    ADD CONSTRAINT activity_type_tenant_label_key UNIQUE (tenant_id, label);


--
-- Name: app_user app_user_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: app_user app_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (id);


--
-- Name: appointment appointment_id_contact_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment
    ADD CONSTRAINT appointment_id_contact_tenant_key UNIQUE (id, contact_id, tenant_id);


--
-- Name: appointment appointment_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment
    ADD CONSTRAINT appointment_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: appointment appointment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment
    ADD CONSTRAINT appointment_pkey PRIMARY KEY (id);


--
-- Name: appointment_sync_conflict appointment_sync_conflict_appointment_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_sync_conflict
    ADD CONSTRAINT appointment_sync_conflict_appointment_key UNIQUE (appointment_id);


--
-- Name: appointment_sync_conflict appointment_sync_conflict_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_sync_conflict
    ADD CONSTRAINT appointment_sync_conflict_pkey PRIMARY KEY (id);


--
-- Name: contact contact_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: contact contact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_pkey PRIMARY KEY (id);


--
-- Name: contact_relation contact_relation_pair_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_relation
    ADD CONSTRAINT contact_relation_pair_key UNIQUE (from_contact_id, to_contact_id, relation_type_id);


--
-- Name: contact_relation contact_relation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_relation
    ADD CONSTRAINT contact_relation_pkey PRIMARY KEY (id);


--
-- Name: contact_relation_type contact_relation_type_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_relation_type
    ADD CONSTRAINT contact_relation_type_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: contact_relation_type contact_relation_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_relation_type
    ADD CONSTRAINT contact_relation_type_pkey PRIMARY KEY (id);


--
-- Name: contact_relation_type contact_relation_type_tenant_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_relation_type
    ADD CONSTRAINT contact_relation_type_tenant_label_key UNIQUE (tenant_id, label_forward);


--
-- Name: contact_role contact_role_contact_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_role
    ADD CONSTRAINT contact_role_contact_type_key UNIQUE (contact_id, role_type_id);


--
-- Name: contact_role contact_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_role
    ADD CONSTRAINT contact_role_pkey PRIMARY KEY (id);


--
-- Name: contact_role_type contact_role_type_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_role_type
    ADD CONSTRAINT contact_role_type_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: contact_role_type contact_role_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_role_type
    ADD CONSTRAINT contact_role_type_pkey PRIMARY KEY (id);


--
-- Name: contact_role_type contact_role_type_tenant_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_role_type
    ADD CONSTRAINT contact_role_type_tenant_label_key UNIQUE (tenant_id, label);


--
-- Name: contact contact_tenant_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_tenant_number_key UNIQUE (tenant_id, contact_number);


--
-- Name: country country_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country
    ADD CONSTRAINT country_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: country country_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country
    ADD CONSTRAINT country_pkey PRIMARY KEY (id);


--
-- Name: country country_tenant_iso_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country
    ADD CONSTRAINT country_tenant_iso_key UNIQUE (tenant_id, iso_code);


--
-- Name: email_template email_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_template
    ADD CONSTRAINT email_template_pkey PRIMARY KEY (id);


--
-- Name: email_template email_template_tenant_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_template
    ADD CONSTRAINT email_template_tenant_name_key UNIQUE (tenant_id, name);


--
-- Name: gender gender_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gender
    ADD CONSTRAINT gender_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: gender gender_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gender
    ADD CONSTRAINT gender_pkey PRIMARY KEY (id);


--
-- Name: gender gender_tenant_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gender
    ADD CONSTRAINT gender_tenant_label_key UNIQUE (tenant_id, label);


--
-- Name: google_connection google_connection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_connection
    ADD CONSTRAINT google_connection_pkey PRIMARY KEY (id);


--
-- Name: google_connection google_connection_tenantId_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_connection
    ADD CONSTRAINT "google_connection_tenantId_unique" UNIQUE (tenant_id);


--
-- Name: google_sync_queue google_sync_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_sync_queue
    ADD CONSTRAINT google_sync_queue_pkey PRIMARY KEY (id);


--
-- Name: invoice invoice_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: invoice_line invoice_line_item_once_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line
    ADD CONSTRAINT invoice_line_item_once_key UNIQUE (invoice_id, activity_item_id);


--
-- Name: invoice_line invoice_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line
    ADD CONSTRAINT invoice_line_pkey PRIMARY KEY (id);


--
-- Name: invoice invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_number_key UNIQUE (tenant_id, number);


--
-- Name: invoice invoice_number_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_number_value_key UNIQUE (tenant_id, number_prefix, number_value);


--
-- Name: invoice invoice_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_pkey PRIMARY KEY (id);


--
-- Name: invoice_send invoice_send_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_send
    ADD CONSTRAINT invoice_send_pkey PRIMARY KEY (id);


--
-- Name: note_draft note_draft_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_draft
    ADD CONSTRAINT note_draft_pkey PRIMARY KEY (id);


--
-- Name: note_file note_file_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_file
    ADD CONSTRAINT note_file_pkey PRIMARY KEY (id);


--
-- Name: note_file note_file_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_file
    ADD CONSTRAINT note_file_storage_path_key UNIQUE (tenant_id, storage_path);


--
-- Name: note note_id_contact_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note
    ADD CONSTRAINT note_id_contact_tenant_key UNIQUE (id, contact_id, tenant_id);


--
-- Name: note note_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note
    ADD CONSTRAINT note_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: note note_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note
    ADD CONSTRAINT note_pkey PRIMARY KEY (id);


--
-- Name: note_type note_type_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_type
    ADD CONSTRAINT note_type_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: note_type note_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_type
    ADD CONSTRAINT note_type_pkey PRIMARY KEY (id);


--
-- Name: note_type note_type_tenant_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_type
    ADD CONSTRAINT note_type_tenant_label_key UNIQUE (tenant_id, label);


--
-- Name: number_range number_range_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.number_range
    ADD CONSTRAINT number_range_pkey PRIMARY KEY (id);


--
-- Name: number_range number_range_tenant_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.number_range
    ADD CONSTRAINT number_range_tenant_code_key UNIQUE (tenant_id, code);


--
-- Name: opening_hour opening_hour_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opening_hour
    ADD CONSTRAINT opening_hour_no_overlap EXCLUDE USING gist (tenant_id WITH =, weekday WITH =, tsrange(('2000-01-01'::date + starts_at), ('2000-01-01'::date + ends_at)) WITH &&);


--
-- Name: opening_hour opening_hour_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opening_hour
    ADD CONSTRAINT opening_hour_pkey PRIMARY KEY (id);


--
-- Name: payment payment_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: payment payment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_pkey PRIMARY KEY (id);


--
-- Name: practice_settings practice_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_settings
    ADD CONSTRAINT practice_settings_pkey PRIMARY KEY (id);


--
-- Name: practice_settings practice_settings_tenantId_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_settings
    ADD CONSTRAINT "practice_settings_tenantId_unique" UNIQUE (tenant_id);


--
-- Name: rate_limit rate_limit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit
    ADD CONSTRAINT rate_limit_pkey PRIMARY KEY (id);


--
-- Name: salutation salutation_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salutation
    ADD CONSTRAINT salutation_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: salutation salutation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salutation
    ADD CONSTRAINT salutation_pkey PRIMARY KEY (id);


--
-- Name: salutation salutation_tenant_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salutation
    ADD CONSTRAINT salutation_tenant_label_key UNIQUE (tenant_id, label);


--
-- Name: service_group service_group_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_group
    ADD CONSTRAINT service_group_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: service_group_item service_group_item_group_service_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_group_item
    ADD CONSTRAINT service_group_item_group_service_key UNIQUE (service_group_id, service_id);


--
-- Name: service_group_item service_group_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_group_item
    ADD CONSTRAINT service_group_item_pkey PRIMARY KEY (id);


--
-- Name: service_group service_group_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_group
    ADD CONSTRAINT service_group_pkey PRIMARY KEY (id);


--
-- Name: service_group service_group_tenant_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_group
    ADD CONSTRAINT service_group_tenant_name_key UNIQUE (tenant_id, name);


--
-- Name: service service_id_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service
    ADD CONSTRAINT service_id_tenant_key UNIQUE (id, tenant_id);


--
-- Name: service service_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service
    ADD CONSTRAINT service_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: smtp_settings smtp_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smtp_settings
    ADD CONSTRAINT smtp_settings_pkey PRIMARY KEY (id);


--
-- Name: smtp_settings smtp_settings_tenantId_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smtp_settings
    ADD CONSTRAINT "smtp_settings_tenantId_unique" UNIQUE (tenant_id);


--
-- Name: tenant tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant
    ADD CONSTRAINT tenant_pkey PRIMARY KEY (id);


--
-- Name: text_template text_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.text_template
    ADD CONSTRAINT text_template_pkey PRIMARY KEY (id);


--
-- Name: text_template text_template_tenant_kind_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.text_template
    ADD CONSTRAINT text_template_tenant_kind_name_key UNIQUE (tenant_id, kind, name);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: account_issuer_account_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX account_issuer_account_key ON public.account USING btree (issuer, account_id);


--
-- Name: account_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_user_idx ON public.account USING btree (user_id);


--
-- Name: activity_activity_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_activity_type_idx ON public.activity USING btree (activity_type_id);


--
-- Name: activity_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_contact_idx ON public.activity USING btree (contact_id, occurred_at);


--
-- Name: activity_item_activity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_item_activity_idx ON public.activity_item USING btree (activity_id, "position");


--
-- Name: activity_tenant_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_tenant_occurred_idx ON public.activity USING btree (tenant_id, occurred_at);


--
-- Name: activity_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_tenant_status_idx ON public.activity USING btree (tenant_id, status);


--
-- Name: activity_type_default_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX activity_type_default_key ON public.activity_type USING btree (tenant_id) WHERE is_default;


--
-- Name: activity_type_preset_item_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_type_preset_item_type_idx ON public.activity_type_preset_item USING btree (activity_type_id, "position");


--
-- Name: activity_type_tenant_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_type_tenant_sort_idx ON public.activity_type USING btree (tenant_id, sort_order, label);


--
-- Name: app_user_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_user_email_key ON public.app_user USING btree (email);


--
-- Name: app_user_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_user_tenant_idx ON public.app_user USING btree (tenant_id);


--
-- Name: appointment_google_event_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX appointment_google_event_key ON public.appointment USING btree (tenant_id, google_event_id) WHERE (google_event_id IS NOT NULL);


--
-- Name: appointment_sync_conflict_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointment_sync_conflict_tenant_idx ON public.appointment_sync_conflict USING btree (tenant_id, detected_at);


--
-- Name: appointment_tenant_starts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointment_tenant_starts_idx ON public.appointment USING btree (tenant_id, starts_at);


--
-- Name: contact_country_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_country_idx ON public.contact USING btree (country_id);


--
-- Name: contact_gender_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_gender_idx ON public.contact USING btree (gender_id);


--
-- Name: contact_relation_exclusive_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contact_relation_exclusive_key ON public.contact_relation USING btree (from_contact_id, relation_type_id) WHERE exclusive;


--
-- Name: contact_relation_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_relation_to_idx ON public.contact_relation USING btree (to_contact_id);


--
-- Name: contact_relation_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_relation_type_idx ON public.contact_relation USING btree (relation_type_id);


--
-- Name: contact_relation_type_tenant_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contact_relation_type_tenant_code_key ON public.contact_relation_type USING btree (tenant_id, code) WHERE (code IS NOT NULL);


--
-- Name: contact_relation_type_tenant_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_relation_type_tenant_sort_idx ON public.contact_relation_type USING btree (tenant_id, sort_order, label_forward);


--
-- Name: contact_role_tenant_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_role_tenant_type_idx ON public.contact_role USING btree (tenant_id, role_type_id);


--
-- Name: contact_role_type_tenant_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_role_type_tenant_sort_idx ON public.contact_role_type USING btree (tenant_id, sort_order, label);


--
-- Name: contact_salutation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_salutation_idx ON public.contact USING btree (salutation_id);


--
-- Name: contact_tenant_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_tenant_sort_idx ON public.contact USING btree (tenant_id, sort_name);


--
-- Name: country_tenant_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX country_tenant_sort_idx ON public.country USING btree (tenant_id, sort_order, iso_code);


--
-- Name: email_template_default_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_template_default_key ON public.email_template USING btree (tenant_id) WHERE is_default;


--
-- Name: gender_tenant_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gender_tenant_sort_idx ON public.gender USING btree (tenant_id, sort_order, label);


--
-- Name: google_sync_queue_appointment_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX google_sync_queue_appointment_key ON public.google_sync_queue USING btree (appointment_id) WHERE (appointment_id IS NOT NULL);


--
-- Name: google_sync_queue_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX google_sync_queue_due_idx ON public.google_sync_queue USING btree (tenant_id, next_attempt_at);


--
-- Name: invoice_cancelled_by_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invoice_cancelled_by_key ON public.invoice USING btree (cancelled_by_invoice_id) WHERE (cancelled_by_invoice_id IS NOT NULL);


--
-- Name: invoice_cancels_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invoice_cancels_key ON public.invoice USING btree (cancels_invoice_id) WHERE (cancels_invoice_id IS NOT NULL);


--
-- Name: invoice_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_contact_idx ON public.invoice USING btree (contact_id, invoice_date);


--
-- Name: invoice_line_activity_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_line_activity_item_idx ON public.invoice_line USING btree (activity_item_id) WHERE (activity_item_id IS NOT NULL);


--
-- Name: invoice_line_invoice_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_line_invoice_idx ON public.invoice_line USING btree (invoice_id, "position");


--
-- Name: invoice_recipient_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_recipient_contact_idx ON public.invoice USING btree (recipient_contact_id);


--
-- Name: invoice_send_invoice_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_send_invoice_idx ON public.invoice_send USING btree (invoice_id, sent_at);


--
-- Name: invoice_send_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_send_tenant_idx ON public.invoice_send USING btree (tenant_id, sent_at);


--
-- Name: invoice_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_tenant_status_idx ON public.invoice USING btree (tenant_id, status, invoice_date);


--
-- Name: note_activity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX note_activity_idx ON public.note USING btree (activity_id);


--
-- Name: note_chain_head_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX note_chain_head_key ON public.note USING btree (contact_id) WHERE ((locked_at IS NOT NULL) AND (prev_hash IS NULL));


--
-- Name: INDEX note_chain_head_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.note_chain_head_key IS 'The other half of note_chain_link_key: a contact has exactly one first link. NULLs do not collide in a unique index, so without this the fork could happen at the head instead. Not a performance index — do not drop as unused.';


--
-- Name: note_chain_link_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX note_chain_link_key ON public.note USING btree (contact_id, prev_hash) WHERE (prev_hash IS NOT NULL);


--
-- Name: INDEX note_chain_link_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.note_chain_link_key IS 'Keeps the hash chain linear: no two notes of one contact may claim the same predecessor. Two locks running concurrently would both read the same tail and both write its hash into prev_hash, forking the chain into two branches that each verify fine on their own. Not a performance index — do not drop as unused.';


--
-- Name: note_contact_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX note_contact_date_idx ON public.note USING btree (contact_id, note_date, created_at);


--
-- Name: note_corrects_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX note_corrects_idx ON public.note USING btree (corrects_note_id);


--
-- Name: note_draft_new_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX note_draft_new_key ON public.note_draft USING btree (user_id, contact_id) WHERE (note_id IS NULL);


--
-- Name: note_draft_note_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX note_draft_note_key ON public.note_draft USING btree (user_id, note_id) WHERE (note_id IS NOT NULL);


--
-- Name: note_draft_tenant_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX note_draft_tenant_updated_idx ON public.note_draft USING btree (tenant_id, updated_at);


--
-- Name: note_file_note_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX note_file_note_idx ON public.note_file USING btree (note_id);


--
-- Name: note_note_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX note_note_type_idx ON public.note USING btree (note_type_id);


--
-- Name: note_type_tenant_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX note_type_tenant_sort_idx ON public.note_type USING btree (tenant_id, sort_order, label);


--
-- Name: opening_hour_tenant_weekday_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX opening_hour_tenant_weekday_idx ON public.opening_hour USING btree (tenant_id, weekday, starts_at);


--
-- Name: payment_invoice_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_invoice_idx ON public.payment USING btree (invoice_id, paid_on);


--
-- Name: payment_tenant_paid_on_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_tenant_paid_on_idx ON public.payment USING btree (tenant_id, paid_on);


--
-- Name: rate_limit_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX rate_limit_key ON public.rate_limit USING btree (key);


--
-- Name: salutation_tenant_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX salutation_tenant_sort_idx ON public.salutation USING btree (tenant_id, sort_order, label);


--
-- Name: service_group_item_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_group_item_group_idx ON public.service_group_item USING btree (service_group_id, "position");


--
-- Name: service_tenant_short_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX service_tenant_short_code_key ON public.service USING btree (tenant_id, short_code) WHERE (short_code IS NOT NULL);


--
-- Name: session_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_expires_idx ON public.session USING btree (expires_at);


--
-- Name: session_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX session_token_key ON public.session USING btree (token);


--
-- Name: session_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_user_idx ON public.session USING btree (user_id);


--
-- Name: text_template_default_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX text_template_default_key ON public.text_template USING btree (tenant_id, kind) WHERE is_default;


--
-- Name: text_template_paid_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX text_template_paid_key ON public.text_template USING btree (tenant_id) WHERE is_paid_variant;


--
-- Name: verification_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_identifier_idx ON public.verification USING btree (identifier);


--
-- Name: account account_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER account_set_updated_at BEFORE UPDATE ON public.account FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: contact_relation contact_relation_exclusive; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contact_relation_exclusive BEFORE INSERT OR UPDATE ON public.contact_relation FOR EACH ROW EXECUTE FUNCTION public.contact_relation_set_exclusive();


--
-- Name: contact_relation_type contact_relation_type_protect_system; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contact_relation_type_protect_system BEFORE DELETE OR UPDATE ON public.contact_relation_type FOR EACH ROW WHEN (old.is_system) EXECUTE FUNCTION public.protect_system_type();


--
-- Name: invoice invoice_cancellation_pair; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER invoice_cancellation_pair AFTER INSERT OR UPDATE ON public.invoice DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_cancellation_pair();


--
-- Name: note_draft note_draft_requires_open_note; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER note_draft_requires_open_note BEFORE INSERT OR UPDATE ON public.note_draft FOR EACH ROW EXECUTE FUNCTION public.note_draft_requires_open_note();


--
-- Name: payment payment_requires_finalized_invoice; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payment_requires_finalized_invoice BEFORE INSERT OR UPDATE ON public.payment FOR EACH ROW EXECUTE FUNCTION public.payment_requires_finalized_invoice();


--
-- Name: activity_item protect_billed_activity_item; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_billed_activity_item BEFORE UPDATE ON public.activity_item FOR EACH ROW EXECUTE FUNCTION public.protect_billed_activity_item();


--
-- Name: invoice protect_finalized_invoice; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_finalized_invoice BEFORE DELETE OR UPDATE ON public.invoice FOR EACH ROW EXECUTE FUNCTION public.protect_finalized_invoice();


--
-- Name: invoice_line protect_finalized_invoice_line; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_finalized_invoice_line BEFORE INSERT OR DELETE OR UPDATE ON public.invoice_line FOR EACH ROW EXECUTE FUNCTION public.protect_finalized_invoice_line();


--
-- Name: note protect_locked_note; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_locked_note BEFORE DELETE OR UPDATE ON public.note FOR EACH ROW EXECUTE FUNCTION public.protect_locked_note();


--
-- Name: note_file protect_locked_note_file; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_locked_note_file BEFORE INSERT OR DELETE OR UPDATE ON public.note_file FOR EACH ROW EXECUTE FUNCTION public.protect_locked_note_file();


--
-- Name: activity set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.activity FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: activity_item set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.activity_item FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: activity_type set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.activity_type FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: activity_type_preset_item set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.activity_type_preset_item FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: app_user set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.app_user FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: appointment set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.appointment FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: appointment_sync_conflict set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.appointment_sync_conflict FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: contact set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.contact FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: contact_relation set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.contact_relation FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: contact_relation_type set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.contact_relation_type FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: contact_role set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.contact_role FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: contact_role_type set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.contact_role_type FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: country set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.country FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: email_template set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.email_template FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: gender set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.gender FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: google_connection set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.google_connection FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: google_sync_queue set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.google_sync_queue FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: invoice set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.invoice FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: invoice_line set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.invoice_line FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: invoice_send set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.invoice_send FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: note set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.note FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: note_draft set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.note_draft FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: note_file set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.note_file FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: note_type set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.note_type FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: number_range set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.number_range FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: opening_hour set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.opening_hour FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: payment set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payment FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: practice_settings set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.practice_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: salutation set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.salutation FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: service set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.service FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: service_group set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.service_group FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: service_group_item set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.service_group_item FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: session set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.session FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: smtp_settings set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.smtp_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tenant set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tenant FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: text_template set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.text_template FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: verification verification_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER verification_set_updated_at BEFORE UPDATE ON public.verification FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: account account_user_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_user_fk FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;


--
-- Name: activity activity_activity_type_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_activity_type_fk FOREIGN KEY (activity_type_id, tenant_id) REFERENCES public.activity_type(id, tenant_id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: activity activity_appointment_contact_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_appointment_contact_tenant_fk FOREIGN KEY (appointment_id, contact_id, tenant_id) REFERENCES public.appointment(id, contact_id, tenant_id) ON DELETE SET NULL (appointment_id);


--
-- Name: activity activity_contact_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_contact_tenant_fk FOREIGN KEY (contact_id, tenant_id) REFERENCES public.contact(id, tenant_id);


--
-- Name: activity_item activity_item_activity_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_item
    ADD CONSTRAINT activity_item_activity_tenant_fk FOREIGN KEY (activity_id, tenant_id) REFERENCES public.activity(id, tenant_id) ON DELETE CASCADE;


--
-- Name: activity_item activity_item_service_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_item
    ADD CONSTRAINT activity_item_service_tenant_fk FOREIGN KEY (service_id, tenant_id) REFERENCES public.service(id, tenant_id);


--
-- Name: activity_item activity_item_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_item
    ADD CONSTRAINT activity_item_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: activity activity_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: activity_type_preset_item activity_type_preset_item_service_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_type_preset_item
    ADD CONSTRAINT activity_type_preset_item_service_tenant_fk FOREIGN KEY (service_id, tenant_id) REFERENCES public.service(id, tenant_id);


--
-- Name: activity_type_preset_item activity_type_preset_item_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_type_preset_item
    ADD CONSTRAINT activity_type_preset_item_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: activity_type_preset_item activity_type_preset_item_type_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_type_preset_item
    ADD CONSTRAINT activity_type_preset_item_type_tenant_fk FOREIGN KEY (activity_type_id, tenant_id) REFERENCES public.activity_type(id, tenant_id) ON DELETE CASCADE;


--
-- Name: activity_type activity_type_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_type
    ADD CONSTRAINT activity_type_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: app_user app_user_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: appointment appointment_contact_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment
    ADD CONSTRAINT appointment_contact_tenant_fk FOREIGN KEY (contact_id, tenant_id) REFERENCES public.contact(id, tenant_id);


--
-- Name: appointment_sync_conflict appointment_sync_conflict_appointment_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_sync_conflict
    ADD CONSTRAINT appointment_sync_conflict_appointment_tenant_fk FOREIGN KEY (appointment_id, tenant_id) REFERENCES public.appointment(id, tenant_id) ON DELETE CASCADE;


--
-- Name: appointment_sync_conflict appointment_sync_conflict_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_sync_conflict
    ADD CONSTRAINT appointment_sync_conflict_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: appointment appointment_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment
    ADD CONSTRAINT appointment_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: contact contact_country_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_country_fk FOREIGN KEY (country_id, tenant_id) REFERENCES public.country(id, tenant_id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: contact contact_gender_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_gender_fk FOREIGN KEY (gender_id, tenant_id) REFERENCES public.gender(id, tenant_id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: contact_relation contact_relation_from_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_relation
    ADD CONSTRAINT contact_relation_from_fk FOREIGN KEY (from_contact_id, tenant_id) REFERENCES public.contact(id, tenant_id) ON DELETE CASCADE;


--
-- Name: contact_relation contact_relation_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_relation
    ADD CONSTRAINT contact_relation_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: contact_relation contact_relation_to_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_relation
    ADD CONSTRAINT contact_relation_to_fk FOREIGN KEY (to_contact_id, tenant_id) REFERENCES public.contact(id, tenant_id) ON DELETE CASCADE;


--
-- Name: contact_relation contact_relation_type_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_relation
    ADD CONSTRAINT contact_relation_type_fk FOREIGN KEY (relation_type_id, tenant_id) REFERENCES public.contact_relation_type(id, tenant_id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: contact_relation_type contact_relation_type_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_relation_type
    ADD CONSTRAINT contact_relation_type_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: contact_role contact_role_contact_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_role
    ADD CONSTRAINT contact_role_contact_tenant_fk FOREIGN KEY (contact_id, tenant_id) REFERENCES public.contact(id, tenant_id) ON DELETE CASCADE;


--
-- Name: contact_role contact_role_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_role
    ADD CONSTRAINT contact_role_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: contact_role contact_role_type_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_role
    ADD CONSTRAINT contact_role_type_fk FOREIGN KEY (role_type_id, tenant_id) REFERENCES public.contact_role_type(id, tenant_id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: contact_role_type contact_role_type_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_role_type
    ADD CONSTRAINT contact_role_type_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: contact contact_salutation_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_salutation_fk FOREIGN KEY (salutation_id, tenant_id) REFERENCES public.salutation(id, tenant_id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: contact contact_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: country country_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country
    ADD CONSTRAINT country_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: email_template email_template_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_template
    ADD CONSTRAINT email_template_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: gender gender_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gender
    ADD CONSTRAINT gender_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: google_connection google_connection_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_connection
    ADD CONSTRAINT google_connection_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: google_sync_queue google_sync_queue_appointment_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_sync_queue
    ADD CONSTRAINT google_sync_queue_appointment_tenant_fk FOREIGN KEY (appointment_id, tenant_id) REFERENCES public.appointment(id, tenant_id) ON DELETE CASCADE;


--
-- Name: google_sync_queue google_sync_queue_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_sync_queue
    ADD CONSTRAINT google_sync_queue_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: invoice invoice_cancelled_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_cancelled_by_fk FOREIGN KEY (cancelled_by_invoice_id, tenant_id) REFERENCES public.invoice(id, tenant_id);


--
-- Name: invoice invoice_cancels_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_cancels_fk FOREIGN KEY (cancels_invoice_id, tenant_id) REFERENCES public.invoice(id, tenant_id);


--
-- Name: invoice invoice_contact_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_contact_tenant_fk FOREIGN KEY (contact_id, tenant_id) REFERENCES public.contact(id, tenant_id);


--
-- Name: invoice_line invoice_line_activity_item_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line
    ADD CONSTRAINT invoice_line_activity_item_tenant_fk FOREIGN KEY (activity_item_id, tenant_id) REFERENCES public.activity_item(id, tenant_id) ON DELETE RESTRICT;


--
-- Name: invoice_line invoice_line_invoice_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line
    ADD CONSTRAINT invoice_line_invoice_tenant_fk FOREIGN KEY (invoice_id, tenant_id) REFERENCES public.invoice(id, tenant_id) ON DELETE CASCADE;


--
-- Name: invoice_line invoice_line_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line
    ADD CONSTRAINT invoice_line_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: invoice invoice_recipient_contact_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_recipient_contact_fk FOREIGN KEY (recipient_contact_id, tenant_id) REFERENCES public.contact(id, tenant_id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: invoice_send invoice_send_invoice_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_send
    ADD CONSTRAINT invoice_send_invoice_tenant_fk FOREIGN KEY (invoice_id, tenant_id) REFERENCES public.invoice(id, tenant_id) ON DELETE RESTRICT;


--
-- Name: invoice_send invoice_send_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_send
    ADD CONSTRAINT invoice_send_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: invoice_send invoice_send_user_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_send
    ADD CONSTRAINT invoice_send_user_tenant_fk FOREIGN KEY (sent_by, tenant_id) REFERENCES public.app_user(id, tenant_id);


--
-- Name: invoice invoice_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: note note_activity_contact_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note
    ADD CONSTRAINT note_activity_contact_tenant_fk FOREIGN KEY (activity_id, contact_id, tenant_id) REFERENCES public.activity(id, contact_id, tenant_id) ON DELETE RESTRICT;


--
-- Name: note note_contact_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note
    ADD CONSTRAINT note_contact_tenant_fk FOREIGN KEY (contact_id, tenant_id) REFERENCES public.contact(id, tenant_id);


--
-- Name: note note_corrects_contact_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note
    ADD CONSTRAINT note_corrects_contact_tenant_fk FOREIGN KEY (corrects_note_id, contact_id, tenant_id) REFERENCES public.note(id, contact_id, tenant_id) ON DELETE RESTRICT;


--
-- Name: note note_created_by_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note
    ADD CONSTRAINT note_created_by_tenant_fk FOREIGN KEY (created_by, tenant_id) REFERENCES public.app_user(id, tenant_id);


--
-- Name: note_draft note_draft_activity_contact_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_draft
    ADD CONSTRAINT note_draft_activity_contact_tenant_fk FOREIGN KEY (activity_id, contact_id, tenant_id) REFERENCES public.activity(id, contact_id, tenant_id) ON DELETE SET NULL (activity_id);


--
-- Name: note_draft note_draft_contact_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_draft
    ADD CONSTRAINT note_draft_contact_tenant_fk FOREIGN KEY (contact_id, tenant_id) REFERENCES public.contact(id, tenant_id) ON DELETE CASCADE;


--
-- Name: note_draft note_draft_corrects_contact_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_draft
    ADD CONSTRAINT note_draft_corrects_contact_tenant_fk FOREIGN KEY (corrects_note_id, contact_id, tenant_id) REFERENCES public.note(id, contact_id, tenant_id) ON DELETE RESTRICT;


--
-- Name: note_draft note_draft_note_contact_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_draft
    ADD CONSTRAINT note_draft_note_contact_tenant_fk FOREIGN KEY (note_id, contact_id, tenant_id) REFERENCES public.note(id, contact_id, tenant_id) ON DELETE CASCADE;


--
-- Name: note_draft note_draft_note_type_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_draft
    ADD CONSTRAINT note_draft_note_type_tenant_fk FOREIGN KEY (note_type_id, tenant_id) REFERENCES public.note_type(id, tenant_id) ON DELETE SET NULL (note_type_id);


--
-- Name: note_draft note_draft_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_draft
    ADD CONSTRAINT note_draft_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: note_draft note_draft_user_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_draft
    ADD CONSTRAINT note_draft_user_tenant_fk FOREIGN KEY (user_id, tenant_id) REFERENCES public.app_user(id, tenant_id) ON DELETE CASCADE;


--
-- Name: note_file note_file_note_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_file
    ADD CONSTRAINT note_file_note_tenant_fk FOREIGN KEY (note_id, tenant_id) REFERENCES public.note(id, tenant_id) ON DELETE CASCADE;


--
-- Name: note_file note_file_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_file
    ADD CONSTRAINT note_file_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: note note_locked_by_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note
    ADD CONSTRAINT note_locked_by_tenant_fk FOREIGN KEY (locked_by, tenant_id) REFERENCES public.app_user(id, tenant_id);


--
-- Name: note note_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note
    ADD CONSTRAINT note_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: note note_type_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note
    ADD CONSTRAINT note_type_fk FOREIGN KEY (note_type_id, tenant_id) REFERENCES public.note_type(id, tenant_id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: note_type note_type_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_type
    ADD CONSTRAINT note_type_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: number_range number_range_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.number_range
    ADD CONSTRAINT number_range_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: opening_hour opening_hour_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opening_hour
    ADD CONSTRAINT opening_hour_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: payment payment_invoice_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_invoice_tenant_fk FOREIGN KEY (invoice_id, tenant_id) REFERENCES public.invoice(id, tenant_id) ON DELETE RESTRICT;


--
-- Name: payment payment_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: practice_settings practice_settings_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_settings
    ADD CONSTRAINT practice_settings_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: salutation salutation_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salutation
    ADD CONSTRAINT salutation_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: service_group_item service_group_item_group_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_group_item
    ADD CONSTRAINT service_group_item_group_tenant_fk FOREIGN KEY (service_group_id, tenant_id) REFERENCES public.service_group(id, tenant_id) ON DELETE CASCADE;


--
-- Name: service_group_item service_group_item_service_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_group_item
    ADD CONSTRAINT service_group_item_service_tenant_fk FOREIGN KEY (service_id, tenant_id) REFERENCES public.service(id, tenant_id);


--
-- Name: service_group_item service_group_item_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_group_item
    ADD CONSTRAINT service_group_item_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: service_group service_group_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_group
    ADD CONSTRAINT service_group_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: service service_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service
    ADD CONSTRAINT service_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: session session_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: session session_user_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_user_tenant_fk FOREIGN KEY (user_id, tenant_id) REFERENCES public.app_user(id, tenant_id) ON DELETE CASCADE;


--
-- Name: smtp_settings smtp_settings_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smtp_settings
    ADD CONSTRAINT smtp_settings_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: text_template text_template_tenant_id_tenant_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.text_template
    ADD CONSTRAINT text_template_tenant_id_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_item ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_type; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_type ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_type_preset_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_type_preset_item ENABLE ROW LEVEL SECURITY;

--
-- Name: appointment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointment ENABLE ROW LEVEL SECURITY;

--
-- Name: appointment_sync_conflict; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointment_sync_conflict ENABLE ROW LEVEL SECURITY;

--
-- Name: contact; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_relation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_relation ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_relation_type; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_relation_type ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_role; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_role ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_role_type; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_role_type ENABLE ROW LEVEL SECURITY;

--
-- Name: country; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.country ENABLE ROW LEVEL SECURITY;

--
-- Name: email_template; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_template ENABLE ROW LEVEL SECURITY;

--
-- Name: gender; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gender ENABLE ROW LEVEL SECURITY;

--
-- Name: google_connection; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_connection ENABLE ROW LEVEL SECURITY;

--
-- Name: google_sync_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_sync_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_line; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_line ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_send; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_send ENABLE ROW LEVEL SECURITY;

--
-- Name: note; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note ENABLE ROW LEVEL SECURITY;

--
-- Name: note_draft; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_draft ENABLE ROW LEVEL SECURITY;

--
-- Name: note_file; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_file ENABLE ROW LEVEL SECURITY;

--
-- Name: note_type; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_type ENABLE ROW LEVEL SECURITY;

--
-- Name: number_range; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.number_range ENABLE ROW LEVEL SECURITY;

--
-- Name: opening_hour; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opening_hour ENABLE ROW LEVEL SECURITY;

--
-- Name: payment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment ENABLE ROW LEVEL SECURITY;

--
-- Name: practice_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.practice_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: salutation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.salutation ENABLE ROW LEVEL SECURITY;

--
-- Name: service; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service ENABLE ROW LEVEL SECURITY;

--
-- Name: service_group; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_group ENABLE ROW LEVEL SECURITY;

--
-- Name: service_group_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_group_item ENABLE ROW LEVEL SECURITY;

--
-- Name: smtp_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.smtp_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant ENABLE ROW LEVEL SECURITY;

--
-- Name: activity tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.activity USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: activity_item tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.activity_item USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: activity_type tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.activity_type USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: activity_type_preset_item tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.activity_type_preset_item USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: appointment tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.appointment USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: appointment_sync_conflict tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.appointment_sync_conflict USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: contact tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.contact USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: contact_relation tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.contact_relation USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: contact_relation_type tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.contact_relation_type USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: contact_role tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.contact_role USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: contact_role_type tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.contact_role_type USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: country tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.country USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: email_template tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.email_template USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: gender tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.gender USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: google_connection tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.google_connection USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: google_sync_queue tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.google_sync_queue USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: invoice tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.invoice USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: invoice_line tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.invoice_line USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: invoice_send tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.invoice_send USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: note tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.note USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: note_draft tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.note_draft USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: note_file tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.note_file USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: note_type tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.note_type USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: number_range tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.number_range USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: opening_hour tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.opening_hour USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: payment tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.payment USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: practice_settings tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.practice_settings USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: salutation tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.salutation USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: service tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.service USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: service_group tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.service_group USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: service_group_item tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.service_group_item USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: smtp_settings tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.smtp_settings USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: tenant tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.tenant USING ((id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: text_template tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.text_template USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: text_template; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.text_template ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO praxi_app;


--
-- Name: FUNCTION google_connection_tenant_ids(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.google_connection_tenant_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.google_connection_tenant_ids() TO praxi_app;


--
-- Name: TABLE account; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.account TO praxi_app;


--
-- Name: TABLE activity; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.activity TO praxi_app;


--
-- Name: TABLE activity_item; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.activity_item TO praxi_app;


--
-- Name: TABLE activity_type; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.activity_type TO praxi_app;


--
-- Name: TABLE activity_type_preset_item; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.activity_type_preset_item TO praxi_app;


--
-- Name: TABLE app_user; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.app_user TO praxi_app;


--
-- Name: TABLE appointment; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.appointment TO praxi_app;


--
-- Name: TABLE appointment_sync_conflict; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.appointment_sync_conflict TO praxi_app;


--
-- Name: TABLE contact; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.contact TO praxi_app;


--
-- Name: TABLE contact_relation; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.contact_relation TO praxi_app;


--
-- Name: TABLE contact_relation_type; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.contact_relation_type TO praxi_app;


--
-- Name: TABLE contact_role; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.contact_role TO praxi_app;


--
-- Name: TABLE contact_role_type; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.contact_role_type TO praxi_app;


--
-- Name: TABLE country; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.country TO praxi_app;


--
-- Name: TABLE email_template; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.email_template TO praxi_app;


--
-- Name: TABLE gender; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.gender TO praxi_app;


--
-- Name: TABLE google_connection; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.google_connection TO praxi_app;


--
-- Name: TABLE google_sync_queue; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.google_sync_queue TO praxi_app;


--
-- Name: TABLE invoice; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.invoice TO praxi_app;


--
-- Name: TABLE invoice_line; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.invoice_line TO praxi_app;


--
-- Name: TABLE invoice_send; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.invoice_send TO praxi_app;


--
-- Name: TABLE note; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.note TO praxi_app;


--
-- Name: TABLE note_draft; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.note_draft TO praxi_app;


--
-- Name: TABLE note_file; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.note_file TO praxi_app;


--
-- Name: TABLE note_type; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.note_type TO praxi_app;


--
-- Name: TABLE number_range; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.number_range TO praxi_app;


--
-- Name: TABLE opening_hour; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.opening_hour TO praxi_app;


--
-- Name: TABLE payment; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payment TO praxi_app;


--
-- Name: TABLE practice_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.practice_settings TO praxi_app;


--
-- Name: TABLE rate_limit; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.rate_limit TO praxi_app;


--
-- Name: TABLE salutation; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.salutation TO praxi_app;


--
-- Name: TABLE service; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.service TO praxi_app;


--
-- Name: TABLE service_group; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.service_group TO praxi_app;


--
-- Name: TABLE service_group_item; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.service_group_item TO praxi_app;


--
-- Name: TABLE session; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.session TO praxi_app;


--
-- Name: TABLE smtp_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.smtp_settings TO praxi_app;


--
-- Name: TABLE tenant; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.tenant TO praxi_app;


--
-- Name: TABLE text_template; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.text_template TO praxi_app;


--
-- Name: TABLE verification; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.verification TO praxi_app;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- `FOR ROLE praxi` REMOVED BY HAND, and it has to be removed again the next
-- time this file is regenerated — pg_dump writes the owner's name in, because
-- that is what it found. Without the clause the default privileges belong to
-- the role that is connected, which during a migration is the owner, whatever
-- it is called. With it, the baseline is a trap on a machine that does not
-- exist yet: on a cluster with no role of that name it fails outright
-- (`role "praxi" does not exist`) and takes the whole schema with it, since
-- this file applies as one statement; and under a superuser owner of another
-- name it is worse — it succeeds and hangs the privileges on the wrong role,
-- so the first table a later migration creates is unreachable for praxi_app
-- and nothing says so until a request touches it.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO praxi_app;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- Same removal, same reason as the block above.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO praxi_app;


--
-- PostgreSQL database dump complete
--


