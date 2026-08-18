import { zodResolver } from '@hookform/resolvers/zod'
import {
  type Contact,
  type ContactKind,
  type ContactRoleInput,
  type ContactUpdate,
  contactGenderSchema,
  contactGenders,
  contactKinds,
  countries,
  countryName,
  formatBerlinDate,
} from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { DateField } from '@/components/date-field'
import { ReadValue } from '@/components/read-value'
import { Section } from '@/components/section-grid'
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
    birthPlace: z.string().trim().max(120),
    // `''` is "not recorded", which is what NULL means in the column too.
    gender: z.union([z.literal(''), contactGenderSchema]),
    companyName: z.string().trim().max(120),
    contactPerson: z.string().trim().max(120),
    vatId: z.string().trim().max(40),
    street: z.string().trim().max(120),
    houseNumber: z.string().trim().max(20),
    postalCode: z.string().trim().max(16),
    city: z.string().trim().max(80),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/),
    email: z.union([z.literal(''), z.email().max(160)]),
    phoneMobile: z.string().trim().max(40),
    phoneLandline: z.string().trim().max(40),
    internalNote: z.string().trim().max(4000),
    diagnosis: z.string().trim().max(4000),
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

/** A Radix select item cannot carry an empty value, so "not recorded" needs a
 *  token of its own on the way through the dropdown. It is folded back to `''`
 *  immediately, and to `null` on submit. */
const NO_GENDER = 'none'

function toContactUpdate(values: ContactFormOutput): ContactUpdate {
  const shared = {
    vatId: emptyToNull(values.vatId),
    street: emptyToNull(values.street),
    houseNumber: emptyToNull(values.houseNumber),
    postalCode: emptyToNull(values.postalCode),
    city: emptyToNull(values.city),
    country: values.country,
    email: emptyToNull(values.email),
    phoneMobile: emptyToNull(values.phoneMobile),
    phoneLandline: emptyToNull(values.phoneLandline),
    internalNote: emptyToNull(values.internalNote),
    diagnosis: emptyToNull(values.diagnosis),
  }

  return values.kind === 'person'
    ? {
        kind: 'person',
        salutation: emptyToNull(values.salutation),
        title: emptyToNull(values.title),
        firstName: emptyToNull(values.firstName),
        lastName: values.lastName,
        dateOfBirth: emptyToNull(values.dateOfBirth),
        birthPlace: emptyToNull(values.birthPlace),
        gender: values.gender === '' ? null : values.gender,
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
    birthPlace: contact?.birthPlace ?? '',
    gender: contact?.gender ?? '',
    companyName: contact?.companyName ?? '',
    contactPerson: contact?.contactPerson ?? '',
    vatId: contact?.vatId ?? '',
    street: contact?.street ?? '',
    houseNumber: contact?.houseNumber ?? '',
    postalCode: contact?.postalCode ?? '',
    city: contact?.city ?? '',
    country: contact?.country ?? 'DE',
    email: contact?.email ?? '',
    phoneMobile: contact?.phoneMobile ?? '',
    phoneLandline: contact?.phoneLandline ?? '',
    internalNote: contact?.internalNote ?? '',
    diagnosis: contact?.diagnosis ?? '',
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
      <div className="space-y-0">
        <Section titleWidth={200} title={strings.contact.sectionName}>
          <div className="sm:col-span-4">
            <Label htmlFor="kind">{strings.contact.kindLabel}</Label>
            {/* Structural and immutable once saved (CLAUDE.md rule 4). */}
            {!editing ? (
              <ReadValue>{strings.contact.kind[kind]}</ReadValue>
            ) : (
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
            )}
            {contact && editing && (
              <p className="mt-1 text-muted-foreground text-xs">{strings.contact.kindImmutable}</p>
            )}
          </div>

          {kind === 'person' ? (
            <>
              <Field
                className="sm:col-span-4"
                id="salutation"
                editing={editing}
                readValue={contact?.salutation}
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
                className="sm:col-span-4"
                id="title"
                editing={editing}
                readValue={contact?.title}
                label={strings.contact.academicTitle}
                {...form.register('title')}
              />
              <Field
                className="sm:col-span-6"
                id="firstName"
                editing={editing}
                readValue={contact?.firstName}
                label={strings.contact.firstName}
                {...form.register('firstName')}
              />
              <Field
                className="sm:col-span-6"
                id="lastName"
                editing={editing}
                readValue={contact?.lastName}
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
              <div className="sm:col-span-6">
                <Label htmlFor={editing ? 'dateOfBirth' : undefined}>
                  {strings.contact.dateOfBirth}
                </Label>
                {!editing ? (
                  <ReadValue>
                    {contact?.dateOfBirth && formatBerlinDate(`${contact.dateOfBirth}T12:00:00Z`)}
                  </ReadValue>
                ) : (
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
                )}
              </div>

              <div className="sm:col-span-6">
                <Label htmlFor={editing ? 'gender' : undefined}>{strings.contact.gender}</Label>
                {/* The readable word lives only in the option list — without
                    this mapping read mode would show `male` (K2). */}
                {!editing ? (
                  <ReadValue>
                    {contact?.gender ? strings.contact.genders[contact.gender] : undefined}
                  </ReadValue>
                ) : (
                  <Controller
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <Select
                        value={field.value === '' ? NO_GENDER : field.value}
                        onValueChange={(value) => field.onChange(value === NO_GENDER ? '' : value)}
                      >
                        <SelectTrigger id="gender" className="mt-2 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Not recorded is a value one can pick back, not
                              only a state one starts in. */}
                          <SelectItem value={NO_GENDER}>{strings.contact.genderNone}</SelectItem>
                          {contactGenders.map((value) => (
                            <SelectItem key={value} value={value}>
                              {strings.contact.genders[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )}
              </div>

              <Field
                className="sm:col-span-6"
                id="birthPlace"
                editing={editing}
                readValue={contact?.birthPlace}
                label={strings.contact.birthPlace}
                {...form.register('birthPlace')}
              />
            </>
          ) : (
            <>
              <Field
                className="sm:col-span-8"
                id="companyName"
                editing={editing}
                readValue={contact?.companyName}
                label={strings.contact.companyName}
                error={errors.companyName && strings.validation.required}
                {...form.register('companyName')}
              />
              <Field
                className="sm:col-span-6"
                id="contactPerson"
                editing={editing}
                readValue={contact?.contactPerson}
                label={strings.contact.contactPerson}
                {...form.register('contactPerson')}
              />
            </>
          )}

          {/* A sole trader is a person and can still have a VAT id. */}
          <Field
            className="sm:col-span-6"
            id="vatId"
            editing={editing}
            readValue={contact?.vatId}
            label={strings.contact.vatId}
            {...form.register('vatId')}
          />
        </Section>

        {creating && (
          <Section
            titleWidth={200}
            title={strings.contact.sectionRoles}
            hint={strings.contact.sectionRolesHint}
          >
            <div className="col-span-12 grid gap-3 sm:grid-cols-2">
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
            </div>
          </Section>
        )}

        <Section
          titleWidth={200}
          title={strings.contact.sectionAddress}
          hint={strings.contact.sectionAddressHint}
        >
          <Field
            className="sm:col-span-8"
            id="street"
            editing={editing}
            readValue={contact?.street}
            label={strings.contact.street}
            {...form.register('street')}
          />
          {/* Its own field. The two are put back together for display by
                `formatStreetLine`, on screen and on the invoice alike. */}
          <Field
            className="sm:col-span-4"
            id="houseNumber"
            editing={editing}
            readValue={contact?.houseNumber}
            label={strings.contact.houseNumber}
            {...form.register('houseNumber')}
          />
          <Field
            className="sm:col-span-4"
            id="postalCode"
            editing={editing}
            readValue={contact?.postalCode}
            label={strings.contact.postalCode}
            {...form.register('postalCode')}
          />
          <Field
            className="sm:col-span-8"
            id="city"
            editing={editing}
            readValue={contact?.city}
            label={strings.contact.city}
            {...form.register('city')}
          />
          {/* A country is stored as a code and never shown as one — see
              `packages/shared/src/country.ts`. */}
          <div className="min-w-0 sm:col-span-4">
            <Label htmlFor={editing ? 'country' : undefined}>{strings.contact.country}</Label>
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
                      {countries.map((entry) => (
                        <SelectItem key={entry.code} value={entry.code}>
                          {entry.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            ) : (
              <ReadValue>{contact && countryName(contact.country)}</ReadValue>
            )}
          </div>
        </Section>

        <Section
          titleWidth={200}
          title={strings.contact.sectionContact}
          hint={strings.contact.sectionContactHint}
        >
          <Field
            className="sm:col-span-4"
            id="email"
            editing={editing}
            readValue={contact?.email}
            type="email"
            label={strings.contact.email}
            error={errors.email && strings.validation.email}
            {...form.register('email')}
          />
          <Field
            className="sm:col-span-4"
            id="phoneMobile"
            editing={editing}
            readValue={contact?.phoneMobile}
            type="tel"
            label={strings.contact.phoneMobile}
            {...form.register('phoneMobile')}
          />
          <Field
            className="sm:col-span-4"
            id="phoneLandline"
            editing={editing}
            readValue={contact?.phoneLandline}
            type="tel"
            label={strings.contact.phoneLandline}
            {...form.register('phoneLandline')}
          />
        </Section>

        {/* Its own section, not folded into "Intern" — a health datum under
            Art. 9 GDPR should not be able to disappear between internal
            notes (CLAUDE.md rule 12). Left off `contacts/new`: writing a
            diagnosis before the contact exists is not what this field is
            for. */}
        {!creating && (
          <Section
            titleWidth={200}
            title={strings.contact.diagnosis}
            hint={strings.contact.diagnosisHint}
          >
            <div className="col-span-12">
              <Label htmlFor={editing ? 'diagnosis' : undefined}>{strings.contact.diagnosis}</Label>
              {editing ? (
                <Textarea
                  id="diagnosis"
                  rows={3}
                  className="mt-2"
                  {...form.register('diagnosis')}
                />
              ) : (
                /* `whitespace-pre-line`, because a diagnosis is typed with line
                   breaks and losing them would change what it says. */
                <ReadValue className="whitespace-pre-line">{contact?.diagnosis}</ReadValue>
              )}
            </div>
          </Section>
        )}

        <Section
          titleWidth={200}
          title={strings.contact.sectionInternal}
          hint={strings.contact.internalNoteHint}
        >
          <div className="col-span-12">
            <Label htmlFor={editing ? 'internalNote' : undefined}>
              {strings.contact.internalNote}
            </Label>
            {editing ? (
              <Textarea
                id="internalNote"
                rows={4}
                className="mt-2"
                {...form.register('internalNote')}
              />
            ) : (
              <ReadValue className="whitespace-pre-line">{contact?.internalNote}</ReadValue>
            )}
          </div>
        </Section>
      </div>

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
  editing: boolean
  readValue?: string | null | undefined
}

/**
 * In read mode the value stands as text under the label, not in a disabled
 * input (K2). `readValue` comes from the stored contact rather than from the
 * form: cancelling an edit does not reset this form, so reading the draft would
 * show changes that were abandoned — the screen has to say what is stored.
 */
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
