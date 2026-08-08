import { zodResolver } from '@hookform/resolvers/zod'
import {
  type Contact,
  type ContactInput,
  type ContactKind,
  type ContactRole,
  contactKinds,
  contactRoles,
} from '@praxi/shared'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { strings } from '@/lib/strings'

/**
 * The API models a contact as a discriminated union, which is right for the
 * wire and for the check constraint but wrong for a form: switching between
 * person and organization would throw away what was typed. So the form holds
 * one flat set of fields with `''` for empty, and `toContactInput` folds it
 * into the union on submit.
 */
const contactFormSchema = z
  .object({
    kind: z.enum(contactKinds),
    salutation: z.string().trim().max(40),
    title: z.string().trim().max(40),
    firstName: z.string().trim().max(80),
    lastName: z.string().trim().max(80),
    dateOfBirth: z.union([z.literal(''), z.iso.date()]),
    companyName: z.string().trim().max(120),
    contactPerson: z.string().trim().max(120),
    vatId: z.string().trim().max(40),
    street: z.string().trim().max(120),
    postalCode: z.string().trim().max(16),
    city: z.string().trim().max(80),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/),
    email: z.union([z.literal(''), z.email().max(160)]),
    phone: z.string().trim().max(40),
    internalNote: z.string().trim().max(4000),
    roles: z.array(
      z.object({
        role: z.enum(contactRoles),
        selected: z.boolean(),
        since: z.union([z.literal(''), z.iso.date()]),
      }),
    ),
  })
  .superRefine((values, ctx) => {
    // Mirrors the `contact_kind_fields` check constraint, so the practitioner
    // is told before the request goes out.
    if (values.kind === 'person' && values.lastName === '') {
      ctx.addIssue({ code: 'custom', path: ['lastName'], message: 'required' })
    }
    if (values.kind === 'organization' && values.companyName === '') {
      ctx.addIssue({ code: 'custom', path: ['companyName'], message: 'required' })
    }
  })

type ContactFormValues = z.input<typeof contactFormSchema>
type ContactFormOutput = z.output<typeof contactFormSchema>

const emptyToNull = (value: string) => (value === '' ? null : value)

function toContactInput(values: ContactFormOutput): ContactInput {
  const roles = values.roles
    .filter((entry) => entry.selected)
    .map((entry) => ({ role: entry.role, since: emptyToNull(entry.since) }))

  const shared = {
    vatId: emptyToNull(values.vatId),
    street: emptyToNull(values.street),
    postalCode: emptyToNull(values.postalCode),
    city: emptyToNull(values.city),
    country: values.country,
    email: emptyToNull(values.email),
    phone: emptyToNull(values.phone),
    internalNote: emptyToNull(values.internalNote),
    roles,
  }

  return values.kind === 'person'
    ? {
        kind: 'person',
        salutation: emptyToNull(values.salutation),
        title: emptyToNull(values.title),
        firstName: emptyToNull(values.firstName),
        lastName: values.lastName,
        dateOfBirth: emptyToNull(values.dateOfBirth),
        ...shared,
      }
    : {
        kind: 'organization',
        companyName: values.companyName,
        contactPerson: emptyToNull(values.contactPerson),
        ...shared,
      }
}

/** Today in Europe/Berlin as `YYYY-MM-DD` — suggested when a role is ticked.
 *  `toISOString()` would be UTC and give yesterday's date late in the evening. */
function todayInBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

function toFormValues(contact: Contact | undefined): ContactFormValues {
  const assigned = new Map(contact?.roles.map((entry) => [entry.role, entry.since]) ?? [])

  return {
    kind: contact?.kind ?? 'person',
    salutation: contact?.salutation ?? '',
    title: contact?.title ?? '',
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    dateOfBirth: contact?.dateOfBirth ?? '',
    companyName: contact?.companyName ?? '',
    contactPerson: contact?.contactPerson ?? '',
    vatId: contact?.vatId ?? '',
    street: contact?.street ?? '',
    postalCode: contact?.postalCode ?? '',
    city: contact?.city ?? '',
    country: contact?.country ?? 'DE',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    internalNote: contact?.internalNote ?? '',
    roles: contactRoles.map((role) => ({
      role,
      selected: assigned.has(role),
      since: assigned.get(role) ?? '',
    })),
  }
}

export function ContactForm({
  contact,
  onSubmit,
  pending,
}: {
  contact?: Contact
  onSubmit: (input: ContactInput) => void
  pending: boolean
}) {
  const form = useForm<ContactFormValues, unknown, ContactFormOutput>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: toFormValues(contact),
  })

  const kind = form.watch('kind') as ContactKind
  const roles = form.watch('roles')
  const errors = form.formState.errors

  return (
    <form
      className="max-w-3xl space-y-6"
      onSubmit={form.handleSubmit((values) => onSubmit(toContactInput(values)))}
      noValidate
    >
      <Card>
        <CardHeader>
          <CardTitle>{strings.contact.sectionName}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <Label htmlFor="kind">{strings.contact.kindLabel}</Label>
            {/* Structural and immutable once saved (CLAUDE.md rule 4). */}
            <Select
              value={kind}
              onValueChange={(value) => form.setValue('kind', value as ContactKind)}
              disabled={Boolean(contact)}
            >
              <SelectTrigger id="kind" className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {contactKinds.map((value) => (
                  <SelectItem key={value} value={value}>
                    {strings.contact.kind[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {contact && (
              <p className="mt-1 text-muted-foreground text-xs">{strings.contact.kindImmutable}</p>
            )}
          </div>

          {kind === 'person' ? (
            <>
              <Field
                className="sm:col-span-2"
                id="salutation"
                label={strings.contact.salutation}
                list="salutation-options"
                {...form.register('salutation')}
              />
              <datalist id="salutation-options">
                {strings.contact.salutationOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              <Field
                className="sm:col-span-2"
                id="title"
                label={strings.contact.academicTitle}
                {...form.register('title')}
              />
              <Field
                className="sm:col-span-3"
                id="firstName"
                label={strings.contact.firstName}
                {...form.register('firstName')}
              />
              <Field
                className="sm:col-span-3"
                id="lastName"
                label={strings.contact.lastName}
                error={errors.lastName && strings.validation.required}
                {...form.register('lastName')}
              />
              <Field
                className="sm:col-span-3"
                id="dateOfBirth"
                type="date"
                label={strings.contact.dateOfBirth}
                {...form.register('dateOfBirth')}
              />
            </>
          ) : (
            <>
              <Field
                className="sm:col-span-4"
                id="companyName"
                label={strings.contact.companyName}
                error={errors.companyName && strings.validation.required}
                {...form.register('companyName')}
              />
              <Field
                className="sm:col-span-3"
                id="contactPerson"
                label={strings.contact.contactPerson}
                {...form.register('contactPerson')}
              />
            </>
          )}

          {/* A sole trader is a person and can still have a VAT id. */}
          <Field
            className="sm:col-span-3"
            id="vatId"
            label={strings.contact.vatId}
            {...form.register('vatId')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{strings.contact.roleLabel}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {roles.map((entry, index) => (
            <div key={entry.role} className="flex items-center gap-3">
              <Checkbox
                id={`role-${entry.role}`}
                checked={entry.selected}
                onCheckedChange={(checked) => {
                  const selected = checked === true
                  form.setValue(`roles.${index}.selected`, selected)
                  // Suggest today when a role is ticked; clearing the tick
                  // leaves the date alone so it comes back on re-tick.
                  if (selected && !entry.since) {
                    form.setValue(`roles.${index}.since`, todayInBerlin())
                  }
                }}
              />
              <Label htmlFor={`role-${entry.role}`} className="w-44 shrink-0 font-normal">
                {strings.contact.role[entry.role as ContactRole]}
              </Label>
              <Input
                type="date"
                aria-label={`${strings.contact.role[entry.role as ContactRole]} ${strings.contact.roleSince}`}
                disabled={!entry.selected}
                {...form.register(`roles.${index}.since`)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{strings.contact.sectionAddress}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-6">
          <Field
            className="sm:col-span-6"
            id="street"
            label={strings.contact.street}
            {...form.register('street')}
          />
          <Field
            className="sm:col-span-2"
            id="postalCode"
            label={strings.contact.postalCode}
            {...form.register('postalCode')}
          />
          <Field
            className="sm:col-span-4"
            id="city"
            label={strings.contact.city}
            {...form.register('city')}
          />
          <Field
            className="sm:col-span-2"
            id="country"
            label={strings.contact.country}
            error={errors.country && strings.validation.country}
            {...form.register('country')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{strings.contact.sectionContact}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            id="email"
            type="email"
            label={strings.contact.email}
            error={errors.email && strings.validation.email}
            {...form.register('email')}
          />
          <Field id="phone" type="tel" label={strings.contact.phone} {...form.register('phone')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{strings.contact.sectionInternal}</CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="internalNote">{strings.contact.internalNote}</Label>
          <Textarea
            id="internalNote"
            rows={4}
            className="mt-2"
            {...form.register('internalNote')}
          />
          <p className="mt-1 text-muted-foreground text-xs">{strings.contact.internalNoteHint}</p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? strings.contact.saving : strings.contact.save}
        </Button>
      </div>
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
