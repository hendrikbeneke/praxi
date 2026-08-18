import type { ContactKind } from './contact.js'

/**
 * How a contact is written wherever a single name is needed — the list, the
 * page heading, and from slice 6 the `recipient_snapshot` on an invoice.
 *
 * Shared between server and client on purpose: the snapshot stored on a
 * finalized invoice has to read exactly like the name shown on screen when it
 * was created, and that only holds if there is one implementation.
 *
 * Note this is *not* what the database sorts by. `contact.sort_name` is a
 * generated column putting the surname first, so the list orders the way a
 * card index does.
 */
export type NameParts = {
  kind: ContactKind
  title?: string | null
  firstName?: string | null
  lastName?: string | null
  companyName?: string | null
}

export function formatContactName(contact: NameParts): string {
  if (contact.kind === 'organization') return contact.companyName ?? ''

  return [contact.title, contact.firstName, contact.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')
}

/**
 * Surname first — `Musterfrau, Erika`.
 *
 * **Which of the two forms a screen uses is decided by one question: does the
 * eye look this name up, or read it?** Not by "list or prose" — that reading
 * breaks on the first counterexample.
 *
 * Surname first wherever a name is *searched for* in a column of names: the
 * contact list, the activity list, both tabs of Zahlungen, the contact picker.
 * There the surname is the handle, and given names first make a column look
 * shuffled even when it is perfectly ordered.
 *
 * Natural order everywhere the name is *read*: the heading of a record, the
 * breadcrumb, the recipient of an invoice, and — the case that shows the rule
 * is not about lists — **a calendar entry**. That is a list too, and a long
 * one, but it is ordered by time; nobody scans it alphabetically, and
 * "Lentz, Mara" in a Tuesday slot would be a card index pretending to be a
 * day. Sorting is what decides, not the shape of the screen.
 *
 * One exception that is not one: `invoice.contactName` in the invoice list
 * stays natural, because for a finalized invoice it *is* the frozen
 * `recipient_snapshot` — the column shows what the document says, and a list
 * spelling a recipient differently from the PDF is a contradiction someone
 * would have to explain. See `docs/design-korrektur/abweichungen.md`.
 */
export function formatContactNameSorted(contact: NameParts): string {
  if (contact.kind === 'organization') return contact.companyName ?? ''
  if (!contact.firstName) return contact.lastName ?? ''
  return `${contact.lastName ?? ''}, ${contact.firstName}`
}
