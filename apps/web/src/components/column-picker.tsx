import { Columns3 } from 'lucide-react'
import { useState } from 'react'
import { OrderButtons } from '@/components/catalogue-controls'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { strings } from '@/lib/strings'

/**
 * Column visibility and order, per list (design handoff, "Spaltenauswahl").
 * Reordered with `OrderButtons`, the same arrows every catalogue list uses —
 * the prototype dragged the columns, which is its own rule 6 broken; the rule
 * wins (CLAUDE.md D2).
 *
 * Purely a controlled component: it knows nothing about `app_user.preferences`
 * or which screen it is on. `visible` is the full state — an array of column
 * keys, membership is visibility and array order is display order — and
 * `onChange` reports the next array. Whichever screen wires this up owns
 * reading and saving that array under its own flat preference key
 * (`contactListColumns`, and so on — never nested, see `userPreferencesSchema`).
 *
 * A column not in `columns` at all cannot appear here; a hidden column keeps
 * no remembered position of its own and is appended at the end of the visible
 * ones when it is switched back on, in the order `columns` lists it.
 */
export type ColumnDefinition = {
  key: string
  label: string
  /** Cannot be hidden — a list needs at least one column that always
   *  identifies the row, e.g. a name. */
  locked?: boolean
}

export function ColumnPicker({
  columns,
  visible,
  onChange,
}: {
  columns: ColumnDefinition[]
  visible: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)

  const byKey = new Map(columns.map((column) => [column.key, column]))
  const visibleColumns = visible
    .map((key) => byKey.get(key))
    .filter((column): column is ColumnDefinition => column !== undefined)
  const hiddenColumns = columns.filter((column) => !visible.includes(column.key))

  function setChecked(key: string, checked: boolean) {
    if (byKey.get(key)?.locked) return
    onChange(checked ? [...visible, key] : visible.filter((existing) => existing !== key))
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= visible.length) return
    const next = [...visible]
    const [moved] = next.splice(index, 1)
    if (!moved) return
    next.splice(target, 0, moved)
    onChange(next)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <Columns3 className="size-4" aria-hidden />
          {strings.catalogue.columns}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <p className="mb-2 text-muted-foreground text-xs">{strings.catalogue.visibleColumns}</p>
        <div className="flex flex-col gap-1">
          {visibleColumns.map((column, index) => (
            <div key={column.key} className="flex items-center gap-2">
              <Checkbox
                id={`column-picker-${column.key}`}
                checked
                disabled={column.locked}
                onCheckedChange={(checked) => setChecked(column.key, checked === true)}
              />
              <Label htmlFor={`column-picker-${column.key}`} className="flex-1 font-normal">
                {column.label}
              </Label>
              <OrderButtons
                index={index}
                count={visibleColumns.length}
                pending={false}
                onMove={move}
              />
            </div>
          ))}
          {hiddenColumns.map((column) => (
            <div key={column.key} className="flex items-center gap-2 py-1">
              <Checkbox
                id={`column-picker-${column.key}`}
                checked={false}
                onCheckedChange={(checked) => setChecked(column.key, checked === true)}
              />
              <Label
                htmlFor={`column-picker-${column.key}`}
                className="flex-1 font-normal text-muted-foreground"
              >
                {column.label}
              </Label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
