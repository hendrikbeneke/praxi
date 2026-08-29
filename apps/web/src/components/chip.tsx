import { cn } from '@/lib/utils'

/**
 * The pill shapes the design uses above a list (K3, corrected in K7 and K8).
 *
 * **Where the count goes depends on what the pill is**, and the design is
 * consistent about it once one reads it properly:
 *
 * - a **filter chip** puts the number first — `3 Offen`. There the number *is*
 *   the statement: how many rows to expect if this is pressed.
 * - a **tab** puts it last — `Leistungen 9`. There the name is the statement
 *   and the number an aside about the place it leads to.
 *
 * K3 flattened the two to "always last", on a feeling rather than on a careful
 * reading of the prototype. K8 took that back. The position lives at each call
 * site rather than in these classes, because it is a property of what the pill
 * means and not of how it looks.
 *
 * A prose summary line beside them keeps prose word order — "4 Notizen",
 * "8 Vorgänge · 3 kommend" — because "Notizen 4" is not a sentence.
 *
 * There was a third shape here until K7, `CountChip`: a `<span>` that only
 * counted. It rested on a reading of the prototype that turned out to be
 * wrong — the chips over the contact's tabs *do* filter — so every chip in
 * this file is a control again.
 */
/**
 * A chip that *does* filter, so it stays a button — the classes only.
 *
 * **The active one is filled dark**, and that overturns what stood here (L6b).
 * The reasoning was that on a row of six a filled pill reads as the primary
 * action of the screen rather than as "this one is selected", so the active
 * state was a light primary tint. The design draws it filled, and it is right
 * for a reason the argument missed: a *row* of chips is not a row of buttons.
 * Only one of them is ever filled, the primary action of the screen sits at
 * the other end of the same line, and a tint that light is a state one has to
 * look for. Rangfolge — the images decide the look.
 */
export function filterChipClass(active: boolean): string {
  return cn(
    'inline-flex h-7 items-center gap-1.5 rounded-full border px-[11px] text-[12.5px] transition-colors',
    active
      ? 'border-primary bg-primary font-semibold text-primary-foreground'
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

/**
 * A row of filter chips — one implementation for every list that carries them
 * (B2).
 *
 * The behaviour is a rule and not a call site's choice: **the active chip
 * switches itself off when it is pressed again**, which is what takes the place
 * of an "Alle" chip. The Vorgänge page had one and the contact's Vorgänge tab
 * did not, so the same row of pills answered the same question in two ways.
 *
 * `count` may be missing while the figures are still on their way. A chip
 * without one is still a chip: it filters, it just cannot say yet how many.
 */
export function FilterChips<Id extends string>({
  chips,
  active,
  onChange,
}: {
  chips: readonly { id: Id; label: string; count: number | undefined }[]
  active: Id | undefined
  onChange: (next: Id | undefined) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className={filterChipClass(active === chip.id)}
          onClick={() => onChange(active === chip.id ? undefined : chip.id)}
        >
          {/* The number first: on a filter chip it is the statement — how many
              rows to expect — while a tab's number is an aside to its name.
              Two roles, two positions (K8). */}
          {chip.count !== undefined && (
            <span className="font-semibold tabular-nums">{chip.count}</span>
          )}
          {chip.label}
        </button>
      ))}
    </div>
  )
}
