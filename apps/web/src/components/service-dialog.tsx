import { zodResolver } from '@hookform/resolvers/zod'
import { formatEuroAmount, parseEuroAmount, type Service, type ServiceInput } from '@praxi/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
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
import { ApiError } from '@/lib/api'
import { createService, updateService } from '@/lib/services'
import { strings } from '@/lib/strings'

/**
 * Amounts are entered with a decimal comma and stored as integer cents
 * (CLAUDE.md rule 2), so the field holds text and the schema converts. That
 * conversion is `parseEuroAmount` from `packages/shared` — the same function
 * the invoice PDF will format against in slice 6.
 */
const serviceFormSchema = z.object({
  shortCode: z.string().trim().max(16),
  description: z.string().trim().min(1).max(200),
  feeCode: z.string().trim().max(40),
  price: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const cents = parseEuroAmount(value)
      if (cents === null || cents < 0) {
        ctx.addIssue({ code: 'custom', message: 'amount' })
        return z.NEVER
      }
      return cents
    }),
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

type FormInput = z.input<typeof serviceFormSchema>
type FormOutput = z.output<typeof serviceFormSchema>

const emptyToNull = (value: string) => (value === '' ? null : value)

function toServiceInput(values: FormOutput): ServiceInput {
  return {
    shortCode: emptyToNull(values.shortCode),
    description: values.description,
    feeCode: emptyToNull(values.feeCode),
    defaultPriceCents: values.price,
    defaultDurationMin: values.duration === '' ? null : values.duration,
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

export function ServiceDialog({
  service,
  open,
  onOpenChange,
}: {
  service?: Service | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: toFormValues(service),
  })

  const { reset } = form
  // The dialog stays mounted between openings, so the fields have to be put
  // back to what is being edited each time it opens.
  useEffect(() => {
    if (open) reset(toFormValues(service))
  }, [open, service, reset])

  const mutation = useMutation({
    mutationFn: (input: ServiceInput) =>
      service ? updateService(service.id, input) : createService(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['services'] })
      // A price shown inside a group comes from the catalogue, so it moves too.
      await queryClient.invalidateQueries({ queryKey: ['service-groups'] })
      toast.success(service ? strings.service.saved : strings.service.created)
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.service.saveFailed)
    },
  })

  const errors = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {service ? strings.service.editTitle : strings.service.createTitle}
          </DialogTitle>
          <DialogDescription>{strings.service.templateHint}</DialogDescription>
        </DialogHeader>

        <form
          id="service-form"
          className="grid gap-4 sm:grid-cols-6"
          onSubmit={form.handleSubmit((values) => mutation.mutate(toServiceInput(values)))}
          noValidate
        >
          <div className="sm:col-span-6">
            <Label htmlFor="description">{strings.service.serviceDescription}</Label>
            <Input
              id="description"
              className="mt-2"
              aria-invalid={errors.description ? true : undefined}
              {...form.register('description')}
            />
            {errors.description && (
              <p className="mt-1 text-destructive text-sm">{strings.validation.required}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="shortCode">{strings.service.shortCode}</Label>
            <Input id="shortCode" className="mt-2" {...form.register('shortCode')} />
            <p className="mt-1 text-muted-foreground text-xs">{strings.service.shortCodeHint}</p>
          </div>

          <div className="sm:col-span-4">
            <Label htmlFor="feeCode">{strings.service.feeCode}</Label>
            <Input id="feeCode" className="mt-2" {...form.register('feeCode')} />
          </div>

          <div className="sm:col-span-3">
            <Label htmlFor="price">{strings.service.price}</Label>
            <div className="mt-2 flex items-center gap-2">
              <Input
                id="price"
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
            <Label htmlFor="duration">{strings.service.duration}</Label>
            <div className="mt-2 flex items-center gap-2">
              <Input
                id="duration"
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
            <div className="flex items-center gap-2">
              <Checkbox
                id="active"
                checked={form.watch('active')}
                onCheckedChange={(checked) => form.setValue('active', checked === true)}
              />
              <Label htmlFor="active" className="font-normal">
                {strings.service.active}
              </Label>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">{strings.service.activeHint}</p>
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {strings.service.cancel}
          </Button>
          <Button type="submit" form="service-form" disabled={mutation.isPending}>
            {mutation.isPending ? strings.service.saving : strings.service.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
