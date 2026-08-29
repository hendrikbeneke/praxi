import { formatEuro } from '@praxi/shared'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { ActivityFilterBar } from '@/components/activity-filter-bar'
import { ActivityList } from '@/components/activity-list'
import { ContentWidth } from '@/components/content-width'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  activitySummaryQueryOptions,
  pastActivitiesQueryOptions,
  upcomingActivitiesQueryOptions,
} from '@/lib/activities'
import {
  type ActivityFilterValue,
  activityFilterSearchSchema,
  activityListParams,
  activitySummaryParams,
} from '@/lib/activity-filters'
import { strings } from '@/lib/strings'

/** Dates, a chip and a type id — nothing personal, so the URL may carry them.
 *  The same four the contact's Vorgänge tab carries, out of the same schema
 *  (B2). Which row is expanded is not in here: it is a scroll position, not a
 *  place, and it belongs to the visit rather than to the address. */
export const Route = createFileRoute('/_app/activities')({
  validateSearch: activityFilterSearchSchema,
  component: ActivitiesPage,
})

function ActivitiesPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const setSearch = (change: Partial<ActivityFilterValue>) =>
    void navigate({ search: (previous) => ({ ...previous, ...change }) })

  /** Two queries, two rules (L3): the future is finite and comes whole, the
   *  past is not and comes fifty at a time. */
  const listParams = activityListParams(undefined, search)
  const upcoming = useQuery(upcomingActivitiesQueryOptions(listParams))
  const past = useInfiniteQuery(pastActivitiesQueryOptions(listParams))
  /**
   * Its own request, unlike D7's invoice list, which counts the 200 rows it
   * loaded. The reason is the data, not a change of mind: the list here is
   * paged, and a browser cannot count what it never fetched — a chip whose
   * number changes as one scrolls is worse than a chip with no number.
   */
  const summary = useQuery(activitySummaryQueryOptions(activitySummaryParams(undefined, search)))

  const [creating, setCreating] = useState(false)
  const counts = summary.data

  return (
    /* The screen owns the window's height and the list scrolls inside it, so
       the filter band stays put without being sticky and the scrollbar belongs
       to the entries rather than to the window (B2). Same shape as the contact
       list (L4); the shell gives this route no padding
       (`lib/page-chrome.ts`). */
    <div className="flex h-full min-h-0 flex-col">
      {/*
          Title, filters, chips and the summary are one full-bleed band in card
          colour, and its bottom border is the rule the design runs across the
          whole width — the same shape as the contact record's header strip
          (K6). The rule is why the band runs to the window edge while its
          *content* is capped: drawn under a capped block it would stop where
          the list stops, which is not a division of the screen but a line in
          the middle of it. The cap on the content is what puts "Neuer Vorgang"
          flush with the entries below it.
        */}
      <div className="border-b bg-card px-8 pt-[22px] pb-3.5">
        <ContentWidth>
          <PageHeader
            className="mb-0"
            title={strings.activity.title}
            description={strings.activity.description}
            actions={
              <Button onClick={() => setCreating(true)}>
                <Plus className="size-4" aria-hidden />
                {strings.activity.create}
              </Button>
            }
          />

          <ActivityFilterBar
            className="mt-4"
            value={search}
            onChange={setSearch}
            summary={counts}
            summaryText={
              counts &&
              strings.activity.summary(
                counts.total,
                counts.upcoming,
                formatEuro(counts.unbilledCents),
              )
            }
          />
        </ContentWidth>
      </div>

      {/* Only the list is capped; the band above runs to the window edge,
          which is what carries its full-width rule (K1). The cap sits on the
          scrolling element itself, so its scrollbar lands at the edge of the
          cards and not at the edge of the window. */}
      <div className="flex min-h-0 flex-1 px-8">
        <ContentWidth className="min-h-0 overflow-auto pt-[18px] pb-12">
          <ActivityList
            upcoming={upcoming.data ?? []}
            past={past.data?.pages.flatMap((page) => page.items) ?? []}
            emptyText={
              upcoming.isPending || past.isPending ? strings.status.loading : strings.activity.empty
            }
            creating={creating}
            onCreated={() => setCreating(false)}
            onCancelCreate={() => setCreating(false)}
            hasMorePast={past.hasNextPage}
            loadingMorePast={past.isFetchingNextPage}
            onLoadMorePast={() => void past.fetchNextPage()}
          />
        </ContentWidth>
      </div>
    </div>
  )
}
