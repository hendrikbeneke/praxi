import { zodResolver } from '@hookform/resolvers/zod'
import {
  type Contact,
  type ContactKind,
  type ContactRoleInput,
  type ContactUpdate,
  contactKinds,
  countryName,
  formatBerlinDate,
} from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { DateField } from '@/components/date-field'
import { ReadValue } from '@/components/read-value'
import { Section, SectionField } from '@/components/section-grid'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { ValueSelect } from '@/components/value-select'
import { roleTypeListQueryOptions } from '@/lib/contact-types'
import { strings } from '@/lib/strings'
import {
  countryListQueryOptions,
  genderListQueryOptions,
  salutationListQueryOptions,
} from '@/lib/value-lists'

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
    // `''` is "none chosen", which is what NULL means in the column too. Held
    // as a string rather than as `uuid | null` because a Radix select cannot
    // carry an empty value; `toContactUpdate` folds it back.
    salutationId: z.union([z.literal(''), z.uuid()]),
    title: z.string().trim().max(40),
    firstName: z.string().trim().max(80),
    lastName: z.string().trim().max(80),
    dateOfBirth: z.union([z.literal(''), z.iso.date()]),
    birthPlace: z.string().trim().max(120),
    // `''` is "not recorded", which is what NULL means in the column too.
    genderId: z.union([z.literal(''), z.uuid()]),
    companyName: z.string().trim().max(120),
    contactPerson: z.string().trim().max(120),
    vatId: z.string().trim().max(40),
    street: z.string().trim().max(120),
    houseNumber: z.string().trim().max(20),
    postalCode: z.string().trim().max(16),
    city: z.string().trim().max(80),
    countryId: z.union([z.literal(''), z.uuid()]),
    email: z.union([z.literal(''), z.email().max(160)]),
    phoneMobile: z.string().trim().max(40),
    phoneLandline: z.string().trim().max(40),
    internalNote: z.string().trim().max(4000),
    diagnosis: z.string().trim().max(4000),
    /**
     * Part of the form on both screens since K6 — the design puts a "Rollen"
     * section in the master data, in read mode as badges and in edit mode as
     * checkboxes. They still travel to the API on their own route: see the
     * note on `contactUpdateSchema` for why they must not be part of the
     * update payload.
     */
    roles: z.array(z.object({ roleTypeId: z.uuid(), since: z.iso.date().nullable() })),
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
    houseNumber: emptyToNull(values.houseNumber),
    postalCode: emptyToNull(values.postalCode),
    city: emptyToNull(values.city),
    countryId: emptyToNull(values.countryId),
    // Shared, not person-only (D-R3): an organization is addressed as
    // "Firma Mustermann GmbH" too.
    salutationId: emptyToNull(values.salutationId),
    email: emptyToNull(values.email),
    phoneMobile: emptyToNull(values.phoneMobile),
    phoneLandline: emptyToNull(values.phoneLandline),
    internalNote: emptyToNull(values.internalNote),
    diagnosis: emptyToNull(values.diagnosis),
  }

  return values.kind === 'person'
    ? {
        kind: 'person',
        title: emptyToNull(values.title),
        firstName: emptyToNull(values.firstName),
        lastName: values.lastName,
        dateOfBirth: emptyToNull(values.dateOfBirth),
        birthPlace: emptyToNull(values.birthPlace),
        genderId: emptyToNull(values.genderId),
        ...shared,
      }
    : {
        kind: 'organization',
        companyName: values.companyName,
        contactPerson: emptyToNull(values.contactPerson),
        ...shared,
      }
}

/** Today in Europe/Berlin as `YYYY-MM-DD` — recorded when a role is ticked.
 *  `toISOString()` would be UTC and give yesterday's date late in the evening. */
function todayInBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

function toFormValues(contact: Contact | undefined): ContactFormValues {
  return {
    kind: contact?.kind ?? 'person',
    salutationId: contact?.salutationId ?? '',
    title: contact?.title ?? '',
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    dateOfBirth: contact?.dateOfBirth ?? '',
    birthPlace: contact?.birthPlace ?? '',
    genderId: contact?.genderId ?? '',
    companyName: contact?.companyName ?? '',
    contactPerson: contact?.contactPerson ?? '',
    vatId: contact?.vatId ?? '',
    street: contact?.street ?? '',
    houseNumber: contact?.houseNumber ?? '',
    postalCode: contact?.postalCode ?? '',
    city: contact?.city ?? '',
    countryId: contact?.countryId ?? '',
    email: contact?.email ?? '',
    phoneMobile: contact?.phoneMobile ?? '',
    phoneLandline: contact?.phoneLandline ?? '',
    internalNote: contact?.internalNote ?? '',
    diagnosis: contact?.diagnosis ?? '',
    roles:
      contact?.roles.map((entry) => ({ roleTypeId: entry.roleTypeId, since: entry.since })) ?? [],
  }
}

/**
 * The master data of a contact — one card of titled sections, as the design
 * lays it out on the record and on the create screen alike.
 *
 * Roles are part of it on both, in read mode as badges with a line naming the
 * ones this contact does *not* hold. Until K6 they lived in a pencil popover in
 * the page header, which was a second way to the same data and is gone.
 * Relations never belong here — they are on the overview.
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

  // The whole catalogue: since migration 0035 there is no inactive half to
  // filter out and no role a contact could hold but not see.
  const types = useQuery(roleTypeListQueryOptions)
  const roleTypes = types.data ?? []

  const salutations = useQuery(salutationListQueryOptions)
  const genders = useQuery(genderListQueryOptions)
  const countries = useQuery(countryListQueryOptions)
  /** The catalogue stores the code; the name comes from `countryName()`, the
   *  same function the invoice PDF uses. Sorted by the practitioner's order,
   *  which the query already returns. */
  const countryEntries = countries.data?.map((entry) => ({
    id: entry.id,
    label: countryName(entry.isoCode),
  }))

  const chosen = new Set(roles.map((entry) => entry.roleTypeId))
  const unassigned = roleTypes.filter((type) => !chosen.has(type.id))

  const toggleRole = (typeId: string, checked: boolean) => {
    // "seit" is recorded but not shown: on the day a role is ticked, today is
    // the only sensible answer, and a date field per role would turn the
    // section into a form of its own.
    form.setValue(
      'roles',
      checked
        ? [...roles, { roleTypeId: typeId, since: todayInBerlin() }]
        : roles.filter((entry) => entry.roleTypeId !== typeId),
      { shouldDirty: true },
    )
  }

  return (
    <form
      onSubmit={form.handleSubmit((values) => onSubmit(toContactUpdate(values), values.roles))}
      noValidate
    >
      <Card className="gap-0 rounded-[10px] px-6 shadow-none">
        <Section
          variant="record"
          title={strings.contact.sectionName}
          hint={strings.contact.sectionNameHint}
        >
          <SectionField span={3} className="sm:col-start-1">
            <Label htmlFor={editing ? 'kind' : undefined}>{strings.contact.kindLabel}</Label>
            {/* Structural and immutable once saved (CLAUDE.md rule 4) — which
                the section's own hint says, so the field needs no second line
                under it. */}
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
          </SectionField>

          {/* Outside the `kind === 'person'` branch on purpose (D-R3): an
              organization is addressed as "Firma Mustermann GmbH" too. */}
          <Controller
            control={form.control}
            name="salutationId"
            render={({ field }) => (
              <ValueSelect
                span={3}
                className="sm:col-start-1"
                id="salutation"
                editing={editing}
                label={strings.contact.salutation}
                noneLabel={strings.contact.salutationNone}
                emptyTitle={strings.contact.salutationsEmpty}
                emptyHint={strings.contact.salutationsEmptyHint}
                entries={salutations.data}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />

          {kind === 'person' ? (
            <>
              <Field
                span={3}
                id="title"
                editing={editing}
                readValue={contact?.title}
                label={strings.contact.academicTitle}
                {...form.register('title')}
              />
              <Field
                span={6}
                className="sm:col-start-1"
                id="firstName"
                editing={editing}
                readValue={contact?.firstName}
                label={strings.contact.firstName}
                {...form.register('firstName')}
              />
              <Field
                span={6}
                required
                id="lastName"
                editing={editing}
                readValue={contact?.lastName}
                label={strings.contact.lastName}
                error={errors.lastName && strings.validation.required}
                {...form.register('lastName')}
              />
            </>
          ) : (
            <>
              <Field
                span={6}
                required
                id="companyName"
                editing={editing}
                readValue={contact?.companyName}
                label={strings.contact.companyName}
                error={errors.companyName && strings.validation.required}
                {...form.register('companyName')}
              />
              <Field
                span={3}
                id="contactPerson"
                editing={editing}
                readValue={contact?.contactPerson}
                label={strings.contact.contactPerson}
                {...form.register('contactPerson')}
              />
            </>
          )}
        </Section>

        <Section
          variant="record"
          title={strings.contact.sectionRoles}
          hint={strings.contact.sectionRolesHint}
        >
          <SectionField>
            {!editing ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {roleTypes
                    .filter((type) => chosen.has(type.id))
                    .map((type) => (
                      <Badge key={type.id} variant="secondary">
                        {type.label}
                      </Badge>
                    ))}
                </div>
                {/* Which roles this contact does not hold is worth a line: it
                    is the difference between "not a patient" and "nobody has
                    got round to ticking it". */}
                <p className="mt-2 text-[13px] text-muted-foreground">
                  {chosen.size === 0
                    ? strings.contact.rolesNone
                    : unassigned.length > 0
                      ? strings.contact.rolesUnassigned(unassigned.map((type) => type.label))
                      : ''}
                </p>
              </>
            ) : (
              /* Three fixed columns, not `auto-fit`: the record prototype sets
                 them, and at this width `auto-fit` happens to give three too —
                 two spellings of one picture are one too many (K6). */
              <div className="grid grid-cols-[repeat(3,minmax(150px,220px))] gap-x-5 gap-y-3">
                {/* No role type at all is a legitimate state, not an error:
                    a contact needs none. What it needs is a sentence, or the
                    section is simply empty and reads as broken. */}
                {roleTypes.length === 0 && (
                  <p className="col-span-3 text-muted-foreground text-sm">
                    <span className="font-medium text-foreground">
                      {strings.contact.roleTypesEmpty}
                    </span>{' '}
                    {strings.contact.roleTypesEmptyHint}
                  </p>
                )}
                {roleTypes.map((type) => (
                  <label
                    key={type.id}
                    htmlFor={`role-${type.id}`}
                    className="flex cursor-pointer items-center gap-[9px] text-sm"
                  >
                    <Checkbox
                      id={`role-${type.id}`}
                      checked={chosen.has(type.id)}
                      onCheckedChange={(value) => toggleRole(type.id, value === true)}
                    />
                    {type.label}
                  </label>
                ))}
              </div>
            )}
          </SectionField>
        </Section>

        {kind === 'person' && (
          <Section
            variant="record"
            title={strings.contact.sectionPerson}
            hint={strings.contact.sectionPersonHint}
          >
            {/*
                The one field that asks for `past`, and the reason is a property
                of this field alone: it is the only one that reaches back far
                enough for "00–69 means the 2000s" to give a wrong answer
                instead of a harmless one. `12.3.46` typed for a patient born in
                1946 would otherwise become 2046, and their age would be wrong
                from that moment on. A payment, a session or an invoice never
                lies that far back, so they keep the ordinary rule — and nothing
                about this belongs anywhere else. A four-digit year is taken at
                its word here too.
              */}
            <SectionField span={4} className="sm:col-start-1">
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
            </SectionField>

            <Field
              span={4}
              id="birthPlace"
              editing={editing}
              readValue={contact?.birthPlace}
              label={strings.contact.birthPlace}
              {...form.register('birthPlace')}
            />

            <Controller
              control={form.control}
              name="genderId"
              render={({ field }) => (
                <ValueSelect
                  span={4}
                  id="gender"
                  editing={editing}
                  label={strings.contact.gender}
                  noneLabel={strings.contact.genderNone}
                  emptyTitle={strings.contact.gendersEmpty}
                  emptyHint={strings.contact.gendersEmptyHint}
                  entries={genders.data}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </Section>
        )}

        <Section
          variant="record"
          title={strings.contact.sectionAddress}
          hint={strings.contact.sectionAddressHint}
        >
          <Field
            span={9}
            className="sm:col-start-1"
            id="street"
            editing={editing}
            readValue={contact?.street}
            label={strings.contact.street}
            {...form.register('street')}
          />
          {/* Its own field. The two are put back together for display by
              `formatStreetLine`, on screen and on the invoice alike. */}
          <Field
            span={3}
            id="houseNumber"
            editing={editing}
            readValue={contact?.houseNumber}
            label={strings.contact.houseNumber}
            {...form.register('houseNumber')}
          />
          <Field
            span={3}
            className="sm:col-start-1"
            id="postalCode"
            editing={editing}
            readValue={contact?.postalCode}
            label={strings.contact.postalCode}
            {...form.register('postalCode')}
          />
          <Field
            span={9}
            id="city"
            editing={editing}
            readValue={contact?.city}
            label={strings.contact.city}
            {...form.register('city')}
          />
          {/* A country is stored as a code and never shown as one — see
              `packages/shared/src/country.ts`. Which codes are offered is the
              practice's choice since D-R3, the name still comes from there. */}
          <Controller
            control={form.control}
            name="countryId"
            render={({ field }) => (
              <ValueSelect
                span={4}
                className="sm:col-start-1"
                id="country"
                editing={editing}
                label={strings.contact.country}
                noneLabel={strings.contact.countryNone}
                emptyTitle={strings.contact.countriesEmpty}
                emptyHint={strings.contact.countriesEmptyHint}
                entries={countryEntries}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Section>

        <Section
          variant="record"
          title={strings.contact.sectionContact}
          hint={strings.contact.sectionContactHint}
        >
          <Field
            span={6}
            className="sm:col-start-1"
            id="email"
            editing={editing}
            readValue={contact?.email}
            type="email"
            label={strings.contact.email}
            error={errors.email && strings.validation.email}
            {...form.register('email')}
          />
          <Field
            span={3}
            id="phoneMobile"
            editing={editing}
            readValue={contact?.phoneMobile}
            type="tel"
            label={strings.contact.phoneMobile}
            {...form.register('phoneMobile')}
          />
          <Field
            span={3}
            id="phoneLandline"
            editing={editing}
            readValue={contact?.phoneLandline}
            type="tel"
            label={strings.contact.phoneLandline}
            {...form.register('phoneLandline')}
          />
        </Section>

        {/*
            Organizations only, as the design has it — and the schema
            deliberately says otherwise: a sole trader is a person and may hold
            a VAT id, the column allows it on both kinds and nothing here
            changes that. What is weighed here is which mistake is worse. The
            sole trader is the rare case; an empty tax field in every patient
            record is the daily one. Recorded in
            `docs/design-korrektur/abweichungen.md`, including how to show it
            again.
          */}
        {kind === 'organization' && (
          <Section
            variant="record"
            title={strings.contact.sectionTax}
            hint={strings.contact.sectionTaxHint}
          >
            <Field
              span={4}
              className="sm:col-start-1"
              id="vatId"
              editing={editing}
              readValue={contact?.vatId}
              label={strings.contact.vatId}
              {...form.register('vatId')}
            />
          </Section>
        )}

        {/* Its own section, not folded into "Intern" — a health datum under
            Art. 9 GDPR should not be able to disappear between internal
            notes (CLAUDE.md rule 12). Left off `contacts/new`: writing a
            diagnosis before the contact exists is not what this field is
            for. */}
        {!creating && (
          <Section
            variant="record"
            title={strings.contact.diagnosis}
            hint={strings.contact.diagnosisHint}
          >
            <SectionField>
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
            </SectionField>
          </Section>
        )}

        <Section
          variant="record"
          title={strings.contact.sectionInternal}
          hint={strings.contact.internalNoteHint}
        >
          <SectionField>
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
          </SectionField>
        </Section>
      </Card>

      {editing && (
        <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-4 rounded-[10px] border bg-card px-4 py-3 shadow-[0_-2px_12px_oklch(25%_0.012_62_/_0.05)]">
          {/* Only when there actually are unsaved changes. The design shows the
              sentence for as long as the form is open, but a form that claims a
              state it is not in is the mistake CLAUDE.md names — and it applies
              to changes as much as to values. */}
          <span className="text-[13px] text-muted-foreground">
            {form.formState.isDirty ? strings.contact.unsavedChanges : ''}
          </span>
          <span className="flex gap-2">
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                {strings.contact.cancel}
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              {pending
                ? strings.contact.saving
                : creating
                  ? strings.contact.createTitle
                  : strings.contact.save}
            </Button>
          </span>
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
  span?: 3 | 4 | 5 | 6 | 7 | 9 | 12
  className?: string
  /** Draws the asterisk the design puts on the two fields the check
   *  constraint insists on — never on anything else. */
  required?: boolean
}

/**
 * In read mode the value stands as text under the label, not in a disabled
 * input (K2). `readValue` comes from the stored contact rather than from the
 * form: cancelling an edit does not reset this form, so reading the draft would
 * show changes that were abandoned — the screen has to say what is stored.
 */
function Field({
  id,
  label,
  error,
  span,
  className,
  editing,
  readValue,
  required,
  ...input
}: FieldProps) {
  return (
    <SectionField span={span} className={className}>
      <Label htmlFor={editing ? id : undefined}>
        {label}
        {required && <span aria-hidden> *</span>}
      </Label>
      {editing ? (
        <>
          <Input id={id} className="mt-2" aria-invalid={error ? true : undefined} {...input} />
          {error && <p className="mt-1 text-destructive text-sm">{error}</p>}
        </>
      ) : (
        <ReadValue>{readValue}</ReadValue>
      )}
    </SectionField>
  )
}
