import type { ValueListEntry } from '@praxi/shared'
import { countryName, searchCountries } from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'
import { DeleteButton, OrderButtons } from '@/components/catalogue-controls'
import { InlineDetailRow, useInlineDetail } from '@/components/inline-detail-row'
import { ListCard, ListCardTitleBar } from '@/components/list-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'
import {
  countryListQueryOptions,
  createCountryEntry,
  createValueEntry,
  deleteCountryEntry,
  deleteValueEntry,
  genderListQueryOptions,
  moveCountryEntry,
  moveValueEntry,
  salutationListQueryOptions,
  updateValueEntry,
  type ValueListKind,
} from '@/lib/value-lists'

/**
 * The three value lists behind a contact's own fields (D-R3) — salutation,
 * gender, country.
 *
 * The two label lists are one component told which one it is looking at: they
 * are the same list with a different heading, and two copies would be two
 * places to fix a wording. The country list is its own, because adding an
 * entry there is a search rather than a text field, and because there is
 * nothing about a chosen country to edit afterwards.
 */

function useCatalogue(key: string) {
  const queryClient = useQueryClient()
  return {
    invalidate: () => queryClient.invalidateQueries({ queryKey: [key] }),
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : strings.contactType.saveFailed),
  }
}

// ------------------------------------------------------------- label lists

export function SalutationSettings() {
  return (
    <LabelListCard
      kind="salutations"
      title={strings.valueList.salutationsTitle}
      hint={strings.valueList.salutationsHint}
      createLabel={strings.valueList.createSalutation}
      empty={strings.valueList.salutationsEmptyCard}
      footer={strings.valueList.salutationsFooter}
      query={salutationListQueryOptions}
    />
  )
}

export function GenderSettings() {
  return (
    <LabelListCard
      kind="genders"
      title={strings.valueList.gendersTitle}
      hint={strings.valueList.gendersHint}
      createLabel={strings.valueList.createGender}
      empty={strings.valueList.gendersEmptyCard}
      query={genderListQueryOptions}
    />
  )
}

function LabelListCard({
  kind,
  title,
  hint,
  createLabel,
  empty,
  footer,
  query,
}: {
  kind: ValueListKind
  title: string
  hint: string
  createLabel: string
  empty: string
  footer?: string
  query: typeof salutationListQueryOptions
}) {
  const { invalidate, onError } = useCatalogue(kind)
  const entries = useQuery(query)
  const detail = useInlineDetail()
  const [creating, setCreating] = useState(false)

  const save = useMutation({
    mutationFn: (input: { id?: string; label: string; sortOrder: number }) =>
      input.id
        ? updateValueEntry(kind, input.id, { label: input.label, sortOrder: input.sortOrder })
        : createValueEntry(kind, { label: input.label, sortOrder: input.sortOrder }).then(
            () => undefined,
          ),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      setCreating(false)
      toast.success(strings.contactType.saved)
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteValueEntry(kind, id),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      toast.success(strings.contactType.deleted)
    },
    onError,
  })

  const move = useMutation({
    mutationFn: (input: { id: string; delta: 1 | -1 }) =>
      moveValueEntry(kind, input.id, input.delta),
    onSuccess: invalidate,
    onError,
  })

  const rows = entries.data ?? []

  return (
    <>
      <ListCard>
        <ListCardTitleBar
          title={title}
          hint={hint}
          action={
            <Button
              size="sm"
              onClick={() => {
                detail.close()
                setCreating((current) => !current)
              }}
            >
              <Plus className="size-4" aria-hidden />
              {createLabel}
            </Button>
          }
        />

        {creating && (
          <div className="border-b bg-muted/20 p-4">
            <LabelForm
              pending={save.isPending}
              onCancel={() => setCreating(false)}
              onSubmit={(label) => save.mutate({ label, sortOrder: 100 })}
            />
          </div>
        )}

        {rows.length === 0 ? (
          <p className="p-4 text-muted-foreground text-sm">
            {entries.isPending ? strings.status.loading : empty}
          </p>
        ) : (
          <Table>
            <TableBody>
              {rows.map((entry, index) => (
                <Fragment key={entry.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => {
                      setCreating(false)
                      detail.toggle(entry.id)
                    }}
                  >
                    <TableCell>
                      <span className="font-medium">{entry.label}</span>
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <OrderButtons
                        index={index}
                        count={rows.length}
                        pending={move.isPending}
                        onMove={(i, delta) => {
                          const row = rows[i]
                          if (row) move.mutate({ id: row.id, delta: delta as 1 | -1 })
                        }}
                      />
                    </TableCell>
                  </TableRow>

                  {detail.isOpen(entry.id) && (
                    <InlineDetailRow colSpan={2}>
                      {detail.editing ? (
                        <LabelForm
                          entry={entry}
                          pending={save.isPending}
                          onCancel={detail.stopEditing}
                          onSubmit={(label) =>
                            save.mutate({ id: entry.id, label, sortOrder: entry.sortOrder })
                          }
                        />
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="outline" onClick={detail.startEditing}>
                            {strings.actions.edit}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={detail.close}>
                            {strings.actions.close}
                          </Button>
                          {/* Never disabled: nothing here is protected. An
                              entry a contact still holds is refused by the
                              server, with the number in the message. */}
                          <DeleteButton
                            disabled={false}
                            onConfirm={() => remove.mutate(entry.id)}
                            title={strings.valueList.deleteTitle}
                            body={strings.valueList.deleteBody}
                          />
                        </div>
                      )}
                    </InlineDetailRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </ListCard>
      {footer && <p className="mt-3 text-muted-foreground text-sm">{footer}</p>}
    </>
  )
}

/** One field. A value list entry is a label and a place in the list, and the
 *  place is moved with the arrows rather than typed. */
function LabelForm({
  entry,
  pending,
  onCancel,
  onSubmit,
}: {
  entry?: ValueListEntry
  pending: boolean
  onCancel: () => void
  onSubmit: (label: string) => void
}) {
  const [label, setLabel] = useState(entry?.label ?? '')

  return (
    <div className="space-y-4">
      <div className="sm:max-w-sm">
        <Label htmlFor="value-label">{strings.contactType.label}</Label>
        <Input
          id="value-label"
          className="mt-2"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {strings.actions.cancel}
        </Button>
        <Button
          type="button"
          disabled={pending || label.trim() === ''}
          onClick={() => onSubmit(label.trim())}
        >
          {strings.actions.save}
        </Button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ country

/**
 * Which countries the contact form offers.
 *
 * Adding one is a **search**, not a dropdown: the ISO list has some 250
 * entries, and a select that long is unusable. Typing "D" offers Deutschland,
 * Dänemark and so on; picking one stores the code. There is nothing to edit
 * afterwards — a country's name is not ours to change.
 */
export function CountrySettings() {
  const { invalidate, onError } = useCatalogue('countries')
  const entries = useQuery(countryListQueryOptions)
  const [term, setTerm] = useState('')

  const add = useMutation({
    mutationFn: (isoCode: string) => createCountryEntry({ isoCode, sortOrder: 100 }),
    onSuccess: async () => {
      await invalidate()
      setTerm('')
      toast.success(strings.contactType.saved)
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteCountryEntry(id),
    onSuccess: async () => {
      await invalidate()
      toast.success(strings.contactType.deleted)
    },
    onError,
  })

  const move = useMutation({
    mutationFn: (input: { id: string; delta: 1 | -1 }) => moveCountryEntry(input.id, input.delta),
    onSuccess: invalidate,
    onError,
  })

  const rows = entries.data ?? []
  const chosen = new Set(rows.map((entry) => entry.isoCode))
  // Already-chosen codes are filtered out rather than shown and refused: the
  // server would answer "steht bereits in der Liste", which is a sentence for
  // a mistake the list could simply not offer.
  const suggestions = searchCountries(term, 20)
    .filter((code) => !chosen.has(code))
    .slice(0, 8)

  return (
    <ListCard>
      <ListCardTitleBar
        title={strings.valueList.countriesTitle}
        hint={strings.valueList.countriesHint}
      />

      <div className="border-b p-4">
        <Label htmlFor="country-search">{strings.valueList.countrySearch}</Label>
        <Input
          id="country-search"
          className="mt-2 sm:max-w-sm"
          value={term}
          placeholder={strings.valueList.countrySearchPlaceholder}
          onChange={(event) => setTerm(event.target.value)}
        />
        {term.trim() !== '' && (
          <div className="mt-2 flex flex-col gap-px sm:max-w-sm">
            {suggestions.length === 0 ? (
              <p className="text-muted-foreground text-sm">{strings.valueList.countryNoMatch}</p>
            ) : (
              suggestions.map((code) => (
                <button
                  key={code}
                  type="button"
                  disabled={add.isPending}
                  onClick={() => add.mutate(code)}
                  className={cn(
                    'flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                    'hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <span>{countryName(code)}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">{code}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="p-4 text-muted-foreground text-sm">
          {entries.isPending ? strings.status.loading : strings.valueList.countriesEmptyCard}
        </p>
      ) : (
        <Table>
          <TableBody>
            {rows.map((entry, index) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <span className="font-medium">{countryName(entry.isoCode)}</span>
                  <span className="ml-2 text-muted-foreground text-xs tabular-nums">
                    {entry.isoCode}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <OrderButtons
                      index={index}
                      count={rows.length}
                      pending={move.isPending}
                      onMove={(i, delta) => {
                        const row = rows[i]
                        if (row) move.mutate({ id: row.id, delta: delta as 1 | -1 })
                      }}
                    />
                    <DeleteButton
                      disabled={false}
                      onConfirm={() => remove.mutate(entry.id)}
                      title={strings.valueList.deleteCountryTitle}
                      body={strings.valueList.deleteBody}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ListCard>
  )
}
