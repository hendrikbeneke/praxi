# The catalogues a new tenant starts with

`praxi tenant create` applies these, and `test/fixtures.ts` reads the same files
so a test tenant is furnished like a real one.

**These are starting values, not a specification.** Every entry here is
renamable and deletable through the settings screens, and no code reads any
label. Edit the files, add entries, remove entries — the next tenant gets what
stands here. What is applied is applied through the ordinary domain functions,
the same ones the settings screens call, and every file is validated against the
same Zod schema the API validates that form with: a colour of `#xyz` or a label
over 60 characters is refused here exactly as it would be on screen.

Applying is **additive and resumable**: each entry is compared by what its
catalogue is unique on — the label, or the ISO code for countries — and only
what is missing is created. A second run creates nothing. An entry somebody
deleted is created again on the next run, and one somebody renamed counts as
missing and comes back alongside the rename. That follows from these being
starting values rather than a state the tool enforces; the command says so while
it runs.

## Why the values are what they are

Read this before changing an order — some of them carry a decision.

**`roles.json`** — `showAsTab` gives a role a tab of its own in the contact
list; the others stay reachable through the dropdown beside it, so the flag
decides prominence, not availability. `Patient` is a starting point like the
other two and nothing more: it is deletable and renamable, and **no code
anywhere looks for it**. Who is pseudonymized towards Google is decided by the
event-title template on the Google connection, never by a role (migration 0035,
CLAUDE.md rule 13).

**`relation-types.json`** — only the two free entries are here. `guardian` and
`billing_recipient` are **not**, and cannot be: they are system entries, logic
resolves them by their code (`finalizeInvoice` for the billing recipient, the
minor's notice for the guardian), and `contactRelationTypeInputSchema` has
neither an `isSystem` nor a `code` field — `contact_relation_type_system_needs_code`
refuses a system entry without one. They are part of what a tenant *is* and live
in `domain/tenant.ts`.

`Elternteil von` / `Kind von` is the deliberate exception to the direction
convention: `from` is normally the contact the fact is a property of, but with
kinship neither side owns it, and this is the more common reading direction.
`Ehepartner von` is symmetric and therefore has `"labelInverse": null` — the
check constraint `contact_relation_type_inverse_label` requires exactly that
pairing.

**`salutations.json`** — `Firma` is here on purpose: a salutation is allowed on
an **organization** too, because "Firma Mustermann GmbH" is the usual first line
of a German address, where it is a prefix to the name rather than a personal
attribute. A salutation is never derived from the gender — "Familie" and "Herr
und Frau" have to stay possible.

**`genders.json`** — three entries, and deliberately no fourth meaning "not
specified". An empty field already means "not recorded", which is at the same
time the fourth state German civil status law has; a value meaning the same as
its own absence would eventually disagree with it.

**`countries.json`** — one country, not the eight the old fixed list carried.
Which countries the practice bills into is a choice it makes, and the first one
is obvious. There is no label: a country's name is resolved from its ISO code by
`countryName()`, so what is configured here is *which countries the contact form
offers*, not what they are called — which is also why this list needs no
translation, ever.

**`note-types.json`** — **`Sitzung` sorts first because the note dialog
preselects the first entry.** An order can carry that decision, which is why
there is no `isDefault` flag on a note type; move something above it and the
dialog preselects that instead. `Nachtrag` is deliberately absent and is not a
type at all: an addendum is a note with a `corrects_note_id` and carries an
ordinary type like every other (CLAUDE.md rule 7).

`showAsTab` decides whether the type appears as a filter chip in the note list.
The flag **alone** decides it, so a chip appears even where the count is zero —
at a filter a zero is an answer.

**`activity-types.json`** — `isDefault` is what a new activity starts on, so
`Folgesitzung` carries it: the everyday case. At most one entry may have it, held
by a partial unique index, and `createActivityType` clears a previous holder
itself. The colours are what the calendar paints an entry in; the label on top is
black or white per `readableTextOn`, so any colour stays readable, and these four
are chosen so that none of them relies on red-green discrimination. No default
duration and no preset services: those are the practice's numbers, and inventing
them here would put made-up defaults on real activities.

## What is not here

**No services.** The service catalogue starts empty, and that is the one
deliberate gap. Every other catalogue is structural — without a note type no
note can be written, without an activity type no activity exists — while an
`activity_item` may carry no `service_id` at all (rule 5), so an empty service
catalogue is a state the software fully supports. And a wrong price is not
correctable after the fact: an item copies description and price at the moment
it is created and never looks back, so three sessions billed from an invented
90,00 € stay at 90,00 € after the catalogue is fixed. The practice's own prices
are the one thing it certainly knows.

Example services with invented prices exist for local development only, in
`../demo/services.json`, and that directory is not copied into the container
image.
