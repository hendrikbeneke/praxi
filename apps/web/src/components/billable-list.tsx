import {
  activityLabel,
  activityTypeLabel,
  type BillableItem,
  formatBerlinDate,
  formatEuro,
} from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import { CollectDialog, type CollectPlanEntry } from '@/components/collect-dialog'
import { ListCard } from '@/components/list-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { billableQueryOptions, invoiceListQueryOptions } from '@/lib/invoices'
import { strings } from '@/lib/strings'

/**
 * Everything rendered and not yet claimed, across all contacts — the first
 * tab of Zahlungen (D7), previously the page at `/billable`.
 *
 * The activity's status is shown and **cannot be filtered on**: billability
 * does not depend on it (CLAUDE.md rule 6), so a filter could only hide work
 * that is still owed. A past activity still standing on "geplant" is exactly
 * the row worth noticing, which is why it is marked rather than hidden. The
 * API has no status parameter at all — see `billableQuerySchema`, and the
 * comment on `listBillableItems` in the domain.
 */
export function BillableList() {
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

  const selectedTotal = plan.reduce((sum, entry) => sum + entry.totalCents, 0)

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

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {items.isPending ? strings.status.loading : strings.billable.empty}
      </p>
    )
  }

  return (
    <>
      <p className="mb-4 max-w-3xl text-muted-foreground text-sm">{strings.billable.description}</p>

      {/* Room for the sticky footer, so the last row is never underneath it. */}
      <div className="space-y-4 pb-20">
        {groups.map((group) => {
          const ids = group.items.map((item) => item.id)
          const chosen = ids.filter((id) => selected.has(id)).length
          const sum = group.items.reduce(
            (total, item) => total + item.quantity * item.unitPriceCents,
            0,
          )

          return (
            <ListCard key={group.contactId}>
              <header className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-4 py-3">
                {/* Three-valued: a partly chosen contact shows the dash from
                    D2, which is what this checkbox was built for. Without it
                    a half-selected group read as fully unselected. */}
                <Checkbox
                  id={`group-${group.contactId}`}
                  checked={chosen === 0 ? false : chosen === ids.length ? true : 'indeterminate'}
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
                  <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
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
                      <Badge variant={item.activityStatus === 'no_show' ? 'secondary' : 'outline'}>
                        {strings.activity.statuses[item.activityStatus]}
                      </Badge>
                    )}

                    <span className="ml-auto tabular-nums">
                      {formatEuro(item.quantity * item.unitPriceCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </ListCard>
          )
        })}
      </div>

      {/* Fixed rather than in the page header: with many contacts the button
          scrolled out of sight exactly when the selection got interesting. */}
      <div className="sticky bottom-0 -mx-8 flex flex-wrap items-center gap-4 border-t bg-card px-8 py-3">
        <span className="text-sm">
          {selected.size === 0
            ? strings.payments.selectionEmpty
            : strings.payments.selection(selected.size)}
        </span>
        {selected.size > 0 && (
          <span className="font-medium tabular-nums">{formatEuro(selectedTotal)}</span>
        )}
        <Button
          className="ml-auto"
          disabled={selected.size === 0}
          onClick={() => setConfirming(true)}
        >
          <FileText className="size-4" aria-hidden />
          {strings.billable.collect}
        </Button>
      </div>

      <CollectDialog
        plan={plan}
        open={confirming}
        onOpenChange={(next) => {
          setConfirming(next)
          // The items are on a draft now; keeping them ticked would offer to
          // collect what is no longer collectable.
          if (!next) setSelected(new Set())
        }}
      />
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
