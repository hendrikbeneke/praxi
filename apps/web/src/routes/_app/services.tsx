import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { ContentWidth } from '@/components/content-width'
import { PageHeader } from '@/components/page-header'
import { ServiceGroupList } from '@/components/service-group-list'
import { ServiceList } from '@/components/service-list'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { serviceListQueryOptions } from '@/lib/services'
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
          <TabsTrigger value="services">{strings.service.tabServices}</TabsTrigger>
          <TabsTrigger value="groups">{strings.service.tabGroups}</TabsTrigger>
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
