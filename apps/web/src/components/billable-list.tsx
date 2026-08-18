import {
  activityTypeColor,
  activityTypeLabel,
  type BillableItem,
  formatBerlinDate,
  formatEuro,
  readableTextOn,
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
import { cn } from '@/lib/utils'

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
  /** Which contacts the confirmation is about: every one with a selection, or
   *  the single one whose own button was pressed. */
  const [confirming, setConfirming] = useState<'all' | string | undefined>()

  const rows = items.data ?? []
  const groups = groupByContact(rows)

  const draftByContact = new Map(
    (drafts.data ?? [])
      .filter((entry) => entry.type === 'invoice')
      .map((entry) => [entry.contactId, { id: entry.id, invoiceDate: entry.invoiceDate }]),
  )

  const chosenOf = (group: Group) =>
    group.activities.flatMap((activity) => activity.items).filter((item) => selected.has(item.id))

  const plan: CollectPlanEntry[] = groups
    .map((group) => {
      const chosen = chosenOf(group)
      return {
        contactId: group.contactId,
        contactName: group.contactName,
        itemIds: chosen.map((item) => item.id),
        totalCents: sumOf(chosen),
        existingDraft: draftByContact.get(group.contactId) ?? null,
      }
    })
    .filter((entry) => entry.itemIds.length > 0)

  /* One contact or all of them — the same `collectBillableItems()` either way,
     which is what rule 6 means by one operation: the button on a group and the
     one in the footer differ only in how many ids they carry. */
  const confirmedPlan =
    confirming === 'all' || confirming === undefined
      ? plan
      : plan.filter((entry) => entry.contactId === confirming)

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
      {/* Before anything is picked the line explains the tab; afterwards it
          reports the selection. One place, two sentences (design). */}
      <p className="mb-2.5 flex min-h-8 items-center text-[13px] text-muted-foreground">
        {selected.size === 0
          ? strings.payments.billableHint
          : strings.payments.billableSelection(
              selected.size,
              formatEuro(selectedTotal),
              plan.length,
            )}
      </p>

      {/* Room for the sticky footer, so the last row is never underneath it. */}
      <div className="space-y-2.5 pb-20">
        {groups.map((group) => {
          const all = group.activities.flatMap((activity) => activity.items)
          const ids = all.map((item) => item.id)
          const chosen = chosenOf(group)
          const touched = chosen.length > 0

          return (
            <ListCard key={group.contactId} className={touched ? 'border-primary' : undefined}>
              <header
                className={cn(
                  'flex flex-wrap items-center gap-3 border-b px-4 py-[11px]',
                  touched ? 'bg-primary/7' : 'bg-muted/40',
                )}
              >
                {/* Three-valued: a partly chosen contact shows the dash from
                    D2, which is what this checkbox was built for. Without it
                    a half-selected group read as fully unselected. */}
                <Checkbox
                  id={`group-${group.contactId}`}
                  checked={
                    chosen.length === 0
                      ? false
                      : chosen.length === ids.length
                        ? true
                        : 'indeterminate'
                  }
                  onCheckedChange={(checked) => toggle(ids, checked === true)}
                />
                <Label htmlFor={`group-${group.contactId}`} className="font-medium">
                  {group.contactName}
                </Label>
                <span className="text-[12.5px] text-muted-foreground tabular-nums">
                  {strings.contact.numberShort} {group.contactNumber}
                </span>
                <span className="text-[12.5px] text-muted-foreground">
                  {strings.payments.groupActivities(group.activities.length)}
                </span>
                {draftByContact.has(group.contactId) && (
                  <Badge variant="outline">{strings.billable.draftExists}</Badge>
                )}

                <span className="ml-auto flex items-center gap-3">
                  {touched && (
                    <>
                      <span className="text-[12.5px] text-muted-foreground tabular-nums">
                        {strings.payments.groupSelection(chosen.length, formatEuro(sumOf(chosen)))}
                      </span>
                      <Button size="sm" onClick={() => setConfirming(group.contactId)}>
                        {strings.invoice.createAction}
                      </Button>
                    </>
                  )}
                  <span className="font-semibold tabular-nums">{formatEuro(sumOf(all))}</span>
                </span>
              </header>

              {group.activities.map((activity) => {
                const color = activityTypeColor(types.data, activity.activityType)
                const picked = activity.items.filter((item) => selected.has(item.id)).length

                return (
                  <div key={activity.activityId} className="border-t first:border-t-0">
                    <div className="flex flex-wrap items-center gap-2.5 px-4 py-[9px]">
                      <Checkbox
                        id={`activity-${activity.activityId}`}
                        checked={
                          picked === 0
                            ? false
                            : picked === activity.items.length
                              ? true
                              : 'indeterminate'
                        }
                        onCheckedChange={(checked) =>
                          toggle(
                            activity.items.map((item) => item.id),
                            checked === true,
                          )
                        }
                      />
                      <Label
                        htmlFor={`activity-${activity.activityId}`}
                        className="font-normal tabular-nums"
                      >
                        {formatBerlinDate(activity.occurredAt)}
                      </Label>
                      <span
                        className="rounded-[5px] px-[7px] py-0.5 text-[11.5px]"
                        style={{ backgroundColor: color, color: readableTextOn(color) }}
                      >
                        {activityTypeLabel(types.data, activity.activityType)}
                      </span>
                      {activity.activityTitle && (
                        <span className="text-[12.5px] text-muted-foreground">
                          {activity.activityTitle}
                        </span>
                      )}

                      {/* Shown, never filtered on. A past activity still on
                          "geplant" should catch the eye, not disappear. */}
                      {activity.activityStatus !== 'rendered' && (
                        <Badge
                          variant={activity.activityStatus === 'no_show' ? 'secondary' : 'outline'}
                        >
                          {strings.activity.statuses[activity.activityStatus]}
                        </Badge>
                      )}

                      <Link
                        to="/contacts/$contactId"
                        params={{ contactId: group.contactId }}
                        search={{ tab: 'activities' }}
                        className="text-[12.5px] text-muted-foreground underline underline-offset-2"
                      >
                        {strings.billable.openContact}
                      </Link>

                      <span className="ml-auto text-[13px] text-muted-foreground tabular-nums">
                        {formatEuro(sumOf(activity.items))}
                      </span>
                    </div>

                    {activity.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 py-1.5 pr-4 pl-[42px] text-sm"
                      >
                        <Checkbox
                          id={`item-${item.id}`}
                          checked={selected.has(item.id)}
                          onCheckedChange={(checked) => toggle([item.id], checked === true)}
                        />
                        <Label htmlFor={`item-${item.id}`} className="font-normal">
                          {item.quantity}× {item.description}
                        </Label>
                        <span className="ml-auto tabular-nums">
                          {formatEuro(item.quantity * item.unitPriceCents)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </ListCard>
          )
        })}
      </div>

      {/*
          Kept beside the per-contact button, though the design has only the
          latter. Both have their case: one contact settled on the spot, or
          several collected in one go — and the bulk way is a promise of rule 6
          ("all contacts in one transaction: a half-finished collect would
          leave the practitioner guessing which ones still need doing"). Fixed
          rather than in the page header, because with many contacts the button
          scrolled out of sight exactly when the selection got interesting
          (D7). Recorded in `docs/design-korrektur/abweichungen.md`.
        */}
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
          onClick={() => setConfirming('all')}
        >
          <FileText className="size-4" aria-hidden />
          {strings.billable.collect}
        </Button>
      </div>

      <CollectDialog
        plan={confirmedPlan}
        open={confirming !== undefined}
        onOpenChange={(next) => {
          if (next) return
          setConfirming(undefined)
          // The items are on a draft now; keeping them ticked would offer to
          // collect what is no longer collectable.
          setSelected(new Set())
        }}
      />
    </>
  )
}

type ActivityGroup = {
  activityId: string
  occurredAt: string
  activityTitle: string | null
  activityType: string
  activityStatus: BillableItem['activityStatus']
  items: BillableItem[]
}

type Group = {
  contactId: string
  contactName: string
  contactNumber: number
  activities: ActivityGroup[]
}

/**
 * Three levels, as the design has it: contact, then activity, then the items
 * of that activity.
 *
 * Flat under the contact — which is what this was until K8 — a session with
 * three items repeated its date and its name three times, and the row that
 * matters ("this whole session is not billed yet") had no place to stand at
 * all. The server already orders by contact and then by date, so both levels
 * are a walk rather than a sort.
 */
function groupByContact(items: readonly BillableItem[]): Group[] {
  const groups: Group[] = []

  for (const item of items) {
    let group = groups.at(-1)
    if (!group || group.contactId !== item.contactId) {
      group = {
        contactId: item.contactId,
        contactName: item.contactName,
        contactNumber: item.contactNumber,
        activities: [],
      }
      groups.push(group)
    }

    const activity = group.activities.at(-1)
    if (activity && activity.activityId === item.activityId) activity.items.push(item)
    else
      group.activities.push({
        activityId: item.activityId,
        occurredAt: item.occurredAt,
        activityTitle: item.activityTitle,
        activityType: item.activityType,
        activityStatus: item.activityStatus,
        items: [item],
      })
  }

  return groups
}

const sumOf = (items: readonly BillableItem[]) =>
  items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0)
