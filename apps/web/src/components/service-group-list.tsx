import { formatEuro, type Service, type ServiceGroup, type ServiceGroupInput } from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'
import {
  ActiveStatus,
  CheckboxField,
  DeleteButton,
  OrderButtons,
} from '@/components/catalogue-controls'
import { useInlineDetail } from '@/components/inline-detail-row'
import { ListCard, ListCardTitleBar, listHeaderClass } from '@/components/list-card'
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
import { ApiError } from '@/lib/api'
import {
  createServiceGroup,
  deleteServiceGroup,
  moveServiceGroup,
  serviceGroupListQueryOptions,
  updateServiceGroup,
} from '@/lib/services'
import { strings } from '@/lib/strings'

/**
 * Leistungsgruppen — a selection helper, resolved into individual services
 * the moment it is picked (CLAUDE.md rule 5); nothing here is ever stored as
 * a group reference. Same reasoning as `service-list.tsx` for why this is a
 * plain CSS grid rather than `ListCard`'s `<Table>` pieces: 150px Gruppe,
 * `1fr` Enthalten, 96px Anzahl, 84px Summe — a mix a table's auto layout
 * cannot reproduce. Header and rows share `GROUP_GRID`.
 */
const GROUP_GRID = 'grid grid-cols-[150px_minmax(0,1fr)_96px_84px] items-baseline gap-2.5'

function groupSum(group: ServiceGroup): number {
  return group.items.reduce((sum, item) => sum + item.defaultPriceCents * item.quantity, 0)
}

export function ServiceGroupList({ services }: { services: Service[] }) {
  const queryClient = useQueryClient()
  // Point 3 (D5): inactive groups stay in the list, the status is in the row.
  const groups = useQuery(serviceGroupListQueryOptions(true))
  const detail = useInlineDetail()
  const [creating, setCreating] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['service-groups'] })
  const onError = (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : strings.service.saveFailed)

  const save = useMutation({
    mutationFn: (input: { id?: string; values: ServiceGroupInput }) =>
      input.id ? updateServiceGroup(input.id, input.values) : createServiceGroup(input.values),
    onSuccess: async (_result, input) => {
      await invalidate()
      detail.close()
      setCreating(false)
      toast.success(input.id ? strings.service.groupSaved : strings.service.groupCreated)
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteServiceGroup(id),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      toast.success(strings.service.groupDeleted)
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : strings.service.groupDeleteFailed),
  })

  const move = useMutation({
    mutationFn: (input: { id: string; delta: 1 | -1 }) => moveServiceGroup(input.id, input.delta),
    onSuccess: invalidate,
    onError,
  })

  const rows = groups.data ?? []

  return (
    <ListCard>
      <ListCardTitleBar
        title={strings.service.tabGroups}
        hint={strings.service.groupHint}
        action={
          <Button
            size="sm"
            onClick={() => {
              detail.close()
              setCreating((current) => !current)
            }}
          >
            <Plus className="size-4" aria-hidden />
            {strings.service.groupCreate}
          </Button>
        }
      />

      {creating && (
        <div className="border-b bg-muted/20 p-4">
          <p className="mb-4 flex items-baseline gap-2">
            <span className="font-semibold">{strings.service.groupCreateTitle}</span>
            <span className="text-muted-foreground text-sm">{strings.service.groupCreateHint}</span>
          </p>
          <ServiceGroupForm
            services={services}
            pending={save.isPending}
            onCancel={() => setCreating(false)}
            onSubmit={(values) => save.mutate({ values })}
          />
        </div>
      )}

      <div className={`${GROUP_GRID} border-b bg-muted/40 px-4 py-[9px] ${listHeaderClass}`}>
        <span>{strings.service.groupColumnLabel}</span>
        <span>{strings.service.groupColumnContains}</span>
        <span>{strings.service.groupColumnCount}</span>
        <span className="text-right">{strings.service.groupSum}</span>
      </div>

      {rows.length === 0 ? (
        <p className="p-4 text-muted-foreground text-sm">
          {groups.isPending ? strings.status.loading : strings.service.groupEmpty}
        </p>
      ) : (
        rows.map((group, index) => (
          <Fragment key={group.id}>
            <div className="flex items-center gap-3 border-b px-4 last:border-b-0">
              <button
                type="button"
                className={`${GROUP_GRID} min-w-0 flex-1 py-2.5 text-left`}
                onClick={() => {
                  setCreating(false)
                  detail.toggle(group.id)
                }}
              >
                <span className="truncate font-medium">{group.name}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {group.items.map((item) => `${item.quantity}× ${item.description}`).join(', ') ||
                    strings.service.groupItemsEmpty}
                </span>
                <span className="text-muted-foreground text-xs">
                  {strings.service.groupCount(group.items.length)}
                </span>
                <span className="text-right font-semibold tabular-nums">
                  {formatEuro(groupSum(group))}
                </span>
              </button>

              <span className="w-[66px] shrink-0">
                <ActiveStatus active={group.active} />
              </span>

              <OrderButtons
                index={index}
                count={rows.length}
                pending={move.isPending}
                onMove={(i, delta) => {
                  const row = rows[i]
                  if (row) move.mutate({ id: row.id, delta: delta as 1 | -1 })
                }}
              />
            </div>

            {detail.isOpen(group.id) && (
              <div className="border-b bg-muted/30 p-4">
                {detail.editing ? (
                  <ServiceGroupForm
                    group={group}
                    services={services}
                    pending={save.isPending}
                    onCancel={detail.stopEditing}
                    onSubmit={(values) => save.mutate({ id: group.id, values })}
                  />
                ) : (
                  <div className="space-y-4">
                    {group.items.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        {strings.service.groupItemsEmpty}
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {group.items.map((item) => (
                          <li key={item.serviceId} className="flex items-baseline gap-3 text-sm">
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {item.quantity}×
                            </span>
                            <span className="flex-1">
                              {item.description}
                              {!item.serviceActive && (
                                <span className="ml-2 text-destructive text-xs">
                                  {strings.service.groupInactiveService}
                                </span>
                              )}
                            </span>
                            <span className="tabular-nums">
                              {formatEuro(item.defaultPriceCents * item.quantity)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="flex items-baseline justify-between border-t pt-3 font-semibold">
                      <span>{strings.service.groupSum}</span>
                      <span className="tabular-nums">{formatEuro(groupSum(group))}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                      <Button size="sm" variant="outline" onClick={detail.startEditing}>
                        {strings.actions.edit}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={detail.close}>
                        {strings.actions.close}
                      </Button>
                      <DeleteButton
                        disabled={false}
                        onConfirm={() => remove.mutate(group.id)}
                        title={strings.service.groupDeleteTitle}
                        body={strings.service.groupDeleteBody}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </Fragment>
        ))
      )}
    </ListCard>
  )
}

type DraftItem = { serviceId: string; quantity: number }

function toDraftItems(group: ServiceGroup | undefined): DraftItem[] {
  return group?.items.map((item) => ({ serviceId: item.serviceId, quantity: item.quantity })) ?? []
}

function ServiceGroupForm({
  group,
  services,
  pending,
  onCancel,
  onSubmit,
}: {
  group?: ServiceGroup
  services: Service[]
  pending: boolean
  onCancel: () => void
  onSubmit: (values: ServiceGroupInput) => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [active, setActive] = useState(group?.active ?? true)
  const [items, setItems] = useState<DraftItem[]>(toDraftItems(group))
  const [nameTouched, setNameTouched] = useState(false)

  const byId = new Map(services.map((entry) => [entry.id, entry]))
  const chosen = new Set(items.map((item) => item.serviceId))
  const available = services.filter((entry) => !chosen.has(entry.id))

  const total = items.reduce(
    (sum, item) => sum + (byId.get(item.serviceId)?.defaultPriceCents ?? 0) * item.quantity,
    0,
  )

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const [row] = next.splice(index, 1)
    if (!row) return
    next.splice(target, 0, row)
    setItems(next)
  }

  const nameInvalid = nameTouched && name.trim() === ''

  function submit() {
    setNameTouched(true)
    if (name.trim() === '') return
    onSubmit({ name: name.trim(), sortOrder: group?.sortOrder ?? 100, active, items })
  }

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="service-group-name">{strings.service.groupName}</Label>
        <Input
          id="service-group-name"
          className="mt-2"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameInvalid ? true : undefined}
        />
        {nameInvalid && (
          <p className="mt-1 text-destructive text-sm">{strings.validation.required}</p>
        )}
      </div>

      <div>
        <p className="font-medium text-sm">{strings.service.groupItems}</p>

        {items.length === 0 ? (
          <p className="mt-2 text-muted-foreground text-sm">{strings.service.groupItemsEmpty}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {items.map((item, index) => {
              const entry = byId.get(item.serviceId)
              return (
                <li key={item.serviceId} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{entry?.description ?? item.serviceId}</p>
                    {entry && !entry.active && (
                      <p className="text-destructive text-xs">
                        {strings.service.groupInactiveService}
                      </p>
                    )}
                  </div>

                  <Input
                    type="number"
                    min={1}
                    max={999}
                    className="w-20"
                    aria-label={strings.service.groupQuantity}
                    value={item.quantity}
                    onChange={(event) => {
                      const quantity = Number.parseInt(event.target.value, 10)
                      setItems((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index
                            ? { ...row, quantity: Number.isFinite(quantity) ? quantity : 1 }
                            : row,
                        ),
                      )
                    }}
                  />

                  <span className="w-24 shrink-0 text-right text-muted-foreground text-sm tabular-nums">
                    {formatEuro((entry?.defaultPriceCents ?? 0) * item.quantity)}
                  </span>

                  <OrderButtons index={index} count={items.length} pending={false} onMove={move} />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={strings.service.groupRemove}
                    onClick={() =>
                      setItems((current) => current.filter((_, rowIndex) => rowIndex !== index))
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        {items.length > 0 && (
          <p className="mt-3 text-right text-sm">
            {strings.service.groupSum}:{' '}
            <span className="font-medium tabular-nums">{formatEuro(total)}</span>
          </p>
        )}

        {available.length > 0 && (
          <Select
            value=""
            onValueChange={(serviceId) =>
              setItems((current) => [...current, { serviceId, quantity: 1 }])
            }
          >
            <SelectTrigger className="mt-4 w-full sm:max-w-sm">
              <SelectValue placeholder={strings.service.groupChooseService} />
            </SelectTrigger>
            <SelectContent>
              {available.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.description} — {formatEuro(entry.defaultPriceCents)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <CheckboxField
        id="service-group-active"
        label={strings.service.active}
        hint={strings.service.activeHint}
        checked={active}
        onChange={setActive}
      />

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {strings.service.cancel}
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? strings.service.saving : strings.service.save}
        </Button>
      </div>
    </div>
  )
}
