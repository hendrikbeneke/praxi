import {
  type Activity,
  type ActivityInput,
  type ActivityItemInput,
  type ActivityStatus,
  type ActivityType,
  type AppointmentStatus,
  activityStatuses,
  addMinutesToLocal,
  appointmentStatuses,
  formatBerlinDate,
  formatEuro,
  formatEuroAmount,
  fromBerlinDateTimeLocal,
  invoicePaymentState,
  MAX_APPOINTMENT_MINUTES,
  minutesBetween,
  occupiesSlot,
  parseEuroAmount,
  type Service,
  type ServiceGroup,
  toBerlinDate,
  toBerlinDateTimeLocal,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, FileText, X } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { CollectDialog, type CollectPlanEntry } from '@/components/collect-dialog'
import { ContactPicker } from '@/components/contact-picker'
import { DateField } from '@/components/date-field'
import { PaymentStatusBadge } from '@/components/payment-status'
import { ReadModeFieldset } from '@/components/read-mode-fieldset'
import { ReadModeFooter } from '@/components/read-mode-footer'
import { TimeField } from '@/components/time-field'
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
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { ApiError } from '@/lib/api'
import { billableQueryOptions, invoiceListQueryOptions } from '@/lib/invoices'
import { noteListQueryOptions } from '@/lib/notes'
import { serviceGroupListQueryOptions, serviceListQueryOptions } from '@/lib/services'
import { strings } from '@/lib/strings'

/**
 * A position while it is being edited.
 *
 * `source` is what decides how it goes back to the server. A row added from
 * the catalogue and not touched since is sent as a reference, so the *server*
 * copies description, fee code and price (CLAUDE.md rule 5, and the rule lives
 * in `domain/`, not here). Editing any of those fields turns it into a
 * `custom` row carrying its own values.
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

  return {
    kind: 'custom',
    ...(item.id ? { id: item.id } : {}),
    serviceId: item.serviceId,
    description: item.description.trim(),
    feeCode: item.feeCode.trim() === '' ? null : item.feeCode.trim(),
    quantity: item.quantity,
    unitPriceCents: draftPriceCents(item),
    billable: item.billable,
  }
}

const DEFAULT_DURATION_MIN = 50

/** True when a type has anything to prefill at all. Without this, changing to
 *  a type that prefills nothing would announce that nothing happened. */
function hasPreset(entry: ActivityType): boolean {
  return (
    entry.defaultDurationMin !== null ||
    entry.defaultServiceId !== null ||
    entry.defaultServiceGroupId !== null
  )
}

/**
 * The positions a type prefills: its default service, or its default group
 * resolved into one row per member.
 *
 * The resolution happens here, at entry time, exactly as it does when a group
 * is picked by hand — no group id is ever sent or stored (CLAUDE.md rule 5).
 * The rows go back as service references, so the server still does the copying.
 */
function presetItemsOf(
  entry: ActivityType,
  services: readonly Service[],
  groups: readonly ServiceGroup[],
): DraftItem[] {
  if (entry.defaultServiceId !== null) {
    const service = services.find((candidate) => candidate.id === entry.defaultServiceId)
    return service ? [fromService(service, 1)] : []
  }

  if (entry.defaultServiceGroupId !== null) {
    const group = groups.find((candidate) => candidate.id === entry.defaultServiceGroupId)
    return (group?.items ?? []).flatMap((member) => {
      const service = services.find((candidate) => candidate.id === member.serviceId)
      return service ? [fromService(service, member.quantity)] : []
    })
  }

  return []
}

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
  // Inactive types come along: an activity entered under one still has to show
  // its label rather than its bare code. The picker filters them out below.
  const types = useQuery({ ...activityTypeListQueryOptions(true), enabled: open })

  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [type, setType] = useState('')
  const [activityStatus, setActivityStatus] = useState<ActivityStatus>('planned')
  /**
   * The day and the time of day are held apart, because they are entered apart
   * — a native `datetime-local` was one field and rendered in the browser's
   * language, down to a twelve-hour clock with AM/PM on an en-US machine.
   * Everything downstream still reads the combined wall-clock string.
   */
  const [occurredDate, setOccurredDate] = useState('')
  const [occurredTime, setOccurredTime] = useState('')
  const [durationText, setDurationText] = useState('')
  /**
   * What a preset last wrote into the duration field, so "has the practitioner
   * touched this?" is answerable. Applying a type's presets silently is only
   * allowed while there is nothing of theirs to overwrite.
   */
  const [presetDurationText, setPresetDurationText] = useState('')
  /** Set when a type was chosen whose presets were *not* applied, because
   *  something would have been overwritten. Shows the line and the button. */
  const [presetNotice, setPresetNotice] = useState(false)
  const [title, setTitle] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [withAppointment, setWithAppointment] = useState(true)
  const [status, setStatus] = useState<AppointmentStatus>('planned')
  const [appointmentNote, setAppointmentNote] = useState('')
  /** A new activity has nothing to read, so it starts editable; an existing
   *  one opens in read mode (CLAUDE.md, read mode first). */
  const [editing, setEditing] = useState(true)

  // The dialog stays mounted between openings, so everything is put back each
  // time it opens.
  useEffect(() => {
    if (!open) return
    setEditing(activity === undefined)
    setPresetNotice(false)

    if (activity) {
      const start = toBerlinDateTimeLocal(activity.occurredAt)
      setSelectedContactId(activity.contactId)
      setType(activity.type)
      setActivityStatus(activity.status)
      setOccurredDate(start.slice(0, 10))
      setOccurredTime(start.slice(11, 16))
      // With a calendar entry its length wins: that is the interval the
      // calendar and the overlap constraint actually work with, and saving
      // writes the same value back to the activity so the two stop drifting.
      setDurationText(
        activity.appointment
          ? String(minutesBetween(activity.appointment.startsAt, activity.appointment.endsAt))
          : activity.durationMin === null
            ? ''
            : String(activity.durationMin),
      )
      setTitle(activity.title ?? '')
      setInternalNote(activity.internalNote ?? '')
      setItems(activity.items.map(fromStored))
      setWithAppointment(activity.appointment !== null)
      setStatus(activity.appointment?.status ?? 'planned')
      setAppointmentNote(activity.appointment?.note ?? '')
      // Nothing here came from a preset, so everything counts as touched.
      setPresetDurationText('')
      return
    }

    const start = startsAtLocal ?? toBerlinDateTimeLocal(new Date().toISOString())
    setSelectedContactId(contactId ?? null)
    // Left empty on purpose: the default type is picked once the catalogue has
    // arrived, in the effect below, which is also where its presets are drawn.
    setType('')
    setActivityStatus('planned')
    setOccurredDate(start.slice(0, 10))
    setOccurredTime(start.slice(11, 16))
    setDurationText(String(DEFAULT_DURATION_MIN))
    setPresetDurationText(String(DEFAULT_DURATION_MIN))
    setTitle('')
    setInternalNote('')
    setItems([])
    setWithAppointment(true)
    setStatus('planned')
    setAppointmentNote('')
  }, [open, activity, contactId, startsAtLocal])

  const typeList = types.data ?? []
  const currentType = typeList.find((entry) => entry.code === type)
  /** Active types, plus the one this activity already carries even if it has
   *  been deactivated since — otherwise opening an old activity would silently
   *  offer to change its type. */
  const selectableTypes = typeList.filter((entry) => entry.active || entry.code === type)

  /** Nothing of the practitioner's would be overwritten: no positions, and a
   *  duration still exactly as a preset left it. */
  const nothingToOverwrite = items.length === 0 && durationText === presetDurationText

  /** `useCallback` because the effect below depends on it — it changes only
   *  when the two catalogues it reads do. */
  const applyPresetOf = useCallback(
    (entry: ActivityType) => {
      if (entry.defaultDurationMin !== null) {
        const text = String(entry.defaultDurationMin)
        setDurationText(text)
        setPresetDurationText(text)
      }
      const rows = presetItemsOf(entry, services.data ?? [], groups.data ?? [])
      // Appended, not replaced: pressing the button must not make positions
      // disappear. On a fresh activity the list is empty, so it is the same.
      if (rows.length > 0) setItems((current) => [...current, ...rows])
    },
    [services.data, groups.data],
  )

  /**
   * The default type, drawn once the catalogue has arrived. It cannot happen
   * in the reset effect above, which runs while the queries are still in
   * flight, so `type` starts empty and this fills it exactly once per opening.
   */
  useEffect(() => {
    if (!open || activity !== undefined || type !== '') return
    if (!types.data || !services.data || !groups.data) return

    const chosen =
      types.data.find((entry) => entry.isDefault && entry.active) ??
      types.data.find((entry) => entry.active)
    if (!chosen) return

    setType(chosen.code)
    applyPresetOf(chosen)
  }, [open, activity, type, types.data, services.data, groups.data, applyPresetOf])

  /**
   * Choosing a type by hand.
   *
   * The presets are drawn only while there is nothing to overwrite. Once the
   * activity carries a duration or positions of its own, changing the type
   * changes **nothing** else, and a line says so with a button next to it —
   * taking the presets over is then an action with a name rather than a silent
   * side effect (CLAUDE.md rule 6).
   */
  function chooseType(code: string) {
    setType(code)

    const entry = typeList.find((candidate) => candidate.code === code)
    if (!entry || !hasPreset(entry)) {
      setPresetNotice(false)
      return
    }
    if (nothingToOverwrite) {
      applyPresetOf(entry)
      setPresetNotice(false)
      return
    }
    setPresetNotice(true)
  }

  /** Fixed for an existing activity, and fixed when the dialog was opened from
   *  a contact. Only the calendar leaves the choice open. */
  const contactLocked = activity !== undefined || contactId !== undefined
  const targetContactId = selectedContactId

  /**
   * One duration, two uses. The appointment's end is derived from it rather
   * than entered separately: a second `datetime-local` for the end invites the
   * date to be edited by accident, and a mistyped end date does not look wrong
   * on screen while it blocks every slot it spans.
   */
  const parsedDuration = Number.parseInt(durationText, 10)
  const durationMinutes =
    Number.isFinite(parsedDuration) &&
    parsedDuration > 0 &&
    parsedDuration <= MAX_APPOINTMENT_MINUTES
      ? parsedDuration
      : null

  /** The two halves back together, and `''` unless both are there — every
   *  check below already reads that as "no time given yet". */
  const occurredAtLocal =
    occurredDate === '' || occurredTime === '' ? '' : `${occurredDate}T${occurredTime}`

  const endsAtLocal =
    occurredAtLocal === '' || durationMinutes === null
      ? null
      : addMinutesToLocal(occurredAtLocal, durationMinutes)

  const canSave =
    targetContactId !== null &&
    type !== '' &&
    occurredAtLocal !== '' &&
    (!withAppointment || endsAtLocal !== null)

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

  /** The description starts from the activity's own title where there is one:
   *  a free position is usually the thing the activity is called. */
  function addFreeItem() {
    setItems((current) => [
      ...current,
      {
        key: nextKey(),
        source: 'custom',
        serviceId: null,
        description: title.trim(),
        feeCode: '',
        quantity: 1,
        priceText: '',
        billable: true,
      },
    ])
  }

  function submit() {
    if (targetContactId === null || type === '' || occurredAtLocal === '') return

    mutation.mutate({
      contactId: targetContactId,
      type,
      status: activityStatus,
      occurredAt: fromBerlinDateTimeLocal(occurredAtLocal),
      durationMin: durationMinutes,
      title: title.trim() === '' ? null : title.trim(),
      internalNote: internalNote.trim() === '' ? null : internalNote.trim(),
      items: items.map(toItemInput),
      appointment:
        withAppointment && endsAtLocal !== null
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

        {/* Read mode until asked otherwise — the list opens this dialog on a
            row click, so most of the time it is opened to look at something. */}
        <ReadModeFieldset disabled={!editing} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-6">
            <div className="sm:col-span-6">
              <Label htmlFor={`${formId}-contact`}>{strings.activity.contact}</Label>
              <ContactPicker
                inputId={`${formId}-contact`}
                value={targetContactId ?? null}
                locked={contactLocked}
                onChange={setSelectedContactId}
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor={`${formId}-type`}>{strings.activity.type}</Label>
              <Select value={type} onValueChange={chooseType}>
                <SelectTrigger id={`${formId}-type`} className="mt-2 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectableTypes.map((entry) => (
                    <SelectItem key={entry.code} value={entry.code}>
                      <span
                        aria-hidden
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor={`${formId}-activity-status`}>{strings.activity.statusLabel}</Label>
              <Select
                value={activityStatus}
                onValueChange={(value) => setActivityStatus(value as ActivityStatus)}
              >
                <SelectTrigger id={`${formId}-activity-status`} className="mt-2 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activityStatuses.map((value) => (
                    <SelectItem key={value} value={value}>
                      {strings.activity.statuses[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-muted-foreground text-xs">{strings.activity.statusHint}</p>
            </div>

            {/* The presets were not drawn, because something of the
                practitioner's would have been overwritten. Say that plainly,
                and make taking them over an action with a name. */}
            {presetNotice && currentType && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed px-3 py-2 sm:col-span-6">
                <span className="text-muted-foreground text-sm">
                  {strings.activity.presetsUnchanged}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    applyPresetOf(currentType)
                    setPresetNotice(false)
                    toast.success(strings.activity.presetsApplied)
                  }}
                >
                  {strings.activity.presetsApply}
                </Button>
              </div>
            )}

            <div className="sm:col-span-2">
              <Label htmlFor={`${formId}-occurred`}>{strings.activity.occurredAt}</Label>
              <DateField
                id={`${formId}-occurred`}
                className="mt-2"
                value={occurredDate}
                onChange={setOccurredDate}
              />
            </div>

            <div className="sm:col-span-1">
              <Label htmlFor={`${formId}-occurred-time`}>{strings.activity.occurredTime}</Label>
              <TimeField
                id={`${formId}-occurred-time`}
                className="mt-2"
                value={occurredTime}
                onChange={setOccurredTime}
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor={`${formId}-duration`}>{strings.activity.durationMin}</Label>
              <Input
                id={`${formId}-duration`}
                type="number"
                min={1}
                max={MAX_APPOINTMENT_MINUTES}
                className="mt-2"
                value={durationText}
                onChange={(event) => setDurationText(event.target.value)}
              />
              {withAppointment && (
                <p className="mt-1 text-muted-foreground text-xs">
                  {endsAtLocal === null
                    ? strings.activity.durationRequired
                    : `${strings.activity.appointmentTo} ${endsAtLocal.slice(11)}`}
                </p>
              )}
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
                      <div className="sm:col-span-6">
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
                      <div className="sm:col-span-3">
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
                onCheckedChange={(checked) => {
                  setWithAppointment(checked === true)
                  // A calendar entry needs a length; without one there is
                  // nothing to put in the grid.
                  if (checked === true && durationText.trim() === '') {
                    setDurationText(String(DEFAULT_DURATION_MIN))
                  }
                }}
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
                  <span className="font-medium text-sm">{strings.activity.appointmentRange}</span>
                  <p className="mt-2 text-sm tabular-nums">
                    {endsAtLocal === null
                      ? strings.activity.durationRequired
                      : `${occurredAtLocal.slice(11)} – ${endsAtLocal.slice(11)}`}
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {strings.activity.appointmentRangeHint}
                  </p>
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

          {activity && (
            <ActivityInvoices activity={activity} onNavigate={() => onOpenChange(false)} />
          )}

          {/* The way from the treatment to the demand. Outside the fieldset:
              it is an action on a saved record, not a field of the form, and
              it acts on what is stored rather than on what is on screen. */}
          {activity && activity.billingState === 'open' && (
            <BillActivity activity={activity} onDone={() => onOpenChange(false)} />
          )}

          {activity && <ActivityNotes activityId={activity.id} />}

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

          {targetContactId === null && (
            <p className="text-muted-foreground text-sm">{strings.activity.contactRequired}</p>
          )}
        </ReadModeFieldset>

        {editing ? (
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {strings.activity.cancel}
            </Button>
            <Button type="button" onClick={submit} disabled={mutation.isPending || !canSave}>
              {mutation.isPending ? strings.activity.saving : strings.activity.save}
            </Button>
          </DialogFooter>
        ) : (
          <ReadModeFooter onClose={() => onOpenChange(false)} onEdit={() => setEditing(true)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * "Rechnung erstellen" on a single activity.
 *
 * The same call the billable list makes, with the items of this one activity:
 * one draft for the contact, appended to the draft they already have. Which of
 * the two it will be is said before it happens, by the dialog both ways share.
 *
 * Only offered while `billingState` is `open` — everything else would be a
 * button that does nothing.
 */
function BillActivity({ activity, onDone }: { activity: Activity; onDone: () => void }) {
  const billable = useQuery(billableQueryOptions(activity.contactId))
  const drafts = useQuery(
    invoiceListQueryOptions({ contactId: activity.contactId, status: 'draft' }),
  )
  const [confirming, setConfirming] = useState(false)

  const mine = (billable.data ?? []).filter((item) => item.activityId === activity.id)
  if (mine.length === 0) return null

  const existing = (drafts.data ?? []).find((entry) => entry.type === 'invoice')

  const plan: CollectPlanEntry[] = [
    {
      contactId: activity.contactId,
      contactName: mine[0]?.contactName ?? '',
      itemIds: mine.map((item) => item.id),
      totalCents: mine.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0),
      existingDraft: existing ? { id: existing.id, invoiceDate: existing.invoiceDate } : null,
    },
  ]

  return (
    <section>
      <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
        <FileText className="size-4" aria-hidden />
        {strings.billable.fromActivity}
      </Button>

      <CollectDialog
        plan={plan}
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open)
          if (!open) onDone()
        }}
        jumpToInvoice
      />
    </section>
  )
}

/**
 * The invoices this activity's positions ended up on — the shortcut from the
 * treatment to the money (CLAUDE.md rule 9).
 *
 * It is a link and nothing else: recording a payment happens on the invoice,
 * so there is exactly one way into it and no second path through the model.
 *
 * Resolved on the client from the contact's invoices, by matching
 * `invoice_line.activity_item_id` against this activity's positions. No new
 * endpoint for it: that reference is already in the payload, and it is the
 * same record of origin the billable query reasons about.
 */
function ActivityInvoices({
  activity,
  onNavigate,
}: {
  activity: Activity
  onNavigate: () => void
}) {
  const invoices = useQuery(invoiceListQueryOptions({ contactId: activity.contactId }))
  const today = toBerlinDate(new Date().toISOString())

  const itemIds = new Set(activity.items.map((item) => item.id))
  const related = (invoices.data ?? []).filter((entry) =>
    entry.lines.some((line) => line.activityItemId !== null && itemIds.has(line.activityItemId)),
  )

  if (related.length === 0) return null

  return (
    <section>
      <p className="font-medium text-sm">{strings.invoice.title}</p>
      <ul className="mt-2 space-y-2">
        {related.map((entry) => {
          const state = invoicePaymentState(entry, entry.paidCents, today)
          return (
            <li key={entry.id} className="flex flex-wrap items-center gap-3 text-sm">
              <Link
                to="/invoices/$invoiceId"
                params={{ invoiceId: entry.id }}
                onClick={onNavigate}
                className="underline underline-offset-4"
              >
                {entry.number ?? strings.invoice.statuses.draft}
              </Link>
              <span className="tabular-nums">{formatEuro(entry.totalCents)}</span>
              <PaymentStatusBadge state={state} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * The documentation written for this activity, read-only.
 *
 * Notes are written and locked on the contact's Notizen tab — this is here so
 * that opening a session shows what was recorded for it without hunting for
 * it. Editing from inside a dialog that is itself a form would mean a second
 * dialog on top of the first, for no gain.
 */
function ActivityNotes({ activityId }: { activityId: string }) {
  const notes = useQuery(noteListQueryOptions({ activityId }))
  const rows = notes.data ?? []

  return (
    <section>
      <p className="font-medium text-sm">{strings.note.title}</p>

      {rows.length === 0 ? (
        <p className="mt-1 text-muted-foreground text-sm">
          {notes.isPending ? strings.status.loading : strings.note.empty}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((entry) => (
            <li key={entry.id} className="rounded-md border px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-sm">{formatBerlinDate(`${entry.noteDate}T12:00:00Z`)}</span>
                <Badge variant="outline">{strings.note.types[entry.type]}</Badge>
                {entry.lockedAt !== null && (
                  <Badge variant="secondary">{strings.note.lockedBadge}</Badge>
                )}
                {entry.files.length > 0 && (
                  <span className="text-muted-foreground text-xs">
                    {entry.files.length} {strings.note.files}
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-muted-foreground text-sm">
                {entry.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
