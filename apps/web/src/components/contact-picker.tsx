import { type Contact, formatContactNameSorted } from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { contactListQueryOptions, contactQueryOptions } from '@/lib/contacts'
import { strings } from '@/lib/strings'

const SUGGESTION_LIMIT = 8

/**
 * Pick one contact by typing. The search runs on the server — the same
 * endpoint and the same term handling as the contact list — so it covers every
 * contact, not only the ones a dropdown happened to load.
 *
 * The suggestion list is rendered inline rather than in a floating layer: the
 * picker sits inside a dialog that scrolls, and an overlay inside a scrolling,
 * focus-trapped container buys clipping and focus problems for nothing. The
 * field is the first thing in that dialog, so pushing the rest down costs
 * nothing either.
 */
export function ContactPicker({
  inputId,
  value,
  locked,
  onChange,
}: {
  inputId: string
  value: string | null
  /** The contact of an existing activity never changes, and neither does the
   *  one the dialog was opened from. */
  locked: boolean
  onChange: (contactId: string | null) => void
}) {
  const [term, setTerm] = useState('')
  // Same approach as the contact list: typing stays immediate, the query
  // follows the settled value.
  const deferredTerm = useDeferredValue(term)
  const [active, setActive] = useState(0)

  const selected = useQuery({
    ...contactQueryOptions(value ?? ''),
    enabled: value !== null,
  })

  const results = useQuery({
    ...contactListQueryOptions({
      q: deferredTerm.trim() || undefined,
      // Archived contacts are never offered — an archived contact is one you
      // are done with, and a new activity for them starts by unarchiving.
      includeArchived: false,
      limit: SUGGESTION_LIMIT,
    }),
    enabled: value === null,
  })

  if (value !== null) {
    return (
      <div className="mt-2 flex min-h-9 items-center gap-3 rounded-md border px-3 py-1.5">
        <span className="truncate text-sm">
          {selected.data ? formatContactNameSorted(selected.data) : strings.status.loading}
        </span>
        {selected.data && (
          <span className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
            {strings.contact.contactNumber} {selected.data.contactNumber}
          </span>
        )}
        {locked ? (
          <span className="ml-auto whitespace-nowrap text-muted-foreground text-xs">
            {strings.activity.contactLocked}
          </span>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => {
              setTerm('')
              setActive(0)
              onChange(null)
            }}
          >
            <X className="size-4" aria-hidden />
            {strings.activity.contactChange}
          </Button>
        )}
      </div>
    )
  }

  const items = results.data?.items ?? []
  const activeIndex = items.length === 0 ? -1 : Math.min(active, items.length - 1)

  function choose(contact: Contact) {
    setTerm('')
    setActive(0)
    onChange(contact.id)
  }

  return (
    <div className="mt-2">
      <div className="relative">
        <Search
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={inputId}
          className="pl-9"
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls={`${inputId}-results`}
          autoComplete="off"
          placeholder={strings.activity.contactSearch}
          value={term}
          onChange={(event) => {
            setTerm(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((current) => Math.min(current + 1, items.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((current) => Math.max(current - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              const contact = items[activeIndex]
              if (contact) choose(contact)
            }
          }}
        />
      </div>

      {/* A listbox takes its options as direct children, so no <ul>/<li> in
          between — the buttons are the options. */}
      <div
        id={`${inputId}-results`}
        role="listbox"
        aria-label={strings.activity.contact}
        className="mt-1 max-h-56 overflow-y-auto rounded-md border empty:hidden"
      >
        {items.map((contact, index) => (
          <button
            key={contact.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={`flex w-full items-baseline gap-3 px-3 py-2 text-left text-sm hover:bg-accent ${
              index === activeIndex ? 'bg-accent' : ''
            }`}
            onMouseEnter={() => setActive(index)}
            onClick={() => choose(contact)}
          >
            <span className="truncate">{formatContactNameSorted(contact)}</span>
            <span className="ml-auto whitespace-nowrap text-muted-foreground text-xs tabular-nums">
              {contact.contactNumber}
              {contact.city ? ` · ${contact.city}` : ''}
            </span>
          </button>
        ))}
      </div>

      {items.length === 0 && !results.isPending && (
        <p className="mt-1 text-muted-foreground text-xs">{strings.activity.contactNoResults}</p>
      )}
    </div>
  )
}
