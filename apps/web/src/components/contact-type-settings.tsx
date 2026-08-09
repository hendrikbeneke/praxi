import type {
  ContactRelationType,
  ContactRelationTypeCreate,
  ContactRoleType,
  ContactRoleTypeCreate,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiError } from '@/lib/api'
import {
  createRelationType,
  createRoleType,
  deleteRelationType,
  deleteRoleType,
  relationTypeListQueryOptions,
  roleTypeListQueryOptions,
  updateRelationType,
  updateRoleType,
} from '@/lib/contact-types'
import { strings } from '@/lib/strings'

/**
 * The two catalogues behind CLAUDE.md rule 4, maintained here.
 *
 * System entries — the ones the software itself builds on — are marked and
 * cannot be deleted, and their code is fixed. Everything about how they read
 * belongs to the practitioner: label, order, and whether the contact list
 * gives the role a tab of its own.
 *
 * The order is moved one step at a time rather than dragged: two rows swap
 * their `sort_order`, which is two ordinary saves and needs no new endpoint.
 */
export function ContactTypeSettings() {
  return (
    <Tabs defaultValue="roles">
      <TabsList>
        <TabsTrigger value="roles">{strings.contactType.tabRoles}</TabsTrigger>
        <TabsTrigger value="relations">{strings.contactType.tabRelations}</TabsTrigger>
      </TabsList>

      <TabsContent value="roles" className="pt-6">
        <RoleTypes />
      </TabsContent>
      <TabsContent value="relations" className="pt-6">
        <RelationTypes />
      </TabsContent>
    </Tabs>
  )
}

function useCatalogue(key: string) {
  const queryClient = useQueryClient()
  return {
    invalidate: () => queryClient.invalidateQueries({ queryKey: [key] }),
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : strings.contactType.saveFailed),
  }
}

// ---------------------------------------------------------------- role types

function RoleTypes() {
  const { invalidate, onError } = useCatalogue('contact-role-types')
  const types = useQuery(roleTypeListQueryOptions(true))
  const [editing, setEditing] = useState<ContactRoleType | 'new' | null>(null)

  const save = useMutation({
    mutationFn: (input: { id?: string; values: ContactRoleTypeCreate }) =>
      input.id
        ? updateRoleType(input.id, input.values)
        : createRoleType(input.values).then(() => undefined),
    onSuccess: async () => {
      await invalidate()
      setEditing(null)
      toast.success(strings.contactType.saved)
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteRoleType(id),
    onSuccess: async () => {
      await invalidate()
      toast.success(strings.contactType.deleted)
    },
    onError,
  })

  const rows = types.data ?? []

  const move = (index: number, delta: number) => {
    const current = rows[index]
    const neighbour = rows[index + delta]
    if (!current || !neighbour) return

    save.mutate({
      id: current.id,
      values: { ...toRoleValues(current), sortOrder: neighbour.sortOrder },
    })
    save.mutate({
      id: neighbour.id,
      values: { ...toRoleValues(neighbour), sortOrder: current.sortOrder },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden />
          {strings.contactType.createRole}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {types.isPending ? strings.status.loading : strings.contactType.emptyRoles}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map((type, index) => (
            <li key={type.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1">
                <span className="font-medium">{type.label}</span>
                <span className="ml-2 text-muted-foreground text-xs">{type.code}</span>
              </span>

              {type.showAsTab && <Badge variant="outline">{strings.contactType.showAsTab}</Badge>}
              {!type.active && <Badge variant="secondary">{strings.contactType.inactive}</Badge>}
              {type.isSystem && (
                <Badge variant="secondary" title={strings.contactType.systemHint}>
                  {strings.contactType.systemBadge}
                </Badge>
              )}

              <OrderButtons
                index={index}
                count={rows.length}
                pending={save.isPending}
                onMove={move}
              />

              <Button
                variant="ghost"
                size="icon"
                aria-label={strings.contactType.editRoleTitle}
                onClick={() => setEditing(type)}
              >
                <Pencil className="size-4" aria-hidden />
              </Button>

              <DeleteButton
                disabled={type.isSystem}
                onConfirm={() => remove.mutate(type.id)}
                hint={type.isSystem ? strings.contactType.systemHint : undefined}
              />
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <RoleTypeDialog
          type={editing === 'new' ? undefined : editing}
          pending={save.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(values) =>
            save.mutate(editing === 'new' ? { values } : { id: editing.id, values })
          }
        />
      )}
    </div>
  )
}

function toRoleValues(type: ContactRoleType): ContactRoleTypeCreate {
  return {
    code: type.code,
    label: type.label,
    showAsTab: type.showAsTab,
    sortOrder: type.sortOrder,
    active: type.active,
  }
}

function RoleTypeDialog({
  type,
  pending,
  onClose,
  onSubmit,
}: {
  type?: ContactRoleType
  pending: boolean
  onClose: () => void
  onSubmit: (values: ContactRoleTypeCreate) => void
}) {
  const [values, setValues] = useState<ContactRoleTypeCreate>(
    type
      ? toRoleValues(type)
      : { code: '', label: '', showAsTab: false, sortOrder: 100, active: true },
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {type ? strings.contactType.editRoleTitle : strings.contactType.createRoleTitle}
          </DialogTitle>
          <DialogDescription>{strings.contactType.codeHint}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="role-code">{strings.contactType.code}</Label>
            <Input
              id="role-code"
              className="mt-2"
              // A code is the handle other rows point at, so it is fixed once
              // the entry exists — for system and own entries alike.
              disabled={type !== undefined}
              value={values.code}
              onChange={(event) => setValues({ ...values, code: event.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="role-label">{strings.contactType.label}</Label>
            <Input
              id="role-label"
              className="mt-2"
              value={values.label}
              onChange={(event) => setValues({ ...values, label: event.target.value })}
            />
          </div>

          <CheckboxField
            id="role-tab"
            label={strings.contactType.showAsTab}
            checked={values.showAsTab}
            onChange={(checked) => setValues({ ...values, showAsTab: checked })}
          />
          <CheckboxField
            id="role-active"
            label={strings.contactType.active}
            checked={values.active}
            onChange={(checked) => setValues({ ...values, active: checked })}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {strings.actions.cancel}
          </Button>
          <Button
            disabled={pending || values.code.trim() === '' || values.label.trim() === ''}
            onClick={() => onSubmit(values)}
          >
            {strings.actions.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------ relation types

function RelationTypes() {
  const { invalidate, onError } = useCatalogue('contact-relation-types')
  const types = useQuery(relationTypeListQueryOptions(true))
  const [editing, setEditing] = useState<ContactRelationType | 'new' | null>(null)

  const save = useMutation({
    mutationFn: (input: { id?: string; values: ContactRelationTypeCreate }) =>
      input.id
        ? updateRelationType(input.id, input.values)
        : createRelationType(input.values).then(() => undefined),
    onSuccess: async () => {
      await invalidate()
      setEditing(null)
      toast.success(strings.contactType.saved)
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteRelationType(id),
    onSuccess: async () => {
      await invalidate()
      toast.success(strings.contactType.deleted)
    },
    onError,
  })

  const rows = types.data ?? []

  const move = (index: number, delta: number) => {
    const current = rows[index]
    const neighbour = rows[index + delta]
    if (!current || !neighbour) return

    save.mutate({
      id: current.id,
      values: { ...toRelationValues(current), sortOrder: neighbour.sortOrder },
    })
    save.mutate({
      id: neighbour.id,
      values: { ...toRelationValues(neighbour), sortOrder: current.sortOrder },
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{strings.contactType.directionHint}</p>

      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden />
          {strings.contactType.createRelation}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {types.isPending ? strings.status.loading : strings.contactType.emptyRelations}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map((type, index) => (
            <li key={type.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1">
                <span className="font-medium">{type.labelForward}</span>
                {type.labelInverse && (
                  <span className="text-muted-foreground"> ↔ {type.labelInverse}</span>
                )}
                <span className="ml-2 text-muted-foreground text-xs">{type.code}</span>
              </span>

              {type.isExclusive && (
                <Badge variant="outline">{strings.contactType.exclusiveBadge}</Badge>
              )}
              {type.isSymmetric && (
                <Badge variant="outline">{strings.contactType.symmetricBadge}</Badge>
              )}
              {!type.active && <Badge variant="secondary">{strings.contactType.inactive}</Badge>}
              {type.isSystem && (
                <Badge variant="secondary" title={strings.contactType.systemHint}>
                  {strings.contactType.systemBadge}
                </Badge>
              )}

              <OrderButtons
                index={index}
                count={rows.length}
                pending={save.isPending}
                onMove={move}
              />

              <Button
                variant="ghost"
                size="icon"
                aria-label={strings.contactType.editRelationTitle}
                onClick={() => setEditing(type)}
              >
                <Pencil className="size-4" aria-hidden />
              </Button>

              <DeleteButton
                disabled={type.isSystem}
                onConfirm={() => remove.mutate(type.id)}
                hint={type.isSystem ? strings.contactType.systemHint : undefined}
              />
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <RelationTypeDialog
          type={editing === 'new' ? undefined : editing}
          pending={save.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(values) =>
            save.mutate(editing === 'new' ? { values } : { id: editing.id, values })
          }
        />
      )}
    </div>
  )
}

function toRelationValues(type: ContactRelationType): ContactRelationTypeCreate {
  return {
    code: type.code,
    labelForward: type.labelForward,
    labelInverse: type.labelInverse,
    isSymmetric: type.isSymmetric,
    isExclusive: type.isExclusive,
    sortOrder: type.sortOrder,
    active: type.active,
  }
}

function RelationTypeDialog({
  type,
  pending,
  onClose,
  onSubmit,
}: {
  type?: ContactRelationType
  pending: boolean
  onClose: () => void
  onSubmit: (values: ContactRelationTypeCreate) => void
}) {
  const [values, setValues] = useState<ContactRelationTypeCreate>(
    type
      ? toRelationValues(type)
      : {
          code: '',
          labelForward: '',
          labelInverse: '',
          isSymmetric: false,
          isExclusive: false,
          sortOrder: 100,
          active: true,
        },
  )

  /** A symmetric type has no second label — the check constraint says so, and
   *  the field disappears rather than being sent empty. */
  const setSymmetric = (checked: boolean) =>
    setValues({ ...values, isSymmetric: checked, labelInverse: checked ? null : '' })

  const complete =
    values.code.trim() !== '' &&
    values.labelForward.trim() !== '' &&
    (values.isSymmetric || (values.labelInverse ?? '').trim() !== '')

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {type ? strings.contactType.editRelationTitle : strings.contactType.createRelationTitle}
          </DialogTitle>
          <DialogDescription>{strings.contactType.directionHint}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="relation-code">{strings.contactType.code}</Label>
            <Input
              id="relation-code"
              className="mt-2"
              disabled={type !== undefined}
              value={values.code}
              onChange={(event) => setValues({ ...values, code: event.target.value })}
            />
            <p className="mt-1 text-muted-foreground text-xs">{strings.contactType.codeHint}</p>
          </div>

          <div>
            <Label htmlFor="relation-forward">{strings.contactType.labelForward}</Label>
            <Input
              id="relation-forward"
              className="mt-2"
              value={values.labelForward}
              onChange={(event) => setValues({ ...values, labelForward: event.target.value })}
            />
          </div>

          <CheckboxField
            id="relation-symmetric"
            label={strings.contactType.symmetric}
            hint={strings.contactType.symmetricHint}
            checked={values.isSymmetric}
            onChange={setSymmetric}
          />

          {!values.isSymmetric && (
            <div>
              <Label htmlFor="relation-inverse">{strings.contactType.labelInverse}</Label>
              <Input
                id="relation-inverse"
                className="mt-2"
                value={values.labelInverse ?? ''}
                onChange={(event) => setValues({ ...values, labelInverse: event.target.value })}
              />
            </div>
          )}

          <CheckboxField
            id="relation-exclusive"
            label={strings.contactType.exclusive}
            hint={strings.contactType.exclusiveHint}
            checked={values.isExclusive}
            onChange={(checked) => setValues({ ...values, isExclusive: checked })}
          />
          <CheckboxField
            id="relation-active"
            label={strings.contactType.active}
            checked={values.active}
            onChange={(checked) => setValues({ ...values, active: checked })}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {strings.actions.cancel}
          </Button>
          <Button disabled={pending || !complete} onClick={() => onSubmit(values)}>
            {strings.actions.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ----------------------------------------------------------------- both lists

function OrderButtons({
  index,
  count,
  pending,
  onMove,
}: {
  index: number
  count: number
  pending: boolean
  onMove: (index: number, delta: number) => void
}) {
  return (
    <span className="flex">
      <Button
        variant="ghost"
        size="icon"
        aria-label={strings.contactType.moveUp}
        disabled={index === 0 || pending}
        onClick={() => onMove(index, -1)}
      >
        <ChevronUp className="size-4" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={strings.contactType.moveDown}
        disabled={index === count - 1 || pending}
        onClick={() => onMove(index, 1)}
      >
        <ChevronDown className="size-4" aria-hidden />
      </Button>
    </span>
  )
}

function DeleteButton({
  disabled,
  hint,
  onConfirm,
}: {
  disabled: boolean
  hint?: string | undefined
  onConfirm: () => void
}) {
  if (disabled) {
    return (
      <Button variant="ghost" size="icon" disabled title={hint} aria-label={strings.actions.delete}>
        <Trash2 className="size-4" aria-hidden />
      </Button>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={strings.actions.delete}>
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{strings.contactType.deleteTitle}</AlertDialogTitle>
          <AlertDialogDescription>{strings.contactType.deleteBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{strings.actions.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{strings.actions.delete}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function CheckboxField({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
      </div>
      {hint && <p className="mt-1 ml-7 text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}
