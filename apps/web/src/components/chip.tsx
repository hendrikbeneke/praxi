import { cn } from '@/lib/utils'

/**
 * The two pill shapes the design uses above a list (K3).
 *
 * **The count goes after the label**, everywhere — `Gesperrt 3`, `Leistungen 9`.
 * The prototype does that on the Leistungen tabs and puts the number first on
 * every other chip; the two were unified this way by decision, so a reader never
 * has to work out which kind of pill they are looking at. Noted in
 * `docs/design-korrektur/abweichungen.md`.
 *
 * A prose summary line beside them keeps prose word order — "4 Notizen",
 * "8 Vorgänge · 3 kommend" — because "Notizen 4" is not a sentence.
 */

/**
 * A count that is only a count: it says how many, and it is deliberately not a
 * button. The prototype renders these as `<button>` but wires no filter to
 * them — clicking one changes nothing about the list. A control that leads
 * nowhere is the same mistake as the letterhead button that answered 404
 * (CLAUDE.md, "a form never claims a state that does not exist"), so this is a
 * `<span>`. If one of these ever has to filter, it becomes a real button with
 * real state, and the change will be visible rather than assumed.
 */
export function CountChip({ label, count }: { label: string; count: number }) {
  return (
    <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] text-muted-foreground">
      {label}
      <span className="font-semibold tabular-nums">{count}</span>
    </span>
  )
}

/**
 * A chip that *does* filter, so it stays a button — the classes only.
 *
 * The active state is a light primary tint with a primary border, not the dark
 * fill `Button variant="default"` gives: on a row of six, a filled pill reads as
 * the primary action of the screen rather than as "this one is selected".
 */
export function filterChipClass(active: boolean): string {
  return cn(
    'inline-flex h-7 items-center gap-1.5 rounded-full border px-[11px] text-[13px] transition-colors',
    active
      ? 'border-primary bg-primary/12 font-semibold text-foreground'
      : 'border-border bg-card text-muted-foreground hover:bg-accent',
  )
}

/**
 * A tab that names a section and says how many are in it — 32px, and the count
 * muted rather than bold.
 *
 * Its own shape beside `filterChipClass`, because it answers a different
 * question: a filter chip's number *is* the statement ("Überfällig 2"), so it
 * carries the weight, while a tab's number is an aside to the name of the place
 * it leads to. Both are the design's, measured.
 */
export function tabChipClass(active: boolean): string {
  return cn(
    'inline-flex h-8 items-center gap-[7px] rounded-full border px-[13px] text-[13.5px] transition-colors hover:border-primary',
    active
      ? 'border-primary bg-primary/12 font-semibold text-foreground'
      : 'border-border bg-card text-muted-foreground',
  )
}

/**
 * The filter tabs in the contact list's filter card — a third shape, and the
 * design means all three: 6×11px, a 6px radius, no border at all, and an
 * *active* state that is a full primary fill rather than a tint.
 *
 * That it differs from `tabChipClass` on Leistungen is the prototype's doing,
 * not an oversight here. The two sit in different places and answer different
 * questions: the Leistungen tabs are the page's own navigation and stand alone
 * above the card, these live inside a filter bar next to a search field and a
 * checkbox, where a row of bordered pills would read as six more controls.
 */
export function listTabClass(active: boolean): string {
  return cn(
    'inline-flex items-center gap-1.5 rounded-md px-[11px] py-1.5 text-[13.5px] transition-colors',
    active
      ? 'bg-primary font-semibold text-primary-foreground hover:bg-primary/[0.88]'
      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  )
}
