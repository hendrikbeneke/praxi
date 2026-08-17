import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The content cap the design puts on a screen — or on one block inside it (K1).
 *
 * Two widths, both measured in the prototype: **1180** for the three list
 * screens that cap the whole page (Einstellungen, Leistungen, Zahlungen) and
 * for the list area of Vorgänge, **1100** for the capped block on Kontaktdetail
 * and Kontakt anlegen. The prototype had 1000 on the create form; 1000 and 1100
 * were unified to 1100 by decision, because two numbers eleven percent apart
 * read as an accident rather than as an intention.
 *
 * Not a route-level setting, and that is the point: where the cap sits is a
 * design fact per screen. Vorgänge wraps only its list so the filter band keeps
 * running to the window edge, Kontaktdetail wraps only its tab content so the
 * tab underline keeps spanning the full field, and the calendar wraps nothing.
 * The page padding around all of this comes from `lib/page-chrome.ts`.
 *
 * **The number is the outer width, and the shell's inset is subtracted here.**
 * In the prototype the cap sits on the same element as the 32px page padding,
 * so 1180 is a border-box width holding 1116px of content. This component sits
 * *inside* `main`'s `px-8`, so capping its content at a bare 1180 would make the
 * screen 64px wider than the design — invisible at 1440, where neither cap
 * bites, and wrong on every larger monitor. `PAGE_INSET` names that relationship
 * instead of leaving 1116 as a magic number nobody can trace back.
 */
const PAGE_INSET = '4rem' // `px-8` on both sides, from `lib/page-chrome.ts`

export function ContentWidth({
  max,
  children,
  className,
}: {
  max: 1180 | 1100
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('w-full', className)} style={{ maxWidth: `calc(${max}px - ${PAGE_INSET})` }}>
      {children}
    </div>
  )
}
