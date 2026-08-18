import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { tabChipClass } from '@/components/chip'
import { ContentWidth } from '@/components/content-width'
import { PageHeader } from '@/components/page-header'
import { ServiceGroupList } from '@/components/service-group-list'
import { ServiceList } from '@/components/service-list'
import { Button } from '@/components/ui/button'
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
  /* Owned here because the button that starts it lives in the page header now. */
  const [creating, setCreating] = useState(false)

  return (
    // The whole page is capped, header included — where the prototype
    // puts it on the three list screens (K1).
    <ContentWidth max={1180}>
      {/* The explanation and the "Neu" button live in the page header, where the
          design puts them — the third slot came with K1. Before that they had
          moved into the list card, which gave that card a title bar the design
          does not have there (K5). One button, its label following the tab, as
          the prototype switches `neuLabel`. */}
      <PageHeader
        title={strings.service.title}
        description={strings.service.description}
        note={strings.service.templateHint}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            {tab === 'groups' ? strings.service.groupCreate : strings.service.create}
          </Button>
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        {(
          [
            ['services', strings.service.tabServices, allServices.data?.length],
            ['groups', strings.service.tabGroups, allGroups.data?.length],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            className={tabChipClass(tab === value)}
            onClick={() =>
              void navigate({
                search: (previous) => ({
                  ...previous,
                  tab: value === 'services' ? undefined : 'groups',
                }),
              })
            }
          >
            {label}
            {/* Nothing while it loads: a tab reading "0" and then "9" claims an
                empty catalogue for a moment. */}
            {count !== undefined && (
              <span className="text-muted-foreground tabular-nums">{count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'groups' ? (
          <>
            {/* The groups tab carries its own sentence above the card — rule 5
                in one line, and the design puts it here rather than in a title
                bar (K5). */}
            <p className="mb-2.5 text-[13px] text-muted-foreground">{strings.service.groupHint}</p>
            <ServiceGroupList
              services={activeServices.data ?? []}
              creating={creating}
              onCreatingChange={setCreating}
            />
          </>
        ) : (
          <ServiceList creating={creating} onCreatingChange={setCreating} />
        )}
      </div>
    </ContentWidth>
  )
}
