import { invoiceListFilterSchema } from '@praxi/shared'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { BillableList } from '@/components/billable-list'
import { ContentWidth } from '@/components/content-width'
import { InvoiceList } from '@/components/invoice-list'
import { PageHeader } from '@/components/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

  return (
    // The whole page is capped, header included — where the prototype
    // puts it on the three list screens (K1).
    <ContentWidth max={1180}>
      <PageHeader title={strings.payments.title} description={strings.payments.description} />

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
        <TabsList>
          <TabsTrigger value="billable">{strings.payments.tabBillable}</TabsTrigger>
          <TabsTrigger value="invoices">{strings.payments.tabInvoices}</TabsTrigger>
        </TabsList>

        <TabsContent value="billable" className="pt-6">
          <BillableList />
        </TabsContent>

        <TabsContent value="invoices" className="pt-6">
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
