import {
  dueDate,
  formatBerlinDate,
  formatEuro,
  type Invoice,
  type InvoiceListFilter,
  invoiceListFilters,
  invoicePaymentState,
  matchesInvoiceListFilter,
  type PaymentState,
  toBerlinDate,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { filterChipClass } from '@/components/chip'
import { type ColumnDefinition, ColumnPicker } from '@/components/column-picker'
import { listHeaderClass } from '@/components/list-card'
import { NewInvoiceDialog } from '@/components/new-invoice-dialog'
import { PaymentStatusBadge } from '@/components/payment-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { invoiceListQueryOptions } from '@/lib/invoices'
import { strings } from '@/lib/strings'
import {
  updateUserPreferences,
  userPreferencesQueryKey,
  userPreferencesQueryOptions,
} from '@/lib/user-preferences'

/** Enough for a practice's whole history today; the count line below the
 *  table says so when it is not, rather than silently showing a prefix. */
const PAGE_SIZE = 200

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: 'number', label: strings.invoice.number, locked: true },
  { key: 'contact', label: strings.invoice.contact },
  { key: 'invoiceDate', label: strings.invoice.invoiceDate },
  { key: 'dueDate', label: strings.invoice.dueDate },
  { key: 'status', label: strings.invoice.statusLabel },
  { key: 'paymentState', label: strings.invoice.paymentState },
  { key: 'paidAmount', label: strings.invoice.paidAmount },
  { key: 'openAmount', label: strings.invoice.openAmount },
  { key: 'total', label: strings.invoice.total },
]

/** `paidAmount` is left out: it is `total − open`, and the two that carry the
 *  question ("what is still owed, of how much") earn the width first. */
const DEFAULT_COLUMNS = COLUMN_DEFINITIONS.filter((entry) => entry.key !== 'paidAmount').map(
  (entry) => entry.key,
)

/** A plain date rendered through the Berlin formatter needs an instant; midday
 *  can never fall on the wrong side of a timezone boundary. */
function formatDate(date: string): string {
  return formatBerlinDate(`${date}T12:00:00Z`)
}

/**
 * Every invoice and what its payments make of it — the second tab of
 * Zahlungen (D7), where the invoice list and the Bezahlübersicht merged.
 *
 * The merge is possible because both screens were the same rows: the invoice
 * list already carried `paidCents`, and `invoicePaymentState()` derives the
 * rest. What the Bezahlübersicht added was a server-side narrowing, and that
 * endpoint is gone — the filter runs here now, over the loaded rows, for the
 * reason its docstring gave: rewriting the status rule as a `WHERE` clause
 * would be a second definition of it, and the two would eventually disagree.
 *
 * Nothing on this screen is stored. Every amount and every status comes out
 * of `invoicePaymentState()` on read (CLAUDE.md rule 9).
 */
export function InvoiceList({
  filter,
  onFilterChange,
}: {
  filter: InvoiceListFilter | undefined
  onFilterChange: (next: InvoiceListFilter | undefined) => void
}) {
  const queryClient = useQueryClient()
  const invoices = useQuery(invoiceListQueryOptions({ limit: PAGE_SIZE }))
  const today = toBerlinDate(new Date().toISOString())
  const [createOpen, setCreateOpen] = useState(false)

  const preferences = useQuery(userPreferencesQueryOptions)
  const visibleColumns = preferences.data?.invoiceListColumns ?? DEFAULT_COLUMNS
  const saveColumns = useMutation({
    mutationFn: (next: string[]) => updateUserPreferences({ invoiceListColumns: next }),
    onMutate: (next) => {
      queryClient.setQueryData(userPreferencesQueryKey, (current) => ({
        ...(current ?? {}),
        invoiceListColumns: next,
      }))
    },
    onSuccess: (saved) => queryClient.setQueryData(userPreferencesQueryKey, saved),
  })

  const loaded = invoices.data ?? []
  const rows = loaded
    .map((invoice) => ({ invoice, state: invoicePaymentState(invoice, invoice.paidCents, today) }))
    .filter(
      (row) => filter === undefined || matchesInvoiceListFilter(row.invoice, row.state, filter),
    )

  const openTotal = rows.reduce((total, row) => total + row.state.openCents, 0)
  const columns = visibleColumns.filter((key) =>
    COLUMN_DEFINITIONS.some((entry) => entry.key === key),
  )

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Every chip carries its count, and the count is what makes the row
            worth reading: "Überfällig 2" is the sentence, the chip is only how
            one acts on it (K3). Counted over the loaded rows — the same array
            the table renders, so no second request. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className={filterChipClass(filter === undefined)}
            onClick={() => onFilterChange(undefined)}
          >
            {strings.invoice.all}
            <span className="font-semibold tabular-nums">{loaded.length}</span>
          </button>
          {invoiceListFilters.map((entry) => (
            <button
              key={entry}
              type="button"
              className={filterChipClass(filter === entry)}
              onClick={() => onFilterChange(entry)}
            >
              {strings.invoice.filters[entry]}
              <span className="font-semibold tabular-nums">
                {
                  loaded.filter((invoice) =>
                    matchesInvoiceListFilter(
                      invoice,
                      invoicePaymentState(invoice, invoice.paidCents, today),
                      entry,
                    ),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ColumnPicker
            columns={COLUMN_DEFINITIONS}
            visible={visibleColumns}
            onChange={(next) => saveColumns.mutate(next)}
          />
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            {strings.invoice.create}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {invoices.isPending
            ? strings.status.loading
            : filter === undefined
              ? strings.invoice.empty
              : strings.invoice.emptyFiltered}
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-[10px] border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  {columns.map((key) => (
                    <TableHead
                      key={key}
                      className={`h-9 px-4 ${listHeaderClass} ${
                        isNumeric(key) ? 'text-right' : ''
                      }`}
                    >
                      {COLUMN_DEFINITIONS.find((entry) => entry.key === key)?.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ invoice, state }) => (
                  <TableRow
                    key={invoice.id}
                    /* The one place this screen carries colour of its own.
                       `/10` rather than `/5`: on the dark theme a five-percent
                       tint over an already dark surface is not a marking. */
                    className={state.daysOverdue !== null ? 'bg-destructive/10' : ''}
                  >
                    {columns.map((key) => (
                      <TableCell
                        key={key}
                        className={isNumeric(key) ? 'text-right tabular-nums' : ''}
                      >
                        <Cell column={key} invoice={invoice} state={state} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 text-muted-foreground text-sm">
            {openTotal !== 0 && (
              <span className="tabular-nums">
                {strings.invoice.openTotal(formatEuro(openTotal))}
              </span>
            )}
            {loaded.length === PAGE_SIZE && (
              <span className="tabular-nums">
                {strings.contact.countOf(rows.length, loaded.length)}
              </span>
            )}
          </div>
        </>
      )}

      <NewInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}

function isNumeric(column: string): boolean {
  return column === 'total' || column === 'paidAmount' || column === 'openAmount'
}

function Cell({
  column,
  invoice,
  state,
}: {
  column: string
  invoice: Invoice
  state: PaymentState
}) {
  switch (column) {
    case 'number':
      return (
        <>
          <Link
            className="underline underline-offset-2"
            to="/invoices/$invoiceId"
            params={{ invoiceId: invoice.id }}
          >
            {invoice.number ?? strings.invoice.statuses.draft}
          </Link>
          {invoice.type === 'cancellation_invoice' && (
            <Badge variant="secondary" className="ml-2">
              {strings.invoice.types.cancellation_invoice}
            </Badge>
          )}

          {/* Both directions of the link, each pointing at the other
              document (rule 9). */}
          {invoice.cancelledByInvoiceId && invoice.cancelledByInvoiceNumber && (
            <CounterpartLink
              label={strings.invoice.cancelledBy}
              invoiceId={invoice.cancelledByInvoiceId}
              number={invoice.cancelledByInvoiceNumber}
            />
          )}
          {invoice.cancelsInvoiceId && invoice.cancelsInvoiceNumber && (
            <CounterpartLink
              label={strings.invoice.cancels}
              invoiceId={invoice.cancelsInvoiceId}
              number={invoice.cancelsInvoiceNumber}
            />
          )}
        </>
      )
    case 'contact':
      return <>{invoice.contactName}</>
    case 'invoiceDate':
      return <span className="tabular-nums">{formatDate(invoice.invoiceDate)}</span>
    case 'dueDate':
      return (
        <span className="tabular-nums">
          {invoice.status === 'draft'
            ? '—'
            : formatDate(dueDate(invoice.invoiceDate, invoice.paymentTermDays))}
        </span>
      )
    case 'status':
      return (
        <Badge variant={invoice.status === 'draft' ? 'outline' : 'secondary'}>
          {strings.invoice.statuses[invoice.status]}
        </Badge>
      )
    case 'paymentState':
      // A draft is not a claim, so it has no payment state to show.
      return invoice.status === 'draft' ? <>—</> : <PaymentStatusBadge state={state} />
    case 'paidAmount':
      return <>{invoice.status === 'draft' ? '—' : formatEuro(state.paidCents)}</>
    case 'openAmount':
      return <>{invoice.status === 'draft' ? '—' : formatEuro(state.openCents)}</>
    case 'total':
      return <>{formatEuro(invoice.totalCents)}</>
    default:
      return null
  }
}

function CounterpartLink({
  label,
  invoiceId,
  number,
}: {
  label: string
  invoiceId: string
  number: string
}) {
  return (
    <span className="ml-2 whitespace-nowrap text-muted-foreground text-xs">
      {label}{' '}
      <Link
        className="underline underline-offset-2"
        to="/invoices/$invoiceId"
        params={{ invoiceId }}
      >
        {number}
      </Link>
    </span>
  )
}
