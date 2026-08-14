import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/page-header'
import { strings } from '@/lib/strings'

/**
 * The consolidated "Zahlungen" area — Abrechenbar, Rechnungen and
 * Bezahlübersicht as tabs, coming in D7. Until then this is deliberately
 * empty rather than redirecting to the three routes it replaces in the
 * navigation, which stay reachable at their own URLs and get folded in and
 * deleted when D7 builds the real content (see WORKPLAN.md).
 */
export const Route = createFileRoute('/_app/payments')({
  component: PaymentsPage,
})

function PaymentsPage() {
  return <PlaceholderPage title={strings.nav.payments} note={strings.placeholder.empty} />
}
