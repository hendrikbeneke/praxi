import { Tabs as TabsPrimitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The underlined tabs of a record — the contact file's Übersicht / Stammdaten /
 * Notizen row (K6).
 *
 * Built on the Radix primitives rather than on `ui/tabs.tsx`, and deliberately
 * so: the shadcn component describes two shapes, a segmented control and a line
 * variant whose rule floats five pixels below the row. This one has no shape of
 * its own at all — each tab carries a 2px bottom border that lands *on* the
 * header strip's own border, which is what makes the rule look continuous
 * across the full width of the screen. Rebuilding that by overriding six
 * variant classes would have left the two describing each other rather than
 * the design.
 *
 * Everything a tab row owes the keyboard — roving focus, arrow keys, the
 * `aria-controls` pairing with `TabsContent` — comes from the primitive and is
 * untouched.
 */
export function RecordTabsList({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('flex gap-0.5', className)}
      {...props}
    />
  )
}

export function RecordTab({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'border-transparent border-b-2 px-3.5 py-[9px] text-[13.5px] text-muted-foreground transition-colors',
        'hover:text-foreground focus-visible:outline-1 focus-visible:outline-ring',
        'data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    />
  )
}
