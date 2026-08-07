import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/page-header'
import { strings } from '@/lib/strings'

export const Route = createFileRoute('/_app/activities')({
  component: () => (
    <PlaceholderPage title={strings.nav.activities} note={strings.placeholder.comingSoon} />
  ),
})
