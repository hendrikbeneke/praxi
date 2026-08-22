import type { NoteType, NoteTypeInput } from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'
import {
  CheckboxField,
  DeleteButton,
  DetailField,
  OrderButtons,
} from '@/components/catalogue-controls'
import { InlineDetailRow, useInlineDetail } from '@/components/inline-detail-row'
import { DASH, ListCard, ListCardTitleBar } from '@/components/list-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import {
  createNoteType,
  deleteNoteType,
  moveNoteType,
  noteTypeListQueryOptions,
  updateNoteType,
} from '@/lib/note-types'
import { strings } from '@/lib/strings'

/**
 * The catalogue behind a note's type (L1), the fourth card in "Auswahllisten".
 *
 * Built like the role card in `contact-type-settings.tsx` — the two carry the
 * same three fields — and deliberately not merged with it: one component would
 * bind the two catalogues together the moment either grows a field, and the
 * wording differs throughout anyway.
 */

export function NoteTypeSettings() {
  const queryClient = useQueryClient()
  const types = useQuery(noteTypeListQueryOptions)
  const detail = useInlineDetail()
  const [creating, setCreating] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['note-types'] })
  const onError = (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : strings.contactType.saveFailed)

  const save = useMutation({
    mutationFn: (input: { id?: string; values: NoteTypeInput }) =>
      input.id
        ? updateNoteType(input.id, input.values)
        : createNoteType(input.values).then(() => undefined),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      setCreating(false)
      toast.success(strings.contactType.saved)
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteNoteType(id),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      toast.success(strings.contactType.deleted)
    },
    onError,
  })

  const move = useMutation({
    mutationFn: (input: { id: string; delta: 1 | -1 }) => moveNoteType(input.id, input.delta),
    onSuccess: invalidate,
    onError,
  })

  const rows = types.data ?? []

  return (
    <>
      <ListCard>
        <ListCardTitleBar
          title={strings.noteType.title}
          hint={strings.noteType.hint}
          action={
            <Button
              size="sm"
              onClick={() => {
                detail.close()
                setCreating((current) => !current)
              }}
            >
              <Plus className="size-4" aria-hidden />
              {strings.noteType.create}
            </Button>
          }
        />

        {creating && (
          <div className="border-b bg-muted/20 p-4">
            <NoteTypeForm
              pending={save.isPending}
              onCancel={() => setCreating(false)}
              onSubmit={(values) => save.mutate({ values })}
            />
          </div>
        )}

        {rows.length === 0 ? (
          <p className="p-4 text-muted-foreground text-sm">
            {types.isPending ? strings.status.loading : strings.noteType.empty}
          </p>
        ) : (
          <Table>
            <TableBody>
              {rows.map((type, index) => (
                <Fragment key={type.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => {
                      setCreating(false)
                      detail.toggle(type.id)
                    }}
                  >
                    <TableCell>
                      <span className="font-medium">{type.label}</span>
                      {type.showAsTab && (
                        <Badge variant="outline" className="ml-2">
                          {strings.noteType.showAsTab}
                        </Badge>
                      )}
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

                  {detail.isOpen(type.id) && (
                    <InlineDetailRow colSpan={2}>
                      {detail.editing ? (
                        <NoteTypeForm
                          type={type}
                          pending={save.isPending}
                          onCancel={detail.stopEditing}
                          onSubmit={(values) => save.mutate({ id: type.id, values })}
                        />
                      ) : (
                        <div className="space-y-4">
                          <dl className="flex flex-wrap gap-8">
                            <DetailField
                              label={strings.noteType.showAsTab}
                              value={type.showAsTab ? strings.contactType.flagYes : DASH}
                            />
                          </dl>
                          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                            <Button size="sm" variant="outline" onClick={detail.startEditing}>
                              {strings.actions.edit}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={detail.close}>
                              {strings.actions.close}
                            </Button>
                            {/* Never disabled: a type notes carry is refused by
                                the server, with the number in the message. */}
                            <DeleteButton
                              disabled={false}
                              onConfirm={() => remove.mutate(type.id)}
                              title={strings.noteType.deleteTitle}
                              body={strings.noteType.deleteBody}
                            />
                          </div>
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
      {/* The sentence the list itself raises: without a type no note can be
          written, and the first entry is what a new note starts on. */}
      <p className="mt-3 text-muted-foreground text-sm">{strings.noteType.footer}</p>
    </>
  )
}

function toValues(type: NoteType): NoteTypeInput {
  return { label: type.label, showAsTab: type.showAsTab, sortOrder: type.sortOrder }
}

function NoteTypeForm({
  type,
  pending,
  onCancel,
  onSubmit,
}: {
  type?: NoteType
  pending: boolean
  onCancel: () => void
  onSubmit: (values: NoteTypeInput) => void
}) {
  const [values, setValues] = useState<NoteTypeInput>(
    type ? toValues(type) : { label: '', showAsTab: false, sortOrder: 100 },
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="note-type-label">{strings.noteType.label}</Label>
          <Input
            id="note-type-label"
            className="mt-2"
            value={values.label}
            onChange={(event) => setValues({ ...values, label: event.target.value })}
          />
          <p className="mt-1 text-muted-foreground text-xs">{strings.noteType.labelHint}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <CheckboxField
          id="note-type-tab"
          label={strings.noteType.showAsTab}
          checked={values.showAsTab}
          onChange={(checked) => setValues({ ...values, showAsTab: checked })}
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {strings.actions.cancel}
        </Button>
        <Button
          type="button"
          disabled={pending || values.label.trim() === ''}
          onClick={() => onSubmit(values)}
        >
          {strings.actions.save}
        </Button>
      </div>
    </div>
  )
}
