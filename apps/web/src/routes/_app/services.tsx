import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { ContentWidth } from '@/components/content-width'
import { PageHeader } from '@/components/page-header'
import { ServiceGroupList } from '@/components/service-group-list'
import { ServiceList } from '@/components/service-list'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { serviceGroupListQueryOptions, serviceListQueryOptions } from '@/lib/services'
import { strings } from '@/lib/strings'

/** Nothing personal here, so the tab may live in the URL. */
const searchSchema = z.object({
  tab: z.enum(['services', 'groups']).optional(),
})

export const Route = createFileRoute('/_app/services')({
  validateSearch: searchSchema,
  component: ServicesPage,
})

function ServicesPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const tab = search.tab ?? 'services'

  // The group editor's picker must not offer a service that no longer applies.
  const activeServices = useQuery(serviceListQueryOptions(false))
  /* The counts on the tabs. Same query keys the two lists inside already use,
     so this is a cache read and not a second request — and it has to include
     the inactive entries, because the lists show them too (K3). */
  const allServices = useQuery(serviceListQueryOptions(true))
  const allGroups = useQuery(serviceGroupListQueryOptions(true))

  return (
    // The whole page is capped, header included — where the prototype
    // puts it on the three list screens (K1).
    <ContentWidth max={1180}>
      <PageHeader title={strings.service.title} description={strings.service.description} />

      <Tabs
        value={tab}
        onValueChange={(value) =>
          void navigate({
            search: (previous) => ({
              ...previous,
              tab: value === 'services' ? undefined : 'groups',
            }),
          })
        }
      >
        <TabsList>
          <TabsTrigger value="services">
            {strings.service.tabServices}
            <TabCount count={allServices.data?.length} />
          </TabsTrigger>
          <TabsTrigger value="groups">
            {strings.service.tabGroups}
            <TabCount count={allGroups.data?.length} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="pt-6">
          <ServiceList />
        </TabsContent>

        <TabsContent value="groups" className="pt-6">
          <ServiceGroupList services={activeServices.data ?? []} />
        </TabsContent>
      </Tabs>
    </ContentWidth>
  )
}

/** The number beside a tab's name — muted and after the label, the way the
 *  design sets it. Nothing while the count is still loading: a tab that says
 *  "0" and then "9" claims an empty catalogue for a moment. */
function TabCount({ count }: { count: number | undefined }) {
  if (count === undefined) return null
  return <span className="text-muted-foreground tabular-nums">{count}</span>
}
