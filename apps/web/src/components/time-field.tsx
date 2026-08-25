import { dateFormat, formatTimeDE, parseTimeDE } from '@praxi/shared'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { strings } from '@/lib/strings'

/**
 * The companion of `DateField`, and it exists for the second half of the same
 * reason: a native `<input type="time">` on an en-US browser offers a
 * twelve-hour clock with AM/PM. A session entered at the wrong half of the day
 * is an appointment nobody keeps.
 *
 * Value in and out is `HH:mm`, or `''`. Same contract as the date field: every
 * keystroke is reported, unreadable text reports nothing rather than leaving a
 * stale time behind, and the complaint waits for the field to be left.
 */

/** The reading of what is typed, without any opinion about where the complaint
 *  belongs on screen. Extracted in B1 so a caller that puts several time fields
 *  in one row can render one message underneath them all — see `TimeField`
 *  below for why that is not a layout preference. */
export function useTimeInput(value: string, onChange: (time: string) => void) {
  const [text, setText] = useState(() => formatTimeDE(value))
  const [invalid, setInvalid] = useState(false)

  // Only resynced when the value disagrees with what the text already means;
  // see DateField for why.
  useEffect(() => {
    setText((current) => ((parseTimeDE(current) ?? '') === value ? current : formatTimeDE(value)))
  }, [value])

  return {
    invalid,
    inputProps: {
      inputMode: 'numeric' as const,
      autoComplete: 'off',
      placeholder: dateFormat.timePlaceholder,
      'aria-invalid': invalid ? (true as const) : undefined,
      value: text,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        setText(event.target.value)
        setInvalid(false)
        onChange(parseTimeDE(event.target.value) ?? '')
      },
      onBlur: () => {
        const time = parseTimeDE(text)
        if (time !== null) {
          setText(formatTimeDE(time))
          setInvalid(false)
        } else {
          setInvalid(text.trim() !== '')
        }
      },
    },
  }
}

/** The one sentence a rejected time gets, so the two places that render it
 *  cannot word it differently. */
export function timeInvalidMessage(): string {
  return strings.date.timeInvalid(dateFormat.timeExample)
}

/**
 * A time field that carries its own complaint underneath it — the shape every
 * caller wants where the field stands alone in a column.
 *
 * **Where two of them share a row, use `useTimeInput` instead** (B1, M1). The
 * message is around eighteen characters wider than the field, and the opening
 * hours are the case that proves what that costs: in flow it wrapped to three
 * lines and pushed the row apart, and made to overflow sideways it would land
 * on top of its neighbour's message the moment both times were unreadable. A
 * row with two fields has to put the message below *the row*, which is
 * something only the row can do.
 */
export function TimeField({
  id,
  value,
  onChange,
  disabled,
  className,
  /**
   * Forwarded to the input, and it has to be declared to arrive (B1). The
   * opening hours have passed one since D9.5 and it never reached the DOM:
   * TypeScript does not excess-property-check a JSX attribute whose name is
   * not a valid identifier, so `aria-label` on a component that does not
   * accept it is dropped without a word from the compiler. Both fields of
   * every window were therefore unnamed for a screen reader — "–" between two
   * anonymous boxes.
   */
  'aria-label': ariaLabel,
}: {
  id?: string
  /** `HH:mm`, or `''` when there is no time. */
  value: string
  onChange: (time: string) => void
  disabled?: boolean
  className?: string
  'aria-label'?: string
}) {
  const { invalid, inputProps } = useTimeInput(value, onChange)

  return (
    <div className={className}>
      <Input id={id} aria-label={ariaLabel} disabled={disabled} {...inputProps} />
      {invalid && <p className="mt-1 text-destructive text-sm">{timeInvalidMessage()}</p>}
    </div>
  )
}
