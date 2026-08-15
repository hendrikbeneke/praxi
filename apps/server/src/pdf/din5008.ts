/**
 * DIN 5008 Form B, in millimetres (CLAUDE.md rule 11).
 *
 * Every measurement the layout needs lives here. Nothing downstream contains a
 * bare number — a magic 45 in a component is unreadable and unverifiable, and
 * these values are the difference between a letter that fits a window envelope
 * (DIN lang, C6/5) and one that does not.
 *
 * Form B rather than Form A: it leaves 27 mm for the letterhead instead of
 * 45 mm, which is what a practice letterhead on a pre-printed template
 * expects. Form A would push the address field 18 mm further down.
 *
 * Origin is the top-left corner of the page, x to the right, y downwards.
 */

/** A4. */
export const PAGE = { width: 210, height: 297 } as const

/**
 * The address field. The first 5 mm hold the small return-address line; the
 * recipient's address starts below it.
 *
 * Form B: the field begins 45 mm from the top edge. Left edge 20 mm, width
 * 85 mm, height 40 mm — the part visible through the envelope window.
 */
export const ADDRESS_FIELD = {
  left: 20,
  top: 45,
  width: 85,
  height: 40,
  /** Height of the return-address zone at the top of the field. */
  returnAddressHeight: 5,
} as const

/**
 * The information block on the right: date, invoice number, contact number.
 * DIN 5008 puts it flush with the right text margin, starting at the top of
 * the address field.
 */
export const INFO_BLOCK = {
  left: 125,
  top: 45,
  width: 65,
} as const

/** Where the actual content begins. Form B: 98.46 mm from the top, rounded to
 *  the nearest tenth the renderer can hit reliably. */
export const CONTENT = {
  top: 98.5,
  left: 25,
  right: 20,
  /** Everything above this line on the last page belongs to the content; the
   *  footer of the template lives below it. */
  bottom: 20,
} as const

/**
 * Folding and punching marks, at the left edge.
 *
 * The first fold at 105 mm and the second at 210 mm are what make the address
 * land in the window after folding in thirds. The punch mark sits exactly in
 * the middle of the page height.
 */
export const MARKS = {
  left: 5,
  length: 5,
  firstFold: 105,
  secondFold: 210,
  punch: 148.5,
} as const

/** 72 points to the inch, 25.4 mm to the inch. */
export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4
}
