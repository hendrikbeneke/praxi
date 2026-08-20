import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A titled section inside one card: a title column on the left carrying the
 * heading and its explanation, a twelve-column field grid on the right, and a
 * line between sections rather than a card frame around each (K4).
 *
 * Shared by the practice master data and the contact record, which is the point:
 * `contact-form.tsx` had its own copy, and the settings had five separate cards
 * where the design has one card with sections. Two implementations of the same
 * grid would have drifted the way the list header did before K1.
 *
 * **The two screens differ in three measured values, and they always differ
 * together** — which is why this takes one `variant` and not three numbers
 * nobody could combine correctly:
 *
 * | | `settings` | `record` |
 * |---|---|---|
 * | title column | 180px | 200px |
 * | space at the divider | 22px below it | 24px above **and** below |
 * | row gap in the field grid | 14px | 16px |
 *
 * Below `sm` the title column collapses and title and fields stack, because
 * 180px of label beside a 132px field is not a layout.
 *
 * The field grid is twelve columns so a field can be told how wide it is in the
 * design's own terms: `span-4` is "a third of the row". The gaps are the
 * prototype's.
 */
export type SectionVariant = 'settings' | 'record'

const VARIANTS: Record<SectionVariant, string> = {
  settings: 'sm:grid-cols-[180px_minmax(0,1fr)] border-t pt-[22px] first:border-t-0 first:pt-0',
  record:
    'sm:grid-cols-[200px_minmax(0,1fr)] border-t pt-6 pb-6 last:pb-0 first:border-t-0 first:pt-0',
}

const ROW_GAP: Record<SectionVariant, string> = {
  settings: 'gap-y-[14px]',
  record: 'gap-y-4',
}

export function Section({
  title,
  hint,
  variant = 'settings',
  children,
}: {
  title: string
  hint?: string
  /** The settings card or the contact record — see the table above. */
  variant?: SectionVariant
  children: React.ReactNode
}) {
  return (
    <div className={cn('grid gap-4 sm:gap-6', VARIANTS[variant])}>
      <div>
        <p className="font-semibold">{title}</p>
        {hint && <p className="mt-1 text-[13px] text-muted-foreground">{hint}</p>}
      </div>
      <div className={cn('grid grid-cols-12 gap-x-[18px]', ROW_GAP[variant])}>{children}</div>
    </div>
  )
}

/** The twelfths a field may occupy — named so components that pass one
 *  through, like `ValueSelect`, need no copy of the union. */
export type SectionSpan = 3 | 4 | 5 | 6 | 7 | 9 | 12

/**
 * One field in a `Section`'s grid. `span` is in twelfths, as the design states
 * its widths; `min-w-0` so a long value cannot push the grid wider than its
 * column, which is what `minmax(0,1fr)` on the parent is there to prevent.
 */
const SPANS: Record<number, string> = {
  3: 'col-span-12 sm:col-span-3',
  4: 'col-span-12 sm:col-span-4',
  5: 'col-span-12 sm:col-span-5',
  6: 'col-span-12 sm:col-span-6',
  7: 'col-span-12 sm:col-span-7',
  9: 'col-span-12 sm:col-span-9',
  12: 'col-span-12',
}

export function SectionField({
  span = 12,
  className,
  children,
}: {
  span?: SectionSpan
  className?: string
  children: React.ReactNode
}) {
  return <div className={cn('min-w-0', SPANS[span], className)}>{children}</div>
}
