import {
  formatBerlinDate,
  formatEuro,
  type Receivable,
  type ReceivableFilter,
  receivableFilters,
} from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { PageHeader } from '@/components/page-header'
import { PaymentStatusBadge } from '@/components/payment-status'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { receivableListQueryOptions } from '@/lib/payments'
import { strings } from '@/lib/strings'

/** A filter name is nothing personal, so the URL may carry it. */
const searchSchema = z.object({
  filter: z.enum(receivableFilters).optional(),
})

export const Route = createFileRoute('/_app/receivables')({
  validateSearch: searchSchema,
  component: ReceivablesPage,
})

const FILTERS: (ReceivableFilter | undefined)[] = [undefined, ...receivableFilters]

function formatDate(date: string): string {
  return formatBerlinDate(`${date}T12:00:00Z`)
}

/** The badge needs the two axes; a row already carries both. */
function stateOf(row: Receivable) {
  return {
    status: row.status,
    paidCents: row.paidCents,
    openCents: row.openCents,
    dueDate: row.dueDate,
    daysOverdue: row.daysOverdue,
  }
}

/**
 * "Who still owes what", at a glance (CLAUDE.md rule 9).
 *
 * Every number here is derived from the payments — nothing on this screen is
 * stored anywhere. Cancelled invoices and cancellation documents are visible
 * unfiltered but match none of the open filters, because they are not claims.
 */
function ReceivablesPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const receivables = useQuery(receivableListQueryOptions(search.filter))

  const rows = receivables.data ?? []
  const openTotal = rows.reduce((total, row) => total + row.openCents, 0)

  return (
    <>
      <PageHeader title={strings.receivable.title} description={strings.receivable.description} />

      <div className="mb-4 flex flex-wrap items-center gap-1">
        {FILTERS.map((filter) => (
          <Button
            key={filter ?? 'all'}
            size="sm"
            variant={search.filter === filter ? 'default' : 'outline'}
            onClick={() => void navigate({ search: { ...(filter ? { filter } : {}) } })}
          >
            {filter ? strings.receivable.filters[filter] : strings.receivable.all}
          </Button>
        ))}

        {openTotal !== 0 && (
          <span className="ml-auto text-muted-foreground text-sm tabular-nums">
            {strings.receivable.openTotal(formatEuro(openTotal))}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {receivables.isPending ? strings.status.loading : strings.receivable.empty}
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{strings.receivable.columns.number}</TableHead>
                <TableHead>{strings.receivable.columns.contact}</TableHead>
                <TableHead>{strings.receivable.columns.invoiceDate}</TableHead>
                <TableHead>{strings.receivable.columns.dueDate}</TableHead>
                <TableHead className="text-right">{strings.receivable.columns.total}</TableHead>
                <TableHead className="text-right">{strings.receivable.columns.paid}</TableHead>
                <TableHead className="text-right">{strings.receivable.columns.open}</TableHead>
                <TableHead>{strings.receivable.columns.status}</TableHead>
                <TableHead className="text-right">{strings.receivable.columns.overdue}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={row.daysOverdue !== null ? 'bg-destructive/5' : ''}
                >
                  <TableCell>
                    <Link
                      to="/invoices/$invoiceId"
                      params={{ invoiceId: row.id }}
                      className="underline underline-offset-4"
                    >
                      {row.number}
                    </Link>
                  </TableCell>
                  <TableCell>{row.contactName}</TableCell>
                  <TableCell className="tabular-nums">{formatDate(row.invoiceDate)}</TableCell>
                  <TableCell className="tabular-nums">
                    {row.dueDate ? formatDate(row.dueDate) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatEuro(row.totalCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatEuro(row.paidCents)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatEuro(row.openCents)}
                  </TableCell>
                  <TableCell>
                    {/* The days have a column of their own here. */}
                    <PaymentStatusBadge state={stateOf(row)} withDays={false} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.daysOverdue === null ? (
                      '—'
                    ) : (
                      <span className="font-medium text-destructive">
                        {strings.receivable.days(row.daysOverdue)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
