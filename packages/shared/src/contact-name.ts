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

/** Surname first, the way the list is ordered — for places that show the name
 *  next to a sorted column and would otherwise look shuffled. */
export function formatContactNameSorted(contact: NameParts): string {
  if (contact.kind === 'organization') return contact.companyName ?? ''
  if (!contact.firstName) return contact.lastName ?? ''
  return `${contact.lastName ?? ''}, ${contact.firstName}`
}
