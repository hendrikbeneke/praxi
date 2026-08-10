import { zodResolver } from '@hookform/resolvers/zod'
import {
  type Contact,
  type ContactKind,
  type ContactRoleInput,
  type ContactUpdate,
  contactKinds,
} from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { DateField } from '@/components/date-field'
import { ReadModeFieldset } from '@/components/read-mode-fieldset'
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
import { roleTypeListQueryOptions } from '@/lib/contact-types'
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
    /**
     * Only filled while creating. On an existing contact the roles are ticked
     * in the page header, which saves immediately — see the note on
     * `contactUpdateSchema` for why they must not travel with this form.
     */
    roles: z.array(z.object({ roleCode: z.string(), since: z.iso.date() })),
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

function toContactUpdate(values: ContactFormOutput): ContactUpdate {
  const shared = {
    vatId: emptyToNull(values.vatId),
    street: emptyToNull(values.street),
    postalCode: emptyToNull(values.postalCode),
    city: emptyToNull(values.city),
    country: values.country,
    email: emptyToNull(values.email),
    phone: emptyToNull(values.phone),
    internalNote: emptyToNull(values.internalNote),
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
    roles: [],
  }
}

/**
 * The master data of a contact.
 *
 * Roles are only part of this form while a contact is being created; on an
 * existing one they live in the page header, next to the name. Relations never
 * belong here — they are on the overview.
 *
 * `editing` is false by default on an existing contact: the record is read
 * first and changed rarely, and a page full of live inputs invites a stray
 * keystroke into a field nobody meant to touch.
 */
export function ContactForm({
  contact,
  editing = true,
  onSubmit,
  onCancel,
  pending,
}: {
  contact?: Contact
  editing?: boolean
  onSubmit: (input: ContactUpdate, roles: ContactRoleInput[]) => void
  onCancel?: () => void
  pending: boolean
}) {
  const form = useForm<ContactFormValues, unknown, ContactFormOutput>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: toFormValues(contact),
  })

  const kind = form.watch('kind') as ContactKind
  const roles = form.watch('roles')
  const errors = form.formState.errors

  const creating = contact === undefined
  const types = useQuery({ ...roleTypeListQueryOptions(false), enabled: creating })
  const roleTypes = types.data ?? []

  return (
    <form
      className="max-w-3xl space-y-6"
      onSubmit={form.handleSubmit((values) => onSubmit(toContactUpdate(values), values.roles))}
      noValidate
    >
      <ReadModeFieldset disabled={!editing} className="space-y-6">
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
                <p className="mt-1 text-muted-foreground text-xs">
                  {strings.contact.kindImmutable}
                </p>
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
                {/*
                  The one field that asks for `past`, and the reason is a
                  property of this field alone: it is the only one that reaches
                  back far enough for "00–69 means the 2000s" to give a wrong
                  answer instead of a harmless one. `12.3.46` typed for a
                  patient born in 1946 would otherwise become 2046, and their
                  age would be wrong from that moment on. A payment, a session
                  or an invoice never lies that far back, so they keep the
                  ordinary rule — and nothing about this belongs anywhere else.
                  A four-digit year is taken at its word here too.
                */}
                <div className="sm:col-span-3">
                  <Label htmlFor="dateOfBirth">{strings.contact.dateOfBirth}</Label>
                  <Controller
                    control={form.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <DateField
                        id="dateOfBirth"
                        className="mt-2"
                        twoDigitYear="past"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </div>
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

        {creating && (
          <Card>
            <CardHeader>
              <CardTitle>{strings.contact.roleLabel}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {roleTypes.length === 0 && (
                <p className="text-muted-foreground text-sm">{strings.contact.roleHint}</p>
              )}
              {roleTypes.map((type) => {
                const checked = roles.some((entry) => entry.roleCode === type.code)
                return (
                  <div key={type.code} className="flex items-center gap-3">
                    <Checkbox
                      id={`role-${type.code}`}
                      checked={checked}
                      onCheckedChange={(value) => {
                        // "seit" is recorded but not shown: on the day a role is
                        // ticked, today is the only sensible answer, and a date
                        // field per role turned the section into a form of its own.
                        form.setValue(
                          'roles',
                          value === true
                            ? [...roles, { roleCode: type.code, since: todayInBerlin() }]
                            : roles.filter((entry) => entry.roleCode !== type.code),
                          { shouldDirty: true },
                        )
                      }}
                    />
                    <Label htmlFor={`role-${type.code}`} className="font-normal">
                      {type.label}
                    </Label>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

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
            <Field
              id="phone"
              type="tel"
              label={strings.contact.phone}
              {...form.register('phone')}
            />
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
      </ReadModeFieldset>

      {editing && (
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
              {strings.contact.cancel}
            </Button>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? strings.contact.saving : strings.contact.save}
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
