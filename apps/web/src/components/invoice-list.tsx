import {
  dueDate,
  formatBerlinDate,
  formatEuro,
  type Invoice,
  invoicePaymentState,
  type PaymentState,
  toBerlinDate,
} from '@praxi/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ContactPicker } from '@/components/contact-picker'
import { InlineDetailRow, useInlineDetail } from '@/components/inline-detail-row'
import { InvoiceDetail } from '@/components/invoice-detail'
import { invoiceColumnDefinitions } from '@/components/invoice-filter-bar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { createInvoice } from '@/lib/invoices'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/** A plain date rendered through the Berlin formatter needs an instant; midday
 *  can never fall on the wrong side of a timezone boundary. */
function formatDate(date: string): string {
  return formatBerlinDate(`${date}T12:00:00Z`)
}

/**
 * Every invoice and what its payments make of it — **the same table on the
 * Zahlungen page and in a contact's Rechnungen tab** (B3).
 *
 * The two were different screens until then: a table with seven columns and a
 * column picker here, a hand-built list of rows with three chips of its own
 * there. They are one list now, and it takes **no parameter to be one**: the
 * rows are handed in, the columns are handed in, and `contactId` reaches
 * nothing but the editor, where it decides whether the recipient is asked for
 * or already known.
 *
 * **The detail opens inside the row that was clicked**, spanning every column —
 * for writing an invoice as much as for reading one, so there is no jump to a
 * page of its own. `/invoices/$invoiceId` stays as an *address*, because three
 * other screens point at a document, but nothing on this list leads there: two
 * renderings of one record eventually say two different things about it, and
 * here the record is a document with legal weight.
 *
 * Nothing on this screen is stored. Every amount and every status comes out of
 * `invoicePaymentState()` on read (CLAUDE.md rule 9).
 */
export function InvoiceList({
  invoices,
  columns,
  contactId,
  creating = false,
  onCreated,
  onCancelCreate,
  openInvoiceId,
  emptyText,
  emptyFilteredText,
  filtered = false,
  className,
}: {
  invoices: readonly Invoice[]
  /** From `useInvoiceColumns()` — one preference for both screens. */
  columns: string[]
  /** Set inside a contact record. The **one difference between the two
   *  screens**: with it the draft is written the moment "Neue Rechnung" is
   *  pressed, without it the panel asks who it is for first. */
  contactId?: string | undefined
  creating?: boolean
  onCreated?: () => void
  onCancelCreate?: () => void
  /** Opened on arrival — the contact's overview links here at the draft it
   *  just started (L5's `activityId`, one record over). A *starting* state:
   *  clicking another row from here on is the ordinary toggle. */
  openInvoiceId?: string | undefined
  emptyText?: string
  emptyFilteredText?: string
  /** Whether a chip is pressed, so an empty list can say which kind of empty
   *  it is. */
  filtered?: boolean
  /** **How tall the card may get, which is what makes the header stick.** The
   *  rows scroll inside the card, so the card needs a bound, and only the
   *  container knows it: on Zahlungen it is a flex child filling what is left
   *  of the window, in a contact record it is capped against the viewport. */
  className?: string
}) {
  const detail = useInlineDetail(openInvoiceId)
  const today = toBerlinDate(new Date().toISOString())

  /** The draft just written, so it opens straight in edit mode — that way in
   *  means "write an invoice", every other one means "read this one". */
  const [created, setCreated] = useState<string | null>(null)

  const shown = columns.filter((key) => invoiceColumnDefinitions.some((entry) => entry.key === key))

  if (invoices.length === 0 && !creating) {
    return (
      <p className="text-muted-foreground text-sm">
        {(filtered ? emptyFilteredText : emptyText) ?? strings.invoice.empty}
      </p>
    )
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-[10px] border bg-card',
        className,
      )}
    >
      {/* **The rows scroll in here and the heading stays put** — the design
          draws the scrollbar inside the card, not at the window edge, and the
          same shape the contact list has had since L4. The wrapper `Table`
          brings is told to keep out of the way: an element that scrolls in one
          axis is a scrollport in both, so a sticky heading would anchor to it
          instead of to this box. */}
      <div className="min-h-0 flex-1 overflow-auto">
        <Table containerClassName="overflow-visible">
          {/* 14px in mixed case, like the contact list — the small caps of
              `listHeaderClass` are the catalogue lists' shape (K5), not this
              table's (K8).

              `bg-card` sits on the heading itself and the tint stays on the
              row: sticky means the rows pass *underneath*, and a 40 % tint on
              its own would let them show through. Composited the two are the
              colour the design draws. */}
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {shown.map((key) => (
                <TableHead
                  key={key}
                  className={cn('h-10 px-4 font-medium text-sm', isNumeric(key) && 'text-right')}
                >
                  {invoiceColumnDefinitions.find((entry) => entry.key === key)?.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {creating && (
              <InlineDetailRow colSpan={shown.length} className="bg-card">
                <CreatePanel
                  {...(contactId ? { contactId } : {})}
                  onCreated={(draft) => {
                    setCreated(draft.id)
                    detail.open(draft.id)
                    onCreated?.()
                  }}
                  onCancel={() => onCancelCreate?.()}
                />
              </InlineDetailRow>
            )}

            {invoices.map((invoice) => {
              const state = invoicePaymentState(invoice, invoice.paidCents, today)
              const open = detail.isOpen(invoice.id)

              return (
                <Fragment key={invoice.id}>
                  <TableRow
                    className={cn(
                      'cursor-pointer',
                      /* The one place this screen carries colour of its own.
                       `/10` rather than `/5`: on the dark theme a five-percent
                       tint over an already dark surface is not a marking. */
                      state.daysOverdue !== null && 'bg-destructive/10',
                      open && 'bg-muted/40',
                    )}
                    onClick={() => detail.toggle(invoice.id)}
                  >
                    {shown.map((key) => (
                      <TableCell
                        key={key}
                        className={cn('px-4', isNumeric(key) && 'text-right tabular-nums')}
                      >
                        <Cell column={key} invoice={invoice} state={state} />
                      </TableCell>
                    ))}
                  </TableRow>

                  {open && (
                    <InlineDetailRow colSpan={shown.length} className="bg-card">
                      <InvoiceDetail
                        key={invoice.id}
                        invoice={invoice}
                        startEditing={created === invoice.id}
                        onClose={detail.close}
                        onDiscarded={detail.close}
                      />
                    </InlineDetailRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function isNumeric(column: string): boolean {
  return column === 'total' || column === 'openAmount'
}

/**
 * Starting an invoice, in the row where it will stand (B3).
 *
 * **With a contact it asks nothing.** Pressing "Neue Rechnung" inside a record
 * *is* the decision, so the draft is written at once and the panel is gone by
 * the time anything is drawn — the row that appears is the ordinary editor, in
 * edit mode.
 *
 * Without one, the only thing missing is who it is for, so that is all this
 * asks. The rest of the invoice is edited in the row it lands in, which is why
 * this is a picker and not a second copy of the form: the design draws the
 * whole form here with an empty recipient, and a form standing for a record
 * that does not exist yet is exactly what CLAUDE.md refuses. What appears once
 * a contact is picked *is* that form, and it is backed by a real draft.
 *
 * The field is labelled "Kontakt" and not "Rechnungsempfänger", though the
 * design writes the latter: the two are different questions. This one asks
 * whose treatment is billed; the editor's field of that name asks which of
 * that contact's billing recipients the document goes to (L8). One word for
 * both is the one-string-two-purposes bug K4 and K5 each fixed once.
 */
function CreatePanel({
  contactId,
  onCreated,
  onCancel,
}: {
  contactId?: string | undefined
  onCreated: (draft: Invoice) => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const fieldId = useId()
  const [picked, setPicked] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (chosen: string) =>
      createInvoice({
        contactId: chosen,
        invoiceDate: toBerlinDate(new Date().toISOString()),
        activityItemIds: [],
      }),
    onSuccess: async (draft) => {
      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
      await queryClient.invalidateQueries({ queryKey: ['activities'] })
      toast.success(strings.invoice.created)
      onCreated(draft)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.invoice.saveFailed)
      onCancel()
    },
  })

  /* Mount is the trigger, because this row exists only while an invoice is
     being started. The ref is against StrictMode's double invocation, which
     would otherwise open two drafts. */
  const started = useRef(false)
  useEffect(() => {
    if (contactId !== undefined && !started.current) {
      started.current = true
      create.mutate(contactId)
    }
  }, [contactId, create.mutate])

  if (contactId !== undefined) {
    return <p className="text-muted-foreground text-sm">{strings.invoice.creating}</p>
  }

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="font-semibold">{strings.invoice.create}</span>
        <span className="text-[13px] text-muted-foreground">{strings.invoice.draftPending}</span>
      </p>

      <div className="max-w-lg">
        <Label htmlFor={fieldId}>{strings.invoice.forContact}</Label>
        <ContactPicker inputId={fieldId} value={picked} locked={false} onChange={setPicked} />
        <p className="mt-1 text-muted-foreground text-xs">{strings.invoice.createHint}</p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        <Button variant="ghost" onClick={onCancel} disabled={create.isPending}>
          {strings.actions.cancel}
        </Button>
        <Button
          disabled={picked === null || create.isPending}
          onClick={() => {
            if (picked !== null) create.mutate(picked)
          }}
        >
          {strings.invoice.createConfirm}
        </Button>
      </div>
    </div>
  )
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

/**
 * Who the document went to (L8), and this is deliberately not `contactName`.
 *
 * The snapshot first: once finalized, what the invoice says is what it went
 * to, whatever has happened to the contact since. Then the chosen recipient,
 * then the contact — which is what most rows are. The same chain the editor's
 * rail uses, so a row and the record it opens cannot disagree.
 */
function recipientOf(invoice: Invoice): string {
  return invoice.recipientSnapshot?.name ?? invoice.recipientName ?? invoice.contactName
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
        <span className="inline-flex flex-wrap items-baseline gap-2">
          {/* Drawn as a link, because that is what the design draws and what
              the cell does: it opens the document. It is not an anchor —
              the row expands rather than navigating (B3), and an anchor
              inside a clickable row would be two gestures on one line. */}
          <span className="font-medium underline underline-offset-2 tabular-nums">
            {invoice.number ?? strings.invoice.statuses.draft}
          </span>
          {invoice.type === 'cancellation_invoice' && (
            <Badge variant="secondary">{strings.invoice.types.cancellation_invoice}</Badge>
          )}
        </span>
      )
    case 'recipient':
      return <>{recipientOf(invoice)}</>
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
