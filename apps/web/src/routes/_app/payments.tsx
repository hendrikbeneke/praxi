import { invoicePaymentState, matchesInvoiceListFilter, toBerlinDate } from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { BillableList } from '@/components/billable-list'
import { ContentWidth } from '@/components/content-width'
import { InvoiceFilterBar, useInvoiceColumns } from '@/components/invoice-filter-bar'
import { InvoiceList } from '@/components/invoice-list'
import { PageHeader } from '@/components/page-header'
import { PaymentTiles } from '@/components/payment-tiles'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { invoiceFilterSearchSchema } from '@/lib/invoice-filters'
import { invoiceListQueryOptions, invoiceSummaryQueryOptions } from '@/lib/invoices'
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
 *
 * Everything below the tiles is the contact's Rechnungen tab, component for
 * component (B3): `InvoiceFilterBar` and `InvoiceList`, out of one filter
 * schema. The tiles are what this screen has and that one does not — a contact
 * record shows no open Vorgänge, they live here.
 */
const searchSchema = z.object({
  /** Absent means the first tab, as everywhere else in this application. */
  tab: z.enum(['invoices']).optional(),
  ...invoiceFilterSearchSchema.shape,
})

export const Route = createFileRoute('/_app/payments')({
  validateSearch: searchSchema,
  component: PaymentsPage,
})

function PaymentsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const tab = search.tab ?? 'billable'

  /**
   * One request for every figure on this screen — the two tiles and the six
   * chips (B3). It counts over the whole table rather than over the rows the
   * list happened to fetch, which is what a capped list could never do.
   */
  const summary = useQuery(invoiceSummaryQueryOptions())
  const invoices = useQuery(invoiceListQueryOptions({ limit: PAGE_SIZE }))
  const { columns, setColumns } = useInvoiceColumns()
  const today = toBerlinDate(new Date().toISOString())

  const [creating, setCreating] = useState(false)
  /** A draft the collect just produced, opened where it now stands. Not in the
   *  URL: it is what a click led to, not a place one arrives at. */
  const [openInvoiceId, setOpenInvoiceId] = useState<string | undefined>(search.invoiceId)

  const rows = (invoices.data ?? []).filter(
    (invoice) =>
      search.invoiceFilter === undefined ||
      matchesInvoiceListFilter(
        invoice,
        invoicePaymentState(invoice, invoice.paidCents, today),
        search.invoiceFilter,
      ),
  )

  const showInvoices = (invoiceId?: string) => {
    if (invoiceId) setOpenInvoiceId(invoiceId)
    void navigate({ search: { tab: 'invoices' } })
  }

  return (
    // The whole page is capped, header included — where the prototype
    // puts it on the three list screens (K1).
    <ContentWidth>
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
            actions={
              /* Here rather than in the filter bar, and that is what keeps the
                 bar identical to the contact's: this button belongs to the
                 whole screen, both tabs included. Same division as "Neuer
                 Vorgang" in B2. */
              <Button
                onClick={() => {
                  setCreating(true)
                  void navigate({ search: { tab: 'invoices' } })
                }}
              >
                <Plus className="size-4" aria-hidden />
                {strings.invoice.create}
              </Button>
            }
          />
          <PaymentTiles
            active={tab}
            onSelect={(next) =>
              void navigate({ search: next === 'invoices' ? { tab: 'invoices' } : {} })
            }
            summary={summary.data}
          />

          {tab === 'invoices' && (
            <InvoiceFilterBar
              className="mt-4"
              summary={summary.data}
              filter={search.invoiceFilter}
              onFilterChange={(next) =>
                void navigate({
                  search: { tab: 'invoices', ...(next ? { invoiceFilter: next } : {}) },
                })
              }
              columns={columns}
              onColumnsChange={setColumns}
            />
          )}
        </div>

        <TabsContent value="billable">
          <BillableList onCollected={showInvoices} />
        </TabsContent>

        <TabsContent value="invoices">
          <InvoiceList
            invoices={rows}
            columns={columns}
            creating={creating}
            onCreated={() => setCreating(false)}
            onCancelCreate={() => setCreating(false)}
            openInvoiceId={openInvoiceId}
            filtered={search.invoiceFilter !== undefined}
            emptyText={invoices.isPending ? strings.status.loading : strings.invoice.empty}
            emptyFilteredText={strings.invoice.emptyFiltered}
          />
        </TabsContent>
      </Tabs>
    </ContentWidth>
  )
}

/** Enough for a practice's whole history today. What is *counted* no longer
 *  depends on it — the chips and the tiles ask the server (B3) — so this is a
 *  cap on the rows drawn and on nothing else. */
const PAGE_SIZE = 200
