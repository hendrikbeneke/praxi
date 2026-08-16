import type { OpeningHour, OpeningHoursInput } from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { ReadModeFieldset } from '@/components/read-mode-fieldset'
import { TimeField } from '@/components/time-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ApiError } from '@/lib/api'
import { openingHoursQueryOptions, replaceOpeningHours } from '@/lib/settings'
import { strings } from '@/lib/strings'

/**
 * When the practice is open (D9.5) — seven rows, any number of windows each.
 *
 * A day with no window says **"geschlossen"** rather than showing an empty
 * pair of time fields. An empty field pair would be a form claiming a state
 * that does not exist: it looks like an unfilled opening time, when in fact
 * there is none and none is wanted.
 *
 * The whole week is saved at once, because that is what it is — see
 * `replaceOpeningHours` in the domain for why a replace is right here and a
 * patch is right one card up.
 */

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

type Draft = { key: string; weekday: number; startsAt: string; endsAt: string }

let counter = 0
const nextKey = () => {
  counter += 1
  return `window-${counter}`
}

function toDraft(hours: readonly OpeningHour[]): Draft[] {
  return hours.map((window) => ({
    key: nextKey(),
    weekday: window.weekday,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
  }))
}

export function OpeningHoursSettings() {
  const queryClient = useQueryClient()
  const fieldId = useId()
  const hours = useQuery(openingHoursQueryOptions)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft[]>([])

  // The stored week is the truth whenever it changes; leaving edit mode puts
  // whatever was typed back to it, which is what "Abbrechen" relies on.
  useEffect(() => {
    if (hours.data && !editing) setDraft(toDraft(hours.data))
  }, [hours.data, editing])

  const save = useMutation({
    mutationFn: (input: OpeningHoursInput) => replaceOpeningHours(input),
    onSuccess: (saved) => {
      queryClient.setQueryData(openingHoursQueryOptions.queryKey, saved)
      // The calendar's slot finder reads these.
      void queryClient.invalidateQueries({ queryKey: ['appointments'] })
      setEditing(false)
      toast.success(strings.openingHours.saved)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.settings.saveFailed)
    },
  })

  const complete = draft.every((window) => window.startsAt !== '' && window.endsAt !== '')

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>{strings.openingHours.title}</CardTitle>
        {!editing && (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden />
            {strings.actions.edit}
          </Button>
        )}
      </CardHeader>

      <CardContent>
        <p className="mb-4 text-muted-foreground text-sm">{strings.openingHours.hint}</p>

        <ReadModeFieldset disabled={!editing} className="space-y-1">
          {WEEKDAYS.map((weekday) => {
            const ofDay = draft.filter((window) => window.weekday === weekday)

            return (
              <div
                key={weekday}
                className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3 border-b py-2 last:border-b-0"
              >
                <span className="pt-1.5 font-medium text-sm">
                  {strings.openingHours.weekdays[weekday - 1]}
                </span>

                <div className="space-y-2">
                  {ofDay.length === 0 && (
                    <p className="pt-1.5 text-muted-foreground text-sm">
                      {strings.openingHours.closed}
                    </p>
                  )}

                  {ofDay.map((window) => (
                    <div key={window.key} className="flex flex-wrap items-center gap-2">
                      <TimeField
                        id={`${fieldId}-${window.key}-from`}
                        aria-label={strings.openingHours.from}
                        className="w-24"
                        value={window.startsAt}
                        onChange={(value) =>
                          setDraft((current) =>
                            current.map((entry) =>
                              entry.key === window.key ? { ...entry, startsAt: value } : entry,
                            ),
                          )
                        }
                      />
                      <span className="text-muted-foreground text-sm">–</span>
                      <TimeField
                        id={`${fieldId}-${window.key}-to`}
                        aria-label={strings.openingHours.to}
                        className="w-24"
                        value={window.endsAt}
                        onChange={(value) =>
                          setDraft((current) =>
                            current.map((entry) =>
                              entry.key === window.key ? { ...entry, endsAt: value } : entry,
                            ),
                          )
                        }
                      />
                      {editing && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={strings.openingHours.removeWindow}
                          onClick={() =>
                            setDraft((current) =>
                              current.filter((entry) => entry.key !== window.key),
                            )
                          }
                        >
                          <X className="size-4" aria-hidden />
                        </Button>
                      )}
                    </div>
                  ))}

                  {editing && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() =>
                        setDraft((current) => [
                          ...current,
                          {
                            key: nextKey(),
                            weekday,
                            // A second window on a day is usually the
                            // afternoon; the first is left empty rather than
                            // guessing a start of business.
                            startsAt: '',
                            endsAt: '',
                          },
                        ])
                      }
                    >
                      <Plus className="size-4" aria-hidden />
                      {strings.openingHours.addWindow}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </ReadModeFieldset>

        {editing && (
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false)
                setDraft(toDraft(hours.data ?? []))
              }}
            >
              {strings.actions.cancel}
            </Button>
            <Button
              type="button"
              disabled={save.isPending || !complete}
              onClick={() =>
                save.mutate({
                  windows: draft.map(({ weekday, startsAt, endsAt }) => ({
                    weekday,
                    startsAt,
                    endsAt,
                  })),
                })
              }
            >
              {save.isPending ? strings.settings.saving : strings.actions.save}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
