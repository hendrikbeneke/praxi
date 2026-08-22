import { Columns3, GripVertical } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/**
 * Column visibility and order, per list.
 *
 * **Reordered by dragging** (L4), which is what the design shows and says —
 * a grip on every row and the line "Zum Sortieren ziehen." It had arrows
 * until then, from D2, on the argument that the prototype's dragging broke
 * its own rule; the images overrule that.
 *
 * The grip is also **operable from the keyboard**: it takes focus and the up
 * and down arrows move the row. Dragging alone is not a feature for everyone
 * who has to use this — and unlike a visible pair of buttons it costs the
 * design nothing.
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
  /** The row under the cursor while something is being dragged, so the list
   *  shows where it would land. */
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  const byKey = new Map(columns.map((column) => [column.key, column]))
  const visibleColumns = visible
    .map((key) => byKey.get(key))
    .filter((column): column is ColumnDefinition => column !== undefined)
  const hiddenColumns = columns.filter((column) => !visible.includes(column.key))

  function setChecked(key: string, checked: boolean) {
    if (byKey.get(key)?.locked) return
    onChange(checked ? [...visible, key] : visible.filter((existing) => existing !== key))
  }

  /** Puts `key` where `target` currently is. The one operation behind both
   *  the drag and the arrow keys, so the two cannot disagree. */
  function moveTo(key: string, target: number) {
    const from = visible.indexOf(key)
    if (from === -1 || target < 0 || target >= visible.length || target === from) return
    const next = [...visible]
    const [moved] = next.splice(from, 1)
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
        <p className="text-muted-foreground text-xs">{strings.catalogue.visibleColumns}</p>
        <p className="mb-2 text-muted-foreground text-xs">{strings.catalogue.dragToOrder}</p>
        {/* Fourteen columns on the contact list, and more are cheap — the
            popover scrolls rather than growing past the window. */}
        <ul className="flex max-h-[min(60svh,26rem)] flex-col gap-1 overflow-y-auto">
          {visibleColumns.map((column, index) => (
            <li
              key={column.key}
              onDragOver={(event) => {
                event.preventDefault()
                setOver(column.key)
              }}
              onDrop={(event) => {
                event.preventDefault()
                /* The key comes out of the payload rather than out of state:
                   `dragstart` only *requests* a re-render, so a drop that
                   lands before React has committed one would read the state
                   as it was — nothing dragged, nothing moved. What the drag
                   carries is true the moment it starts. */
                const key = event.dataTransfer.getData('text/plain') || dragging
                if (key) moveTo(key, index)
                setDragging(null)
                setOver(null)
              }}
              className={cn(
                'flex items-center gap-2 rounded-md px-1 py-0.5',
                over === column.key && dragging !== column.key && 'bg-accent',
                dragging === column.key && 'opacity-50',
              )}
            >
              <button
                type="button"
                draggable
                aria-label={strings.catalogue.moveColumn(column.label)}
                className="cursor-grab text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  // Firefox starts no drag at all without payload.
                  event.dataTransfer.setData('text/plain', column.key)
                  setDragging(column.key)
                }}
                onDragEnd={() => {
                  setDragging(null)
                  setOver(null)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                  event.preventDefault()
                  moveTo(column.key, index + (event.key === 'ArrowUp' ? -1 : 1))
                }}
              >
                <GripVertical className="size-4" aria-hidden />
              </button>
              <Checkbox
                id={`column-picker-${column.key}`}
                checked
                disabled={column.locked}
                onCheckedChange={(checked) => setChecked(column.key, checked === true)}
              />
              <Label htmlFor={`column-picker-${column.key}`} className="flex-1 font-normal">
                {column.label}
              </Label>
            </li>
          ))}
          {hiddenColumns.map((column) => (
            <li key={column.key} className="flex items-center gap-2 px-1 py-0.5">
              {/* No grip: a hidden column has no place in the order yet, and a
                  handle that moves nothing is a promise the row cannot keep. */}
              <span className="size-4" aria-hidden />
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
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
