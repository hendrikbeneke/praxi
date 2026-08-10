import { dueDate, formatBerlinDate, formatEuro, type InvoiceStatus } from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { PageHeader } from '@/components/page-header'
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

/** The status filter is a router search param; nothing personal in the URL. */
const searchSchema = z.object({
  status: z.enum(['draft', 'finalized', 'cancelled']).optional(),
})

export const Route = createFileRoute('/_app/invoices/')({
  validateSearch: searchSchema,
  component: InvoiceListPage,
})

const FILTERS: (InvoiceStatus | undefined)[] = [undefined, 'draft', 'finalized', 'cancelled']

/** A plain date rendered through the Berlin formatter needs an instant; midday
 *  can never fall on the wrong side of a timezone boundary. */
function formatDate(date: string): string {
  return formatBerlinDate(`${date}T12:00:00Z`)
}

function InvoiceListPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const invoices = useQuery(invoiceListQueryOptions({ status: search.status }))

  const rows = invoices.data ?? []

  return (
    <>
      <PageHeader title={strings.invoice.title} description={strings.invoice.description} />

      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map((status) => (
          <Button
            key={status ?? 'all'}
            size="sm"
            variant={search.status === status ? 'default' : 'outline'}
            onClick={() => void navigate({ search: { ...(status ? { status } : {}) } })}
          >
            {status ? strings.invoice.statuses[status] : strings.invoice.all}
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {invoices.isPending ? strings.status.loading : strings.invoice.empty}
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{strings.invoice.number}</TableHead>
                <TableHead>{strings.invoice.contact}</TableHead>
                <TableHead>{strings.invoice.invoiceDate}</TableHead>
                <TableHead>{strings.invoice.dueDate}</TableHead>
                <TableHead>{strings.invoice.statusLabel}</TableHead>
                <TableHead className="text-right">{strings.invoice.total}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Link
                      className="underline underline-offset-2"
                      to="/invoices/$invoiceId"
                      params={{ invoiceId: entry.id }}
                    >
                      {entry.number ?? strings.invoice.statuses.draft}
                    </Link>
                    {entry.type === 'cancellation_invoice' && (
                      <Badge variant="secondary" className="ml-2">
                        {strings.invoice.types.cancellation_invoice}
                      </Badge>
                    )}

                    {/* Both directions of the link, each pointing at the other
                        document (rule 9). */}
                    {entry.cancelledByInvoiceId && entry.cancelledByInvoiceNumber && (
                      <CounterpartLink
                        label={strings.invoice.cancelledBy}
                        invoiceId={entry.cancelledByInvoiceId}
                        number={entry.cancelledByInvoiceNumber}
                      />
                    )}
                    {entry.cancelsInvoiceId && entry.cancelsInvoiceNumber && (
                      <CounterpartLink
                        label={strings.invoice.cancels}
                        invoiceId={entry.cancelsInvoiceId}
                        number={entry.cancelsInvoiceNumber}
                      />
                    )}
                  </TableCell>
                  <TableCell>{entry.contactName}</TableCell>
                  <TableCell className="tabular-nums">{formatDate(entry.invoiceDate)}</TableCell>
                  <TableCell className="tabular-nums">
                    {entry.status === 'draft'
                      ? '—'
                      : formatDate(dueDate(entry.invoiceDate, entry.paymentTermDays))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.status === 'draft' ? 'outline' : 'secondary'}>
                      {strings.invoice.statuses[entry.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatEuro(entry.totalCents)}
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
