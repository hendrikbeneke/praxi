import { z } from 'zod'

/**
 * The stable handle of a catalogue entry that logic points at — a
 * `contact_relation_type`. It is set when the entry is created and never
 * changes afterwards, because other rows reference it.
 *
 * It lived in `contact-role-type.ts` until migration 0035 took the code off
 * the role catalogue, and the activity types lost theirs in B1/0041. The
 * relation types are the last catalogue that still has one, and rule 4 says
 * why: there the codes carry real logic — `billing_recipient` decides who an
 * invoice goes to, `guardian` drives the minor's notice.
 */
export const typeCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,39}$/)

/** The longest a code may be, from the pattern above: one leading letter plus
 *  39 more characters. */
export const TYPE_CODE_MAX_LENGTH = 40

/** German umlauts and the sharp s, written out. Transliterated rather than
 *  stripped: "Ärztin" losing its first letter to become "rztin" is worse than
 *  a slightly longer "aerztin". */
const GERMAN: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
}

/** What is left when a label yields nothing usable — a label of pure
 *  punctuation, or one in a script that transliterates to nothing. */
const FALLBACK = 'relation'

/**
 * A code derived from a relation type's label (B1d).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * **The code does not follow a rename, and that is deliberate.**
 *
 * `contact_relation.relation_code` is a foreign key onto this column, so the
 * code is the handle every existing relation of this type hangs from.
 * Rewriting it when the label changes would mean rewriting every relation row
 * with it — and a foreign key with `ON UPDATE RESTRICT` refuses that outright,
 * which is the database saying the same thing. Renaming "Betreut von" to
 * "Bezugsperson" therefore leaves the code `betreut_von`, and the relations
 * stay attached.
 *
 * That looks like an oversight from the outside, which is why it is written
 * here: the code is not a second name for the type, it is where the type is
 * nailed down. The label is what a human reads and is free to change; the code
 * is what the rows point at and cannot.
 *
 * (`WORKPLAN.md`, "Before going live": pointing `contact_relation` at the id
 * the way the roles and the activity types already are would end this — and
 * would let the code disappear from practitioner-made entries altogether.)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Derived rather than random because the code is invisible on screen and very
 * visible in `psql` and in a `pg_dump`: `sorgeberechtigt_2` says what the row
 * is when someone looks, `rel_k3m9x2p1` sends them to a join. Nothing depends
 * on the derivation being stable or reversible — it is read once, at creation.
 *
 * `reserve` shortens the base so a caller can append a collision suffix and
 * still fit inside `TYPE_CODE_MAX_LENGTH`. Truncating beats failing: a code is
 * a handle, and a handle that is a few characters shorter still works, while
 * an exception when creating a relation type is a dead end on a screen.
 */
export function relationTypeCodeFrom(label: string, reserve = 0): string {
  const slug = [...label.toLowerCase()]
    .map((character) => GERMAN[character] ?? character)
    .join('')
    // Decompose what is left — é, ç, å — and drop the combining marks.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    // The pattern demands a letter first, so a label like "2. Kontakt" cannot
    // keep its digits at the front.
    .replace(/^[0-9_]+/, '')

  const room = Math.max(1, TYPE_CODE_MAX_LENGTH - reserve)
  return (slug === '' ? FALLBACK : slug).slice(0, room).replace(/_+$/, '') || FALLBACK
}
