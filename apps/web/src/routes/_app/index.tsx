import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { strings } from '@/lib/strings'

export const Route = createFileRoute('/_app/')({
  component: DashboardPage,
})

const berlinTime = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'Europe/Berlin',
})

function DashboardPage() {
  const { user } = Route.useRouteContext()

  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await api.api.health.$get()
      if (!res.ok) throw new Error('health check failed')
      return res.json()
    },
  })

  return (
    <>
      <PageHeader title={strings.nav.dashboard} description={user.name} />

      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {health.isPending
            ? strings.status.loading
            : health.isError
              ? strings.status.serverUnreachable
              : `${strings.status.serverReachable} — ${strings.status.serverTime}: ${berlinTime.format(
                  new Date(health.data.time),
                )}`}
        </p>
        <Button
          variant="outline"
          onClick={() => void health.refetch()}
          disabled={health.isFetching}
        >
          {strings.actions.recheck}
        </Button>
      </div>
    </>
  )
}
