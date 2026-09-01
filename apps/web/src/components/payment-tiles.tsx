import { formatEuro, type InvoiceSummary } from '@praxi/shared'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/**
 * The two tiles that switch between the tabs of Zahlungen (K8).
 *
 * They *are* the tab bar — the design gives this screen no segmented control,
 * because the question it answers is a question about money: what is still
 * uninvoiced, and what is invoiced and unpaid. A switch that says only
 * "Offene Vorgänge / Rechnungen" makes one click to find out; these say it
 * before the click, which is the whole point of putting them at the top.
 *
 * Built on the Radix primitive, like `RecordTab` in K6: the shape is entirely
 * the design's and none of shadcn's, and everything a tab bar owes the
 * keyboard comes from the primitive.
 *
 * The amount on the right turns red when something is overdue. It is the only
 * colour on the tile, and it is on the number rather than on the tile, because
 * what is late is a part of the sum and not the whole screen.
 *
 * **Every figure comes from the server** (B3). They were folded out of the two
 * lists this page had loaded until then, and the invoice list is capped at 200
 * — so a tile said "3 offen" of the first two hundred documents. A number on a
 * tile that changes as one scrolls is a wrong number, not a partial one.
 */
export function PaymentTiles({
  active,
  onSelect,
  summary,
}: {
  active: 'billable' | 'invoices'
  onSelect: (tab: 'billable' | 'invoices') => void
  /** Undefined while it is still on its way; the tiles then show no figures
   *  rather than zeros, which would be an answer. */
  summary: InvoiceSummary | undefined
}) {
  return (
    <TabsPrimitive.List className="mt-5 grid gap-3.5 sm:grid-cols-2">
      <Tile
        value="billable"
        active={active === 'billable'}
        label={strings.payments.tabBillable}
        amount={summary && formatEuro(summary.billableCents)}
        amountLabel={strings.payments.tileBillableValue}
        parts={
          summary &&
          strings.payments.tileBillableParts(summary.billableActivities, summary.billableItems)
        }
        onSelect={() => onSelect('billable')}
      />
      <Tile
        value="invoices"
        active={active === 'invoices'}
        label={strings.payments.tabInvoices}
        amount={summary && formatEuro(summary.openCents)}
        amountLabel={strings.payments.tileInvoicesValue}
        parts={summary && strings.payments.tileInvoiceParts(summary.draft, summary.open)}
        warning={
          summary && summary.overdue > 0 ? strings.payments.tileOverdue(summary.overdue) : undefined
        }
        onSelect={() => onSelect('invoices')}
      />
    </TabsPrimitive.List>
  )
}

function Tile({
  value,
  active,
  label,
  amount,
  amountLabel,
  parts,
  warning,
  onSelect,
}: {
  value: string
  active: boolean
  label: string
  amount: string | undefined
  amountLabel: string
  parts: string | undefined
  warning?: string | undefined
  onSelect: () => void
}) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      onClick={onSelect}
      className={cn(
        'flex flex-col gap-1 rounded-xl border px-[18px] pt-[15px] pb-3.5 text-left transition-colors hover:border-primary',
        active ? 'border-primary bg-primary/8 shadow-sm' : 'border-border bg-card',
      )}
    >
      <span className="flex w-full items-baseline gap-3">
        <span className="whitespace-nowrap font-semibold text-[15.5px]">{label}</span>
        <span
          className={cn(
            'ml-auto shrink-0 whitespace-nowrap font-semibold text-[23px] leading-[1.1] tracking-[-0.02em] tabular-nums',
            warning && 'text-destructive',
          )}
        >
          {amount}
        </span>
      </span>
      <span className="flex w-full items-baseline gap-2 text-[12.5px] text-muted-foreground">
        <span>{parts}</span>
        <span className="ml-auto tabular-nums">{amountLabel}</span>
      </span>
      {warning && <span className="font-semibold text-[12.5px] text-destructive">{warning}</span>}
    </TabsPrimitive.Trigger>
  )
}
