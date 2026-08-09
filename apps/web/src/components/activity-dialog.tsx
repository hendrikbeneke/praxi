import {
  type Activity,
  type ActivityInput,
  type ActivityItemInput,
  type ActivityType,
  type AppointmentStatus,
  activityTypes,
  addMinutesToLocal,
  appointmentStatuses,
  formatEuro,
  formatEuroAmount,
  fromBerlinDateTimeLocal,
  occupiesSlot,
  parseEuroAmount,
  type Service,
  type ServiceGroup,
  toBerlinDateTimeLocal,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createActivity, updateActivity } from '@/lib/activities'
import { ApiError } from '@/lib/api'
import { serviceGroupListQueryOptions, serviceListQueryOptions } from '@/lib/services'
import { strings } from '@/lib/strings'

/**
 * A position while it is being edited.
 *
 * `source` is what decides how it goes back to the server. A row added from
 * the catalogue and not touched since is sent as a reference, so the *server*
 * copies description, fee code, price and duration (CLAUDE.md rule 5, and the
 * rule lives in `domain/`, not here). Editing any of those fields turns it
 * into a `custom` row carrying its own values.
 */
type DraftItem = {
  key: string
  id?: string
  source: 'service' | 'custom'
  serviceId: string | null
  description: string
  feeCode: string
  quantity: number
  priceText: string
  durationText: string
  billable: boolean
}

/** A stable React key for a row that has no id until it is saved. */
let keyCounter = 0
function nextKey(): string {
  keyCounter += 1
  return `draft-${keyCounter}`
}

function fromService(service: Service, quantity: number): DraftItem {
  return {
    key: nextKey(),
    source: 'service',
    serviceId: service.id,
    description: service.description,
    feeCode: service.feeCode ?? '',
    quantity,
    priceText: formatEuroAmount(service.defaultPriceCents),
    durationText: service.defaultDurationMin === null ? '' : String(service.defaultDurationMin),
    billable: true,
  }
}

function fromStored(item: Activity['items'][number]): DraftItem {
  return {
    key: nextKey(),
    id: item.id,
    source: 'custom',
    serviceId: item.serviceId,
    description: item.description,
    feeCode: item.feeCode ?? '',
    quantity: item.quantity,
    priceText: formatEuroAmount(item.unitPriceCents),
    durationText: item.durationMin === null ? '' : String(item.durationMin),
    billable: item.billable,
  }
}

function draftPriceCents(item: DraftItem): number {
  return parseEuroAmount(item.priceText) ?? 0
}

function toItemInput(item: DraftItem): ActivityItemInput {
  // Untouched and freshly added from the catalogue: let the server copy.
  if (item.source === 'service' && !item.id && item.serviceId) {
    return {
      kind: 'service',
      serviceId: item.serviceId,
      quantity: item.quantity,
      billable: item.billable,
    }
  }

  const duration = Number.parseInt(item.durationText, 10)
  return {
    kind: 'custom',
    ...(item.id ? { id: item.id } : {}),
    serviceId: item.serviceId,
    description: item.description.trim(),
    feeCode: item.feeCode.trim() === '' ? null : item.feeCode.trim(),
    quantity: item.quantity,
    unitPriceCents: draftPriceCents(item),
    durationMin: Number.isFinite(duration) && duration > 0 ? duration : null,
    billable: item.billable,
  }
}

const DEFAULT_DURATION_MIN = 50

export function ActivityDialog({
  activity,
  contactId,
  startsAtLocal,
  open,
  onOpenChange,
}: {
  activity?: Activity | undefined
  /** Fixed when opened from a contact; chosen in the dialog otherwise. */
  contactId?: string | undefined
  /** Pre-filled when opened by clicking a slot in the calendar. */
  startsAtLocal?: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const formId = useId()

  const services = useQuery({ ...serviceListQueryOptions(false), enabled: open })
  const groups = useQuery({ ...serviceGroupListQueryOptions(false), enabled: open })

  const [type, setType] = useState<ActivityType>('session')
  const [occurredAtLocal, setOccurredAtLocal] = useState('')
  const [durationText, setDurationText] = useState('')
  const [title, setTitle] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [withAppointment, setWithAppointment] = useState(true)
  const [endsAtLocal, setEndsAtLocal] = useState('')
  const [status, setStatus] = useState<AppointmentStatus>('planned')
  const [appointmentNote, setAppointmentNote] = useState('')

  // The dialog stays mounted between openings, so everything is put back each
  // time it opens.
  useEffect(() => {
    if (!open) return

    if (activity) {
      const start = toBerlinDateTimeLocal(activity.occurredAt)
      setType(activity.type)
      setOccurredAtLocal(start)
      setDurationText(activity.durationMin === null ? '' : String(activity.durationMin))
      setTitle(activity.title ?? '')
      setInternalNote(activity.internalNote ?? '')
      setItems(activity.items.map(fromStored))
      setWithAppointment(activity.appointment !== null)
      setEndsAtLocal(
        activity.appointment
          ? toBerlinDateTimeLocal(activity.appointment.endsAt)
          : addMinutesToLocal(start, DEFAULT_DURATION_MIN),
      )
      setStatus(activity.appointment?.status ?? 'planned')
      setAppointmentNote(activity.appointment?.note ?? '')
      return
    }

    const start = startsAtLocal ?? toBerlinDateTimeLocal(new Date().toISOString())
    setType('session')
    setOccurredAtLocal(start)
    setDurationText('')
    setTitle('')
    setInternalNote('')
    setItems([])
    setWithAppointment(true)
    setEndsAtLocal(addMinutesToLocal(start, DEFAULT_DURATION_MIN))
    setStatus('planned')
    setAppointmentNote('')
  }, [open, activity, startsAtLocal])

  const targetContactId = activity?.contactId ?? contactId

  const mutation = useMutation({
    mutationFn: (input: ActivityInput) =>
      activity ? updateActivity(activity.id, input) : createActivity(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['activities'] })
      await queryClient.invalidateQueries({ queryKey: ['appointments'] })
      toast.success(activity ? strings.activity.saved : strings.activity.created)
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.activity.saveFailed)
    },
  })

  function patch(index: number, change: Partial<DraftItem>) {
    setItems((current) =>
      current.map((item, position) => (position === index ? { ...item, ...change } : item)),
    )
  }

  /** Editing a copied field detaches the row from the catalogue reference —
   *  from here on it carries its own values. */
  function edit(index: number, change: Partial<DraftItem>) {
    patch(index, { ...change, source: 'custom' })
  }

  function move(index: number, by: number) {
    setItems((current) => {
      const next = [...current]
      const moved = next[index]
      const displaced = next[index + by]
      if (!moved || !displaced) return current
      next[index] = displaced
      next[index + by] = moved
      return next
    })
  }

  function addService(serviceId: string) {
    const service = services.data?.find((entry) => entry.id === serviceId)
    if (service) setItems((current) => [...current, fromService(service, 1)])
  }

  /**
   * A group is resolved the moment it is picked, into one row per member — no
   * group id is sent and none is stored (rule 5). The rows go back as service
   * references, so the server still does the copying.
   */
  function addGroup(group: ServiceGroup) {
    const expanded = group.items.flatMap((member) => {
      const service = services.data?.find((entry) => entry.id === member.serviceId)
      return service ? [fromService(service, member.quantity)] : []
    })
    setItems((current) => [...current, ...expanded])
  }

  function addFreeItem() {
    setItems((current) => [
      ...current,
      {
        key: nextKey(),
        source: 'custom',
        serviceId: null,
        description: '',
        feeCode: '',
        quantity: 1,
        priceText: '',
        durationText: '',
        billable: true,
      },
    ])
  }

  function submit() {
    if (!targetContactId || occurredAtLocal === '') return

    mutation.mutate({
      contactId: targetContactId,
      type,
      occurredAt: fromBerlinDateTimeLocal(occurredAtLocal),
      durationMin: Number.parseInt(durationText, 10) > 0 ? Number.parseInt(durationText, 10) : null,
      title: title.trim() === '' ? null : title.trim(),
      internalNote: internalNote.trim() === '' ? null : internalNote.trim(),
      items: items.map(toItemInput),
      appointment: withAppointment
        ? {
            startsAt: fromBerlinDateTimeLocal(occurredAtLocal),
            endsAt: fromBerlinDateTimeLocal(endsAtLocal),
            status,
            title: title.trim() === '' ? null : title.trim(),
            note: appointmentNote.trim() === '' ? null : appointmentNote.trim(),
          }
        : null,
    })
  }

  const billableTotal = items
    .filter((item) => item.billable)
    .reduce((sum, item) => sum + draftPriceCents(item) * item.quantity, 0)
  const grandTotal = items.reduce((sum, item) => sum + draftPriceCents(item) * item.quantity, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {activity ? strings.activity.editTitle : strings.activity.createTitle}
          </DialogTitle>
          <DialogDescription>{strings.activity.copyHint}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <Label htmlFor={`${formId}-type`}>{strings.activity.type}</Label>
              <Select value={type} onValueChange={(value) => setType(value as ActivityType)}>
                <SelectTrigger id={`${formId}-type`} className="mt-2 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activityTypes.map((value) => (
                    <SelectItem key={value} value={value}>
                      {strings.activity.types[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor={`${formId}-occurred`}>{strings.activity.occurredAt}</Label>
              <Input
                id={`${formId}-occurred`}
                type="datetime-local"
                className="mt-2"
                value={occurredAtLocal}
                onChange={(event) => {
                  setOccurredAtLocal(event.target.value)
                  if (event.target.value !== '') {
                    setEndsAtLocal(addMinutesToLocal(event.target.value, DEFAULT_DURATION_MIN))
                  }
                }}
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor={`${formId}-duration`}>{strings.activity.durationMin}</Label>
              <Input
                id={`${formId}-duration`}
                type="number"
                min={1}
                className="mt-2"
                value={durationText}
                onChange={(event) => setDurationText(event.target.value)}
              />
            </div>

            <div className="sm:col-span-6">
              <Label htmlFor={`${formId}-title`}>{strings.activity.activityTitle}</Label>
              <Input
                id={`${formId}-title`}
                className="mt-2"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
          </div>

          <section>
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">{strings.activity.items}</p>
              <Button type="button" variant="outline" size="sm" onClick={addFreeItem}>
                {strings.activity.addFree}
              </Button>
            </div>

            {items.length === 0 ? (
              <p className="mt-2 text-muted-foreground text-sm">{strings.activity.itemsEmpty}</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {items.map((item, index) => (
                  <li key={item.key} className="rounded-md border p-3">
                    <div className="grid gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-5">
                        <Label className="text-xs" htmlFor={`${item.key}-description`}>
                          {strings.activity.itemDescription}
                        </Label>
                        <Input
                          id={`${item.key}-description`}
                          className="mt-1"
                          value={item.description}
                          onChange={(event) => edit(index, { description: event.target.value })}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs" htmlFor={`${item.key}-fee`}>
                          {strings.activity.itemFeeCode}
                        </Label>
                        <Input
                          id={`${item.key}-fee`}
                          className="mt-1"
                          value={item.feeCode}
                          onChange={(event) => edit(index, { feeCode: event.target.value })}
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <Label className="text-xs" htmlFor={`${item.key}-quantity`}>
                          {strings.activity.itemQuantity}
                        </Label>
                        <Input
                          id={`${item.key}-quantity`}
                          type="number"
                          min={1}
                          className="mt-1"
                          value={item.quantity}
                          onChange={(event) =>
                            patch(index, {
                              quantity: Math.max(1, Number.parseInt(event.target.value, 10) || 1),
                            })
                          }
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs" htmlFor={`${item.key}-price`}>
                          {strings.activity.itemPrice}
                        </Label>
                        <Input
                          id={`${item.key}-price`}
                          inputMode="decimal"
                          className="mt-1"
                          value={item.priceText}
                          onChange={(event) => edit(index, { priceText: event.target.value })}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs" htmlFor={`${item.key}-item-duration`}>
                          {strings.activity.itemDuration}
                        </Label>
                        <Input
                          id={`${item.key}-item-duration`}
                          type="number"
                          min={1}
                          className="mt-1"
                          value={item.durationText}
                          onChange={(event) => edit(index, { durationText: event.target.value })}
                        />
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`${item.key}-billable`}
                          checked={item.billable}
                          onCheckedChange={(checked) =>
                            patch(index, { billable: checked === true })
                          }
                        />
                        <Label htmlFor={`${item.key}-billable`} className="font-normal text-sm">
                          {strings.activity.itemBillable}
                        </Label>
                      </div>

                      <span className="text-muted-foreground text-sm tabular-nums">
                        {formatEuro(draftPriceCents(item) * item.quantity)}
                      </span>

                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={strings.activity.itemMoveUp}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp className="size-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={strings.activity.itemMoveDown}
                          disabled={index === items.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown className="size-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={strings.activity.itemRemove}
                          onClick={() =>
                            setItems((current) =>
                              current.filter((_, position) => position !== index),
                            )
                          }
                        >
                          <X className="size-4" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Select key={`service-${items.length}`} onValueChange={addService}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={strings.activity.addService} />
                </SelectTrigger>
                <SelectContent>
                  {(services.data ?? []).map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.description} — {formatEuro(service.defaultPriceCents)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                key={`group-${items.length}`}
                onValueChange={(groupId) => {
                  const group = groups.data?.find((entry) => entry.id === groupId)
                  if (group) addGroup(group)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={strings.activity.addGroup} />
                </SelectTrigger>
                <SelectContent>
                  {(groups.data ?? []).map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="mt-2 text-muted-foreground text-xs">{strings.activity.groupHint}</p>

            {items.length > 0 && (
              <div className="mt-3 space-y-1 text-right text-sm">
                <p>
                  {strings.activity.sumBillable}:{' '}
                  <span className="font-medium tabular-nums">{formatEuro(billableTotal)}</span>
                </p>
                {grandTotal !== billableTotal && (
                  <p className="text-muted-foreground">
                    {strings.activity.sumTotal}:{' '}
                    <span className="tabular-nums">{formatEuro(grandTotal)}</span>
                  </p>
                )}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${formId}-with-appointment`}
                checked={withAppointment}
                onCheckedChange={(checked) => setWithAppointment(checked === true)}
              />
              <Label htmlFor={`${formId}-with-appointment`} className="font-normal">
                {strings.activity.withAppointment}
              </Label>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              {strings.activity.withAppointmentHint}
            </p>

            {withAppointment && (
              <div className="mt-3 grid gap-4 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <Label htmlFor={`${formId}-ends`}>{strings.activity.appointmentTo}</Label>
                  <Input
                    id={`${formId}-ends`}
                    type="datetime-local"
                    className="mt-2"
                    value={endsAtLocal}
                    onChange={(event) => setEndsAtLocal(event.target.value)}
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor={`${formId}-status`}>{strings.activity.appointmentStatus}</Label>
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as AppointmentStatus)}
                  >
                    <SelectTrigger id={`${formId}-status`} className="mt-2 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {appointmentStatuses.map((value) => (
                        <SelectItem key={value} value={value}>
                          {strings.appointment.status[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {occupiesSlot(status)
                      ? strings.appointment.holdsSlot
                      : strings.appointment.releasesSlot}
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor={`${formId}-appointment-note`}>
                    {strings.activity.appointmentNote}
                  </Label>
                  <Input
                    id={`${formId}-appointment-note`}
                    className="mt-2"
                    value={appointmentNote}
                    onChange={(event) => setAppointmentNote(event.target.value)}
                  />
                </div>
              </div>
            )}
          </section>

          <section>
            <Label htmlFor={`${formId}-note`}>{strings.activity.internalNote}</Label>
            <Textarea
              id={`${formId}-note`}
              rows={3}
              className="mt-2"
              value={internalNote}
              onChange={(event) => setInternalNote(event.target.value)}
            />
            <p className="mt-1 text-muted-foreground text-xs">
              {strings.activity.internalNoteHint}
            </p>
          </section>

          {!targetContactId && <Badge variant="secondary">{strings.activity.contact} fehlt</Badge>}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {strings.activity.cancel}
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={mutation.isPending || !targetContactId || occurredAtLocal === ''}
          >
            {mutation.isPending ? strings.activity.saving : strings.activity.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
