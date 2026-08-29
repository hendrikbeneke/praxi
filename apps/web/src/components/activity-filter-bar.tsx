import type { ActivitySummary } from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import type * as React from 'react'
import { useId } from 'react'
import { FilterChips } from '@/components/chip'
import { DateField } from '@/components/date-field'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type ActivityFilterValue, activityChips } from '@/lib/activity-filters'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/** The value the type picker carries when nothing is picked. A `<Select>` has
 *  no empty item, so the absence needs a name. */
const ALL_TYPES = 'all'

/**
 * What stands above a list of Vorgänge: the window, the type, the chips (B2).
 *
 * **One component for the Vorgänge page and the contact's Vorgänge tab, and it
 * takes no parameter that varies between them.** The two used to disagree about
 * every part of this — the page filtered by window and type and held its filter
 * in the URL, the tab had five chips in `useState` — and a row of controls that
 * one screen has and the other does not is not the same screen twice.
 *
 * `summary` is the exception, and it is content rather than a switch: the
 * sentence the two screens write differs in what it counts (a whole practice
 * has money still unbilled; one contact's tab says how many and how many are
 * ahead), which is prose, not logic.
 *
 * What the counts must **not** follow is the chips — see
 * `activitySummaryParams`.
 */
export function ActivityFilterBar({
  value,
  onChange,
  summary,
  summaryText,
  className,
}: {
  value: ActivityFilterValue
  /** A patch, not the whole value: every control here changes one field. */
  onChange: (change: Partial<ActivityFilterValue>) => void
  /** Drives the numbers on the chips. Undefined while it is on its way, which
   *  the chips render as no number rather than as a nought. */
  summary: ActivitySummary | undefined
  summaryText?: React.ReactNode
  className?: string
}) {
  const types = useQuery(activityTypeListQueryOptions(true))
  const fieldId = useId()

  return (
    /* One wrapping row, bottom-aligned: the two date fields, the type filter,
       the chips and the summary sentence all sit on the same baseline. */
    <div className={cn('flex flex-wrap items-end gap-[18px]', className)}>
      <div>
        <Label htmlFor={`${fieldId}-from`}>{strings.activity.rangeFrom}</Label>
        <DateField
          id={`${fieldId}-from`}
          className="mt-1.5 w-40"
          value={value.from ?? ''}
          onChange={(iso: string) => onChange({ from: iso === '' ? undefined : iso })}
        />
      </div>
      <div>
        <Label htmlFor={`${fieldId}-to`}>{strings.activity.rangeTo}</Label>
        <DateField
          id={`${fieldId}-to`}
          className="mt-1.5 w-40"
          value={value.to ?? ''}
          onChange={(iso: string) => onChange({ to: iso === '' ? undefined : iso })}
        />
      </div>
      <div>
        <Label htmlFor={`${fieldId}-type`}>{strings.activity.type}</Label>
        <Select
          value={value.activityTypeId ?? ALL_TYPES}
          onValueChange={(picked) =>
            onChange({ activityTypeId: picked === ALL_TYPES ? undefined : picked })
          }
        >
          <SelectTrigger id={`${fieldId}-type`} className="mt-1.5 w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>{strings.activity.allTypes}</SelectItem>
            {/* An inactive type stays in the list while it is the one picked —
                otherwise the control would show nothing for a filter that is
                on. */}
            {(types.data ?? [])
              .filter((entry) => entry.active || entry.id === value.activityTypeId)
              .map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  {entry.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="pb-[7px]">
        <FilterChips
          chips={activityChips(summary)}
          active={value.filter}
          onChange={(next) => onChange({ filter: next })}
        />
      </div>

      {summaryText && <p className="pb-[9px] text-[13px] text-muted-foreground">{summaryText}</p>}
    </div>
  )
}
