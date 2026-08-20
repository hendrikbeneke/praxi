import { z } from 'zod'

/**
 * The stable handle of a catalogue entry that logic points at — an
 * `activity_type`, a `contact_relation_type`. It is set when the entry is
 * created and never changes afterwards, because other rows reference it; a
 * typo is fixed by deleting the unused entry and adding it again.
 *
 * It lived in `contact-role-type.ts` until migration 0035 took the code off
 * the role catalogue. Roles are labels now and point at an id — the two
 * catalogues that still need a semantic anchor are the ones next to it, so the
 * schema has its own file rather than a home in one of them.
 */
export const typeCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,39}$/)
