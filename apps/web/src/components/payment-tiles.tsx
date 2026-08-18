import { type BillableItem, formatEuro, type Invoice, type PaymentState } from '@praxi/shared'
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
 */
export function PaymentTiles({
  active,
  onSelect,
  billable,
  invoices,
  stateOf,
}: {
  active: 'billable' | 'invoices'
  onSelect: (tab: 'billable' | 'invoices') => void
  billable: readonly BillableItem[]
  invoices: readonly Invoice[]
  stateOf: (invoice: Invoice) => PaymentState
}) {
  const billableCents = billable.reduce(
    (total, item) => total + item.quantity * item.unitPriceCents,
    0,
  )
  const billableActivities = new Set(billable.map((item) => item.activityId)).size

  const drafts = invoices.filter((invoice) => invoice.status === 'draft')
  const claims = invoices
    .filter((invoice) => invoice.status !== 'draft')
    .map((invoice) => stateOf(invoice))
  const open = claims.filter((state) => state.openCents > 0)
  const overdue = open.filter((state) => state.daysOverdue !== null)
  const openCents = open.reduce((total, state) => total + state.openCents, 0)

  return (
    <TabsPrimitive.List className="mt-5 grid gap-3.5 sm:grid-cols-2">
      <Tile
        value="billable"
        active={active === 'billable'}
        label={strings.payments.tabBillable}
        amount={formatEuro(billableCents)}
        amountLabel={strings.payments.tileBillableValue}
        parts={strings.payments.tileBillableParts(billableActivities, billable.length)}
        onSelect={() => onSelect('billable')}
      />
      <Tile
        value="invoices"
        active={active === 'invoices'}
        label={strings.payments.tabInvoices}
        amount={formatEuro(openCents)}
        amountLabel={strings.payments.tileInvoicesValue}
        parts={strings.payments.tileInvoiceParts(drafts.length, open.length)}
        warning={overdue.length > 0 ? strings.payments.tileOverdue(overdue.length) : undefined}
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
  amount: string
  amountLabel: string
  parts: string
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
