import { zodResolver } from '@hookform/resolvers/zod'
import { type PracticeSettings, practiceSettingsInputSchema } from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ActivityTypeSettings } from '@/components/activity-type-settings'
import { RelationTypeSettings, RoleTypeSettings } from '@/components/contact-type-settings'
import { ContentWidth } from '@/components/content-width'
import { GoogleSettings } from '@/components/google-settings'
import { InvoiceSettings } from '@/components/invoice-settings'
import { MailSettings } from '@/components/mail-settings'
import { OpeningHoursSettings } from '@/components/opening-hours-settings'
import { PageHeader } from '@/components/page-header'
import { ReadModeFieldset } from '@/components/read-mode-fieldset'
import { TextTemplateSettings } from '@/components/text-template-settings'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { practiceSettingsQueryOptions, updatePracticeSettings } from '@/lib/settings'
import { strings } from '@/lib/strings'

const sectionKeys = [
  'practice',
  'invoicing',
  'roles',
  'relations',
  'activityTypes',
  'textTemplates',
  'mail',
  'google',
] as const
type SectionKey = (typeof sectionKeys)[number]

const searchSchema = z.object({
  section: z.enum(sectionKeys).default('practice'),
})

export const Route = createFileRoute('/_app/settings')({
  validateSearch: searchSchema,
  loader: ({ context }) => context.queryClient.ensureQueryData(practiceSettingsQueryOptions),
  component: SettingsPage,
})

/**
 * The section list on the left — one hint per entry, reused as the panel's
 * own title-bar hint where the panel has one (D4). Order matches the
 * sidebar's money-first-then-catalogues instinct: Praxis and Rechnungsstellung
 * first because they are read most, then the catalogues in the order a new
 * practice would set them up, mail and the calendar last.
 */
const SECTIONS: { key: SectionKey; label: string; hint: string }[] = [
  {
    key: 'practice',
    label: strings.settings.sectionPractice,
    hint: strings.settingsNav.practiceHint,
  },
  {
    key: 'invoicing',
    label: strings.settings.sectionInvoicing,
    hint: strings.settingsNav.invoicingHint,
  },
  { key: 'roles', label: strings.contactType.tabRoles, hint: strings.contactType.rolesHint },
  {
    key: 'relations',
    label: strings.contactType.tabRelations,
    hint: strings.contactType.relationsHint,
  },
  { key: 'activityTypes', label: strings.activityType.title, hint: strings.activityType.hint },
  {
    key: 'textTemplates',
    label: strings.invoice.templates,
    hint: strings.invoice.templatesHint,
  },
  { key: 'mail', label: strings.mail.title, hint: strings.settingsNav.mailHint },
  { key: 'google', label: strings.google.title, hint: strings.settingsNav.googleHint },
]

function SettingsPage() {
  const { section } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    // The whole page is capped here, header included — that is where the
    // prototype puts it on the three list screens (K1).
    <ContentWidth max={1180}>
      <PageHeader
        title={strings.settings.pageTitle}
        description={strings.settings.pageDescription}
      />

      <div className="grid gap-7 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex flex-col gap-0.5 self-start lg:sticky lg:top-8">
          {SECTIONS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => void navigate({ search: { section: entry.key } })}
              className={`flex flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-accent ${
                section === entry.key ? 'bg-primary/10' : ''
              }`}
            >
              <span className={section === entry.key ? 'font-semibold' : 'font-normal'}>
                {entry.label}
              </span>
              <span className="text-muted-foreground text-xs">{entry.hint}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {section === 'practice' && (
            <div className="space-y-6">
              <PracticeForm />
              {/* Its own table and its own save, so it sits beside the form
                  rather than inside it (D9.5). */}
              <OpeningHoursSettings />
            </div>
          )}
          {section === 'invoicing' && <InvoiceSettings />}
          {section === 'roles' && <RoleTypeSettings />}
          {section === 'relations' && <RelationTypeSettings />}
          {section === 'activityTypes' && <ActivityTypeSettings />}
          {section === 'textTemplates' && <TextTemplateSettings />}
          {section === 'mail' && <MailSettings />}
          {section === 'google' && <GoogleSettings />}
        </div>
      </div>
    </ContentWidth>
  )
}

/** Everything on `practice_settings` except the payment term, which moved to
 *  "Rechnungsstellung" (D4). A `PATCH`, not the old `PUT`: this form sends
 *  only the fields it renders, so saving it can never touch the payment term
 *  even if that panel has unsaved changes open at the same time — see
 *  `updatePracticeSettings` on the server for why that matters. */
const formSchema = practiceSettingsInputSchema.omit({ defaultPaymentTermDays: true })

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
  }
}

function PracticeForm() {
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
    mutationFn: (values: FormOutput) => updatePracticeSettings(values),
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
    <form
      className="space-y-6"
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      noValidate
    >
      {/* The practice master data is read far more often than it is changed,
          so the panel opens read-only (CLAUDE.md, read mode first). */}
      <ReadModeFieldset disabled={!editing} className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>{strings.settings.sectionPractice}</CardTitle>
            {!editing && (
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-4" aria-hidden />
                {strings.actions.edit}
              </Button>
            )}
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
      </ReadModeFieldset>

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
