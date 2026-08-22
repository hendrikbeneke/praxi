-- The unsaved state of a note being written (L2).
--
-- A note can take twenty minutes to write, and twenty minutes must not be lost
-- to a crash or a stray click. The obvious answer would be an autosave switch
-- beside the save button, and it is the wrong one three times over: saving a
-- new note straight away leaves empty notes in the record when somebody is
-- interrupted, a switch is a setting to think about at every note, and with it
-- on, "Abbrechen" means the opposite of what it says.
--
-- The case that decides it is the existing note. There the editor cannot write
-- into the row: what stands there is the last saved version, so writing into
-- it would make cancelling impossible, and a crash halfway through a
-- rephrasing would turn half a sentence into the valid documentation.
--
-- So: a draft that is not the note. It is saved while typing, "Speichern"
-- makes a note of it and deletes it, "Abbrechen" leaves it lying. No
-- versioning, no history, no merge — one draft per key, the newer overwrites
-- the older.
--
-- On the server rather than in localStorage: that would be tied to one device,
-- and it would put treatment documentation unencrypted in a place outside the
-- practice's control (CLAUDE.md rule 12).

CREATE TABLE "note_draft" (
  "id"               uuid PRIMARY KEY NOT NULL,
  "tenant_id"        uuid NOT NULL REFERENCES "tenant"("id"),
  "user_id"          uuid NOT NULL,
  "contact_id"       uuid NOT NULL,
  -- Null while the note does not exist yet; the key is then the contact.
  "note_id"          uuid,
  -- An addendum in the making. Here because an addendum is a NEW note and
  -- therefore shares the one draft per contact: without this column, accepting
  -- the draft back would silently produce an ordinary note.
  "corrects_note_id" uuid,
  "activity_id"      uuid,
  -- Both nullable, and this is the rule the table is built on: the draft
  -- mirrors the form, gaps included. Were they required, a save running while
  -- the date field is briefly blank during retyping would fail — and take the
  -- text with it, which is the one thing this exists to keep.
  "note_type_id"     uuid,
  "note_date"        date,
  "text"             text NOT NULL,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  -- A draft without text is not a draft: emptying the field deletes it rather
  -- than leaving a husk to be asked about at the next opening.
  CONSTRAINT "note_draft_text_not_blank" CHECK (btrim("text") <> '')
);
--> statement-breakpoint

ALTER TABLE "note_draft" ADD CONSTRAINT "note_draft_user_tenant_fk"
  FOREIGN KEY ("user_id", "tenant_id") REFERENCES "app_user" ("id", "tenant_id")
  ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "note_draft" ADD CONSTRAINT "note_draft_contact_tenant_fk"
  FOREIGN KEY ("contact_id", "tenant_id") REFERENCES "contact" ("id", "tenant_id")
  ON DELETE cascade;
--> statement-breakpoint

-- Three columns, so a draft cannot hang on another contact's note.
ALTER TABLE "note_draft" ADD CONSTRAINT "note_draft_note_contact_tenant_fk"
  FOREIGN KEY ("note_id", "contact_id", "tenant_id")
  REFERENCES "note" ("id", "contact_id", "tenant_id")
  ON DELETE cascade;
--> statement-breakpoint

-- Restrict, like note.corrects_note_id — and reachable only in theory, since
-- the note an addendum corrects is locked and therefore undeletable.
ALTER TABLE "note_draft" ADD CONSTRAINT "note_draft_corrects_contact_tenant_fk"
  FOREIGN KEY ("corrects_note_id", "contact_id", "tenant_id")
  REFERENCES "note" ("id", "contact_id", "tenant_id")
  ON DELETE restrict;
--> statement-breakpoint

-- SET NULL on the COLUMN, not on the row's key: a draft must never be what
-- stops an activity or a note type from being deleted, and the bare form would
-- null tenant_id along with it. The column list is PG 15+ and drizzle-kit
-- cannot express it — the same hand-written exception as migration 0009.
ALTER TABLE "note_draft" ADD CONSTRAINT "note_draft_activity_contact_tenant_fk"
  FOREIGN KEY ("activity_id", "contact_id", "tenant_id")
  REFERENCES "activity" ("id", "contact_id", "tenant_id")
  ON DELETE SET NULL ("activity_id");
--> statement-breakpoint
ALTER TABLE "note_draft" ADD CONSTRAINT "note_draft_note_type_tenant_fk"
  FOREIGN KEY ("note_type_id", "tenant_id") REFERENCES "note_type" ("id", "tenant_id")
  ON DELETE SET NULL ("note_type_id");
--> statement-breakpoint

-- Two partial indexes rather than one key: NULL does not collide in a plain
-- unique index, so (user_id, note_id) would allow any number of drafts for a
-- note that does not exist yet.
CREATE UNIQUE INDEX "note_draft_note_key"
  ON "note_draft" ("user_id", "note_id") WHERE "note_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "note_draft_new_key"
  ON "note_draft" ("user_id", "contact_id") WHERE "note_id" IS NULL;
--> statement-breakpoint
CREATE INDEX "note_draft_tenant_updated_idx" ON "note_draft" ("tenant_id", "updated_at");
--> statement-breakpoint

-- A locked note is not editable, so it has no draft. The foreign key cannot
-- say that — it does not know `locked_at` — and a check constraint cannot look
-- into a second table, which is exactly the position
-- payment_requires_finalized_invoice stands in (migration 0023). So: the
-- domain refuses first for the message, and this makes the state unreachable.
--
-- corrects_note_id is deliberately not covered. An addendum refers to a locked
-- note by definition.
CREATE FUNCTION note_draft_requires_open_note() RETURNS trigger AS $$
BEGIN
  IF NEW."note_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "note" WHERE "id" = NEW."note_id" AND "locked_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'a locked note has no draft';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER note_draft_requires_open_note
  BEFORE INSERT OR UPDATE ON "note_draft"
  FOR EACH ROW EXECUTE FUNCTION note_draft_requires_open_note();
--> statement-breakpoint

CREATE TRIGGER set_updated_at BEFORE UPDATE ON "note_draft"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Row-level security per CLAUDE.md rule 1: policy created, then explicitly
-- DISABLED. Tenant isolation is enforced by the application.
CREATE POLICY "tenant_isolation" ON "note_draft"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "note_draft" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

COMMENT ON TABLE "note_draft" IS
  'The unsaved state of a note being written (L2). A draft is NOT the note: on '
  'an existing note the editor cannot write into the row, because what stands '
  'there is the last saved version — writing into it would make cancelling '
  'impossible, and a crash halfway through a rephrasing would turn half a '
  'sentence into the valid documentation. Saving makes a note of the draft and '
  'deletes it; cancelling leaves it lying. One draft per key, the newer '
  'overwrites the older — no versioning, no history, no merge.';
--> statement-breakpoint

COMMENT ON COLUMN "note_draft"."note_date" IS
  'Nullable on purpose, like note_type_id: the draft mirrors the form, gaps '
  'included. Were it required, a save running while the field is briefly blank '
  'during retyping would fail and take the text with it — the one thing this '
  'table exists to keep.';
