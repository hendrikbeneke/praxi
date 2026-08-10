import { zodResolver } from '@hookform/resolvers/zod'
import { type PracticeSettings, practiceSettingsInputSchema } from '@praxi/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { ActivityTypeSettings } from '@/components/activity-type-settings'
import { ContactTypeSettings } from '@/components/contact-type-settings'
import { InvoiceSettings } from '@/components/invoice-settings'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api, apiError } from '@/lib/api'
import { strings } from '@/lib/strings'

const practiceSettingsQueryOptions = queryOptions({
  queryKey: ['settings'],
  queryFn: async (): Promise<PracticeSettings> => {
    const res = await api.api.settings.$get()
    if (!res.ok) throw await apiError(res)
    return res.json()
  },
})

export const Route = createFileRoute('/_app/settings')({
  loader: ({ context }) => context.queryClient.ensureQueryData(practiceSettingsQueryOptions),
  component: SettingsPage,
})

/** The schema the server validates against, reused verbatim — the form cannot
 *  drift from the API contract because there is only one definition. */
const formSchema = practiceSettingsInputSchema

type FormInput = z.input<typeof formSchema>
type FormOutput = z.output<typeof formSchema>

/**
 * The API models an unfilled optional field as `null`; an `<input>` cannot
 * hold that and would go uncontrolled. So `null` becomes `''` on the way in,
 * and the schema folds `''` back to `null` on the way out.
 */
function toFormValues(settings: PracticeSettings): FormInput {
  return {
    practiceName: settings.practiceName,
    street: settings.street ?? '',
    postalCode: settings.postalCode ?? '',
    city: settings.city ?? '',
    country: settings.country,
    phone: settings.phone ?? '',
    email: settings.email ?? '',
    website: settings.website ?? '',
    taxNumber: settings.taxNumber ?? '',
    bankName: settings.bankName ?? '',
    iban: settings.iban ?? '',
    bic: settings.bic ?? '',
    defaultPaymentTermDays: settings.defaultPaymentTermDays,
  }
}

function SettingsPage() {
  const queryClient = useQueryClient()
  const { data: settings } = useQuery(practiceSettingsQueryOptions)

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: settings ? toFormValues(settings) : undefined,
  })

  const [editing, setEditing] = useState(false)

  const { reset } = form
  // After a save the server's normalization (trimmed text, upper-cased IBAN)
  // is the truth; show that rather than what was typed.
  useEffect(() => {
    if (settings) reset(toFormValues(settings))
  }, [settings, reset])

  const mutation = useMutation({
    mutationFn: async (values: FormOutput): Promise<PracticeSettings> => {
      const res = await api.api.settings.$put({ json: values })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(practiceSettingsQueryOptions.queryKey, saved)
      setEditing(false)
      toast.success(strings.settings.saved)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.settings.saveFailed)
    },
  })

  const errors = form.formState.errors

  return (
    <>
      <PageHeader
        title={strings.settings.title}
        description={strings.settings.description}
        actions={
          !editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden />
              {strings.actions.edit}
            </Button>
          )
        }
      />

      {/* The practice master data is read far more often than it is changed,
          so the page opens read-only (CLAUDE.md, read mode first). */}
      <form
        className="max-w-3xl space-y-6"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        noValidate
      >
        <fieldset disabled={!editing} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{strings.settings.sectionPractice}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field
                id="practiceName"
                label={strings.settings.practiceName}
                error={errors.practiceName && strings.validation.required}
                {...form.register('practiceName')}
              />
              <Field
                id="taxNumber"
                label={strings.settings.taxNumber}
                error={errors.taxNumber && strings.validation.tooLong}
                {...form.register('taxNumber')}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{strings.settings.sectionAddress}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-6">
              <Field
                className="sm:col-span-6"
                id="street"
                label={strings.settings.street}
                error={errors.street && strings.validation.tooLong}
                {...form.register('street')}
              />
              <Field
                className="sm:col-span-2"
                id="postalCode"
                label={strings.settings.postalCode}
                error={errors.postalCode && strings.validation.tooLong}
                {...form.register('postalCode')}
              />
              <Field
                className="sm:col-span-4"
                id="city"
                label={strings.settings.city}
                error={errors.city && strings.validation.tooLong}
                {...form.register('city')}
              />
              <Field
                className="sm:col-span-2"
                id="country"
                label={strings.settings.country}
                error={errors.country && strings.validation.country}
                {...form.register('country')}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{strings.settings.sectionContact}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field
                id="phone"
                label={strings.settings.phone}
                type="tel"
                error={errors.phone && strings.validation.tooLong}
                {...form.register('phone')}
              />
              <Field
                id="email"
                label={strings.settings.email}
                type="email"
                error={errors.email && strings.validation.email}
                {...form.register('email')}
              />
              <Field
                className="sm:col-span-2"
                id="website"
                label={strings.settings.website}
                error={errors.website && strings.validation.tooLong}
                {...form.register('website')}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{strings.settings.sectionBanking}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field
                className="sm:col-span-2"
                id="bankName"
                label={strings.settings.bankName}
                error={errors.bankName && strings.validation.tooLong}
                {...form.register('bankName')}
              />
              <Field
                id="iban"
                label={strings.settings.iban}
                error={errors.iban && strings.validation.iban}
                {...form.register('iban')}
              />
              <Field
                id="bic"
                label={strings.settings.bic}
                error={errors.bic && strings.validation.tooLong}
                {...form.register('bic')}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{strings.settings.sectionInvoicing}</CardTitle>
            </CardHeader>
            <CardContent>
              <Field
                className="max-w-40"
                id="defaultPaymentTermDays"
                label={strings.settings.defaultPaymentTermDays}
                type="number"
                inputMode="numeric"
                min={0}
                max={365}
                error={errors.defaultPaymentTermDays && strings.validation.paymentTerm}
                {...form.register('defaultPaymentTermDays')}
              />
            </CardContent>
          </Card>
        </fieldset>

        {editing && (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => {
                // Back to what is stored, which is what "Abbrechen" means.
                if (settings) reset(toFormValues(settings))
                setEditing(false)
              }}
            >
              {strings.actions.cancel}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? strings.settings.saving : strings.settings.save}
            </Button>
          </div>
        )}
      </form>

      {/* Outside the form on purpose: these save on their own and have
          nothing to do with the practice master data above. */}
      <div className="mt-8">
        <h2 className="mb-4 font-semibold text-lg">{strings.invoice.settingsTitle}</h2>
        <InvoiceSettings />
      </div>

      <div className="mt-8">
        <h2 className="font-semibold text-lg">{strings.contactType.title}</h2>
        <p className="mt-1 mb-4 text-muted-foreground text-sm">{strings.contactType.description}</p>
        <ContactTypeSettings />
      </div>

      <div className="mt-8">
        <h2 className="font-semibold text-lg">{strings.activityType.title}</h2>
        <p className="mt-1 mb-4 text-muted-foreground text-sm">
          {strings.activityType.description}
        </p>
        <ActivityTypeSettings />
      </div>
    </>
  )
}

type FieldProps = React.ComponentProps<typeof Input> & {
  id: string
  label: string
  error?: string | undefined
}

function Field({ id, label, error, className, ...input }: FieldProps) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="mt-2" aria-invalid={error ? true : undefined} {...input} />
      {error && <p className="mt-1 text-destructive text-sm">{error}</p>}
    </div>
  )
}
