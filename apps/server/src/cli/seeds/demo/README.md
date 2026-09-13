# Invented data, for local development only

Nothing in this directory may ever reach the database of a practice that has
started using this software. Two things keep it out, and only the second is
mechanical:

1. `praxi dev seed` and `praxi dev demo` carry `devOnly` in the command
   registry, and the runner refuses them when `NODE_ENV` is `production`,
   pointing at `praxi tenant create` instead. That stops the accident — the
   wrong command in the right window — and not somebody determined: putting
   `NODE_ENV=development` in front of the command walks past it.
2. **This directory is not copied into the container image.** The Dockerfile
   copies `seeds/default` and nothing else, so on a server both commands fail
   naming the file they cannot find, whatever `NODE_ENV` says. Short of putting
   these files there by hand, the invented practice and the invented prices do
   not exist on that machine at all.

## The files

**`practice.json`** — the placeholder master data `praxi dev seed` writes: a
made-up practice name, address, IBAN, BIC and tax number. It exists so a
developer's screens are not empty, and it is exactly what a real practice must
not find in its settings, where a placeholder is read as a record that exists
rather than as a gap to fill. `praxi tenant create` asks for the practice name
and leaves every other field empty for that reason.

**`services.json`** — seven services and one group. **Every figure is invented.**
They are here and not in `../default/` because a wrong price cannot be corrected
after the fact: an `activity_item` copies description, fee code and price at the
moment it is created and never looks back (CLAUDE.md rule 5), so sessions billed
from a made-up 90,00 € stay at 90,00 € after the catalogue is fixed. The group
carries two different services and a quantity above one, so that resolving a
group into individual items has something real to resolve.

Services are matched by `description` and group items reference a service by the
same, because that is what the two are recognised by here; `shortCode` is
optional and only the entries typed every day have one.

**`practices.json`** — two practices with contacts, sessions, notes, relations
and draft invoices. The **second one exists so that tenant isolation is
something to look at in a browser** and not only an assertion in a test: sign in
as one practitioner and none of the other's contacts, notes or invoices may be
anywhere. Its notes say so in as many words, which is what makes a leak visible
at a glance.

The names are obviously fake, as everywhere in this repository, and the
addresses end in `.invalid`, which RFC 2606 guarantees will never resolve.

### How a practice entry is read

- `tenant: "existing"` hangs the data off the tenant `praxi dev seed` made, so a
  developer signs in with their own credentials and finds something there. It is
  left alone if that tenant already has contacts — running the command twice
  must not double a card index or burn a second run of contact numbers.
- `tenant: "own"` creates a tenant, practice and user of its own. It needs
  `practiceName`, `userEmail` and `userName`; both demo users share one
  password, which the command prints when it finishes.
- `sessions` is a number of weekly appointments counted back from today, oldest
  first, so the list has a past to page through and the newest sits nearest to
  today. The first of them is an *Erstgespräch*, the rest *Folgesitzungen*.
- `notes` are attached to those activities in order; more notes than sessions
  simply means the extra ones hang off the contact alone.
- `ageYears` is turned into a date of birth on every run rather than written
  down, **so a demo minor does not come of age on a fixed date**.
- `role` defaults to `Patient`; `null` means no role at all, which is what the
  paying parent gets — a billing recipient is not in treatment, and a role
  nobody needs is a role in the way.
- `guardedBy` names another contact of the same practice as `"Vorname Nachname"`
  and creates **two** relations from the child: `guardian` and
  `billing_recipient`. Both hang from the child, per the direction convention —
  `from` is the contact the fact is a property of — so the child's record reads
  "Sorgeberechtigt: …" and "Rechnungsempfänger: …" and the parent's shows the
  inverse of each.
- `houseNumber` is shared by the two halves of a family, so guardian and child
  live at one address instead of two doors apart.

The family stands **first** in each list on purpose: the command bills the first
60 % of what it produced, and a new draft starts on the contact's billing
recipient where there is one (L8) — so their position is the difference between
a demo that merely has a relation somewhere and one where an invoice for a child
is actually addressed to the parent, which is the case the practice bills that
way.

Invoices are left **as drafts**. Finalizing writes a PDF to disk and burns a
number from the range, and neither belongs in a seed. Only 60 % of what is
billable is collected, so both states are on screen at once: invoices to look
at, and open items under "Abrechenbar" and in the "Offene Vorgänge" tile.
