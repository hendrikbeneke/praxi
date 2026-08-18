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
 * **The title column is 180px in the settings and 200px in the contact record.**
 * Measured in the prototype, which sets both — so the width is a prop and not a
 * constant. Below `sm` the column collapses and title and fields stack, because
 * 180px of label beside a 132px field is not a layout.
 *
 * The field grid is twelve columns so a field can be told how wide it is in the
 * design's own terms: `span-4` is "a third of the row". The gaps (`14px 18px`
 * inside, `24px` to the title column) are the prototype's.
 */
export function Section({
  title,
  hint,
  titleWidth = 180,
  children,
}: {
  title: string
  hint?: string
  /** 180 in the settings, 200 in the contact record — both from the design. */
  titleWidth?: 180 | 200
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'grid gap-4 border-t pt-[22px] first:border-t-0 first:pt-0 sm:gap-6',
        titleWidth === 200
          ? 'sm:grid-cols-[200px_minmax(0,1fr)]'
          : 'sm:grid-cols-[180px_minmax(0,1fr)]',
      )}
    >
      <div>
        <p className="font-semibold">{title}</p>
        {hint && <p className="mt-1 text-[13px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="grid grid-cols-12 gap-x-[18px] gap-y-[14px]">{children}</div>
    </div>
  )
}

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
  12: 'col-span-12',
}

export function SectionField({
  span = 12,
  className,
  children,
}: {
  span?: 3 | 4 | 5 | 6 | 7 | 12
  className?: string
  children: React.ReactNode
}) {
  return <div className={cn('min-w-0', SPANS[span], className)}>{children}</div>
}
