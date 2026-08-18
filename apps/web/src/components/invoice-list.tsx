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
import { NewInvoiceDialog } from '@/components/new-invoice-dialog'
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

/**
 * **One status column, not two** (K8). It said "Festgeschrieben" in one and
 * "Teilweise bezahlt" in the next, which is the same mistake the chip band had
 * before D7 merged it: a document is in *one* state, and the two columns had
 * to be read together to find out which. `documentState()` below is that one
 * state, and what has been paid so far stands beside the badge rather than in
 * a column of its own.
 *
 * The order is the design's, and `total` comes before `openAmount`: what was
 * demanded, then what is left of it.
 */
const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: 'number', label: strings.invoice.number, locked: true },
  { key: 'contact', label: strings.invoice.contact },
  { key: 'invoiceDate', label: strings.invoice.invoiceDate },
  { key: 'dueDate', label: strings.invoice.dueDate },
  { key: 'status', label: strings.invoice.statusLabel },
  { key: 'total', label: strings.invoice.total },
  { key: 'openAmount', label: strings.invoice.openAmount },
]

const DEFAULT_COLUMNS = COLUMN_DEFINITIONS.map((entry) => entry.key)

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
  /**
   * A stored choice that names a column this list no longer has predates the
   * change and is **dropped whole**, not filtered down to its known part.
   *
   * Discarding looks generous until one sees what keeping it does: the array
   * carries the *order* as well as the selection, so the surviving keys would
   * go on standing in an order nobody chose any more. That is not theory — on
   * the first pass of K8 `Betrag` and `Offen` stayed the wrong way round for
   * exactly this reason, with the definitions long since swapped. A preference
   * that mentions something gone is a preference from before the change, and
   * the honest answer to it is the current default.
   */
  const stored = preferences.data?.invoiceListColumns
  const visibleColumns =
    stored?.every((key) => COLUMN_DEFINITIONS.some((entry) => entry.key === key)) === true
      ? stored
      : DEFAULT_COLUMNS
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

  /* The summary describes the whole list, not the filtered view: it is what
     the chips narrow *from*, so it must not move when one is pressed. */
  const draftCount = loaded.filter((invoice) => invoice.status === 'draft').length
  const claims = loaded
    .filter((invoice) => invoice.status !== 'draft')
    .map((invoice) => invoicePaymentState(invoice, invoice.paidCents, today))
  const openCount = claims.filter((state) => state.openCents > 0).length
  const openTotalAll = claims.reduce((total, state) => total + state.openCents, 0)
  const columns = visibleColumns.filter((key) =>
    COLUMN_DEFINITIONS.some((entry) => entry.key === key),
  )

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* The summary first, then the chips — the design's order, and it
            reads as one sentence with them: what the list is made of, then the
            ways to narrow it (K8). */}
        <p className="mr-3 text-[13px] text-muted-foreground tabular-nums">
          {strings.invoice.listSummary(draftCount, openCount, formatEuro(openTotalAll))}
        </p>

        {/* **The count comes first here**: on a filter chip the number is the
            statement — how many rows to expect — while on a tab it is an aside
            to the name. K3 flattened the two to one order; K8 took that back
            (see `components/chip.tsx`). */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className={filterChipClass(filter === undefined)}
            onClick={() => onFilterChange(undefined)}
          >
            <span className="font-semibold tabular-nums">{loaded.length}</span>
            {strings.invoice.all}
          </button>
          {invoiceListFilters.map((entry) => (
            <button
              key={entry}
              type="button"
              className={filterChipClass(filter === entry)}
              onClick={() => onFilterChange(entry)}
            >
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
              {strings.invoice.filters[entry]}
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
              {/* 14px in mixed case, like the contact list — the small caps of
                  `listHeaderClass` are the catalogue lists' shape (K5), not
                  this table's (K8). */}
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  {columns.map((key) => (
                    <TableHead
                      key={key}
                      className={`h-10 px-4 font-medium text-sm ${
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

          {/* What is outstanding is said once, above the chips, and it says it
              of the whole list. The line that used to stand here said it of
              the filtered view *and* counted drafts as open, so the two could
              differ by a draft's total — a claim nobody has made yet (K8). */}
          {loaded.length === PAGE_SIZE && (
            <p className="mt-3 text-muted-foreground text-sm tabular-nums">
              {strings.contact.countOf(rows.length, loaded.length)}
            </p>
          )}
        </>
      )}

      <NewInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}

function isNumeric(column: string): boolean {
  return column === 'total' || column === 'openAmount'
}

/**
 * The one state a document is in — the badge in the status column.
 *
 * A draft is not a claim and therefore has no payment state; everything else
 * is whatever `invoicePaymentState()` makes of it, which per rule 9 is the
 * only place that decides. Nothing is derived twice here.
 */
function documentState(invoice: Invoice, state: PaymentState): { label: string; settled: boolean } {
  if (invoice.status === 'draft') {
    return { label: strings.invoice.statuses.draft, settled: false }
  }
  return {
    label: strings.payment.statuses[state.status],
    settled: state.status !== 'open' && state.status !== 'partially_paid',
  }
}

/** What is written beside the badge: how much has arrived while something is
 *  still owed, and on which day it was settled once nothing is. */
function statusNote(invoice: Invoice, state: PaymentState): string | undefined {
  if (invoice.status === 'draft') return undefined

  if (state.status === 'cancelled' || state.status === 'cancellation') {
    return invoice.lastPaidOn
      ? strings.invoice.settledOnDay(formatDate(invoice.lastPaidOn))
      : undefined
  }
  if (state.status === 'paid' || state.status === 'overpaid') {
    return invoice.lastPaidOn
      ? strings.invoice.paidOnDay(formatDate(invoice.lastPaidOn))
      : undefined
  }
  return state.paidCents > 0 ? strings.invoice.partPaid(formatEuro(state.paidCents)) : undefined
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
    case 'dueDate': {
      if (invoice.status === 'draft') return <span className="tabular-nums">—</span>
      return (
        <span className="inline-flex items-baseline gap-2">
          <span className="tabular-nums">
            {formatDate(dueDate(invoice.invoiceDate, invoice.paymentTermDays))}
          </span>
          {/* How late it is belongs in the row, next to the day it was due —
              the tinted row says *that* it is late, this says how long. */}
          {state.daysOverdue !== null && (
            <span className="whitespace-nowrap font-semibold text-[12px] text-destructive">
              {strings.invoice.overdueSinceDays(state.daysOverdue)}
            </span>
          )}
        </span>
      )
    }
    case 'status': {
      const document = documentState(invoice, state)
      const note = statusNote(invoice, state)
      return (
        <span className="inline-flex flex-wrap items-baseline gap-2">
          <Badge variant={document.settled ? 'secondary' : 'outline'}>{document.label}</Badge>
          {note && <span className="text-[12px] text-muted-foreground tabular-nums">{note}</span>}
        </span>
      )
    }
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
