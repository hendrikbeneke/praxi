-- Note types become a catalogue (L1).
--
-- `note.type` was `text` with a named check constraint over six fixed values —
-- general, session, document, correspondence, addendum, other. Five of them
-- are a way of filing documentation, and how a practice files its
-- documentation is not the software's decision, so the practitioner maintains
-- them now.
--
-- Built like contact_role_type after 0035 and the three lists of 0037: id,
-- tenant_id, label, sort_order, plus `show_as_tab` — the flag that decides
-- which types the note list offers as a filter chip. With many types the chip
-- row is unusable, and which ones are worth a chip is a decision, not a
-- consequence of what a contact happens to have.
--
-- The sixth value, `addendum`, deliberately does NOT become an entry. See the
-- move below.

CREATE TABLE "note_type" (
  "id"          uuid PRIMARY KEY NOT NULL,
  "tenant_id"   uuid NOT NULL REFERENCES "tenant"("id"),
  "label"       text NOT NULL,
  "show_as_tab" boolean NOT NULL DEFAULT false,
  "sort_order"  integer NOT NULL DEFAULT 0,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  -- What a type is recognised by, there being no code.
  CONSTRAINT "note_type_tenant_label_key" UNIQUE ("tenant_id", "label"),
  -- The target of note's composite foreign key.
  CONSTRAINT "note_type_id_tenant_key" UNIQUE ("id", "tenant_id")
);
--> statement-breakpoint
CREATE INDEX "note_type_tenant_sort_idx" ON "note_type" ("tenant_id", "sort_order", "label");
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "note_type"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Row-level security per CLAUDE.md rule 1: policy created, then explicitly
-- DISABLED. Tenant isolation is enforced by the application.
CREATE POLICY "tenant_isolation" ON "note_type"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "note_type" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ---------------------------------------------------------------- the move

-- The five entries, for every tenant that already exists. A frozen copy of
-- what db/seed/note-types.ts creates for a new one; that file is the living
-- definition, this one is history — the same split as 0017 and 0037.
--
-- The German wording is the one the screens already used, not a new one. All
-- five carry the chip flag, so the filter row looks exactly as it did; the
-- flag earns its keep once the practitioner adds a sixth type. "Sitzung"
-- sorts first because the note dialog preselected `session`, and with a
-- catalogue the preselection is simply the first entry — no is_default flag
-- for a decision an order can carry.
INSERT INTO "note_type" ("id", "tenant_id", "label", "show_as_tab", "sort_order")
SELECT gen_random_uuid(), t."id", v."label", true, v."sort_order"
  FROM "tenant" t
  CROSS JOIN (VALUES ('Sitzung', 10), ('Allgemein', 20), ('Dokument', 30),
                     ('Korrespondenz', 40), ('Sonstiges', 50))
    AS v("label", "sort_order")
ON CONFLICT DO NOTHING;
--> statement-breakpoint

ALTER TABLE "note" ADD COLUMN "note_type_id" uuid;
--> statement-breakpoint

-- protect_locked_note fires BEFORE UPDATE and would refuse every locked row
-- below with "locked note is immutable". Filling a new column is not a
-- correction of documentation — it is the same fact written in a second
-- place — so the trigger comes off for the move and goes straight back on.
-- This is the only reason it may ever be switched off, and the maintenance
-- step that deletes the three locked test notes of the development database
-- carries the same comment.
ALTER TABLE "note" DISABLE TRIGGER "protect_locked_note";
--> statement-breakpoint

UPDATE "note" n SET "note_type_id" = t."id"
  FROM "note_type" t
 WHERE t."tenant_id" = n."tenant_id"
   AND t."label" = CASE n."type"
                     WHEN 'session'        THEN 'Sitzung'
                     WHEN 'general'        THEN 'Allgemein'
                     WHEN 'document'       THEN 'Dokument'
                     WHEN 'correspondence' THEN 'Korrespondenz'
                     WHEN 'other'          THEN 'Sonstiges'
                   END;
--> statement-breakpoint

-- The addenda. They inherit the type of the note they correct: an addendum to
-- a session note is itself session documentation, which is the whole reason
-- `addendum` is not a type anymore.
--
-- Recursive, because an addendum correcting an addendum is refused by the
-- screen and by nothing else — the walk goes up until it reaches a note that
-- is not one. `corrects_note_id` is a single column, so the ancestry is a
-- line and exactly one row per note ends it.
WITH RECURSIVE ancestry AS (
  SELECT n."id" AS note_id, n."tenant_id", p."type" AS parent_type,
         p."corrects_note_id" AS next_id
    FROM "note" n
    JOIN "note" p ON p."id" = n."corrects_note_id"
   WHERE n."type" = 'addendum'
  UNION ALL
  SELECT a.note_id, a."tenant_id", p."type", p."corrects_note_id"
    FROM ancestry a
    JOIN "note" p ON p."id" = a.next_id
   WHERE a.parent_type = 'addendum'
)
UPDATE "note" n SET "note_type_id" = t."id"
  FROM ancestry a
  JOIN "note_type" t
    ON t."tenant_id" = a."tenant_id"
   AND t."label" = CASE a.parent_type
                     WHEN 'session'        THEN 'Sitzung'
                     WHEN 'general'        THEN 'Allgemein'
                     WHEN 'document'       THEN 'Dokument'
                     WHEN 'correspondence' THEN 'Korrespondenz'
                     WHEN 'other'          THEN 'Sonstiges'
                   END
 WHERE n."id" = a.note_id
   AND a.parent_type <> 'addendum';
--> statement-breakpoint

-- Whatever the walk above could not resolve — nothing in any database that
-- exists, but a note without a type cannot be left standing and "Allgemein"
-- claims nothing that would be wrong.
UPDATE "note" n SET "note_type_id" = t."id"
  FROM "note_type" t
 WHERE t."tenant_id" = n."tenant_id" AND t."label" = 'Allgemein'
   AND n."note_type_id" IS NULL;
--> statement-breakpoint

ALTER TABLE "note" ENABLE TRIGGER "protect_locked_note";
--> statement-breakpoint

-- Checked here rather than left to SET NOT NULL, which could only name the
-- column and not say how many rows lost their type on the way.
DO $$
DECLARE lost integer;
BEGIN
  SELECT count(*) INTO lost FROM "note" WHERE "note_type_id" IS NULL;
  IF lost > 0 THEN
    RAISE EXCEPTION 'note: % rows without a type after the move', lost;
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "note" ALTER COLUMN "note_type_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_type_fk"
  FOREIGN KEY ("note_type_id", "tenant_id")
  REFERENCES "public"."note_type" ("id", "tenant_id")
  ON UPDATE restrict ON DELETE restrict;
--> statement-breakpoint
-- On the child side, so deleting a type does not seq-scan `note` — and
-- neither does the count the domain runs first for its message.
CREATE INDEX "note_note_type_idx" ON "note" ("note_type_id");
--> statement-breakpoint

ALTER TABLE "note" DROP CONSTRAINT "note_type_check";
--> statement-breakpoint

-- The one that tied type and target together: (type = 'addendum') =
-- (corrects_note_id is not null). It cannot survive a catalogue — "Nachtrag"
-- would be selectable, and a note carrying it without a target would be
-- refused by a constraint no screen could explain. What makes a note an
-- addendum is `corrects_note_id`, alone, from here on.
-- note_addendum_not_self stays: nothing corrects itself.
ALTER TABLE "note" DROP CONSTRAINT "note_addendum_target";
--> statement-breakpoint

ALTER TABLE "note" DROP COLUMN "type";
