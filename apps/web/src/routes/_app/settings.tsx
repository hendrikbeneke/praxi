import { zodResolver } from '@hookform/resolvers/zod'
import {
  countryName,
  type PracticeSettings,
  practiceCountries,
  practiceSettingsInputSchema,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { ReadValue } from '@/components/read-value'
import { Section, SectionField } from '@/components/section-grid'
import { TextTemplateSettings } from '@/components/text-template-settings'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CountrySettings,
  GenderSettings,
  SalutationSettings,
} from '@/components/value-list-settings'
import { ApiError } from '@/lib/api'
import { practiceSettingsQueryOptions, updatePracticeSettings } from '@/lib/settings'
import { strings } from '@/lib/strings'

const sectionKeys = [
  'practice',
  'invoicing',
  'roles',
  'relations',
  'valueLists',
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
  { key: 'roles', label: strings.contactType.tabRoles, hint: strings.settingsNav.rolesHint },
  {
    key: 'relations',
    label: strings.contactType.tabRelations,
    hint: strings.settingsNav.relationsHint,
  },
  {
    key: 'valueLists',
    label: strings.valueList.sectionTitle,
    hint: strings.valueList.sectionHint,
  },
  {
    key: 'activityTypes',
    label: strings.activityType.title,
    hint: strings.settingsNav.activityTypesHint,
  },
  {
    key: 'textTemplates',
    label: strings.invoice.templates,
    hint: strings.settingsNav.textTemplatesHint,
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
              /* The tint is mixed against `--card`, as the prototype sets it;
                 Tailwind's `bg-primary/10` is alpha over the page background,
                 which lands a hair darker (K4). */
              className="flex flex-col gap-0.5 rounded-lg px-3 py-[9px] text-left hover:bg-accent"
              style={
                section === entry.key
                  ? { background: 'color-mix(in oklab, var(--primary) 10%, var(--card))' }
                  : undefined
              }
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
          {section === 'valueLists' && (
            <div className="space-y-8">
              <SalutationSettings />
              <GenderSettings />
              <CountrySettings />
            </div>
          )}
          {section === 'activityTypes' && <ActivityTypeSettings />}
          {section === 'textTemplates' && <TextTemplateSettings />}
          {section === 'mail' && <MailSettings />}
          {section === 'google' && <GoogleSettings />}
        </div>
      </div>
    </ContentWidth>
  )
}

/** Everything on `practice_settings`, the payment term included: the design puts
 *  it in this card's last section, and K4 moved it back from the
 *  "Rechnungsstellung" panel where D4 had put it. Still a `PATCH` and not the
 *  old `PUT` — the reason that matters has not changed, it has only stopped
 *  being about this one field: a panel's save must touch nothing it does not
 *  render. See `updatePracticeSettings` on the server. */
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
    vatId: settings.vatId ?? '',
    bankName: settings.bankName ?? '',
    iban: settings.iban ?? '',
    bic: settings.bic ?? '',
    defaultPaymentTermDays: settings.defaultPaymentTermDays,
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
      {/* One card with six sections, separated by a line — not six cards. Each
          section's explanation stands in its title column, which is where the
          design puts it and why `Section` carries a `hint` at all (K4). The panel
          is read far more often than changed, so it opens in read mode; since K2
          that means values as text, not disabled fields. */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>{strings.settings.cardTitle}</CardTitle>
          {!editing && (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden />
              {strings.actions.edit}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Section
            title={strings.settings.sectionPractice}
            hint={strings.settings.practiceHintSection}
          >
            <SectionField span={12}>
              <Field
                id="practiceName"
                editing={editing}
                readValue={settings?.practiceName}
                label={strings.settings.practiceName}
                error={errors.practiceName && strings.validation.required}
                {...form.register('practiceName')}
              />
            </SectionField>
          </Section>

          <Section
            title={strings.settings.sectionAddress}
            hint={strings.settings.addressHintSection}
          >
            <SectionField span={12}>
              <Field
                id="street"
                editing={editing}
                readValue={settings?.street}
                label={strings.settings.street}
                error={errors.street && strings.validation.tooLong}
                {...form.register('street')}
              />
            </SectionField>
            <SectionField span={3}>
              <Field
                id="postalCode"
                editing={editing}
                readValue={settings?.postalCode}
                label={strings.settings.postalCode}
                error={errors.postalCode && strings.validation.tooLong}
                {...form.register('postalCode')}
              />
            </SectionField>
            <SectionField span={5}>
              <Field
                id="city"
                editing={editing}
                readValue={settings?.city}
                label={strings.settings.city}
                error={errors.city && strings.validation.tooLong}
                {...form.register('city')}
              />
            </SectionField>
            <SectionField span={4}>
              {/* NOT the contact catalogue: the practice's own country is a
                  system property — which law applies hangs on it — so the set
                  is `practiceCountries`, given in a commit and not configurable
                  (D-R3). The name still comes from `countryName()`. */}
              <Label htmlFor={editing ? 'country' : undefined}>{strings.settings.country}</Label>
              {editing ? (
                <Controller
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="country" className="mt-2 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {practiceCountries.map((code) => (
                          <SelectItem key={code} value={code}>
                            {countryName(code)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              ) : (
                <ReadValue>{settings && countryName(settings.country)}</ReadValue>
              )}
            </SectionField>
          </Section>

          <Section
            title={strings.settings.sectionContact}
            hint={strings.settings.contactHintSection}
          >
            <SectionField span={6}>
              <Field
                id="phone"
                editing={editing}
                readValue={settings?.phone}
                label={strings.settings.phone}
                type="tel"
                error={errors.phone && strings.validation.tooLong}
                {...form.register('phone')}
              />
            </SectionField>
            <SectionField span={6}>
              <Field
                id="email"
                editing={editing}
                readValue={settings?.email}
                label={strings.settings.email}
                type="email"
                error={errors.email && strings.validation.email}
                {...form.register('email')}
              />
            </SectionField>
            <SectionField span={12}>
              <Field
                id="website"
                editing={editing}
                readValue={settings?.website}
                label={strings.settings.website}
                error={errors.website && strings.validation.tooLong}
                {...form.register('website')}
              />
            </SectionField>
          </Section>

          <Section
            title={strings.settings.sectionBanking}
            hint={strings.settings.bankingHintSection}
          >
            <SectionField span={12}>
              <Field
                id="bankName"
                editing={editing}
                readValue={settings?.bankName}
                label={strings.settings.bankName}
                error={errors.bankName && strings.validation.tooLong}
                {...form.register('bankName')}
              />
            </SectionField>
            <SectionField span={7}>
              <Field
                id="iban"
                editing={editing}
                readValue={settings?.iban}
                label={strings.settings.iban}
                error={errors.iban && strings.validation.iban}
                {...form.register('iban')}
              />
            </SectionField>
            <SectionField span={5}>
              <Field
                id="bic"
                editing={editing}
                readValue={settings?.bic}
                label={strings.settings.bic}
                error={errors.bic && strings.validation.tooLong}
                {...form.register('bic')}
              />
            </SectionField>
          </Section>

          <Section title={strings.settings.sectionTaxes} hint={strings.settings.taxesHintSection}>
            <SectionField span={6}>
              <Field
                id="taxNumber"
                editing={editing}
                readValue={settings?.taxNumber}
                label={strings.settings.taxNumber}
                error={errors.taxNumber && strings.validation.tooLong}
                {...form.register('taxNumber')}
              />
            </SectionField>
            <SectionField span={6}>
              <Field
                id="vatId"
                editing={editing}
                readValue={settings?.vatId}
                label={strings.settings.vatId}
                error={errors.vatId && strings.validation.tooLong}
                {...form.register('vatId')}
              />
            </SectionField>
          </Section>

          {/* The payment term lives here, as the design puts it — not in the
              "Rechnungsstellung" panel where D4 had moved it. Safe since D4: the
              route is a PATCH and this form sends only the fields it renders, so
              saving it cannot touch a column it does not show. */}
          <Section
            title={strings.settings.sectionInvoicingPreset}
            hint={strings.settings.invoicingPresetHintSection}
          >
            <SectionField span={3}>
              <Field
                id="defaultPaymentTermDays"
                editing={editing}
                readValue={
                  settings === undefined ? undefined : String(settings.defaultPaymentTermDays)
                }
                label={strings.settings.defaultPaymentTermDays}
                inputMode="numeric"
                error={errors.defaultPaymentTermDays && strings.validation.paymentTerm}
                {...form.register('defaultPaymentTermDays')}
              />
            </SectionField>
          </Section>
        </CardContent>
      </Card>

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
  editing: boolean
  readValue?: string | null | undefined
}

/** In read mode the value is text under the label, not a disabled input (K2).
 *  The `<Label>` is the same in both modes, so switching moves no line. */
function Field({ id, label, error, className, editing, readValue, ...input }: FieldProps) {
  return (
    <div className={className}>
      <Label htmlFor={editing ? id : undefined}>{label}</Label>
      {editing ? (
        <>
          <Input id={id} className="mt-2" aria-invalid={error ? true : undefined} {...input} />
          {error && <p className="mt-1 text-destructive text-sm">{error}</p>}
        </>
      ) : (
        <ReadValue>{readValue}</ReadValue>
      )}
    </div>
  )
}
