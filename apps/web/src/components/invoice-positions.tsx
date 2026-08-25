import {
  activityTypeColor,
  activityTypeLabel,
  type BillableItem,
  formatBerlinDate,
  formatBerlinTime,
  formatEuro,
  formatEuroAmount,
  type Invoice,
  type InvoiceLineInput,
  parseEuroAmount,
  type Service,
} from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { useState } from 'react'
import { ServicePicker } from '@/components/service-picker'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { billableQueryOptions } from '@/lib/invoices'
import { serviceGroupListQueryOptions, serviceListQueryOptions } from '@/lib/services'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/**
 * A position while the invoice is a draft.
 *
 * `activityItemId` is what decides everything about it. A position that came
 * out of a Vorgang belongs to that Vorgang and is only ever *chosen* onto this
 * invoice; a free one exists nowhere else and removing it deletes it. That is
 * the whole of the rule below, and it hangs on the kind rather than on the
 * mode — otherwise the same row would carry an X here and a checkbox there,
 * depending on where one stood.
 */
export type DraftLine = {
  key: string
  id?: string
  activityItemId: string | null
  /** The Vorgang the item belongs to and what it takes to name it — derived on
   *  read, all four null on a free line. Read mode names it under the
   *  position; edit mode groups by it. */
  activityId: string | null
  activityOccurredAt: string | null
  activityTypeId: string | null
  activityTitle: string | null
  description: string
  feeCode: string
  dateOfService: string | null
  quantity: number
  priceText: string
}

let keyCounter = 0
export function nextLineKey(): string {
  keyCounter += 1
  return `line-${keyCounter}`
}

export function lineFromStored(line: Invoice['lines'][number]): DraftLine {
  return {
    key: nextLineKey(),
    id: line.id,
    activityItemId: line.activityItemId,
    activityId: line.activityId,
    activityOccurredAt: line.activityOccurredAt,
    activityTypeId: line.activityTypeId,
    activityTitle: line.activityTitle,
    description: line.description,
    feeCode: line.feeCode ?? '',
    dateOfService: line.dateOfService,
    quantity: line.quantity,
    priceText: formatEuroAmount(line.unitPriceCents),
  }
}

export function lineFromBillable(item: BillableItem): DraftLine {
  return {
    key: nextLineKey(),
    activityItemId: item.id,
    activityId: item.activityId,
    activityOccurredAt: item.occurredAt,
    activityTypeId: item.activityTypeId,
    activityTitle: item.activityTitle,
    description: item.description,
    feeCode: item.feeCode ?? '',
    dateOfService: item.occurredAt.slice(0, 10),
    quantity: item.quantity,
    priceText: formatEuroAmount(item.unitPriceCents),
  }
}

export function lineToInput(line: DraftLine): InvoiceLineInput {
  return {
    ...(line.id ? { id: line.id } : {}),
    activityItemId: line.activityItemId,
    description: line.description.trim(),
    feeCode: line.feeCode.trim() === '' ? null : line.feeCode.trim(),
    dateOfService: line.dateOfService,
    quantity: line.quantity,
    unitPriceCents: parseEuroAmount(line.priceText) ?? 0,
  }
}

export function linePriceCents(line: DraftLine): number {
  return (parseEuroAmount(line.priceText) ?? 0) * line.quantity
}

/** One Vorgang and the positions of it that are still to be decided about —
 *  the ones on this draft and the ones still open. Anything already claimed by
 *  another invoice is in neither list and does not appear. */
type Group = {
  activityId: string
  occurredAt: string
  typeId: string
  title: string | null
  rows: GroupRow[]
}

/**
 * One position of a Vorgang, in one of three states while editing.
 *
 * - `line` set — it is on this invoice.
 * - `item` set — it is open and could be put on it.
 * - `detached` set — it was on it a moment ago and has been unticked. It has
 *   to stay visible, or unticking would make the row vanish and there would be
 *   no way to change one's mind before saving. It is not in the billable list
 *   either: that list still counts it as claimed until the draft is saved.
 */
type GroupRow = { line?: DraftLine; item?: BillableItem; detached?: DraftLine }

/**
 * The positions of an invoice draft (L8).
 *
 * **One list, not two.** Until L8 the screen showed the invoice's lines and,
 * under them, a separate "Abrechenbar" list to tick things onto it — two
 * places asking one question, and the answer to "is this session on the
 * invoice" depended on which of the two one happened to read. Here every
 * position of the contact that is still available stands once, grouped under
 * the Vorgang it came from, checked when it is on this invoice.
 *
 * **The gesture hangs on the kind of position, in both modes.** A Vorgang's
 * position is checked and unchecked — it belongs to the Vorgang, and getting
 * rid of it for good means marking it unbillable there. A free position is
 * removed with an X, because it exists on this invoice and nowhere else.
 *
 * The checkbox on a Vorgang's header is a *helper and not a unit*: what is
 * billed is always positions. It ticks all of the Vorgang's open positions,
 * and it shows as ticked only when every one of them is — the third state is
 * for the middle, which is a perfectly ordinary thing to want (one of two
 * positions of a session on this invoice, the other on the next).
 */
export function InvoicePositions({
  contactId,
  lines,
  setLines,
  editing,
  invoiceDate,
}: {
  contactId: string
  lines: DraftLine[]
  setLines: (next: DraftLine[]) => void
  editing: boolean
  /** What a free position is dated with — see `addFree`. */
  invoiceDate: string
}) {
  const billable = useQuery({ ...billableQueryOptions(contactId), enabled: editing })
  const services = useQuery({ ...serviceListQueryOptions(false), enabled: editing })
  const groups = useQuery({ ...serviceGroupListQueryOptions(false), enabled: editing })
  const types = useQuery(activityTypeListQueryOptions(true))

  /** What was unticked since editing began — see `GroupRow`.
   *
   *  It needs no reset: read mode and edit mode render this component from two
   *  different places in `invoice-detail.tsx`, so switching between them
   *  unmounts one and mounts the other, and there is nothing left to clear. */
  const [detached, setDetached] = useState<DraftLine[]>([])

  const fromActivities = lines.filter((line) => line.activityItemId !== null)
  const free = lines.filter((line) => line.activityItemId === null)

  const grouped = buildGroups(fromActivities, detached, billable.data ?? [])

  /**
   * Ticking and unticking, for one row or for a whole Vorgang.
   *
   * One pass over the rows rather than a call per row: every branch below
   * reads `lines`, so calling this twice in a loop would let the second call
   * overwrite the first with the state it had before it.
   */
  function apply(rows: readonly GroupRow[], on: boolean) {
    let nextLines = [...lines]
    let nextDetached = [...detached]

    for (const row of rows) {
      if ((row.line !== undefined) === on) continue

      if (!on) {
        const line = row.line
        if (!line) continue
        nextDetached = [...nextDetached, line]
        nextLines = nextLines.filter((entry) => entry.key !== line.key)
        continue
      }

      /* Back on: the line it was, if it was one a moment ago, so an edit made
         before unticking is not thrown away. Otherwise a fresh copy of the
         open item. */
      const back = row.detached ?? (row.item ? lineFromBillable(row.item) : undefined)
      if (!back) continue
      nextDetached = nextDetached.filter((entry) => entry.key !== back.key)
      nextLines = [...nextLines, back]
    }

    setLines(nextLines)
    setDetached(nextDetached)
  }

  function patchFree(key: string, change: Partial<DraftLine>) {
    setLines(lines.map((line) => (line.key === key ? { ...line, ...change } : line)))
  }

  function moveFree(key: string, by: number) {
    const index = lines.findIndex((line) => line.key === key)
    const other = index + by
    const a = lines[index]
    const b = lines[other]
    if (!a || !b) return
    const next = [...lines]
    next[index] = b
    next[other] = a
    setLines(next)
  }

  const total = lines.reduce((sum, line) => sum + linePriceCents(line), 0)

  if (!editing) {
    /**
     * **Read mode is flat.** Grouping exists so one can decide per Vorgang
     * what goes on the invoice; once the invoice says what it says there is
     * nothing to decide, and a header carrying a checkbox nobody can tick is
     * furniture. What is worth keeping is where a position came from, so each
     * one names its Vorgang and links to it — which is what the design draws.
     */
    return (
      <section>
        <p className="font-medium text-sm">{strings.invoice.lines}</p>

        {lines.length === 0 ? (
          <p className="mt-2 text-muted-foreground text-sm">{strings.invoice.emptyDraft}</p>
        ) : (
          <ul className="mt-2">
            {lines.map((line) => (
              <li key={line.key} className="border-t py-2 first:border-t-0">
                <span className="flex flex-wrap items-baseline gap-3">
                  <span className="w-8 shrink-0 text-muted-foreground text-sm tabular-nums">
                    {line.quantity}×
                  </span>
                  <span className="min-w-0 flex-1">
                    {line.description}
                    {line.feeCode !== '' && (
                      <span className="ml-2 text-muted-foreground text-xs">{line.feeCode}</span>
                    )}
                  </span>
                  <span className="text-right tabular-nums">
                    {formatEuro(linePriceCents(line))}
                  </span>
                </span>
                {line.activityId !== null && line.dateOfService !== null && (
                  <Link
                    className="ml-11 text-[12.5px] text-muted-foreground underline underline-offset-2"
                    to="/contacts/$contactId"
                    params={{ contactId }}
                    search={{ tab: 'activities', activityId: line.activityId }}
                  >
                    {strings.invoice.fromActivity(
                      formatBerlinDate(`${line.dateOfService}T12:00:00Z`),
                    )}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-1 flex items-baseline justify-between gap-4 border-t pt-3">
          <span className="font-medium">{strings.invoice.totalLong}</span>
          <span className="font-semibold text-lg tabular-nums">{formatEuro(total)}</span>
        </div>
      </section>
    )
  }

  return (
    <section>
      <p className="font-medium text-sm">{strings.invoice.lines}</p>
      {editing && <p className="mt-1 text-muted-foreground text-xs">{strings.invoice.linesHint}</p>}

      {grouped.length === 0 && free.length === 0 && (
        <p className="mt-3 text-muted-foreground text-sm">
          {editing ? strings.invoice.linesNothingOpen : strings.invoice.emptyDraft}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {grouped.map((group) => {
          const chosen = group.rows.filter((row) => row.line !== undefined).length
          const state = chosen === 0 ? false : chosen === group.rows.length ? true : 'indeterminate'

          return (
            <div key={group.activityId} className="overflow-hidden rounded-md border">
              <div className="flex items-center gap-2.5 border-b bg-muted/45 px-3 py-2">
                {editing && (
                  <Checkbox
                    aria-label={strings.invoice.lineGroupToggle}
                    checked={state}
                    onCheckedChange={(next) => apply(group.rows, next === true)}
                  />
                )}
                <span className="font-semibold text-[13.5px] tabular-nums">
                  {formatBerlinDate(group.occurredAt)}, {formatBerlinTime(group.occurredAt)}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[13px]">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: activityTypeColor(types.data, group.typeId) }}
                  />
                  {group.title ?? activityTypeLabel(types.data, group.typeId)}
                </span>
                <span className="ml-auto text-[13px] tabular-nums">
                  {formatEuro(
                    group.rows.reduce(
                      (sum, row) => sum + (row.line ? linePriceCents(row.line) : 0),
                      0,
                    ),
                  )}
                </span>
              </div>

              <ul>
                {group.rows.map((row) => {
                  const item = row.item
                  const line = row.line
                  const key = line?.key ?? row.detached?.key ?? item?.id ?? ''
                  return (
                    <li
                      key={key}
                      className={cn(
                        'flex flex-wrap items-center gap-2 px-3 py-2',
                        line === undefined && 'opacity-60',
                      )}
                    >
                      <Checkbox
                        aria-label={strings.invoice.lineToggle}
                        checked={line !== undefined}
                        onCheckedChange={(next) => apply([row], next === true)}
                      />
                      <PositionRow
                        line={line ?? row.detached}
                        fallback={item}
                        editing={line !== undefined}
                        onPatch={(change) => line && patchFree(line.key, change)}
                      />
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}

        {free.map((line) => (
          <div key={line.key} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
            <PositionRow
              line={line}
              editing={editing}
              onPatch={(change) => patchFree(line.key, change)}
            />
            {editing && (
              <div className="flex items-center gap-1">
                {/* The arrows stay on a free position, although no image shows
                    them: it has no date of its own to be ordered by, so its
                    place on the document is a decision. A Vorgang's positions
                    take their place from the Vorgang. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={strings.activity.itemMoveUp}
                  disabled={lines.indexOf(line) === 0}
                  onClick={() => moveFree(line.key, -1)}
                >
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={strings.activity.itemMoveDown}
                  disabled={lines.indexOf(line) === lines.length - 1}
                  onClick={() => moveFree(line.key, 1)}
                >
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={strings.invoice.lineRemove}
                  onClick={() => setLines(lines.filter((entry) => entry.key !== line.key))}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div className="mt-4 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <ServicePicker
              services={services.data ?? []}
              groups={groups.data ?? []}
              resetKey={lines.length}
              onPickService={(service) => setLines([...lines, freeFrom(service, invoiceDate)])}
              onPickGroup={(group) =>
                setLines([
                  ...lines,
                  ...group.items.flatMap((entry) => {
                    const service = (services.data ?? []).find((s) => s.id === entry.serviceId)
                    return service
                      ? Array.from({ length: entry.quantity }, () => freeFrom(service, invoiceDate))
                      : []
                  }),
                ])
              }
            />
          </div>
          <span className="text-muted-foreground text-sm">{strings.activity.addOr}</span>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setLines([
                ...lines,
                {
                  key: nextLineKey(),
                  activityItemId: null,
                  activityId: null,
                  activityOccurredAt: null,
                  activityTypeId: null,
                  activityTitle: null,
                  description: '',
                  feeCode: '',
                  dateOfService: invoiceDate,
                  quantity: 1,
                  priceText: '',
                },
              ])
            }
          >
            {strings.activity.addFreeShort}
          </Button>
        </div>
      )}

      <div className="mt-4 flex items-baseline justify-between gap-4 border-t pt-3">
        <span className="font-medium">{strings.invoice.totalLong}</span>
        <span className="font-semibold text-lg tabular-nums">{formatEuro(total)}</span>
      </div>
    </section>
  )
}

/** A catalogue pick becomes a *free* position: it exists on this invoice and
 *  in no Vorgang, so it is removed with an X like any other. Rule 5 — the
 *  description and the price are copied at the moment of picking. */
function freeFrom(service: Service, invoiceDate: string): DraftLine {
  return {
    key: nextLineKey(),
    activityItemId: null,
    activityId: null,
    activityOccurredAt: null,
    activityTypeId: null,
    activityTitle: null,
    description: service.description,
    feeCode: service.feeCode ?? '',
    dateOfService: invoiceDate,
    quantity: 1,
    priceText: formatEuroAmount(service.defaultPriceCents),
  }
}

/** The four fields of a position, in the design's single line. The labels are
 *  `aria-label` rather than headings above each field — four of them repeated
 *  per row was a wall of small print (L7). */
function PositionRow({
  line,
  fallback,
  editing,
  onPatch,
}: {
  line: DraftLine | undefined
  fallback?: BillableItem | undefined
  editing: boolean
  onPatch: (change: Partial<DraftLine>) => void
}) {
  const description = line?.description ?? fallback?.description ?? ''
  const feeCode = line?.feeCode ?? fallback?.feeCode ?? ''
  const quantity = line?.quantity ?? fallback?.quantity ?? 1
  const priceText = line?.priceText ?? formatEuroAmount(fallback?.unitPriceCents ?? 0)

  if (!editing) {
    return (
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-3">
        <span className="w-8 shrink-0 text-muted-foreground text-sm tabular-nums">{quantity}×</span>
        <span className="min-w-0 flex-1">
          {description}
          {feeCode && <span className="ml-2 text-muted-foreground text-xs">{feeCode}</span>}
        </span>
        <span className="text-right tabular-nums">
          {formatEuro((parseEuroAmount(priceText) ?? 0) * quantity)}
        </span>
      </span>
    )
  }

  return (
    <>
      <Input
        aria-label={strings.activity.itemQuantity}
        type="number"
        min={1}
        className="w-16"
        value={quantity}
        onChange={(event) =>
          onPatch({ quantity: Math.max(1, Number.parseInt(event.target.value, 10) || 1) })
        }
      />
      <Input
        aria-label={strings.activity.itemDescription}
        placeholder={strings.activity.itemDescription}
        className="min-w-40 flex-1"
        value={description}
        onChange={(event) => onPatch({ description: event.target.value })}
      />
      <Input
        aria-label={strings.activity.itemFeeCode}
        placeholder={strings.activity.itemFeeCode}
        className="w-20"
        value={feeCode}
        onChange={(event) => onPatch({ feeCode: event.target.value })}
      />
      <Input
        aria-label={strings.activity.itemPrice}
        inputMode="decimal"
        className="w-24 text-right tabular-nums"
        value={priceText}
        onChange={(event) => onPatch({ priceText: event.target.value })}
      />
    </>
  )
}

/**
 * The Vorgänge this invoice draws on, newest first.
 *
 * Two sources that cannot overlap: the lines already on the draft, and the
 * contact's billable items — a draft counts as claiming its items, so anything
 * on this invoice is absent from the second list by construction. Anything on
 * *another* invoice is in neither, which is what "not selectable and not
 * counted" means here: it does not appear at all.
 *
 * Only reached in edit mode — read mode is flat, because there is nothing left
 * to decide (see above).
 */
function buildGroups(
  lines: DraftLine[],
  detached: readonly DraftLine[],
  billable: readonly BillableItem[],
): Group[] {
  const byActivity = new Map<string, Group>()

  const ensure = (
    activityId: string,
    occurredAt: string,
    typeId: string,
    title: string | null,
  ): Group => {
    const found = byActivity.get(activityId)
    if (found) return found
    const created: Group = { activityId, occurredAt, typeId, title, rows: [] }
    byActivity.set(activityId, created)
    return created
  }

  for (const item of billable) {
    ensure(item.activityId, item.occurredAt, item.activityTypeId, item.activityTitle).rows.push({
      item,
    })
  }

  /* A line's Vorgang is known from the billable list where the item is still
     open, and otherwise from the line itself — which is why the payload
     carries `activityId` per line. Where neither says (a line whose Vorgang
     was deleted, which the foreign key forbids) it lands in its own group. */
  for (const line of [...lines, ...detached]) {
    const isDetached = detached.includes(line)
    const known = [...byActivity.values()].find((group) =>
      group.rows.some((row) => row.item?.id === line.activityItemId),
    )
    if (known) {
      const row = known.rows.find((entry) => entry.item?.id === line.activityItemId)
      if (row) {
        if (isDetached) row.detached = line
        else row.line = line
      }
      continue
    }

    /* A position already on this draft is not in the billable list — a draft
       counts as claiming its items — so its Vorgang comes from the line
       itself, which is what `activityOccurredAt` and the two beside it are
       for. Without them a group header could only say a date. */
    ensure(
      line.activityId ?? `line:${line.activityItemId}`,
      line.activityOccurredAt ?? `${line.dateOfService ?? ''}T00:00:00.000Z`,
      line.activityTypeId ?? '',
      line.activityTitle,
    ).rows.push(isDetached ? { detached: line } : { line })
  }

  const groups = [...byActivity.values()]
  groups.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  return groups
}
