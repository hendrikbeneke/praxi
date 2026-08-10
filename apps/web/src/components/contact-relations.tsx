import {
  type ContactRelation,
  type ContactRelationType,
  type RelationDirection,
  relationLabel,
  relationOptions,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
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
} from '@/lib/contact-types'
import { strings } from '@/lib/strings'

/**
 * The contacts this one is linked to (CLAUDE.md rule 4).
 *
 * Both records show the same row, each with its own label, so this component
 * is the same on either end. It acts immediately: adding and removing a link
 * are single decisions, not a form to fill in and submit.
 *
 * The billing recipient is pulled to the top and set off by a rule. It is the
 * one relation with a consequence — the invoice will go to them — and it reads
 * differently from "this is the mother". What actually decides the position is
 * that the type is exclusive, which is the same thing said generally: a type
 * a contact can only hold once is a type something depends on.
 */
export function ContactRelations({ contactId }: { contactId: string }) {
  const queryClient = useQueryClient()
  const relations = useQuery(relationListQueryOptions(contactId))
  const types = useQuery(relationTypeListQueryOptions(true))

  const [adding, setAdding] = useState(false)
  const [option, setOption] = useState('')
  const [otherContactId, setOtherContactId] = useState<string | null>(null)
  /** Set when the row was opened by "Ersetzen": the new relation takes the
   *  place of the existing one in a single request. */
  const [replacing, setReplacing] = useState(false)

  // Every type for the labels — a relation entered before its type was
  // deactivated still has to read correctly — but only the active ones are
  // offered.
  const typesByCode = new Map((types.data ?? []).map((type) => [type.code, type]))
  const options = relationOptions((types.data ?? []).filter((type) => type.active))

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['contacts', 'relations'] })
  }

  const closeRow = () => {
    setAdding(false)
    setOption('')
    setOtherContactId(null)
    setReplacing(false)
  }

  const add = useMutation({
    mutationFn: (input: { code: string; direction: RelationDirection; other: string }) =>
      addRelation(contactId, {
        relationCode: input.code,
        direction: input.direction,
        otherContactId: input.other,
        since: todayInBerlin(),
        replace: replacing,
      }),
    onSuccess: async () => {
      await invalidate()
      closeRow()
      toast.success(strings.contact.relationAdded)
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
  const billing = rows.filter((row) => isOwnedExclusive(row, typesByCode))
  const rest = rows.filter((row) => !isOwnedExclusive(row, typesByCode))

  /** An exclusive type this contact already holds cannot be added a second
   *  time — the menu says so instead of letting the database say it. */
  const takenCodes = new Set(billing.map((row) => row.relationCode))

  const chosen = options.find((entry) => optionKey(entry) === option)
  const canAdd = chosen !== undefined && otherContactId !== null

  const openRow = (code?: string, direction?: RelationDirection) => {
    setAdding(true)
    setReplacing(code !== undefined)
    setOption(code && direction ? optionKey({ code, direction }) : '')
    setOtherContactId(null)
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{strings.contact.relations}</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          aria-label={strings.contact.relationAdd}
          onClick={() => (adding ? closeRow() : openRow())}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {rows.length === 0 && !adding && (
          <p className="text-muted-foreground text-sm">
            {relations.isPending ? strings.status.loading : strings.contact.relationsEmpty}
          </p>
        )}

        {rows.length > 0 && (
          <ul className="-mx-2">
            {billing.map((relation) => (
              <RelationRow
                key={relation.id}
                relation={relation}
                type={typesByCode.get(relation.relationCode)}
                onReplace={() => openRow(relation.relationCode, relation.direction)}
                onRemove={() => remove.mutate(relation.id)}
              />
            ))}
            {billing.length > 0 && rest.length > 0 && <li className="my-2 border-t" />}
            {rest.map((relation) => (
              <RelationRow
                key={relation.id}
                relation={relation}
                type={typesByCode.get(relation.relationCode)}
                onRemove={() => remove.mutate(relation.id)}
              />
            ))}
          </ul>
        )}

        {adding &&
          (options.length === 0 ? (
            <p className="text-muted-foreground text-sm">{strings.contact.relationNoTypes}</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
              <div className="w-56">
                <Label htmlFor="relation-kind">{strings.contact.relationKind}</Label>
                <Select value={option} onValueChange={setOption}>
                  <SelectTrigger id="relation-kind" className="mt-2 w-full">
                    <SelectValue placeholder={strings.contact.relationKind} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((entry) => {
                      // Only the side this contact would own can be taken:
                      // exclusivity counts per `from` contact.
                      const taken =
                        entry.direction === 'forward' &&
                        takenCodes.has(entry.code) &&
                        !(replacing && optionKey(entry) === option)

                      return (
                        <SelectItem
                          key={optionKey(entry)}
                          value={optionKey(entry)}
                          disabled={taken}
                        >
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
                  onChange={setOtherContactId}
                />
              </div>

              <div className="mb-1 flex gap-2">
                <Button variant="ghost" onClick={closeRow}>
                  {strings.contact.cancel}
                </Button>
                <Button
                  disabled={!canAdd || add.isPending}
                  onClick={() => {
                    if (!chosen || !otherContactId) return
                    add.mutate({
                      code: chosen.code,
                      direction: chosen.direction,
                      other: otherContactId,
                    })
                  }}
                >
                  {replacing ? strings.contact.relationReplace : strings.contact.relationSave}
                </Button>
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  )
}

function RelationRow({
  relation,
  type,
  onReplace,
  onRemove,
}: {
  relation: ContactRelation
  type: ContactRelationType | undefined
  onReplace?: () => void
  onRemove: () => void
}) {
  return (
    <li className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50">
      <Link
        className="flex flex-1 flex-wrap items-baseline gap-x-3"
        to="/contacts/$contactId"
        params={{ contactId: relation.otherContactId }}
      >
        <span className="w-48 shrink-0 text-muted-foreground text-sm">
          {/* An unknown code should not happen — a type in use cannot be
              deleted — so it falls back to the code rather than to nothing. */}
          {type ? relationLabel(type, relation.direction) : relation.relationCode}
        </span>
        <span className="font-medium">{relation.otherContactName}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {relation.otherContactNumber}
        </span>
      </Link>

      {onReplace && (
        <Button variant="ghost" size="sm" onClick={onReplace}>
          {strings.contact.relationReplace}
        </Button>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={strings.contact.relationRemove}>
            <X className="size-4" aria-hidden />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.contact.relationRemoveTitle}</AlertDialogTitle>
            <AlertDialogDescription>{strings.contact.relationRemoveBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.contact.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove}>
              {strings.contact.relationRemove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

/**
 * True for a relation of an exclusive type that this contact owns — it is the
 * `from` end, the side the exclusivity is enforced on. Read from the type, not
 * from the relation: the mirrored column on the row exists for the index, not
 * for the screen.
 */
function isOwnedExclusive(
  relation: ContactRelation,
  types: Map<string, ContactRelationType>,
): boolean {
  return relation.direction === 'forward' && Boolean(types.get(relation.relationCode)?.isExclusive)
}

/** One option per side, so the value has to carry both. */
function optionKey(option: { code: string; direction: RelationDirection }): string {
  return `${option.code}:${option.direction}`
}

/** Today in Europe/Berlin as `YYYY-MM-DD`. `toISOString()` would be UTC and
 *  give yesterday's date late in the evening. */
function todayInBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}
