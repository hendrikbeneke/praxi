import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/page-header'
import { strings } from '@/lib/strings'

export const Route = createFileRoute('/_app/contacts')({
  component: () => (
    <PlaceholderPage title={strings.nav.contacts} note={strings.placeholder.comingSoon} />
  ),
})
