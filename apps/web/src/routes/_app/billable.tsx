import {
  activityLabel,
  activityTypeLabel,
  type BillableItem,
  formatBerlinDate,
  formatEuro,
} from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import { CollectDialog, type CollectPlanEntry } from '@/components/collect-dialog'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { billableQueryOptions, invoiceListQueryOptions } from '@/lib/invoices'
import { strings } from '@/lib/strings'

export const Route = createFileRoute('/_app/billable')({
  component: BillablePage,
})

/**
 * Everything rendered and not yet claimed, across all contacts.
 *
 * The middle station of the money: **Abrechenbar → Rechnungen →
 * Bezahlübersicht** — work done and not yet demanded, demanded, demanded and
 * not yet paid.
 *
 * The activity's status is shown and **cannot be filtered on**: billability
 * does not depend on it (CLAUDE.md rule 6), so a filter could only hide work
 * that is still owed. A past activity still standing on "geplant" is exactly
 * the row worth noticing, which is why it is marked rather than hidden. The
 * API has no status parameter at all — see `billableQuerySchema`.
 */
function BillablePage() {
  const items = useQuery(billableQueryOptions())
  const types = useQuery(activityTypeListQueryOptions(true))
  // The drafts that already exist, so the confirmation can say "appended to"
  // rather than "created" before anything happens.
  const drafts = useQuery(invoiceListQueryOptions({ status: 'draft' }))

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)

  const rows = items.data ?? []
  const groups = groupByContact(rows)

  const draftByContact = new Map(
    (drafts.data ?? [])
      .filter((entry) => entry.type === 'invoice')
      .map((entry) => [entry.contactId, { id: entry.id, invoiceDate: entry.invoiceDate }]),
  )

  const plan: CollectPlanEntry[] = groups
    .map((group) => ({
      contactId: group.contactId,
      contactName: group.contactName,
      itemIds: group.items.filter((item) => selected.has(item.id)).map((item) => item.id),
      totalCents: group.items
        .filter((item) => selected.has(item.id))
        .reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0),
      existingDraft: draftByContact.get(group.contactId) ?? null,
    }))
    .filter((entry) => entry.itemIds.length > 0)

  function toggle(ids: readonly string[], checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  return (
    <>
      <PageHeader
        title={strings.billable.title}
        description={strings.billable.description}
        actions={
          <Button disabled={selected.size === 0} onClick={() => setConfirming(true)}>
            <FileText className="size-4" aria-hidden />
            {strings.billable.collect}
          </Button>
        }
      />

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {items.isPending ? strings.status.loading : strings.billable.empty}
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const ids = group.items.map((item) => item.id)
            const allChosen = ids.every((id) => selected.has(id))
            const sum = group.items.reduce(
              (total, item) => total + item.quantity * item.unitPriceCents,
              0,
            )

            return (
              <section key={group.contactId} className="rounded-md border">
                <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
                  <Checkbox
                    id={`group-${group.contactId}`}
                    checked={allChosen}
                    onCheckedChange={(checked) => toggle(ids, checked === true)}
                  />
                  <Label htmlFor={`group-${group.contactId}`} className="font-medium">
                    {group.contactName}
                  </Label>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {strings.contact.contactNumber} {group.contactNumber}
                  </span>
                  {draftByContact.has(group.contactId) && (
                    <Badge variant="outline">{strings.billable.draftExists}</Badge>
                  )}
                  <span className="ml-auto font-medium tabular-nums">{formatEuro(sum)}</span>
                </header>

                <ul className="divide-y">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm"
                    >
                      <Checkbox
                        id={`item-${item.id}`}
                        checked={selected.has(item.id)}
                        onCheckedChange={(checked) => toggle([item.id], checked === true)}
                      />
                      <span className="tabular-nums">{formatBerlinDate(item.occurredAt)}</span>

                      <Link
                        to="/contacts/$contactId"
                        params={{ contactId: item.contactId }}
                        className="text-muted-foreground underline underline-offset-2"
                      >
                        {activityLabel(
                          { title: item.activityTitle },
                          activityTypeLabel(types.data, item.activityType),
                        )}
                      </Link>

                      <Label htmlFor={`item-${item.id}`} className="font-normal">
                        {item.quantity}× {item.description}
                      </Label>

                      {/* Shown, never filtered on. A past activity still on
                          "geplant" should catch the eye, not disappear. */}
                      {item.activityStatus !== 'rendered' && (
                        <Badge
                          variant={item.activityStatus === 'no_show' ? 'secondary' : 'outline'}
                        >
                          {strings.activity.statuses[item.activityStatus]}
                        </Badge>
                      )}

                      <span className="ml-auto tabular-nums">
                        {formatEuro(item.quantity * item.unitPriceCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <CollectDialog plan={plan} open={confirming} onOpenChange={setConfirming} />
    </>
  )
}

type Group = {
  contactId: string
  contactName: string
  contactNumber: number
  items: BillableItem[]
}

/** The server already orders by contact and then by date, so grouping is a
 *  walk rather than a sort. */
function groupByContact(items: readonly BillableItem[]): Group[] {
  const groups: Group[] = []

  for (const item of items) {
    const last = groups.at(-1)
    if (last && last.contactId === item.contactId) last.items.push(item)
    else
      groups.push({
        contactId: item.contactId,
        contactName: item.contactName,
        contactNumber: item.contactNumber,
        items: [item],
      })
  }

  return groups
}
