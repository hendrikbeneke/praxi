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
  formatEuro,
  formatEuroAmount,
  fromBerlinDateTimeLocal,
  MAX_APPOINTMENT_MINUTES,
  minutesBetween,
  occupiesSlot,
  parseEuroAmount,
  type Service,
  type ServiceGroup,
  toBerlinDateTimeLocal,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { ContactPicker } from '@/components/contact-picker'
import { DateField } from '@/components/date-field'
import { ReadModeFieldset } from '@/components/read-mode-fieldset'
import { TimeField } from '@/components/time-field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { serviceGroupListQueryOptions, serviceListQueryOptions } from '@/lib/services'
import { strings } from '@/lib/strings'

/**
 * Editing an activity — the fields, the position list, and the calendar entry
 * beside it.
 *
 * **This component is mounted only while editing and is expected to be
 * remounted per record**: the caller keys it on the activity's id, so the
 * initial state below is read once from props and there is no reset effect.
 * That is the one real simplification the move out of the dialog bought — a
 * dialog stays mounted between openings and had to put everything back each
 * time, which is where the class of bug lived that shows a previous record's
 * positions for a frame.
 *
 * **What the D8 prototype leaves out and this keeps**, so that the next
 * comparison against `Vorgänge.dc.html` does not read as an oversight. The
 * fuller variant in `Kontaktdetail.dc.html` has all of them; the abbreviated
 * one on the Vorgänge page does not, and two of them carry rules:
 *
 * - **billable checkbox per position** — CLAUDE.md rule 6 is worked by marking
 *   a position unbillable and adding an Ausfallhonorar beside it. Without the
 *   checkbox the rule has no control.
 * - **appointment status** — only a cancellation releases the slot. Without
 *   the select an appointment could be created and never called off.
 * - **service group picker** — rule 5, resolved at pick time.
 * - **reorder arrows** — the handoff's own rule (arrows, never drag), and the
 *   order decides how the positions read on the invoice.
 * - **preset notice with "übernehmen"** — from D1; silently overwriting is
 *   exactly what it prevents.
 * - **internal note** — no other screen carries it.
 */

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
  return entry.defaultDurationMin !== null || entry.presetItems.length > 0
}

/**
 * The positions a type prefills, already resolved to service references by
 * the time they reach here — a group picked in the settings was flattened
 * into `presetItems` at that moment (CLAUDE.md rule 5), so there is no group
 * to resolve on this side. Looked up against the full catalogue rather than
 * trusting the denormalized fields on `presetItems`, because those do not
 * carry `feeCode` — the same reason `addGroup` below re-resolves group
 * members through `services` instead of using `group.items` directly.
 */
function presetItemsOf(entry: ActivityType, services: readonly Service[]): DraftItem[] {
  return entry.presetItems.flatMap((preset) => {
    const service = services.find((candidate) => candidate.id === preset.serviceId)
    return service ? [fromService(service, preset.quantity)] : []
  })
}

/** With a calendar entry its length wins: that is the interval the calendar
 *  and the overlap constraint actually work with, and saving writes the same
 *  value back to the activity so the two stop drifting. */
function initialDuration(activity: Activity | undefined): string {
  if (!activity) return String(DEFAULT_DURATION_MIN)
  if (activity.appointment) {
    return String(minutesBetween(activity.appointment.startsAt, activity.appointment.endsAt))
  }
  return activity.durationMin === null ? '' : String(activity.durationMin)
}

export function ActivityForm({
  activity,
  contactId,
  startsAtLocal,
  onSaved,
  onCancel,
}: {
  activity?: Activity | undefined
  /** Fixed when editing from a contact; chosen in the form otherwise. */
  contactId?: string | undefined
  /** Pre-filled when a slot in the calendar was clicked. */
  startsAtLocal?: string | undefined
  onSaved: () => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const formId = useId()

  const services = useQuery(serviceListQueryOptions(false))
  const groups = useQuery(serviceGroupListQueryOptions(false))
  // Inactive types come along: an activity entered under one still has to show
  // its label rather than its bare code. The picker filters them out below.
  const types = useQuery(activityTypeListQueryOptions(true))

  const start = activity
    ? toBerlinDateTimeLocal(activity.occurredAt)
    : (startsAtLocal ?? toBerlinDateTimeLocal(new Date().toISOString()))

  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    activity?.contactId ?? contactId ?? null,
  )
  /** Left empty for a new activity on purpose: the default type is picked once
   *  the catalogue has arrived, in the effect below, which is also where its
   *  presets are drawn. */
  const [type, setType] = useState(activity?.type ?? '')
  const [activityStatus, setActivityStatus] = useState<ActivityStatus>(
    activity?.status ?? 'planned',
  )
  /**
   * The day and the time of day are held apart, because they are entered apart
   * — a native `datetime-local` was one field and rendered in the browser's
   * language, down to a twelve-hour clock with AM/PM on an en-US machine.
   * Everything downstream still reads the combined wall-clock string.
   */
  const [occurredDate, setOccurredDate] = useState(start.slice(0, 10))
  const [occurredTime, setOccurredTime] = useState(start.slice(11, 16))
  const [durationText, setDurationText] = useState(() => initialDuration(activity))
  /**
   * What a preset last wrote into the duration field, so "has the practitioner
   * touched this?" is answerable. Applying a type's presets silently is only
   * allowed while there is nothing of theirs to overwrite — on an existing
   * activity nothing came from a preset, so everything counts as touched.
   */
  const [presetDurationText, setPresetDurationText] = useState(() =>
    activity ? '' : String(DEFAULT_DURATION_MIN),
  )
  /** Set when a type was chosen whose presets were *not* applied, because
   *  something would have been overwritten. Shows the line and the button. */
  const [presetNotice, setPresetNotice] = useState(false)
  const [title, setTitle] = useState(activity?.title ?? '')
  const [internalNote, setInternalNote] = useState(activity?.internalNote ?? '')
  const [items, setItems] = useState<DraftItem[]>(() =>
    activity ? activity.items.map(fromStored) : [],
  )
  const [withAppointment, setWithAppointment] = useState(
    activity ? activity.appointment !== null : true,
  )
  const [status, setStatus] = useState<AppointmentStatus>(
    activity?.appointment?.status ?? 'planned',
  )
  const [appointmentNote, setAppointmentNote] = useState(activity?.appointment?.note ?? '')

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
   *  when the catalogue it reads does. */
  const applyPresetOf = useCallback(
    (entry: ActivityType) => {
      if (entry.defaultDurationMin !== null) {
        const text = String(entry.defaultDurationMin)
        setDurationText(text)
        setPresetDurationText(text)
      }
      const rows = presetItemsOf(entry, services.data ?? [])
      // Appended, not replaced: pressing the button must not make positions
      // disappear. On a fresh activity the list is empty, so it is the same.
      if (rows.length > 0) setItems((current) => [...current, ...rows])
    },
    [services.data],
  )

  /**
   * The default type, drawn once the catalogue has arrived. It cannot happen
   * in the initial state above, which is read while the queries are still in
   * flight, so `type` starts empty and this fills it exactly once.
   */
  useEffect(() => {
    if (activity !== undefined || type !== '') return
    if (!types.data || !services.data) return

    const chosen =
      types.data.find((entry) => entry.isDefault && entry.active) ??
      types.data.find((entry) => entry.active)
    if (!chosen) return

    setType(chosen.code)
    applyPresetOf(chosen)
  }, [activity, type, types.data, services.data, applyPresetOf])

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

  /** Fixed for an existing activity, and fixed when the form was opened from a
   *  contact. Only the calendar and the Vorgänge page leave the choice open. */
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
      onSaved()
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
    <>
      {/* Always editable — this component exists only while editing. The
          fieldset stays for the Select context it provides, which is what
          keeps a dropdown from opening on a disabled form elsewhere.

          `@container` and `@xl:` rather than `sm:` (D9): the breakpoints have
          to answer "how wide is this form", not "how wide is the window". In
          the calendar rail the window is wide and the form is 348 px, and a
          twelve-column grid in 348 px is a pile. */}
      <ReadModeFieldset disabled={false} className="@container space-y-6">
        <div className="grid gap-4 @xl:grid-cols-12">
          {!contactLocked && (
            <div className="@xl:col-span-12">
              <Label htmlFor={`${formId}-contact`}>{strings.activity.contact}</Label>
              <ContactPicker
                inputId={`${formId}-contact`}
                value={targetContactId ?? null}
                locked={false}
                onChange={setSelectedContactId}
              />
            </div>
          )}

          <div className="@xl:col-span-6">
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

          <div className="@xl:col-span-6">
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
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed px-3 py-2 @xl:col-span-12">
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

          <div className="@xl:col-span-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[8rem] flex-1">
                <Label htmlFor={`${formId}-occurred`}>{strings.activity.occurredAt}</Label>
                <DateField
                  id={`${formId}-occurred`}
                  className="mt-2"
                  value={occurredDate}
                  onChange={setOccurredDate}
                />
              </div>
              <div className="w-24">
                <Label htmlFor={`${formId}-occurred-time`}>{strings.activity.occurredTime}</Label>
                <TimeField
                  id={`${formId}-occurred-time`}
                  className="mt-2"
                  value={occurredTime}
                  onChange={setOccurredTime}
                />
              </div>
              <div className="w-24">
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
              </div>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              {endsAtLocal === null
                ? strings.activity.durationRequired
                : `${strings.activity.appointmentTo} ${endsAtLocal.slice(11)}`}
            </p>
          </div>

          <div className="@xl:col-span-6">
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
          <p className="font-medium text-sm">{strings.activity.items}</p>
          <p className="mt-1 text-muted-foreground text-xs">{strings.activity.copyHint}</p>

          {items.length === 0 ? (
            <p className="mt-3 text-muted-foreground text-sm">{strings.activity.itemsEmpty}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {items.map((item, index) => (
                <li key={item.key} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="w-16">
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
                    <div className="min-w-40 flex-1">
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
                    <div className="w-20">
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
                    <div className="w-24">
                      <Label className="text-xs" htmlFor={`${item.key}-price`}>
                        {strings.activity.itemPrice}
                      </Label>
                      <Input
                        id={`${item.key}-price`}
                        inputMode="decimal"
                        className="mt-1 text-right tabular-nums"
                        value={item.priceText}
                        onChange={(event) => edit(index, { priceText: event.target.value })}
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    {/* Rule 6 has no other control: a no-show is documented by
                        marking the session unbillable and adding an
                        Ausfallhonorar beside it. */}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`${item.key}-billable`}
                        checked={item.billable}
                        onCheckedChange={(checked) => patch(index, { billable: checked === true })}
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
                          setItems((current) => current.filter((_, position) => position !== index))
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

          {/* Both pickers list the catalogue in the order the catalogue is
              kept in — `sortOrder` first, then the name (D5). Neither sorts
              again here, which is what makes the setting reach the picker. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="min-w-56 flex-1">
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
            </div>

            <div className="min-w-56 flex-1">
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

            <Button type="button" variant="outline" size="sm" onClick={addFreeItem}>
              {strings.activity.addFree}
            </Button>
          </div>
          <p className="mt-2 text-muted-foreground text-xs">{strings.activity.groupHint}</p>

          {items.length > 0 && (
            <div className="mt-4 space-y-1 border-t pt-3">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium">{strings.activity.sumBillable}</span>
                <span className="font-medium text-lg tabular-nums">
                  {formatEuro(billableTotal)}
                </span>
              </div>
              {grandTotal !== billableTotal && (
                <div className="flex items-baseline justify-between gap-4 text-muted-foreground text-xs">
                  <span>{strings.activity.sumTotalLong}</span>
                  <span className="tabular-nums">{formatEuro(grandTotal)}</span>
                </div>
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
            <div className="mt-3 grid gap-4 @xl:grid-cols-12">
              <div className="@xl:col-span-4">
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

              {/* Only a cancellation releases the slot, so without this the
                  appointment could be made and never called off. */}
              <div className="@xl:col-span-4">
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

              <div className="@xl:col-span-4">
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
          <p className="mt-1 text-muted-foreground text-xs">{strings.activity.internalNoteHint}</p>
        </section>

        {targetContactId === null && (
          <p className="text-muted-foreground text-sm">{strings.activity.contactRequired}</p>
        )}
      </ReadModeFieldset>

      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {strings.activity.cancel}
        </Button>
        <Button type="button" onClick={submit} disabled={mutation.isPending || !canSave}>
          {mutation.isPending ? strings.activity.saving : strings.activity.save}
        </Button>
      </div>
    </>
  )
}
