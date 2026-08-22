import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The content cap the design puts on a screen — or on one block inside it (K1).
 *
 * **One number, 1180, and it is a content width.** Measured off the L5 images:
 * at a 1728 px window the master data card runs from 268 to 1447, and 268 is
 * where `main`'s `px-8` ends. So what is capped is the content, not the
 * content plus its inset.
 *
 * There were two values until L5 — 1180 for the four list screens and 1100 for
 * the two contact screens — and worse, the two meant different things: 1180
 * was applied to the same element as the 32 px page padding and therefore held
 * 1116 px of content, while 1100 was the content itself. That is a trap and it
 * sprang once already (K6, where 1100 rendered as 1036). Two numbers eleven
 * percent apart read as an accident anyway. Now a screen is either capped at
 * 1180 or it runs the full width — the contact's Übersicht is the second case,
 * and nothing sits between them.
 *
 * Not a route-level setting, and that is the point: where the cap sits is a
 * design fact per screen. Vorgänge wraps only its list so the filter band keeps
 * running to the window edge, Kontaktdetail wraps only its tab content so the
 * tab underline keeps spanning the full field, and the calendar wraps nothing.
 * The page padding around all of this comes from `lib/page-chrome.ts`.
 */
export function ContentWidth({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('w-full max-w-[1180px]', className)}>{children}</div>
}
