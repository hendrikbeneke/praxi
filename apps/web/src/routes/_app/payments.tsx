import { invoiceListFilterSchema, invoicePaymentState, toBerlinDate } from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { BillableList } from '@/components/billable-list'
import { ContentWidth } from '@/components/content-width'
import { InvoiceList } from '@/components/invoice-list'
import { PageHeader } from '@/components/page-header'
import { PaymentTiles } from '@/components/payment-tiles'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { billableQueryOptions, invoiceListQueryOptions } from '@/lib/invoices'
import { strings } from '@/lib/strings'

/**
 * Zahlungen — the money, on one screen (D7). It replaced three: Abrechenbar,
 * Rechnungen and the Bezahlübersicht, which were the same rows at three
 * stations of the same journey.
 *
 * Nothing personal in the URL, so both the tab and the filter may live there.
 * The **selection** in the first tab deliberately may not: it is a fleeting
 * intention rather than a place in the application, and it is a list of
 * activity item ids — mediately, what happened in which session (rule 12).
 */
const searchSchema = z.object({
  /** Absent means the first tab, as everywhere else in this application. */
  tab: z.enum(['invoices']).optional(),
  filter: invoiceListFilterSchema.optional(),
})

export const Route = createFileRoute('/_app/payments')({
  validateSearch: searchSchema,
  component: PaymentsPage,
})

function PaymentsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const tab = search.tab ?? 'billable'

  /* The tiles say what each tab is worth, so they read the same two queries
     the tabs themselves do — the cache serves both, so this costs no request
     of its own. */
  const billable = useQuery(billableQueryOptions())
  const invoices = useQuery(invoiceListQueryOptions({ limit: 200 }))
  const today = toBerlinDate(new Date().toISOString())

  return (
    // The whole page is capped, header included — where the prototype
    // puts it on the three list screens (K1).
    <ContentWidth max={1180}>
      <Tabs
        value={tab}
        onValueChange={(value) =>
          void navigate({
            // The filter belongs to the invoice tab alone. Carrying it over
            // would leave a filter set on a list that does not show it —
            // a state nobody could explain a week later.
            search: value === 'invoices' ? { tab: 'invoices' } : {},
          })
        }
      >
        {/* Title and tiles stay put while the list scrolls under them: on this
            screen the two numbers up here are what one keeps glancing back at
            (design). */}
        <div className="sticky top-0 z-5 bg-background pb-4">
          <PageHeader
            className="mb-0"
            title={strings.payments.title}
            description={strings.payments.description}
          />
          <PaymentTiles
            active={tab}
            onSelect={(next) =>
              void navigate({ search: next === 'invoices' ? { tab: 'invoices' } : {} })
            }
            billable={billable.data ?? []}
            invoices={invoices.data ?? []}
            stateOf={(invoice) => invoicePaymentState(invoice, invoice.paidCents, today)}
          />
        </div>

        <TabsContent value="billable">
          <BillableList />
        </TabsContent>

        <TabsContent value="invoices">
          <InvoiceList
            filter={search.filter}
            onFilterChange={(next) =>
              void navigate({ search: { tab: 'invoices', ...(next ? { filter: next } : {}) } })
            }
          />
        </TabsContent>
      </Tabs>
    </ContentWidth>
  )
}
