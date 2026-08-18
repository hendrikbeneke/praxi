import {
  type ActivityType,
  type ActivityTypeCreate,
  DEFAULT_COLOR,
  formatEuro,
  type Service,
  type ServiceGroup,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'
import {
  ActiveStatus,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import {
  activityTypeListQueryOptions,
  createActivityType,
  deleteActivityType,
  moveActivityType,
  updateActivityType,
} from '@/lib/activity-types'
import { ApiError } from '@/lib/api'
import { serviceGroupListQueryOptions, serviceListQueryOptions } from '@/lib/services'
import { strings } from '@/lib/strings'

/**
 * The catalogue of activity types (CLAUDE.md rule 6), one settings section
 * (D4: "Vorgangsarten"). Inline detail instead of a dialog, `/move` instead
 * of two `PUT`s, and — new in D4 — a real editor for the preset: add a
 * service or a group (resolved into its members immediately, rule 5),
 * reorder and remove, each with its own quantity. The dialog version only
 * offered a single service or group because the preset became a list in D1
 * and the surface to edit it properly was D4's job from the start.
 */
export function ActivityTypeSettings() {
  const queryClient = useQueryClient()
  const types = useQuery(activityTypeListQueryOptions(true))
  const services = useQuery(serviceListQueryOptions(false))
  const groups = useQuery(serviceGroupListQueryOptions(false))
  const detail = useInlineDetail()
  const [creating, setCreating] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['activity-types'] })
  const onError = (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : strings.activityType.saveFailed)

  const save = useMutation({
    mutationFn: (input: { id?: string; values: ActivityTypeCreate }) =>
      input.id
        ? updateActivityType(input.id, input.values)
        : createActivityType(input.values).then(() => undefined),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      setCreating(false)
      toast.success(strings.activityType.saved)
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteActivityType(id),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      toast.success(strings.activityType.deleted)
    },
    onError,
  })

  const move = useMutation({
    mutationFn: (input: { id: string; delta: 1 | -1 }) => moveActivityType(input.id, input.delta),
    onSuccess: invalidate,
    onError,
  })

  const rows = types.data ?? []
  const serviceRows = services.data ?? []
  const groupRows = groups.data ?? []
  const byServiceId = new Map(serviceRows.map((service) => [service.id, service]))

  return (
    <>
      <ListCard>
        <ListCardTitleBar
          title={strings.activityType.title}
          hint={strings.activityType.hint}
          action={
            <Button
              size="sm"
              onClick={() => {
                detail.close()
                setCreating((current) => !current)
              }}
            >
              <Plus className="size-4" aria-hidden />
              {strings.activityType.create}
            </Button>
          }
        />

        {creating && (
          <div className="border-b bg-muted/20 p-4">
            <ActivityTypeForm
              services={serviceRows}
              groups={groupRows}
              pending={save.isPending}
              onCancel={() => setCreating(false)}
              onSubmit={(values) => save.mutate({ values })}
            />
          </div>
        )}

        {rows.length === 0 ? (
          <p className="p-4 text-muted-foreground text-sm">
            {types.isPending ? strings.status.loading : strings.activityType.empty}
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
                      <ColorSwatch color={type.color} />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{type.label}</span>
                      <span className="ml-2 text-muted-foreground text-xs">{type.code}</span>
                      {type.isDefault && (
                        <Badge variant="outline" className="ml-2">
                          {strings.activityType.defaultBadge}
                        </Badge>
                      )}
                      {/* Duration and preset in one muted line, as the design
                          writes it: the duration (or "ohne übliche Dauer")
                          followed by the services, joined by "·" (K4). Without
                          it the row said what the type is called and nothing
                          about what applying it would do. */}
                      <span className="ml-2 text-muted-foreground text-xs">
                        {presetSummary(type, byServiceId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ActiveStatus active={type.active} />
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
                    <InlineDetailRow colSpan={4}>
                      {detail.editing ? (
                        <ActivityTypeForm
                          type={type}
                          services={serviceRows}
                          groups={groupRows}
                          pending={save.isPending}
                          onCancel={detail.stopEditing}
                          onSubmit={(values) => save.mutate({ id: type.id, values })}
                        />
                      ) : (
                        <ActivityTypeDetail
                          type={type}
                          services={serviceRows}
                          onEdit={detail.startEditing}
                          onClose={detail.close}
                          onDelete={() => remove.mutate(type.id)}
                        />
                      )}
                    </InlineDetailRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </ListCard>
      {/* The sentence the design puts under the card — it answers the question
          the list itself raises, so it belongs below it, not in the title bar (K3). */}
      <p className="mt-3 text-muted-foreground text-sm">{strings.activityType.footer}</p>
    </>
  )
}

/**
 * The colour as the calendar will show it — a dot, as the design draws it (K4).
 *
 * It used to be a filled rectangle carrying the first three letters of the
 * label, which made it the loudest thing on the settings screen and put a
 * truncated word ("Ers", "Fol") where the full one already stands beside it.
 * Handoff pattern 7: colour carries meaning or belongs to a primary surface, it
 * is not a decorative area. `readableTextOn` went with the fill — nothing is
 * written on the colour anymore.
 */
export function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  )
}

function ActivityTypeDetail({
  type,
  services,
  onEdit,
  onClose,
  onDelete,
}: {
  type: ActivityType
  services: readonly Service[]
  onEdit: () => void
  onClose: () => void
  onDelete: () => void
}) {
  const byId = new Map(services.map((service) => [service.id, service]))

  return (
    <div className="space-y-4">
      <dl className="flex flex-wrap gap-8">
        <DetailField label={strings.activityType.code} value={type.code} />
        <DetailField
          label={strings.activityType.defaultDuration}
          value={
            type.defaultDurationMin !== null
              ? `${type.defaultDurationMin} ${strings.service.durationMinutes}`
              : DASH
          }
        />
        <DetailField
          label={strings.activityType.isDefault}
          value={type.isDefault ? strings.activityType.defaultBadge : DASH}
        />
      </dl>

      <div>
        <span className="text-muted-foreground text-[11.5px] uppercase tracking-wide">
          {strings.activityType.preset}
        </span>
        {type.presetItems.length === 0 ? (
          <p className="mt-1 text-sm">{strings.activityType.presetEmpty}</p>
        ) : (
          <ol className="mt-1 space-y-1">
            {type.presetItems.map((item, index) => {
              const service = byId.get(item.serviceId)
              return (
                <li key={item.serviceId} className="flex items-baseline gap-2 text-sm">
                  <span className="text-muted-foreground text-xs tabular-nums">{index + 1}.</span>
                  <span>{service ? service.description : item.serviceId}</span>
                  {item.quantity > 1 && (
                    <span className="text-muted-foreground text-xs">× {item.quantity}</span>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button size="sm" variant="outline" onClick={onEdit}>
          {strings.actions.edit}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {strings.actions.close}
        </Button>
        <DeleteButton
          disabled={false}
          onConfirm={onDelete}
          title={strings.activityType.deleteTitle}
          body={strings.activityType.deleteBody}
        />
      </div>
    </div>
  )
}

function toValues(type: ActivityType): ActivityTypeCreate {
  return {
    code: type.code,
    label: type.label,
    color: type.color,
    defaultDurationMin: type.defaultDurationMin,
    presetItems: type.presetItems.map((item) => ({
      serviceId: item.serviceId,
      quantity: item.quantity,
    })),
    isDefault: type.isDefault,
    sortOrder: type.sortOrder,
    active: type.active,
  }
}

function ActivityTypeForm({
  type,
  services,
  groups,
  pending,
  onCancel,
  onSubmit,
}: {
  type?: ActivityType
  services: readonly Service[]
  groups: readonly ServiceGroup[]
  pending: boolean
  onCancel: () => void
  onSubmit: (values: ActivityTypeCreate) => void
}) {
  const [values, setValues] = useState<ActivityTypeCreate>(
    type
      ? toValues(type)
      : {
          code: '',
          label: '',
          color: DEFAULT_COLOR,
          defaultDurationMin: null,
          presetItems: [],
          isDefault: false,
          sortOrder: 100,
          active: true,
        },
  )

  const durationText = values.defaultDurationMin === null ? '' : String(values.defaultDurationMin)

  return (
    <div className="space-y-4">
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
          {type === undefined && (
            <p className="mt-1 text-muted-foreground text-xs">{strings.activityType.codeHint}</p>
          )}
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

      <div className="grid gap-4 sm:grid-cols-2">
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
            <ColorSwatch color={values.color} />
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
      </div>

      <PresetItemsEditor
        items={values.presetItems}
        onChange={(presetItems) => setValues({ ...values, presetItems })}
        services={services}
        groups={groups}
      />

      <div className="flex flex-wrap gap-6">
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
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {strings.actions.cancel}
        </Button>
        <Button
          type="button"
          disabled={pending || values.code.trim() === '' || values.label.trim() === ''}
          onClick={() => onSubmit(values)}
        >
          {strings.actions.save}
        </Button>
      </div>
    </div>
  )
}

type PresetItem = ActivityTypeCreate['presetItems'][number]

/**
 * Add, reorder, remove — the editor the dialog version deferred to D4. A
 * service already on the list cannot be added a second time (the unique
 * constraint on `activity_type_preset_item` would refuse it anyway); picking
 * a group adds whichever of its members are not already present and never
 * itself appears in the list (rule 5). Reordering here only touches this
 * component's local array — `position` is rewritten from it on save, same as
 * `service_group_item`.
 */
function PresetItemsEditor({
  items,
  onChange,
  services,
  groups,
}: {
  items: PresetItem[]
  onChange: (items: PresetItem[]) => void
  services: readonly Service[]
  groups: readonly ServiceGroup[]
}) {
  const chosenIds = new Set(items.map((item) => item.serviceId))
  const availableServices = services.filter((service) => !chosenIds.has(service.id))
  const byId = new Map(services.map((service) => [service.id, service]))

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const [row] = next.splice(index, 1)
    if (!row) return
    next.splice(target, 0, row)
    onChange(next)
  }

  return (
    <div>
      <Label>{strings.activityType.preset}</Label>
      <p className="mt-1 text-muted-foreground text-xs">{strings.activityType.presetLongHint}</p>

      {items.length === 0 ? (
        <p className="mt-2 text-muted-foreground text-sm">{strings.activityType.presetEmpty}</p>
      ) : (
        <ul className="mt-2 divide-y rounded-md border">
          {items.map((item, index) => {
            const service = byId.get(item.serviceId)
            return (
              <li key={item.serviceId} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1 text-sm">
                  {service ? service.description : item.serviceId}
                  {service && (
                    <span className="ml-2 text-muted-foreground text-xs">
                      {formatEuro(service.defaultPriceCents)}
                    </span>
                  )}
                </span>
                <Input
                  type="number"
                  min={1}
                  className="w-20"
                  aria-label={strings.activityType.presetQuantity}
                  value={item.quantity}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10)
                    const quantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
                    onChange(items.map((row, i) => (i === index ? { ...row, quantity } : row)))
                  }}
                />
                <OrderButtons index={index} count={items.length} pending={false} onMove={move} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={strings.actions.delete}
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <Select
        value=""
        onValueChange={(selected) => {
          if (selected.startsWith('service:')) {
            onChange([...items, { serviceId: selected.slice('service:'.length), quantity: 1 }])
            return
          }
          const group = groups.find((candidate) => `group:${candidate.id}` === selected)
          if (!group) return
          const additions = group.items
            .filter((groupItem) => !chosenIds.has(groupItem.serviceId))
            .map((groupItem) => ({ serviceId: groupItem.serviceId, quantity: 1 }))
          onChange([...items, ...additions])
        }}
      >
        <SelectTrigger className="mt-3 w-full sm:max-w-sm">
          <SelectValue placeholder={strings.activityType.presetAdd} />
        </SelectTrigger>
        <SelectContent>
          {availableServices.map((service) => (
            <SelectItem key={service.id} value={`service:${service.id}`}>
              {strings.activityType.presetService}: {service.description} —{' '}
              {formatEuro(service.defaultPriceCents)}
            </SelectItem>
          ))}
          {groups.map((group) => (
            <SelectItem key={group.id} value={`group:${group.id}`}>
              {strings.activityType.presetGroup}: {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * What applying this type would do, in one muted line: the usual duration — or
 * that there is none — followed by the services it prefills, joined by "·".
 *
 * The format is the design's, including "ohne übliche Dauer" for a type without
 * one: `—` would say "no value" where the point is that this kind of activity
 * has no usual length, which is a statement and not a gap (K4).
 *
 * A preset service the catalogue no longer offers is skipped rather than shown
 * as a blank: `presetItems` holds references, and the row is a summary, not the
 * place to report a stale one.
 */
function presetSummary(type: ActivityType, byServiceId: Map<string, Service>): string {
  const duration =
    type.defaultDurationMin === null
      ? strings.activityType.noUsualDuration
      : `${type.defaultDurationMin} ${strings.service.durationMinutes}`
  const services = type.presetItems
    .map((item) => byServiceId.get(item.serviceId)?.description)
    .filter((description): description is string => description !== undefined)
  return [duration, ...services].join(' · ')
}
