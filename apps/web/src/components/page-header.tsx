import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The page title block. Three text slots, because the design has three: the
 * title, a one-line `description`, and a longer `note` that explains how the
 * screen works ("Der Katalog ist eine Vorlage. Beim Anlegen eines Vorgangs
 * werden Bezeichnung, Ziffer, Preis und Dauer kopiert …").
 *
 * The `note` slot is what K1 added, and its absence had a visible cost: with
 * nowhere to put that sentence, Leistungen moved it into the list card and took
 * the "Neue Leistung" button along, which gave that card a title bar the design
 * does not have there.
 *
 * The 720px cap sits on the whole text block, not on the note alone — that is
 * how the prototype sets it, and it is why the title wraps at the same measure
 * as the prose under it. Sizes measured, not guessed: 26px/1.1/−0.022em for the
 * title, 14px at 5px below it, 13px at 10px below that.
 */
export function PageHeader({
  title,
  description,
  note,
  actions,
  className,
}: {
  title: string
  description?: string
  note?: string
  actions?: ReactNode
  /** For a header that sits inside a strip of its own and brings its own
   *  spacing — `contacts/new` does (K6). */
  className?: string
}) {
  return (
    <header className={cn('mb-5 flex items-start justify-between gap-7', className)}>
      <div className="min-w-0 max-w-[720px]">
        <h1 className="font-semibold text-[26px] leading-[1.1] tracking-[-0.022em]">{title}</h1>
        {description && <p className="mt-[5px] text-muted-foreground text-sm">{description}</p>}
        {note && (
          <p className="mt-[10px] text-[13px] text-muted-foreground leading-[1.5]">{note}</p>
        )}
      </div>
      {actions}
    </header>
  )
}

/**
 * A navigation target whose slice has not been built yet. The sidebar is
 * complete from slice 1 on, so every entry has to lead somewhere — this says
 * plainly that the area is still empty instead of showing a broken page.
 */
export function PlaceholderPage({ title, note }: { title: string; note: string }) {
  return (
    <>
      <PageHeader title={title} />
      <p className="text-muted-foreground text-sm">{note}</p>
    </>
  )
}
