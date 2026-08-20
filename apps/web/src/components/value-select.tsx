import { ReadValue } from '@/components/read-value'
import { SectionField, type SectionSpan } from '@/components/section-grid'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { strings } from '@/lib/strings'

/**
 * One field of the contact form whose values come from a catalogue (D-R3):
 * salutation, gender, country.
 *
 * Three fields with the same three states — read, choose, and "there is
 * nothing to choose from" — so one component rather than three copies. What
 * differs between them is the label and the wording of the empty case, both
 * passed in.
 *
 * **Read mode renders the entry's label, never its id**, which is the whole
 * reason this is not a plain `<select>`: the readable form of a value lives in
 * the option list, so read mode has to resolve it too (CLAUDE.md, "read mode
 * renders no fields").
 *
 * **The empty catalogue is a sentence, not an empty dropdown.** A select with
 * nothing in it looks broken and says nothing about why; the same shape the
 * roles section uses since 0035.
 */

/** A Radix select item cannot carry an empty value, so "none" needs a token of
 *  its own on the way through the dropdown. Folded back to `''` immediately. */
const NONE = 'none'

export type SelectableValue = { id: string; label: string }

export function ValueSelect({
  id,
  span,
  className,
  editing,
  label,
  noneLabel,
  emptyTitle,
  emptyHint,
  entries,
  value,
  onChange,
}: {
  id: string
  span?: SectionSpan
  className?: string
  editing: boolean
  label: string
  /** "Not recorded" as something one can pick *back*, not only a state one
   *  starts in. */
  noneLabel: string
  emptyTitle: string
  emptyHint: string
  entries: readonly SelectableValue[] | undefined
  /** `''` is none chosen — the form holds it as a string, see `contact-form`. */
  value: string
  onChange: (next: string) => void
}) {
  const chosen = entries?.find((entry) => entry.id === value)
  const isEmpty = entries !== undefined && entries.length === 0

  return (
    // The empty case takes the whole row: it is two sentences where the field
    // is a quarter of a row wide, and at that width it wraps into a column of
    // three-word lines.
    <SectionField span={isEmpty ? 12 : span} className={isEmpty ? undefined : className}>
      <Label htmlFor={editing ? id : undefined}>{label}</Label>
      {!editing ? (
        <ReadValue>{chosen?.label}</ReadValue>
      ) : isEmpty ? (
        <p className="mt-2 max-w-prose text-muted-foreground text-sm">
          <span className="font-medium text-foreground">{emptyTitle}</span> {emptyHint}{' '}
          {strings.contact.valueListEmptySettings}
        </p>
      ) : (
        <Select
          value={value === '' ? NONE : value}
          onValueChange={(next) => onChange(next === NONE ? '' : next)}
        >
          <SelectTrigger id={id} className="mt-2 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{noneLabel}</SelectItem>
            {(entries ?? []).map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </SectionField>
  )
}
