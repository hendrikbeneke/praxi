import { type InvoiceListFilter, type InvoiceSummary, invoiceListFilters } from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FilterChips } from '@/components/chip'
import { type ColumnDefinition, ColumnPicker } from '@/components/column-picker'
import { strings } from '@/lib/strings'
import {
  updateUserPreferences,
  userPreferencesQueryKey,
  userPreferencesQueryOptions,
} from '@/lib/user-preferences'
import { cn } from '@/lib/utils'

/**
 * The seven columns of the design's invoice table — the same seven on both
 * screens, the contact's Rechnungen tab included (B3).
 *
 * **"Empfänger" is not redundant inside a contact record.** Since L8 the
 * invoice may be addressed to somebody else — the child is the patient, the
 * mother pays — so the column answers a question the surrounding page does
 * not: most rows say the contact, and the ones that do not are exactly the
 * ones worth seeing.
 *
 * The order is the design's, and `total` comes before `openAmount`: what was
 * demanded, then what is left of it.
 */
export const invoiceColumnDefinitions: ColumnDefinition[] = [
  { key: 'number', label: strings.invoice.number, locked: true },
  { key: 'recipient', label: strings.invoice.contact },
  { key: 'invoiceDate', label: strings.invoice.invoiceDate },
  { key: 'dueDate', label: strings.invoice.dueDate },
  { key: 'status', label: strings.invoice.statusLabel },
  { key: 'total', label: strings.invoice.total },
  { key: 'openAmount', label: strings.invoice.openAmount },
]

const DEFAULT_COLUMNS = invoiceColumnDefinitions.map((entry) => entry.key)

/**
 * Which columns this list shows and in what order — **one preference for both
 * screens**, because it is one list (B3). Reading it in a hook rather than in
 * the bar is what lets the bar and the table stay two components: the page
 * hangs its bar in a full-bleed band and its table below, and both need the
 * same array.
 *
 * A stored choice naming a column this list no longer has predates the change
 * and is **dropped whole**, not filtered down to its known part. Discarding
 * looks harsh until one sees what keeping it does: the array carries the
 * *order* as well as the selection, so the surviving keys would go on standing
 * in an order nobody chose. That is not theory — on the first pass of K8
 * "Betrag" and "Offen" stayed the wrong way round for exactly this reason. A
 * preference that mentions something gone is a preference from before the
 * change, and the honest answer to it is the current default.
 */
export function useInvoiceColumns(): {
  columns: string[]
  setColumns: (next: string[]) => void
} {
  const queryClient = useQueryClient()
  const preferences = useQuery(userPreferencesQueryOptions)
  const stored = preferences.data?.invoiceListColumns

  const columns =
    stored?.every((key) => invoiceColumnDefinitions.some((entry) => entry.key === key)) === true
      ? stored
      : DEFAULT_COLUMNS

  const save = useMutation({
    mutationFn: (next: string[]) => updateUserPreferences({ invoiceListColumns: next }),
    onMutate: (next) => {
      queryClient.setQueryData(userPreferencesQueryKey, (current) => ({
        ...(current ?? {}),
        invoiceListColumns: next,
      }))
    },
    onSuccess: (saved) => queryClient.setQueryData(userPreferencesQueryKey, saved),
  })

  return { columns, setColumns: (next) => save.mutate(next) }
}

/**
 * The band over the invoice table: the chips on the left, the column picker on
 * the right — identical on the Zahlungen page and in a contact's Rechnungen tab
 * (B3), which is the whole point of it being a component.
 *
 * **There is no summary sentence.** "1 Entwurf · 3 offen · 105,50 € ausstehend"
 * stood in front of the chips until B3 and said what the chips already say,
 * one word further left. The chips carry their numbers because on a filter a
 * count *is* the statement; a sentence repeating three of them is a second
 * place to keep in step for nothing.
 *
 * **The counts come from the server** and describe the selection, not the
 * narrowing: pressing a chip cannot change the number written on it. They were
 * folded out of the loaded rows until B3, and that list is capped at 200 — so
 * every figure here was the figure in the first page.
 *
 * `action` is the container's own button, not the bar's: on Zahlungen "Neue
 * Rechnung" lives in the page header, where it belongs to both tabs, and in
 * the contact record there is no page header to put it in. Same division as
 * `ActivityFilterBar` and "Neuer Vorgang" (B2).
 */
export function InvoiceFilterBar({
  summary,
  filter,
  onFilterChange,
  columns,
  onColumnsChange,
  action,
  className,
}: {
  summary: InvoiceSummary | undefined
  filter: InvoiceListFilter | undefined
  onFilterChange: (next: InvoiceListFilter | undefined) => void
  columns: string[]
  onColumnsChange: (next: string[]) => void
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <FilterChips
        all={{ label: strings.invoice.all, count: summary?.total }}
        chips={invoiceListFilters.map((entry) => ({
          id: entry,
          label: strings.invoice.filters[entry],
          count: summary?.[entry],
        }))}
        active={filter}
        onChange={onFilterChange}
      />

      <div className="ml-auto flex items-center gap-2">
        <ColumnPicker
          columns={invoiceColumnDefinitions}
          visible={columns}
          onChange={onColumnsChange}
        />
        {action}
      </div>
    </div>
  )
}
