import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/page-header'
import { strings } from '@/lib/strings'

export const Route = createFileRoute('/_app/services')({
  component: () => (
    <PlaceholderPage title={strings.nav.services} note={strings.placeholder.comingSoon} />
  ),
})
