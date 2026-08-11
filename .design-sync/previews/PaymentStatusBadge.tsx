import type { PaymentState } from '@praxi/shared'
import { PaymentStatusBadge } from '@/components/payment-status'

function state(overrides: Partial<PaymentState>): PaymentState {
  return {
    status: 'open',
    paidCents: 0,
    openCents: 0,
    dueDate: '2026-08-01',
    daysOverdue: null,
    ...overrides,
  }
}

export function AlleStati() {
  return (
    <div className="flex flex-col items-start gap-3">
      <PaymentStatusBadge state={state({ status: 'open' })} />
      <PaymentStatusBadge state={state({ status: 'partially_paid' })} />
      <PaymentStatusBadge state={state({ status: 'paid', daysOverdue: null })} />
      <PaymentStatusBadge state={state({ status: 'overpaid' })} />
      <PaymentStatusBadge state={state({ status: 'cancelled' })} />
      <PaymentStatusBadge state={state({ status: 'cancellation' })} />
    </div>
  )
}

export function Ueberfaellig() {
  return <PaymentStatusBadge state={state({ status: 'open', daysOverdue: 12 })} />
}
