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
 * **Where the cap sits differs between the two, so the number means two
 * different things and there is no formula covering both.** On the four
 * screens capped at 1180 the prototype puts the cap on the same element as the
 * 32px page padding, so the inset is part of the number and 1180 holds 1116px
 * of content. On the two contact screens the cap sits on a block *inside* an
 * already padded area, so 1100 is the content width itself. This component
 * always sits inside `main`'s `px-8`, so each value needs its own answer —
 * hence a table and not a subtraction. Getting it wrong is invisible at 1440,
 * where neither cap bites, and 64px off on every larger monitor (found in K6,
 * where 1100 was rendering as 1036).
 */
const PAGE_INSET = '4rem' // `px-8` on both sides, from `lib/page-chrome.ts`

const OUTER_WIDTH: Record<1180 | 1100, string> = {
  // Einstellungen, Leistungen, Zahlungen and the list area of Vorgänge.
  1180: `calc(1180px - ${PAGE_INSET})`,
  // Kontaktdetail and Kontakt anlegen.
  1100: '1100px',
}

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
    <div className={cn('w-full', className)} style={{ maxWidth: OUTER_WIDTH[max] }}>
      {children}
    </div>
  )
}
