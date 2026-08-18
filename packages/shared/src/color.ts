import { z } from 'zod'

/**
 * The colours the practitioner picks for activity types, and the one decision
 * the software makes about them.
 *
 * A colour is stored as `#rrggbb`, lower case, because the database check
 * constraint says so and because a stored `#FFF` and a stored `#ffffff` would
 * be the same colour under two spellings.
 *
 * `readableTextOn` is the reason this file exists. A calendar entry is painted
 * in the colour of its activity type and carries a label on top, so the label
 * has to stay readable — on the four seeded colours, and on whatever colour is
 * picked next. Fixing white as the text colour fails that: it reads at 3.7:1 on
 * the seeded teal and 3.2:1 on the amber, both below the 4.5:1 that small text
 * needs. Choosing per colour never drops below 4.58:1, whatever the colour.
 */

/** `#rrggbb`, normalized to lower case. `#RRGGBB` and stray spaces are
 *  accepted on the way in; nothing else is. */
export const hexColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().regex(/^#[0-9a-f]{6}$/))

/** Slate — what an entry without a colour of its own is painted in. */
export const DEFAULT_COLOR = '#64748b'

function channels(color: string): [number, number, number] {
  const value = Number.parseInt(color.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/** WCAG 2.1 relative luminance, 0 for black and 1 for white. */
export function relativeLuminance(color: string): number {
  const [red, green, blue] = channels(color)
  const linear = (byte: number): number => {
    const channel = byte / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
}

/** WCAG 2.1 contrast ratio between two colours, from 1 to 21. Exported, like
 *  `BLACK` and `WHITE` below, for `color.test.ts`: `readableTextOn` only ever
 *  answers black or white, so the ratio behind that choice is testable
 *  nowhere else. */
export function contrastRatio(one: string, other: string): number {
  const first = relativeLuminance(one)
  const second = relativeLuminance(other)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

export const BLACK = '#000000'
export const WHITE = '#ffffff'

/**
 * Black or white, whichever reads better on this background.
 *
 * The comparison is between the two contrast ratios, which crosses over at a
 * luminance of about 0.179. The worst case is a background sitting exactly on
 * that crossover, where both choices give √21 ≈ 4.58:1 — still above the 4.5:1
 * WCAG AA asks of small text. So this holds for every colour, not only for the
 * ones seeded today.
 *
 * **Only call this where the background really is this colour.** The argument
 * is a paint, not a hint: a chip filled with `#3b82f6` is one, a surface tinted
 * *towards* `#3b82f6` is not.
 *
 * The calendar is the case that shows why, and it got this wrong until K10.
 * The design paints an entry as `color-mix(in oklab, <type colour> 20%,
 * var(--card))` — a fifth of the colour over the card. Measure the *type*
 * colour there and the answer is not merely imprecise, it is systematically
 * inverted: a dark type colour reports "use white", and white on a surface that
 * is four fifths card — nearly white in every light theme — is unreadable;
 * a light type colour reports "use black" on the same near-white surface and
 * happens to be right. The function would be wrong exactly where it is needed
 * and right where it does not matter.
 *
 * Mixing with a theme token is the better answer anyway, and it needs no
 * measurement: the surface follows `--card` through all five colour schemes,
 * so the text can simply be `--foreground` and is correct in every one. Where
 * a fill *is* the colour — the type chip in the activity list, in Zahlungen and
 * in the activity-type settings — this function stays exactly right.
 */
export function readableTextOn(background: string): string {
  return contrastRatio(background, BLACK) >= contrastRatio(background, WHITE) ? BLACK : WHITE
}
