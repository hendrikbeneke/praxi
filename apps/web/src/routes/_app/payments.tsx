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
    /* The screen owns the window's height and the table scrolls inside its own
       card, so the band up here stays put without being sticky and the
       scrollbar belongs to the rows rather than to the window — the shape the
       contact list has had since L4 and Vorgänge since B2, and the one the
       design draws here (B3). The shell gives this route no padding
       (`lib/page-chrome.ts`). */
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
      className="flex h-full min-h-0 flex-col gap-0"
    >
      {/*
          Title, tiles and the chip row are one full-bleed band in card colour,
          and its bottom border is the rule the design runs across the whole
          width — the same shape as the Vorgänge filter band (B2) and the
          contact record's header strip (K6). The rule is why the band runs to
          the window edge while its *content* is capped: drawn under a capped
          block it would stop where the table stops, which is a line in the
          middle of the screen rather than a division of it.
        */}
      <div className="border-b bg-card px-8 pt-5 pb-3.5">
        <ContentWidth>
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
        </ContentWidth>
      </div>

      {/* Only the content below the rule is capped, and the cap sits on the
          column the two tabs fill — the invoice card scrolls inside itself,
          the billable list scrolls as a whole under its own fixed footer. */}
      <div className="flex min-h-0 flex-1 px-8">
        <ContentWidth className="flex min-h-0 flex-col pt-[18px] pb-7">
          <TabsContent value="billable" className="flex min-h-0 flex-1 flex-col">
            <BillableList onCollected={showInvoices} />
          </TabsContent>

          <TabsContent value="invoices" className="flex min-h-0 flex-1 flex-col">
            <InvoiceList
              className="min-h-0 flex-1"
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
        </ContentWidth>
      </div>
    </Tabs>
  )
}

/** Enough for a practice's whole history today. What is *counted* no longer
 *  depends on it — the chips and the tiles ask the server (B3) — so this is a
 *  cap on the rows drawn and on nothing else. */
const PAGE_SIZE = 200
