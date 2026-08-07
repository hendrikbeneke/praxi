import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/page-header'
import { strings } from '@/lib/strings'

export const Route = createFileRoute('/_app/appointments')({
  component: () => (
    <PlaceholderPage title={strings.nav.appointments} note={strings.placeholder.comingSoon} />
  ),
})
