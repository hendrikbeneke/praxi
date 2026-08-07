import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { strings } from '@/lib/strings'

export const Route = createFileRoute('/')({
  component: HomePage,
})

const berlinTime = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'Europe/Berlin',
})

function HomePage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await api.api.health.$get()
      if (!res.ok) throw new Error('health check failed')
      return res.json()
    },
  })

  return (
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
      <Button onClick={() => void health.refetch()} disabled={health.isFetching}>
        {strings.actions.recheck}
      </Button>
    </div>
  )
}
