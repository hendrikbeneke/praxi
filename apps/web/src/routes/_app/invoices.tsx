import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/page-header'
import { strings } from '@/lib/strings'

export const Route = createFileRoute('/_app/invoices')({
  component: () => (
    <PlaceholderPage title={strings.nav.invoices} note={strings.placeholder.comingSoon} />
  ),
})
