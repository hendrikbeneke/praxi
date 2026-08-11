import { formatEuro, toBerlinDate } from '@praxi/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ApiError } from '@/lib/api'
import { collectBillable } from '@/lib/invoices'
import { strings } from '@/lib/strings'

/** What the dialog needs to know about one contact's share, worked out by the
 *  caller from data it already has. */
export type CollectPlanEntry = {
  contactId: string
  contactName: string
  itemIds: string[]
  totalCents: number
  /** The number of the draft the items will be appended to, `null` when a new
   *  one will be opened. A draft has no number yet, so this is its date. */
  existingDraft: { id: string; invoiceDate: string } | null
}

/**
 * The one confirmation both ways into billing use — the button on an activity
 * and the bulk action on the billable list.
 *
 * It says what will happen **before** it happens, per contact: a new draft, or
 * an addition to the one that is already open. The rule itself lives on the
 * server (`collectBillableItems`); this only reads it out, from the drafts the
 * screen has loaded anyway.
 */
export function CollectDialog({
  plan,
  open,
  onOpenChange,
  /** Where there is exactly one draft to look at afterwards, go there. The
   *  bulk action over several contacts has no single "it". */
  jumpToInvoice = false,
}: {
  plan: CollectPlanEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
  jumpToInvoice?: boolean
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const itemIds = plan.flatMap((entry) => entry.itemIds)
  const total = plan.reduce((sum, entry) => sum + entry.totalCents, 0)

  const collect = useMutation({
    mutationFn: () =>
      collectBillable({
        activityItemIds: itemIds,
        invoiceDate: toBerlinDate(new Date().toISOString()),
      }),
    onSuccess: async (results) => {
      // Activities carry their billing state, so they are stale too.
      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
      await queryClient.invalidateQueries({ queryKey: ['activities'] })

      onOpenChange(false)
      toast.success(strings.billable.collected(results.length))

      const first = results[0]
      if (jumpToInvoice && first) {
        void navigate({ to: '/invoices/$invoiceId', params: { invoiceId: first.invoiceId } })
      }
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.invoice.saveFailed)
    },
  })

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{strings.billable.collectTitle}</AlertDialogTitle>
          <AlertDialogDescription>{strings.billable.collectBody}</AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="space-y-2 text-sm">
          {plan.map((entry) => (
            <li key={entry.contactId} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{entry.contactName}</span>
              <span className="text-muted-foreground">
                {entry.existingDraft
                  ? strings.billable.willAppend(entry.itemIds.length)
                  : strings.billable.willCreate(entry.itemIds.length)}
              </span>
              <span className="ml-auto tabular-nums">{formatEuro(entry.totalCents)}</span>
            </li>
          ))}
        </ul>

        {plan.length > 1 && (
          <p className="text-right text-sm">
            {strings.billable.total} <span className="font-medium">{formatEuro(total)}</span>
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{strings.actions.back}</AlertDialogCancel>
          <AlertDialogAction
            disabled={collect.isPending || itemIds.length === 0}
            onClick={(event) => {
              // The dialog closes on its own after the call, not before it.
              event.preventDefault()
              collect.mutate()
            }}
          >
            {strings.billable.collectConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
