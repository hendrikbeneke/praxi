import {
  type ActivityType,
  type ActivityTypeCreate,
  DEFAULT_COLOR,
  formatEuro,
  readableTextOn,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CheckboxField, DeleteButton, OrderButtons } from '@/components/catalogue-controls'
import { ReadModeFieldset } from '@/components/read-mode-fieldset'
import { ReadModeFooter } from '@/components/read-mode-footer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  activityTypeListQueryOptions,
  createActivityType,
  deleteActivityType,
  updateActivityType,
} from '@/lib/activity-types'
import { ApiError } from '@/lib/api'
import { serviceGroupListQueryOptions, serviceListQueryOptions } from '@/lib/services'
import { strings } from '@/lib/strings'

/**
 * The catalogue of activity types (CLAUDE.md rule 6), maintained here.
 *
 * Same shape as the two catalogues in `contact-type-settings.tsx`, minus the
 * system entries — nothing in the software depends on a particular activity
 * type existing. What cannot be deleted is a type that is in use, and the
 * server says so.
 *
 * The two preset fields are one control on screen, because at most one of them
 * may be set: a select over services *and* groups, prefixed by their kind.
 * Modelling them as two fields would let both be filled and then be refused by
 * the check constraint.
 */
export function ActivityTypeSettings() {
  const queryClient = useQueryClient()
  const types = useQuery(activityTypeListQueryOptions(true))
  const [editing, setEditing] = useState<ActivityType | 'new' | null>(null)

  const onError = (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : strings.activityType.saveFailed)

  const save = useMutation({
    mutationFn: (input: { id?: string; values: ActivityTypeCreate }) =>
      input.id
        ? updateActivityType(input.id, input.values)
        : createActivityType(input.values).then(() => undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['activity-types'] })
      setEditing(null)
      toast.success(strings.activityType.saved)
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteActivityType(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['activity-types'] })
      toast.success(strings.activityType.deleted)
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
      values: { ...toValues(current), sortOrder: neighbour.sortOrder },
    })
    save.mutate({
      id: neighbour.id,
      values: { ...toValues(neighbour), sortOrder: current.sortOrder },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden />
          {strings.activityType.create}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {types.isPending ? strings.status.loading : strings.activityType.empty}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map((type, index) => (
            <li key={type.id} className="flex items-center gap-3 px-4 py-3">
              <ColorSwatch color={type.color} label={type.label} />

              <span className="flex-1">
                <span className="font-medium">{type.label}</span>
                <span className="ml-2 text-muted-foreground text-xs">{type.code}</span>
              </span>

              {type.defaultDurationMin !== null && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {type.defaultDurationMin} {strings.service.durationMinutes}
                </span>
              )}
              {type.isDefault && (
                <Badge variant="outline">{strings.activityType.defaultBadge}</Badge>
              )}
              {!type.active && <Badge variant="secondary">{strings.activityType.inactive}</Badge>}

              <OrderButtons
                index={index}
                count={rows.length}
                pending={save.isPending}
                onMove={move}
              />

              <Button
                variant="ghost"
                size="icon"
                aria-label={strings.activityType.editTitle}
                onClick={() => setEditing(type)}
              >
                <Pencil className="size-4" aria-hidden />
              </Button>

              <DeleteButton
                disabled={false}
                onConfirm={() => remove.mutate(type.id)}
                title={strings.activityType.deleteTitle}
                body={strings.activityType.deleteBody}
              />
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <ActivityTypeDialog
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

/** The colour as the calendar will show it, with a label on top in whichever
 *  of black and white reads better — so the choice is visible while making it. */
export function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="inline-flex h-6 min-w-14 items-center justify-center rounded px-2 text-xs"
      style={{ backgroundColor: color, color: readableTextOn(color) }}
    >
      {label.slice(0, 3)}
    </span>
  )
}

function toValues(type: ActivityType): ActivityTypeCreate {
  return {
    code: type.code,
    label: type.label,
    color: type.color,
    defaultDurationMin: type.defaultDurationMin,
    defaultServiceId: type.defaultServiceId,
    defaultServiceGroupId: type.defaultServiceGroupId,
    isDefault: type.isDefault,
    sortOrder: type.sortOrder,
    active: type.active,
  }
}

/** The two preset columns as one value, so the "at most one" rule cannot be
 *  broken in the form at all. */
const NO_PRESET = 'none'
const presetValue = (values: ActivityTypeCreate): string => {
  if (values.defaultServiceId) return `service:${values.defaultServiceId}`
  if (values.defaultServiceGroupId) return `group:${values.defaultServiceGroupId}`
  return NO_PRESET
}

function withPreset(values: ActivityTypeCreate, selected: string): ActivityTypeCreate {
  const [kind, id] = selected.split(':')
  return {
    ...values,
    defaultServiceId: kind === 'service' ? (id ?? null) : null,
    defaultServiceGroupId: kind === 'group' ? (id ?? null) : null,
  }
}

function ActivityTypeDialog({
  type,
  pending,
  onClose,
  onSubmit,
}: {
  type?: ActivityType
  pending: boolean
  onClose: () => void
  onSubmit: (values: ActivityTypeCreate) => void
}) {
  const services = useQuery(serviceListQueryOptions(false))
  const groups = useQuery(serviceGroupListQueryOptions(false))

  const [values, setValues] = useState<ActivityTypeCreate>(
    type
      ? toValues(type)
      : {
          code: '',
          label: '',
          color: DEFAULT_COLOR,
          defaultDurationMin: null,
          defaultServiceId: null,
          defaultServiceGroupId: null,
          isDefault: false,
          sortOrder: 100,
          active: true,
        },
  )
  /** A new entry has nothing to read; an existing one opens in read mode
   *  (CLAUDE.md, read mode first). */
  const [editing, setEditing] = useState(type === undefined)

  const durationText = values.defaultDurationMin === null ? '' : String(values.defaultDurationMin)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {type ? strings.activityType.editTitle : strings.activityType.createTitle}
          </DialogTitle>
          <DialogDescription>{strings.activityType.presetHint}</DialogDescription>
        </DialogHeader>

        <ReadModeFieldset disabled={!editing} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="activity-type-code">{strings.activityType.code}</Label>
              <Input
                id="activity-type-code"
                className="mt-2"
                // The handle `activity.type` points at: fixed once it exists.
                disabled={type !== undefined}
                value={values.code}
                onChange={(event) => setValues({ ...values, code: event.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="activity-type-label">{strings.activityType.label}</Label>
              <Input
                id="activity-type-label"
                className="mt-2"
                value={values.label}
                onChange={(event) => setValues({ ...values, label: event.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="activity-type-color">{strings.activityType.color}</Label>
            <div className="mt-2 flex items-center gap-3">
              <Input
                id="activity-type-color"
                type="color"
                className="h-9 w-16 p-1"
                value={values.color}
                onChange={(event) => setValues({ ...values, color: event.target.value })}
              />
              <ColorSwatch
                color={values.color}
                label={values.label || strings.activityType.label}
              />
            </div>
            <p className="mt-1 text-muted-foreground text-xs">{strings.activityType.colorHint}</p>
          </div>

          <div>
            <Label htmlFor="activity-type-duration">{strings.activityType.defaultDuration}</Label>
            <Input
              id="activity-type-duration"
              type="number"
              min={1}
              className="mt-2 max-w-40"
              value={durationText}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10)
                setValues({
                  ...values,
                  defaultDurationMin: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
                })
              }}
            />
            <p className="mt-1 text-muted-foreground text-xs">
              {strings.activityType.defaultDurationHint}
            </p>
          </div>

          <div>
            <Label htmlFor="activity-type-preset">{strings.activityType.preset}</Label>
            <Select
              value={presetValue(values)}
              onValueChange={(selected) => setValues(withPreset(values, selected))}
            >
              <SelectTrigger id="activity-type-preset" className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PRESET}>{strings.activityType.presetNone}</SelectItem>
                {(services.data ?? []).map((service) => (
                  <SelectItem key={service.id} value={`service:${service.id}`}>
                    {strings.activityType.presetService}: {service.description} —{' '}
                    {formatEuro(service.defaultPriceCents)}
                  </SelectItem>
                ))}
                {(groups.data ?? []).map((group) => (
                  <SelectItem key={group.id} value={`group:${group.id}`}>
                    {strings.activityType.presetGroup}: {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <CheckboxField
            id="activity-type-default"
            label={strings.activityType.isDefault}
            hint={strings.activityType.isDefaultHint}
            checked={values.isDefault}
            onChange={(checked) => setValues({ ...values, isDefault: checked })}
          />
          <CheckboxField
            id="activity-type-active"
            label={strings.activityType.active}
            hint={strings.activityType.activeHint}
            checked={values.active}
            onChange={(checked) => setValues({ ...values, active: checked })}
          />
        </ReadModeFieldset>

        {editing ? (
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
        ) : (
          <ReadModeFooter onClose={onClose} onEdit={() => setEditing(true)} />
        )}
      </DialogContent>
    </Dialog>
  )
}
