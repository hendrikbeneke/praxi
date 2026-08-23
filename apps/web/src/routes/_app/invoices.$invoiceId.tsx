import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { ContentWidth } from '@/components/content-width'
import { InvoiceDetail } from '@/components/invoice-detail'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { invoiceQueryOptions } from '@/lib/invoices'
import { strings } from '@/lib/strings'

export const Route = createFileRoute('/_app/invoices/$invoiceId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(invoiceQueryOptions(params.invoiceId)),
  component: InvoiceDetailPage,
})

/**
 * One invoice on a page of its own (L8).
 *
 * **A thin container, and nothing else.** Everything that reads or edits an
 * invoice lives in `InvoiceDetail`, which the contact's Rechnungen tab expands
 * inside the row that was clicked — the same shape as `ActivityDetail` and for
 * the same reason: two renderings of one record eventually say two different
 * things about it, and here the record is a document with legal weight.
 *
 * The route stays although the design puts the invoice in the contact tab,
 * because four places lead here: the Vorgang detail's rail, the contact
 * overview's card, the Zahlungen page and the cancellation link on the invoice
 * itself. A record that several screens point at needs an address.
 */
function InvoiceDetailPage() {
  const { invoiceId } = Route.useParams()
  const navigate = useNavigate()
  const { data: invoice } = useQuery(invoiceQueryOptions(invoiceId))

  if (!invoice) return <p className="text-muted-foreground text-sm">{strings.status.loading}</p>

  return (
    <>
      <PageHeader
        title={`${strings.invoice.types[invoice.type]} ${invoice.number ?? ''}`.trim()}
        description={invoice.contactName}
        actions={
          <Button variant="ghost" asChild>
            <Link to="/payments" search={{ tab: 'invoices' }}>
              <ArrowLeft className="size-4" aria-hidden />
              {strings.actions.back}
            </Link>
          </Button>
        }
      />

      <ContentWidth>
        <InvoiceDetail
          invoice={invoice}
          onDiscarded={() => void navigate({ to: '/payments', search: { tab: 'invoices' } })}
        />
      </ContentWidth>
    </>
  )
}
