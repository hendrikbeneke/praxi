import type { PaymentState, PaymentStatus } from '@praxi/shared'
import { Badge } from '@/components/ui/badge'
import { strings } from '@/lib/strings'

/**
 * The payment state of one invoice, as a badge.
 *
 * One component, because it appears on the invoice screen, in the invoice list
 * and in the receivables view, and those three must not disagree about what
 * "teilweise bezahlt" looks like.
 *
 * Being overdue is the second axis (see `invoicePaymentState`), so it does not
 * replace the status — it is what turns the badge red and adds the days beside
 * it. Only the shadcn variants are used; the design pass comes after.
 */
const VARIANTS: Record<PaymentStatus, 'default' | 'secondary' | 'outline'> = {
  open: 'outline',
  partially_paid: 'outline',
  paid: 'default',
  overpaid: 'default',
  cancelled: 'secondary',
  cancellation: 'secondary',
}

export function PaymentStatusBadge({
  state,
  withDays = true,
}: {
  state: PaymentState
  /** Off where a column of its own already carries the days. */
  withDays?: boolean
}) {
  const overdue = state.daysOverdue !== null

  return (
    <span className="inline-flex items-center gap-2">
      <Badge variant={overdue ? 'destructive' : VARIANTS[state.status]}>
        {strings.payment.statuses[state.status]}
      </Badge>
      {overdue && withDays && state.daysOverdue !== null && (
        <span className="text-destructive text-xs">
          {strings.payment.overdueBy(state.daysOverdue)}
        </span>
      )}
    </span>
  )
}
