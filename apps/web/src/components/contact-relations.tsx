import {
  type ContactRelation,
  type ContactRelationType,
  type RelationDirection,
  relationLabel,
  relationOptions,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ContactPicker } from '@/components/contact-picker'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import {
  addRelation,
  relationListQueryOptions,
  relationTypeListQueryOptions,
  removeRelation,
  saveRelation,
} from '@/lib/contact-types'
import { strings } from '@/lib/strings'

/**
 * The contacts this one is linked to (CLAUDE.md rule 4), as the L5 images draw
 * it: a table with a header row, a pencil and a bin per row, and
 * "+ Beziehung hinzufügen" at the foot.
 *
 * Both records show the same row, each with its own label, so this component
 * is the same on either end.
 *
 * **Flat, in catalogue order.** The billing recipient used to be pulled to the
 * top and set off by a rule, on the argument that the one relation with a
 * consequence reads differently from "this is the mother". The images say
 * otherwise and they are the Vorgabe (L5). What is not cosmetic survives: an
 * exclusive type this contact already holds stays disabled in the menu, so the
 * refusal is a sentence in the dropdown rather than a unique violation.
 *
 * **A row is editable, and that is what replaced "Ersetzen".** Swapping the
 * billing recipient is now what it always was — a change to the row that
 * stands — and `updateRelation` rewrites it in one transaction, which is the
 * guarantee the old `replace` flag existed for.
 */
export function ContactRelations({ contactId }: { contactId: string }) {
  const queryClient = useQueryClient()
  const relations = useQuery(relationListQueryOptions(contactId))
  const types = useQuery(relationTypeListQueryOptions(true))

  /** Which row the form stands in: an id while editing, `'new'` while adding,
   *  null while the table is just a table. One at a time — the design shows no
   *  screen with two open forms, and two would raise the question of what the
   *  second one is for. */
  const [editing, setEditing] = useState<string | null>(null)

  // Every type for the labels — a relation entered before its type was
  // deactivated still has to read correctly — but only the active ones are
  // offered.
  const typesById = new Map((types.data ?? []).map((type) => [type.id, type]))
  const options = relationOptions((types.data ?? []).filter((type) => type.active))

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['contacts', 'relations'] })
  }

  const save = useMutation({
    mutationFn: (input: {
      relationId: string | null
      id: string
      direction: RelationDirection
      other: string
    }) => {
      const payload = {
        relationTypeId: input.id,
        direction: input.direction,
        otherContactId: input.other,
        since: todayInBerlin(),
      }
      return input.relationId === null
        ? addRelation(contactId, payload)
        : saveRelation(contactId, input.relationId, payload)
    },
    onSuccess: async (_saved, input) => {
      await invalidate()
      setEditing(null)
      toast.success(
        input.relationId === null ? strings.contact.relationAdded : strings.contact.relationSaved,
      )
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : strings.contact.relationFailed),
  })

  const remove = useMutation({
    mutationFn: (relationId: string) => removeRelation(contactId, relationId),
    onSuccess: async () => {
      await invalidate()
      toast.success(strings.contact.relationRemoved)
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : strings.contact.relationFailed),
  })

  const rows = relations.data ?? []

  /** An exclusive type this contact already owns cannot be taken a second
   *  time — the menu says so instead of letting the database say it. */
  const takenTypeIds = new Set(
    rows
      .filter(
        (row) =>
          row.direction === 'forward' && Boolean(typesById.get(row.relationTypeId)?.isExclusive),
      )
      .map((row) => row.relationTypeId),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.contact.relations}</CardTitle>
      </CardHeader>

      <CardContent className="px-0">
        {/* One grid, one column definition, shared by the header and every row
            — so a heading can never stand over a different column than the
            values under it. */}
        <div className="px-6 pb-2 text-[13px] text-muted-foreground">
          <div className={ROW_GRID}>
            <span>{strings.contact.relationKind}</span>
            <span>{strings.contact.relationOther}</span>
            <span className="text-right">{strings.contact.relationActions}</span>
          </div>
        </div>

        {rows.length === 0 && editing !== 'new' && (
          <p className="border-t px-6 py-4 text-muted-foreground text-sm">
            {relations.isPending ? strings.status.loading : strings.contact.relationsEmpty}
          </p>
        )}

        <ul>
          {rows.map((relation) =>
            editing === relation.id ? (
              <li key={relation.id} className="border-t bg-muted/30 px-6 py-4">
                <RelationForm
                  options={options}
                  takenTypeIds={takenTypeIds}
                  relation={relation}
                  pending={save.isPending}
                  onCancel={() => setEditing(null)}
                  onSave={(id, direction, other) =>
                    save.mutate({ relationId: relation.id, id, direction, other })
                  }
                />
              </li>
            ) : (
              <RelationRow
                key={relation.id}
                relation={relation}
                type={typesById.get(relation.relationTypeId)}
                onEdit={() => setEditing(relation.id)}
                onRemove={() => remove.mutate(relation.id)}
              />
            ),
          )}
        </ul>

        {editing === 'new' ? (
          <div className="px-6 pt-4">
            {/* The new row is an inset box below the table, the edit form takes
                the place of its row — both as the images have them. */}
            <div className="rounded-[10px] border bg-muted/30 px-4 py-4">
              <RelationForm
                options={options}
                takenTypeIds={takenTypeIds}
                pending={save.isPending}
                onCancel={() => setEditing(null)}
                onSave={(id, direction, other) =>
                  save.mutate({ relationId: null, id, direction, other })
                }
              />
            </div>
          </div>
        ) : (
          editing === null && (
            <div className="border-t px-4 pt-3">
              <Button variant="ghost" onClick={() => setEditing('new')}>
                <Plus className="size-4" aria-hidden />
                {strings.contact.relationAdd}
              </Button>
            </div>
          )
        )}
      </CardContent>
    </Card>
  )
}

/** Measured off the images: the counterpart starts at roughly two fifths of
 *  the card's content, the actions take what they need at the right. */
const ROW_GRID = 'grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-4'

function RelationRow({
  relation,
  type,
  onEdit,
  onRemove,
}: {
  relation: ContactRelation
  type: ContactRelationType | undefined
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <li className={`border-t px-6 ${ROW_GRID} py-1`}>
      <span className="truncate text-muted-foreground text-sm">
        {/* An unknown code should not happen — a type in use cannot be
            deleted — so it falls back to the code rather than to nothing. */}
        {type ? relationLabel(type, relation.direction) : relation.relationTypeId}
      </span>

      {/* Reading is allowed everywhere: the name leads to that contact's own
          record, edit mode or not. */}
      <Link
        className="truncate text-sm hover:underline"
        to="/contacts/$contactId"
        params={{ contactId: relation.otherContactId }}
      >
        {relation.otherContactName}
      </Link>

      <span className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={strings.contact.relationEdit}
          onClick={onEdit}
        >
          <Pencil className="size-4" aria-hidden />
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={strings.contact.relationRemove}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{strings.contact.relationRemoveTitle}</AlertDialogTitle>
              <AlertDialogDescription>{strings.contact.relationRemoveBody}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{strings.contact.cancel}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onRemove}>
                {strings.contact.relationRemove}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </span>
    </li>
  )
}

/**
 * The kind and the counterpart, side by side — the same two fields whether a
 * relation is being added or changed, because a change is not a patch: the two
 * together *are* the relation (see `contactRelationInputSchema`).
 */
function RelationForm({
  options,
  takenTypeIds,
  relation,
  pending,
  onSave,
  onCancel,
}: {
  options: { id: string; direction: RelationDirection; label: string }[]
  takenTypeIds: Set<string>
  /** Absent while adding. */
  relation?: ContactRelation
  pending: boolean
  onSave: (relationTypeId: string, direction: RelationDirection, otherContactId: string) => void
  onCancel: () => void
}) {
  const [option, setOption] = useState(
    relation ? optionKey({ id: relation.relationTypeId, direction: relation.direction }) : '',
  )
  const [otherContactId, setOtherContactId] = useState<string | null>(
    relation?.otherContactId ?? null,
  )

  const chosen = options.find((entry) => optionKey(entry) === option)
  const canSave = chosen !== undefined && otherContactId !== null

  if (options.length === 0) {
    return <p className="text-muted-foreground text-sm">{strings.contact.relationNoTypes}</p>
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-56">
        <Label htmlFor="relation-kind">{strings.contact.relationKind}</Label>
        <Select value={option} onValueChange={setOption}>
          <SelectTrigger id="relation-kind" className="mt-2 w-full">
            <SelectValue placeholder={strings.contact.relationKindChoose} />
          </SelectTrigger>
          <SelectContent>
            {options.map((entry) => {
              // Only the side this contact would own can be taken: exclusivity
              // counts per `from` contact. The row being edited keeps its own
              // value selectable, or it could not be saved unchanged.
              const taken =
                entry.direction === 'forward' &&
                takenTypeIds.has(entry.id) &&
                optionKey(entry) !==
                  (relation
                    ? optionKey({ id: relation.relationTypeId, direction: relation.direction })
                    : '')

              return (
                <SelectItem key={optionKey(entry)} value={optionKey(entry)} disabled={taken}>
                  {entry.label}
                  {taken && ` — ${strings.contact.relationTaken}`}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-64 flex-1">
        <Label htmlFor="relation-contact">{strings.contact.relationOther}</Label>
        <ContactPicker
          inputId="relation-contact"
          value={otherContactId}
          locked={false}
          compact
          onChange={setOtherContactId}
        />
      </div>

      <div className="mb-1 flex gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          {strings.contact.cancel}
        </Button>
        <Button
          disabled={!canSave || pending}
          onClick={() => {
            if (!chosen || !otherContactId) return
            onSave(chosen.id, chosen.direction, otherContactId)
          }}
        >
          {strings.contact.relationSave}
        </Button>
      </div>
    </div>
  )
}

/** One option per side, so the value has to carry both. */
function optionKey(option: { id: string; direction: RelationDirection }): string {
  return `${option.id}:${option.direction}`
}

/** Today in Europe/Berlin as `YYYY-MM-DD`. `toISOString()` would be UTC and
 *  give yesterday's date late in the evening. */
function todayInBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}
