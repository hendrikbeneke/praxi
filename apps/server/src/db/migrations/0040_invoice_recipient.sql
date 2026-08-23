-- The recipient of an invoice, which is not always the contact whose
-- treatment it bills (L8).
--
-- `contact_relation_type.billing_recipient` has existed as a system entry
-- since slice 6.5, and CLAUDE.md has said all along that it "decides who an
-- invoice goes to" — while no line outside a comment read it. This is where
-- that becomes true. The case it exists for is the one the relation was
-- designed around: the child is the patient, the mother pays.
--
-- NULL means the contact itself, which is what every existing row means and
-- what the overwhelming majority of invoices will keep meaning. A default of
-- "the contact" cannot be written as a column default, so absence carries it.
--
-- The column is only ever *read* while the invoice is a draft. At
-- finalization the address is copied into `recipient_snapshot`, and from then
-- on the snapshot is what the document was addressed to — the relation may be
-- dissolved afterwards and the invoice still has to render what it rendered.
-- `protect_finalized_invoice` (0030) freezes this column automatically,
-- because it diffs the whole row rather than naming columns.
ALTER TABLE "invoice"
  ADD COLUMN "recipient_contact_id" uuid;

ALTER TABLE "invoice"
  ADD CONSTRAINT "invoice_recipient_contact_fk"
  FOREIGN KEY ("recipient_contact_id", "tenant_id")
  REFERENCES "contact" ("id", "tenant_id")
  ON UPDATE RESTRICT ON DELETE RESTRICT;

-- On the child side, so archiving or deleting a contact does not seq-scan
-- every invoice to find out whether one is addressed to them.
CREATE INDEX "invoice_recipient_contact_idx"
  ON "invoice" ("recipient_contact_id");

COMMENT ON COLUMN "invoice"."recipient_contact_id" IS
  'Who the invoice is addressed to; NULL means the contact itself. Read only '
  'while the invoice is a draft — after finalization recipient_snapshot is '
  'what the document was addressed to.';
