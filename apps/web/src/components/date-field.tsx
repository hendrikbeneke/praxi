import {
  dateFormat,
  formatDateDE,
  parseDateDE,
  type TwoDigitYearMode,
  toBerlinDate,
} from '@praxi/shared'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/**
 * A date field whose format belongs to the application, not to the browser.
 *
 * `<input type="date">` renders in the *browser's* language: on a machine set
 * to en-US it asks for mm/dd/yyyy while every label around it is German, and
 * 07.03. is then a different day than it looks. Every date in this application
 * goes through here instead.
 *
 * The value in and out is ISO `YYYY-MM-DD`, unchanged — nothing behind this
 * component knows that a person reads dates differently.
 *
 * **The screen and the value never disagree.** Every keystroke is parsed and
 * reported: readable text emits its date, unreadable text emits an empty
 * string rather than leaving the previous date standing behind a field that no
 * longer shows it. The complaint waits for the field to be left, because
 * marking half-typed input as wrong is noise.
 */
export function DateField({
  id,
  value,
  onChange,
  twoDigitYear,
  disabled,
  className,
}: {
  id?: string
  /** ISO `YYYY-MM-DD`, or `''` when there is no date. */
  value: string
  onChange: (iso: string) => void
  /** See `TwoDigitYearMode` — `past` belongs to the date of birth alone. */
  twoDigitYear?: TwoDigitYearMode
  /** For the screens that gate a single field rather than a whole form.
   *  Read mode passes nothing, because it renders no field at all (K2) —
   *  this is for a field that stays visible and must not be operated. */
  disabled?: boolean
  className?: string
}) {
  const [text, setText] = useState(() => formatDateDE(value))
  const [invalid, setInvalid] = useState(false)
  const [open, setOpen] = useState(false)

  const read = (written: string) => parseDateDE(written, { twoDigitYear })

  /**
   * Follow the value when it changes from outside — a dialog opening on a
   * different record, a form resetting after a save.
   *
   * Only when it disagrees with what the text already means: typing `13.7.26`
   * emits the date, which comes straight back as `value`, and rewriting the
   * field to `13.07.2026` under the caret mid-word would be maddening.
   */
  useEffect(() => {
    setText((current) =>
      (parseDateDE(current, { twoDigitYear }) ?? '') === value ? current : formatDateDE(value),
    )
  }, [value, twoDigitYear])

  function type(written: string) {
    setText(written)
    setInvalid(false)
    onChange(read(written) ?? '')
  }

  /** Leaving the field is when it gets tidied up, or complained about. */
  function leave() {
    const iso = read(text)
    if (iso !== null) {
      setText(formatDateDE(iso))
      setInvalid(false)
    } else {
      setInvalid(text.trim() !== '')
    }
  }

  function pick(iso: string) {
    setText(formatDateDE(iso))
    setInvalid(false)
    onChange(iso)
    setOpen(false)
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder={dateFormat.placeholder}
          disabled={disabled}
          aria-invalid={invalid ? true : undefined}
          value={text}
          onChange={(event) => type(event.target.value)}
          onBlur={leave}
        />

        {/* A Radix popover opens on click, which a disabled fieldset already
            suppresses — read mode needs nothing extra here. */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              aria-label={strings.date.open}
            >
              <CalendarDays className="size-4" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <MonthCalendar value={read(text) ?? ''} onSelect={pick} />
          </PopoverContent>
        </Popover>
      </div>

      {invalid && (
        <p className="mt-1 text-destructive text-sm">
          {strings.date.invalid(dateFormat.placeholder)}
        </p>
      )}
    </div>
  )
}

/** How far back and forward the year list reaches. A hundred and twenty years
 *  back is what a date of birth needs; ten forward is more than any invoice. */
const YEARS_BACK = 120
const YEARS_AHEAD = 10

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function isoOf(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad(month + 1)}-${pad(day)}`
}

/** Days in a month, from the zeroth day of the next one. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/** Which column the first falls in, counting from Monday the way a German
 *  wall calendar does. */
function leadingBlanks(year: number, month: number): number {
  return (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7
}

/**
 * The calendar behind the field.
 *
 * Hand-written, and month and year are dropdowns rather than something to page
 * to. That is not a preference: entering a date of birth means travelling
 * eight hundred months, and a calendar that can only be paged makes the field
 * useless for the one record where it matters most. Written this way, it is
 * the only shape the component has — not an option somebody has to remember to
 * switch on.
 *
 * All arithmetic runs in UTC and comes out as plain `YYYY-MM-DD` strings, so a
 * day can never shift by one when the clocks move.
 */
function MonthCalendar({ value, onSelect }: { value: string; onSelect: (iso: string) => void }) {
  const today = toBerlinDate(new Date().toISOString())
  const anchor = value === '' ? today : value

  const [year, setYear] = useState(() => Number(anchor.slice(0, 4)))
  const [month, setMonth] = useState(() => Number(anchor.slice(5, 7)) - 1)

  const thisYear = Number(today.slice(0, 4))
  const years = Array.from(
    { length: YEARS_BACK + YEARS_AHEAD + 1 },
    (_, index) => thisYear - YEARS_BACK + index,
  )

  function step(by: number) {
    const moved = new Date(Date.UTC(year, month + by, 1))
    setYear(moved.getUTCFullYear())
    setMonth(moved.getUTCMonth())
  }

  const blanks = leadingBlanks(year, month)
  const days = daysInMonth(year, month)

  return (
    <div className="w-72">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={strings.date.previousMonth}
          onClick={() => step(-1)}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>

        <Select value={String(month)} onValueChange={(next) => setMonth(Number(next))}>
          <SelectTrigger className="flex-1" size="sm" aria-label={strings.date.month}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {strings.date.months.map((name, index) => (
              <SelectItem key={name} value={String(index)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(year)} onValueChange={(next) => setYear(Number(next))}>
          <SelectTrigger className="w-24" size="sm" aria-label={strings.date.year}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((entry) => (
              <SelectItem key={entry} value={String(entry)}>
                {entry}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={strings.date.nextMonth}
          onClick={() => step(1)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-muted-foreground text-xs">
        {strings.date.weekdays.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {/* One spacer spanning the days of the previous month, rather than a
            handful of empty cells that would need keys of their own. */}
        {blanks > 0 && <span style={{ gridColumn: `span ${blanks}` }} />}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1
          const iso = isoOf(year, month, day)
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(iso)}
              aria-current={iso === today ? 'date' : undefined}
              aria-pressed={iso === value}
              className={cn(
                'rounded-md py-1.5 text-sm tabular-nums hover:bg-accent',
                iso === today && 'font-medium text-primary',
                iso === value && 'bg-primary text-primary-foreground hover:bg-primary',
              )}
            >
              {day}
            </button>
          )
        })}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 w-full"
        onClick={() => onSelect(today)}
      >
        {strings.date.today}
      </Button>
    </div>
  )
}
