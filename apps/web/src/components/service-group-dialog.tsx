import { formatEuro, type Service, type ServiceGroup, type ServiceGroupInput } from '@praxi/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ReadModeFieldset } from '@/components/read-mode-fieldset'
import { ReadModeFooter } from '@/components/read-mode-footer'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { createServiceGroup, updateServiceGroup } from '@/lib/services'
import { strings } from '@/lib/strings'

type DraftItem = { serviceId: string; quantity: number }

/**
 * Plain state rather than react-hook-form: the interesting part is an ordered
 * list with add, remove and move, which a field array would only get in the
 * way of. There is one required field and it is checked on submit.
 */
export function ServiceGroupDialog({
  group,
  services,
  open,
  onOpenChange,
}: {
  group?: ServiceGroup | undefined
  services: Service[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [active, setActive] = useState(true)
  const [items, setItems] = useState<DraftItem[]>([])
  const [nameTouched, setNameTouched] = useState(false)
  /** A new group has nothing to read, so it starts editable; an existing one
   *  opens in read mode (CLAUDE.md, read mode first). */
  const [editing, setEditing] = useState(true)

  useEffect(() => {
    if (!open) return
    setEditing(group === undefined)
    setName(group?.name ?? '')
    setActive(group?.active ?? true)
    setItems(
      group?.items.map((item) => ({ serviceId: item.serviceId, quantity: item.quantity })) ?? [],
    )
    setNameTouched(false)
  }, [open, group])

  const mutation = useMutation({
    mutationFn: (input: ServiceGroupInput) =>
      group ? updateServiceGroup(group.id, input) : createServiceGroup(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['service-groups'] })
      toast.success(group ? strings.service.groupSaved : strings.service.groupCreated)
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.service.saveFailed)
    },
  })

  const byId = new Map(services.map((entry) => [entry.id, entry]))
  const chosen = new Set(items.map((item) => item.serviceId))
  const available = services.filter((entry) => !chosen.has(entry.id))

  const total = items.reduce(
    (sum, item) => sum + (byId.get(item.serviceId)?.defaultPriceCents ?? 0) * item.quantity,
    0,
  )

  function move(index: number, by: number) {
    setItems((current) => {
      const next = [...current]
      const target = index + by
      const moved = next[index]
      const displaced = next[target]
      if (!moved || !displaced) return current
      next[index] = displaced
      next[target] = moved
      return next
    })
  }

  function submit() {
    setNameTouched(true)
    if (name.trim() === '') return
    // `sortOrder` is not a form field yet — reordering arrives with the
    // redesigned catalogue screen (D5) — so it is carried through unchanged.
    mutation.mutate({ name: name.trim(), sortOrder: group?.sortOrder ?? 0, active, items })
  }

  const nameInvalid = nameTouched && name.trim() === ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {group ? strings.service.groupEditTitle : strings.service.groupCreateTitle}
          </DialogTitle>
          <DialogDescription>{strings.service.groupHint}</DialogDescription>
        </DialogHeader>

        <ReadModeFieldset disabled={!editing} className="space-y-5">
          <div>
            <Label htmlFor="group-name">{strings.service.groupName}</Label>
            <Input
              id="group-name"
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
              <p className="mt-2 text-muted-foreground text-sm">
                {strings.service.groupItemsEmpty}
              </p>
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

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={strings.service.groupMoveUp}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={strings.service.groupMoveDown}
                        disabled={index === items.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={strings.service.groupRemove}
                        onClick={() =>
                          setItems((current) => current.filter((_, rowIndex) => rowIndex !== index))
                        }
                      >
                        <X className="size-4" aria-hidden />
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
              <div className="mt-4 flex items-center gap-2">
                <Select
                  // A key that changes with the selection resets the trigger
                  // back to its placeholder after each add.
                  key={items.length}
                  onValueChange={(serviceId) =>
                    setItems((current) => [...current, { serviceId, quantity: 1 }])
                  }
                >
                  <SelectTrigger className="w-full">
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
                <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="group-active"
                checked={active}
                onCheckedChange={(checked) => setActive(checked === true)}
              />
              <Label htmlFor="group-active" className="font-normal">
                {strings.service.active}
              </Label>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">{strings.service.activeHint}</p>
          </div>
        </ReadModeFieldset>

        {editing ? (
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {strings.service.cancel}
            </Button>
            <Button type="button" onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending ? strings.service.saving : strings.service.save}
            </Button>
          </DialogFooter>
        ) : (
          <ReadModeFooter onClose={() => onOpenChange(false)} onEdit={() => setEditing(true)} />
        )}
      </DialogContent>
    </Dialog>
  )
}
