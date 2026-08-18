import { zodResolver } from '@hookform/resolvers/zod'
import {
  formatEuro,
  formatEuroAmount,
  parseEuroAmount,
  type Service,
  type ServiceInput,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import {
  ActiveStatus,
  CheckboxField,
  DeleteButton,
  DetailField,
  OrderButtons,
} from '@/components/catalogue-controls'
import { useInlineDetail } from '@/components/inline-detail-row'
import { DASH, ListCard, listHeaderClass } from '@/components/list-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import {
  createService,
  deleteService,
  moveService,
  serviceListQueryOptions,
  updateService,
} from '@/lib/services'
import { strings } from '@/lib/strings'

/**
 * The catalogue itself — a settings-style list (D5), but deliberately not
 * built on `ListCard`'s `<Table>` pieces (`ListCardHeaderRow`/`Cell`): the
 * column widths here are a fixed pixel grid with one flexible column in the
 * middle (58px Kürzel, 1fr Bezeichnung, 48px Ziffer, 76px Preis, 80px Dauer),
 * and an HTML table cannot give a `1fr` track that exact control next to
 * fixed ones. Header and rows share the same `grid-template-columns`, kept
 * as one constant so they cannot drift apart. `InlineDetailRow` is Table-bound
 * for the same reason and is not used here — `useInlineDetail()` is plain
 * state and works the same regardless of markup, so that part is reused.
 * `ListCard`, `ListCardTitleBar`, `ActiveStatus`, `OrderButtons`,
 * `DeleteButton`, `DetailField` and `CheckboxField` are all markup-neutral
 * and are reused exactly as in the `<Table>`-based lists.
 */
const GRID = 'grid grid-cols-[58px_minmax(0,1fr)_48px_76px_80px] items-baseline gap-2.5'

export function ServiceList({
  creating,
  onCreatingChange,
}: {
  /** Owned by the page, because the button that starts it lives in the page
   *  header now — one "Neu" for both tabs, its label following the tab (K5). */
  creating: boolean
  onCreatingChange: (creating: boolean) => void
}) {
  const queryClient = useQueryClient()
  // Point 3 (D5): inactive entries stay in the list, the status is in the
  // row — no "show inactive" filter to maintain.
  const services = useQuery(serviceListQueryOptions(true))
  const detail = useInlineDetail()

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['services'] }),
      // A price shown inside a group comes from the catalogue, so it moves too.
      queryClient.invalidateQueries({ queryKey: ['service-groups'] }),
    ])
  const onError = (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : strings.service.saveFailed)

  const save = useMutation({
    mutationFn: (input: { id?: string; values: ServiceInput }) =>
      input.id ? updateService(input.id, input.values) : createService(input.values),
    onSuccess: async (_result, input) => {
      await invalidate()
      detail.close()
      onCreatingChange(false)
      toast.success(input.id ? strings.service.saved : strings.service.created)
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteService(id),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      toast.success(strings.service.deleted)
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : strings.service.deleteFailed),
  })

  const move = useMutation({
    mutationFn: (input: { id: string; delta: 1 | -1 }) => moveService(input.id, input.delta),
    onSuccess: invalidate,
    onError,
  })

  const rows = services.data ?? []

  return (
    <ListCard>
      {creating && (
        <div className="border-b bg-muted/20 p-4">
          <p className="mb-4 flex items-baseline gap-2">
            <span className="font-semibold">{strings.service.createTitle}</span>
            <span className="text-muted-foreground text-sm">{strings.service.createHint}</span>
          </p>
          <ServiceForm
            pending={save.isPending}
            onCancel={() => onCreatingChange(false)}
            onSubmit={(values) => save.mutate({ values })}
          />
        </div>
      )}

      <div
        className={`flex items-center gap-3 border-b bg-muted/40 px-4 py-[9px] ${listHeaderClass}`}
      >
        <span className={`${GRID} min-w-0 flex-1`}>
          <span>{strings.service.shortCode}</span>
          <span>{strings.service.serviceDescription}</span>
          <span>{strings.service.feeCodeColumn}</span>
          <span className="text-right">{strings.service.price}</span>
          <span>{strings.service.duration}</span>
        </span>
        <span className="w-[66px] shrink-0">{strings.catalogue.statusColumn}</span>
        {/* Empty, over the two arrows — the row's own layout, mirrored so each
            heading sits above the column it names (K5). */}
        <span className="w-[26px] shrink-0" />
        <span className="w-[26px] shrink-0" />
      </div>

      {rows.length === 0 ? (
        <p className="p-4 text-muted-foreground text-sm">
          {services.isPending ? strings.status.loading : strings.service.empty}
        </p>
      ) : (
        rows.map((entry, index) => (
          <Fragment key={entry.id}>
            <div className="flex items-center gap-3 border-b px-4 text-sm last:border-b-0">
              <button
                type="button"
                className={`${GRID} min-w-0 flex-1 py-2.5 text-left`}
                onClick={() => {
                  onCreatingChange(false)
                  detail.toggle(entry.id)
                }}
              >
                <span className="truncate text-muted-foreground text-xs tabular-nums">
                  {entry.shortCode ?? DASH}
                </span>
                <span className="truncate font-semibold">{entry.description}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {entry.feeCode ?? DASH}
                </span>
                <span className="text-right tabular-nums">
                  {formatEuro(entry.defaultPriceCents)}
                </span>
                <span className="truncate text-muted-foreground text-xs tabular-nums">
                  {entry.defaultDurationMin === null
                    ? DASH
                    : `${entry.defaultDurationMin} ${strings.service.durationMinutes}`}
                </span>
              </button>

              <span className="w-[66px] shrink-0">
                <ActiveStatus active={entry.active} />
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

            {detail.isOpen(entry.id) && (
              <div className="border-b bg-muted/30 p-4">
                {detail.editing ? (
                  <ServiceForm
                    service={entry}
                    pending={save.isPending}
                    onCancel={detail.stopEditing}
                    onSubmit={(values) => save.mutate({ id: entry.id, values })}
                  />
                ) : (
                  <div className="space-y-4">
                    <dl className="flex flex-wrap gap-8">
                      <DetailField
                        label={strings.service.shortCode}
                        value={entry.shortCode ?? DASH}
                      />
                      <DetailField label={strings.service.feeCode} value={entry.feeCode ?? DASH} />
                      <DetailField
                        label={strings.service.duration}
                        value={
                          entry.defaultDurationMin === null
                            ? strings.service.durationEmpty
                            : `${entry.defaultDurationMin} ${strings.service.durationMinutes}`
                        }
                      />
                    </dl>
                    <p className="text-muted-foreground text-sm">
                      {entry.active
                        ? strings.service.detailHintActive
                        : strings.service.detailHintInactive}
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
                        onConfirm={() => remove.mutate(entry.id)}
                        title={strings.service.deleteTitle}
                        body={strings.service.deleteBody}
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

const priceSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const cents = parseEuroAmount(value)
    if (cents === null || cents < 0) {
      ctx.addIssue({ code: 'custom', message: 'amount' })
      return z.NEVER
    }
    return cents
  })

const formSchema = z.object({
  shortCode: z.string().trim().max(16),
  description: z.string().trim().min(1).max(200),
  feeCode: z.string().trim().max(40),
  price: priceSchema,
  duration: z.union([
    z.literal(''),
    z.coerce
      .number()
      .int()
      .positive()
      .max(24 * 60),
  ]),
  active: z.boolean(),
})

type FormInput = z.input<typeof formSchema>
type FormOutput = z.output<typeof formSchema>

const emptyToNull = (value: string) => (value === '' ? null : value)

function toServiceInput(values: FormOutput, sortOrder: number): ServiceInput {
  return {
    shortCode: emptyToNull(values.shortCode),
    description: values.description,
    feeCode: emptyToNull(values.feeCode),
    defaultPriceCents: values.price,
    defaultDurationMin: values.duration === '' ? null : values.duration,
    sortOrder,
    active: values.active,
  }
}

function toFormValues(service: Service | undefined): FormInput {
  return {
    shortCode: service?.shortCode ?? '',
    description: service?.description ?? '',
    feeCode: service?.feeCode ?? '',
    price: service ? formatEuroAmount(service.defaultPriceCents) : '',
    duration: service?.defaultDurationMin ?? '',
    active: service?.active ?? true,
  }
}

function ServiceForm({
  service,
  pending,
  onCancel,
  onSubmit,
}: {
  service?: Service
  pending: boolean
  onCancel: () => void
  onSubmit: (values: ServiceInput) => void
}) {
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(service),
  })
  const errors = form.formState.errors

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit(toServiceInput(values, service?.sortOrder ?? 100)),
      )}
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-6">
        <div className="sm:col-span-6">
          <Label htmlFor="service-description">{strings.service.serviceDescription}</Label>
          <Input
            id="service-description"
            className="mt-2"
            aria-invalid={errors.description ? true : undefined}
            {...form.register('description')}
          />
          {errors.description && (
            <p className="mt-1 text-destructive text-sm">{strings.validation.required}</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="service-shortCode">{strings.service.shortCode}</Label>
          <Input id="service-shortCode" className="mt-2" {...form.register('shortCode')} />
          <p className="mt-1 text-muted-foreground text-xs">{strings.service.shortCodeHint}</p>
        </div>

        <div className="sm:col-span-4">
          <Label htmlFor="service-feeCode">{strings.service.feeCode}</Label>
          <Input id="service-feeCode" className="mt-2" {...form.register('feeCode')} />
        </div>

        <div className="sm:col-span-3">
          <Label htmlFor="service-price">{strings.service.price}</Label>
          <div className="mt-2 flex items-center gap-2">
            <Input
              id="service-price"
              inputMode="decimal"
              aria-invalid={errors.price ? true : undefined}
              {...form.register('price')}
            />
            <span className="text-muted-foreground text-sm">€</span>
          </div>
          {errors.price ? (
            <p className="mt-1 text-destructive text-sm">{strings.validation.amount}</p>
          ) : (
            <p className="mt-1 text-muted-foreground text-xs">{strings.service.priceHint}</p>
          )}
        </div>

        <div className="sm:col-span-3">
          <Label htmlFor="service-duration">{strings.service.duration}</Label>
          <div className="mt-2 flex items-center gap-2">
            <Input
              id="service-duration"
              type="number"
              min={1}
              max={24 * 60}
              aria-invalid={errors.duration ? true : undefined}
              {...form.register('duration')}
            />
            <span className="whitespace-nowrap text-muted-foreground text-sm">
              {strings.service.durationMinutes}
            </span>
          </div>
          {errors.duration && (
            <p className="mt-1 text-destructive text-sm">{strings.validation.duration}</p>
          )}
        </div>

        <div className="sm:col-span-6">
          <CheckboxField
            id="service-active"
            label={strings.service.active}
            hint={strings.service.activeHint}
            checked={form.watch('active')}
            onChange={(checked) => form.setValue('active', checked)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {strings.service.cancel}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? strings.service.saving : strings.service.save}
        </Button>
      </div>
    </form>
  )
}
