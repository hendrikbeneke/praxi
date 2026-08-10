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
}: {
  id?: string
  /** `HH:mm`, or `''` when there is no time. */
  value: string
  onChange: (time: string) => void
  disabled?: boolean
  className?: string
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
      {invalid && (
        <p className="mt-1 text-destructive text-sm">
          {strings.date.timeInvalid(dateFormat.timePlaceholder)}
        </p>
      )}
    </div>
  )
}
