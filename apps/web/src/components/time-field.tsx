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
  const [text, setText] = useState(() => formatTimeDE(value))
  const [invalid, setInvalid] = useState(false)

  // Only resynced when the value disagrees with what the text already means;
  // see DateField for why.
  useEffect(() => {
    setText((current) => ((parseTimeDE(current) ?? '') === value ? current : formatTimeDE(value)))
  }, [value])

  return (
    <div className={className}>
      <Input
        id={id}
        aria-label={ariaLabel}
        inputMode="numeric"
        autoComplete="off"
        placeholder={dateFormat.timePlaceholder}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setInvalid(false)
          onChange(parseTimeDE(event.target.value) ?? '')
        }}
        onBlur={() => {
          const time = parseTimeDE(text)
          if (time !== null) {
            setText(formatTimeDE(time))
            setInvalid(false)
          } else {
            setInvalid(text.trim() !== '')
          }
        }}
      />
      {/* `w-max` so the sentence stays on one line (B1, M1). A time field is
          typically 6rem wide, and a message wrapped into three lines inside it
          is what made the opening-hours row visibly come apart. Overflowing to
          the right costs nothing: at the message's own height the row beside it
          is empty, and the box itself keeps its width, so nothing around it
          moves. `max-w-xs` stops it running off the card. */}
      {invalid && (
        <p className="mt-1 w-max max-w-xs text-destructive text-sm">
          {strings.date.timeInvalid(dateFormat.timeExample)}
        </p>
      )}
    </div>
  )
}
