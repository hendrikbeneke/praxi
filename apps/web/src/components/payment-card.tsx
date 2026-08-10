import {
  formatBerlinDate,
  formatEuro,
  formatEuroAmount,
  type Invoice,
  invoicePaymentState,
  type PaymentInput,
  type PaymentMethod,
  parseEuroAmount,
  paymentMethods,
  toBerlinDate,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PaymentStatusBadge } from '@/components/payment-status'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { addPayment, deletePayment, paymentListQueryOptions } from '@/lib/payments'
import { strings } from '@/lib/strings'

/** A plain date through the Berlin formatter needs an instant; midday can
 *  never fall on the wrong side of a timezone boundary. */
function formatDate(date: string): string {
  return formatBerlinDate(`${date}T12:00:00Z`)
}

/**
 * What was received on this invoice, and the entry form for the next payment
 * (CLAUDE.md rule 9).
 *
 * Only shown on a document, never on a draft: a draft is not a claim, and the
 * server refuses a payment against one twice over.
 *
 * The state on top is computed here from the invoice and the sum of its
 * payments, through the same `invoicePaymentState()` the receivables view
 * uses. Nothing is stored, so nothing can drift.
 */
export function PaymentCard({ invoice }: { invoice: Invoice }) {
  const queryClient = useQueryClient()
  const payments = useQuery(paymentListQueryOptions(invoice.id))
  const [open, setOpen] = useState(false)

  const rows = payments.data ?? []
  const paidCents = rows.reduce((total, row) => total + row.amountCents, 0)
  const state = invoicePaymentState(invoice, paidCents, toBerlinDate(new Date().toISOString()))

  /** Both queries: the invoice carries `paidCents` for the list, and the list
   *  itself shows the state. */
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['invoices'] })
    await queryClient.invalidateQueries({ queryKey: ['receivables'] })
  }

  const onError = (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : strings.payment.saveFailed)

  const record = useMutation({
    mutationFn: (input: PaymentInput) => addPayment(invoice.id, input),
    onSuccess: async () => {
      await refresh()
      setOpen(false)
      toast.success(strings.payment.saved)
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (paymentId: string) => deletePayment(invoice.id, paymentId),
    onSuccess: async () => {
      await refresh()
      toast.success(strings.payment.removed)
    },
    onError,
  })

  return (
    <section className="rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium text-sm">{strings.payment.title}</p>
        <PaymentStatusBadge state={state} />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          {strings.payment.sumPaid}:{' '}
          <span className="font-medium tabular-nums">{formatEuro(state.paidCents)}</span>
        </span>
        <span>
          {strings.payment.sumOpen}:{' '}
          <span className="font-medium tabular-nums">{formatEuro(state.openCents)}</span>
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-muted-foreground text-sm">
          {payments.isPending ? strings.status.loading : strings.payment.empty}
        </p>
      ) : (
        <ul className="mt-3 divide-y rounded-md border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="tabular-nums">{formatDate(row.paidOn)}</span>
              <span className="text-muted-foreground">
                {strings.payment.methods[row.method]}
                {row.note && ` · ${row.note}`}
              </span>
              <span className="ml-auto font-medium tabular-nums">
                {formatEuro(row.amountCents)}
              </span>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={strings.payment.remove}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{strings.payment.removeTitle}</AlertDialogTitle>
                    {/* Names the amount and the date: with several payments on
                        one invoice it is otherwise unclear which one is going. */}
                    <AlertDialogDescription>
                      {strings.payment.removeBody(
                        formatEuro(row.amountCents),
                        formatDate(row.paidOn),
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{strings.actions.cancel}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate(row.id)}>
                      {strings.actions.delete}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      )}

      <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        {strings.payment.add}
      </Button>

      {open && (
        <PaymentDialog
          openCents={state.openCents}
          pending={record.isPending}
          onClose={() => setOpen(false)}
          onSubmit={(input) => record.mutate(input)}
        />
      )}
    </section>
  )
}

/**
 * Entering one payment. The amount is prefilled with what is still open, which
 * is right for the common case and editable for every other — a part payment
 * is simply a smaller number.
 *
 * The method starts at `bank_transfer` every time rather than at whatever was
 * used last: hidden state nobody asked for is worse than one extra click.
 */
function PaymentDialog({
  openCents,
  pending,
  onClose,
  onSubmit,
}: {
  openCents: number
  pending: boolean
  onClose: () => void
  onSubmit: (input: PaymentInput) => void
}) {
  const today = toBerlinDate(new Date().toISOString())
  const [paidOn, setPaidOn] = useState(today)
  const [amountText, setAmountText] = useState(formatEuroAmount(openCents))
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer')
  const [note, setNote] = useState('')

  const amountCents = parseEuroAmount(amountText)
  const valid = amountCents !== null && amountCents !== 0 && paidOn !== ''

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{strings.payment.addTitle}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="payment-date">{strings.payment.paidOn}</Label>
            <Input
              id="payment-date"
              type="date"
              className="mt-2"
              value={paidOn}
              onChange={(event) => setPaidOn(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="payment-amount">{strings.payment.amount}</Label>
            <Input
              id="payment-amount"
              inputMode="decimal"
              className="mt-2"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
            />
            <p className="mt-1 text-muted-foreground text-xs">{strings.payment.amountHint}</p>
          </div>

          <div>
            <Label htmlFor="payment-method">{strings.payment.method}</Label>
            <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
              <SelectTrigger id="payment-method" className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((value) => (
                  <SelectItem key={value} value={value}>
                    {strings.payment.methods[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="payment-note">{strings.payment.note}</Label>
            <Input
              id="payment-note"
              className="mt-2"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {strings.actions.cancel}
          </Button>
          <Button
            disabled={pending || !valid}
            onClick={() =>
              amountCents !== null &&
              onSubmit({
                paidOn,
                amountCents,
                method,
                note: note.trim() === '' ? null : note.trim(),
              })
            }
          >
            {strings.payment.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
