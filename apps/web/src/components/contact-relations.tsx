import { type ContactRelation, relationLabel, relationOptions } from '@praxi/shared'
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
 * The relations of one contact (CLAUDE.md rule 4).
 *
 * Both records show the same row, each with its own label, so this component
 * is the same on either end. Adding offers every directed type twice — once
 * per side — and picking the inverse side stores the row with the ends
 * swapped.
 *
 * It acts immediately rather than travelling in the contact's payload: a
 * relation involves a second contact, and half of it belongs to a record that
 * is not being edited.
 */
export function ContactRelations({ contactId }: { contactId: string }) {
  const queryClient = useQueryClient()
  const relations = useQuery(relationListQueryOptions(contactId))
  const types = useQuery(relationTypeListQueryOptions(true))

  const [option, setOption] = useState('')
  const [otherContactId, setOtherContactId] = useState<string | null>(null)

  // Every type for the labels — a relation entered before its type was
  // deactivated still has to read correctly — but only the active ones are
  // offered.
  const typesByCode = new Map((types.data ?? []).map((type) => [type.code, type]))
  const options = relationOptions((types.data ?? []).filter((type) => type.active))

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['contacts', 'relations'] })
  }

  const add = useMutation({
    mutationFn: (input: { code: string; direction: 'forward' | 'inverse'; other: string }) =>
      addRelation(contactId, {
        relationCode: input.code,
        direction: input.direction,
        otherContactId: input.other,
        since: todayInBerlin(),
      }),
    onSuccess: async () => {
      await invalidate()
      setOption('')
      setOtherContactId(null)
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

  const chosen = options.find((entry) => optionKey(entry) === option)
  const canAdd = chosen !== undefined && otherContactId !== null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.contact.relations}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-muted-foreground text-sm">{strings.contact.relationsHint}</p>

        {relations.data && relations.data.length > 0 ? (
          <ul className="divide-y rounded-md border">
            {relations.data.map((relation) => (
              <li key={relation.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-56 shrink-0 text-muted-foreground text-sm">
                  {label(typesByCode, relation)}
                </span>
                <Link
                  className="flex-1 underline underline-offset-2"
                  to="/contacts/$contactId"
                  params={{ contactId: relation.otherContactId }}
                >
                  {relation.otherContactName}
                </Link>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {relation.otherContactNumber}
                </span>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={strings.contact.relationRemove}>
                      <X className="size-4" aria-hidden />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{strings.contact.relationRemoveTitle}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {strings.contact.relationRemoveBody}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{strings.contact.cancel}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove.mutate(relation.id)}>
                        {strings.contact.relationRemove}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {relations.isPending ? strings.status.loading : strings.contact.relationsEmpty}
          </p>
        )}

        {options.length === 0 ? (
          <p className="text-muted-foreground text-sm">{strings.contact.relationNoTypes}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-72">
              <Label htmlFor="relation-kind">{strings.contact.relationKind}</Label>
              <Select value={option} onValueChange={setOption}>
                <SelectTrigger id="relation-kind" className="mt-2 w-full">
                  <SelectValue placeholder={strings.contact.relationKind} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((entry) => (
                    <SelectItem key={optionKey(entry)} value={optionKey(entry)}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-72 flex-1">
              <Label htmlFor="relation-contact">{strings.contact.relationOther}</Label>
              <ContactPicker
                inputId="relation-contact"
                value={otherContactId}
                locked={false}
                onChange={setOtherContactId}
              />
            </div>

            <Button
              className="mb-1"
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
              <Plus className="size-4" aria-hidden />
              {strings.contact.relationSave}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** One option per side, so the value has to carry both. */
function optionKey(option: { code: string; direction: string }): string {
  return `${option.code}:${option.direction}`
}

/** The label this record reads. An unknown code should not happen — a type in
 *  use cannot be deleted — so it falls back to the code rather than to
 *  nothing, which would leave a row nobody can explain. */
function label(
  types: Map<string, Parameters<typeof relationLabel>[0]>,
  relation: ContactRelation,
): string {
  const type = types.get(relation.relationCode)
  return type ? relationLabel(type, relation.direction) : relation.relationCode
}

/** Today in Europe/Berlin as `YYYY-MM-DD`. `toISOString()` would be UTC and
 *  give yesterday's date late in the evening. */
function todayInBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}
