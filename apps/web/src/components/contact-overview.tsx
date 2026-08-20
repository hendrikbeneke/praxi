import {
  type Activity,
  activityLabel,
  activityTypeLabel,
  ageInYears,
  type Contact,
  countryName,
  formatBerlinDate,
  formatBerlinDateTime,
  formatBerlinDayTime,
  formatEuro,
  formatRelativeDayBerlin,
  formatStreetLine,
  GUARDIAN_RELATION_CODE,
  invoicePaymentState,
  toBerlinDate,
} from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FileText, TriangleAlert } from 'lucide-react'
import { ContactRelations } from '@/components/contact-relations'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { activityListQueryOptions } from '@/lib/activities'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { relationListQueryOptions } from '@/lib/contact-types'
import { billableQueryOptions, invoiceListQueryOptions } from '@/lib/invoices'
import { noteListQueryOptions } from '@/lib/notes'
import { strings } from '@/lib/strings'
import { countryListQueryOptions } from '@/lib/value-lists'

/**
 * What the record is opened for: the contact's details, where they stand, and
 * what is waiting to be done.
 *
 * Every block asks for itself and shows a placeholder until its own answer is
 * there. This is the screen that gets opened all day; five queries landing one
 * after another and re-laying out the page each time is worse than five boxes
 * that fill in place.
 */
const RECENT_ACTIVITIES = 5

export function ContactOverview({
  contact,
  onDocument,
}: {
  contact: Contact
  onDocument: (activity: Activity) => void
}) {
  /* Three rows, as the design lays them out: the three summaries side by side,
     then the contact's details beside the recent activities — which get the
     wider column because they carry a date, a name and a badge — then the
     relations across the whole width. Until K7 this was two equal columns in a
     different order; the cards are the same six. */
  return (
    <div className="flex flex-col gap-[18px]">
      <GuardianHint contact={contact} />

      <div className="grid gap-[18px] lg:grid-cols-3">
        <ActivitySummary contactId={contact.id} onDocument={onDocument} />
        <BillableSummary contactId={contact.id} />
        <InvoiceSummary contactId={contact.id} />
      </div>

      <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <ContactDetails contact={contact} />
        <RecentActivities contactId={contact.id} />
      </div>

      <ContactRelations contactId={contact.id} />
    </div>
  )
}

/** A block that is still loading keeps its box, so the page does not jump. */
function Pending() {
  return <p className="text-muted-foreground text-sm">{strings.status.loading}</p>
}

/**
 * A minor with nobody entered as their guardian. Not an error — the record may
 * simply be new, and the software refuses nothing over it. It looks for the
 * system code, not for a label that happens to read "Sorgeberechtigt".
 */
function GuardianHint({ contact }: { contact: Contact }) {
  const relations = useQuery(relationListQueryOptions(contact.id))

  if (contact.kind !== 'person' || !contact.dateOfBirth) return null
  if (ageInYears(contact.dateOfBirth, new Date()) >= 18) return null
  if (!relations.data) return null

  const hasGuardian = relations.data.some(
    (relation) =>
      relation.relationCode === GUARDIAN_RELATION_CODE && relation.direction === 'forward',
  )
  if (hasGuardian) return null

  return (
    <div className="flex items-start gap-3 rounded-md border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <span>{strings.contact.guardianMissing}</span>
    </div>
  )
}

function ContactDetails({ contact }: { contact: Contact }) {
  const countries = useQuery(countryListQueryOptions)
  const countryCode =
    countries.data?.find((entry) => entry.id === contact.countryId)?.isoCode ?? null

  const streetLine = formatStreetLine(contact)
  const hasAddress = streetLine !== null || contact.postalCode || contact.city
  const hasPhone = contact.phoneMobile !== null || contact.phoneLandline !== null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.contact.sectionContact}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* A label column and a value column, as the design sets it — labelled
            because which of the two numbers it is decides whether one calls or
            writes, and aligned because four labels down the left read as a
            list rather than as four sentences. */}
        <div className="grid grid-cols-[88px_minmax(0,1fr)] items-baseline gap-x-3.5 gap-y-[11px] text-sm">
          {contact.phoneMobile && (
            <>
              <span className="text-[13px] text-muted-foreground">
                {strings.contact.phoneMobile}
              </span>
              <a className="tabular-nums hover:underline" href={`tel:${contact.phoneMobile}`}>
                {contact.phoneMobile}
              </a>
            </>
          )}
          {contact.phoneLandline && (
            <>
              <span className="text-[13px] text-muted-foreground">
                {strings.contact.phoneLandline}
              </span>
              <a className="tabular-nums hover:underline" href={`tel:${contact.phoneLandline}`}>
                {contact.phoneLandline}
              </a>
            </>
          )}
          {contact.email && (
            <>
              <span className="text-[13px] text-muted-foreground">{strings.contact.email}</span>
              <a className="break-words hover:underline" href={`mailto:${contact.email}`}>
                {contact.email}
              </a>
            </>
          )}
          {hasAddress && (
            <>
              <span className="text-[13px] text-muted-foreground">
                {strings.contact.sectionAddress}
              </span>
              <address className="not-italic">
                {streetLine && <div>{streetLine}</div>}
                <div>
                  {[contact.postalCode, contact.city].filter(Boolean).join(' ')}
                  {/* Named, not coded — and nothing at all for Germany, the
                      same rule the invoice's address block follows. */}
                  {countryCode !== null && countryCode !== 'DE' && ` · ${countryName(countryCode)}`}
                </div>
              </address>
            </>
          )}
        </div>
        {!hasPhone && !contact.email && !hasAddress && (
          <p className="text-muted-foreground text-sm">{strings.contact.noContactData}</p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * What an activity is called: its title, or the label of its type — the same
 * fallback every other screen uses (`activityLabel` in `packages/shared`).
 * This file used to add a third step, the item descriptions joined together,
 * which slice 7.5 dropped: with the type label there is always a name, and
 * "Folgesitzung, Folgesitzung" said less than "Folgesitzung".
 */
function useActivityLabel(): (activity: Activity) => string {
  const types = useQuery(activityTypeListQueryOptions(true))
  return (activity) => activityLabel(activity, activityTypeLabel(types.data, activity.type))
}

/**
 * The next appointment and the last activity, the two ends of the thread. The
 * button next to the last one opens the note dialog with that activity already
 * filled in — documenting is what this record is usually opened for.
 */
function ActivitySummary({
  contactId,
  onDocument,
}: {
  contactId: string
  onDocument: (activity: Activity) => void
}) {
  const activities = useQuery(activityListQueryOptions({ contactId }))
  const activityLabelOf = useActivityLabel()
  const now = new Date()

  const rows = activities.data ?? []
  const upcoming = rows
    .filter((activity) => activity.appointment && activity.appointment.startsAt > now.toISOString())
    .sort((a, b) => (a.appointment?.startsAt ?? '').localeCompare(b.appointment?.startsAt ?? ''))
  const past = rows
    .filter((activity) => activity.occurredAt <= now.toISOString())
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))

  const next = upcoming[0]
  const last = past[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.contact.overviewThread}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {activities.isPending ? (
          <Pending />
        ) : (
          <>
            <div>
              <p className="text-[13px] text-muted-foreground">{strings.contact.nextAppointment}</p>
              {next?.appointment ? (
                <>
                  {/* The one number this card is opened for, so the design sets
                      it large. The day carries no year and does not need one:
                      the relative line beside it says which week is meant. */}
                  <p className="mt-1 font-semibold text-[19px] tracking-[-0.015em] tabular-nums">
                    {formatBerlinDayTime(next.appointment.startsAt)}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {formatRelativeDayBerlin(next.appointment.startsAt, now)} ·{' '}
                    {activityLabelOf(next)}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-muted-foreground">{strings.contact.noNextAppointment}</p>
              )}
            </div>

            <div className="border-t pt-3">
              <p className="text-[13px] text-muted-foreground">{strings.contact.lastActivity}</p>
              {last ? (
                <>
                  <p className="mt-[3px] tabular-nums">{formatBerlinDateTime(last.occurredAt)}</p>
                  <p className="mb-3 text-[13px] text-muted-foreground">{activityLabelOf(last)}</p>
                  <Button className="w-full" onClick={() => onDocument(last)}>
                    <FileText className="size-4" aria-hidden />
                    {strings.contact.document}
                  </Button>
                </>
              ) : (
                <p className="mt-1 text-muted-foreground">{strings.activity.empty}</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The last few activities with whether anything was written about them. An
 * undocumented session is the thing this practice most needs to see, so it is
 * marked and not merely left blank.
 */
function RecentActivities({ contactId }: { contactId: string }) {
  const activities = useQuery(activityListQueryOptions({ contactId }))
  const notes = useQuery(noteListQueryOptions({ contactId }))
  const activityLabelOf = useActivityLabel()

  const documented = new Set(
    (notes.data ?? [])
      .map((note) => note.activityId)
      .filter((activityId): activityId is string => activityId !== null),
  )

  const rows = [...(activities.data ?? [])]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, RECENT_ACTIVITIES)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.contact.recentActivities}</CardTitle>
      </CardHeader>
      <CardContent>
        {activities.isPending || notes.isPending ? (
          <Pending />
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{strings.activity.empty}</p>
        ) : (
          <ul className="-mx-2">
            {rows.map((activity) => (
              <li
                key={activity.id}
                className="flex flex-wrap items-center gap-x-4 border-t px-1 py-2.5 text-sm first:border-t-0"
              >
                <span className="w-[104px] shrink-0 text-muted-foreground tabular-nums">
                  {formatBerlinDate(activity.occurredAt)}
                </span>
                <span className="flex-1">{activityLabelOf(activity)}</span>
                {documented.has(activity.id) ? (
                  <Badge variant="secondary">{strings.contact.documented}</Badge>
                ) : (
                  <Badge variant="destructive">{strings.contact.notDocumented}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * What could go on an invoice today, and where it would go. An open draft is
 * linked directly; with none, the way there is the Rechnungen tab, which is
 * where a draft is started.
 */
function BillableSummary({ contactId }: { contactId: string }) {
  const billable = useQuery(billableQueryOptions(contactId))
  // Same query key as the invoice card, so this costs no second request.
  const invoices = useQuery(invoiceListQueryOptions({ contactId }))

  const items = billable.data ?? []
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
  const draft = (invoices.data ?? []).find((invoice) => invoice.status === 'draft')

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.contact.billable}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {billable.isPending ? (
          <Pending />
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">{strings.contact.noBillable}</p>
        ) : (
          <>
            {/* The amount is the statement, so it is set large and the count
                explains it underneath — the other way round on the card the
                design draws. */}
            <p className="font-semibold text-[28px] tracking-[-0.02em] tabular-nums">
              {formatEuro(total)}
            </p>
            <p className="mt-1 mb-3.5 text-muted-foreground">
              {strings.contact.billableCount(items.length)}
            </p>
            {draft && (
              <Link
                className="text-primary hover:underline"
                to="/invoices/$invoiceId"
                params={{ invoiceId: draft.id }}
              >
                {strings.contact.openDraft}
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Invoices, and what is still owed on them.
 *
 * Every number is derived: `invoicePaymentState()` from the invoice and the
 * sum of its payments, the same function the invoice screen and the
 * receivables view go through. Cancelled invoices and cancellation documents
 * answer with their own state and never count as open.
 */
function InvoiceSummary({ contactId }: { contactId: string }) {
  const invoices = useQuery(invoiceListQueryOptions({ contactId }))

  const today = toBerlinDate(new Date().toISOString())
  const rows = invoices.data ?? []
  const finalized = rows.filter((invoice) => invoice.status === 'finalized')

  const states = finalized.map((invoice) => ({
    invoice,
    state: invoicePaymentState(invoice, invoice.paidCents, today),
  }))
  const open = states.filter((entry) => entry.state.openCents > 0)
  const overdue = open.filter((entry) => entry.state.daysOverdue !== null)
  const openCents = open.reduce((total, entry) => total + entry.state.openCents, 0)
  const overdueCents = overdue.reduce((total, entry) => total + entry.state.openCents, 0)

  /* What was actually billed this year: live claims only. A cancelled invoice
     drops out by its status, and the cancellation document by its type — the
     pair would otherwise net to something that was never demanded. */
  const year = Number(today.slice(0, 4))
  const billedThisYear = finalized
    .filter((invoice) => invoice.type === 'invoice' && invoice.invoiceDate.startsWith(String(year)))
    .reduce((total, invoice) => total + invoice.totalCents, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.invoice.title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {invoices.isPending ? (
          <Pending />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-muted-foreground">
                {strings.contact.invoicesFinalized(finalized.length)}
              </span>
              {overdue.length > 0 && (
                <Badge variant="destructive">
                  {strings.contact.invoicesOverdue(overdue.length)}
                </Badge>
              )}
            </div>

            <p className="mt-2.5 font-semibold text-[28px] tracking-[-0.02em] tabular-nums">
              {formatEuro(openCents)}
            </p>
            <p className="mb-3 text-[13px] text-muted-foreground">
              {strings.contact.invoicesOpenAmount}
            </p>

            <div className="flex flex-col gap-[7px] border-t pt-3">
              {overdueCents > 0 && (
                <p className="flex items-baseline justify-between gap-2.5">
                  <span className="text-[13px] text-muted-foreground">
                    {strings.contact.invoicesOverdueAmount}
                  </span>
                  <span className="font-semibold text-destructive tabular-nums">
                    {formatEuro(overdueCents)}
                  </span>
                </p>
              )}
              <p className="flex items-baseline justify-between gap-2.5">
                <span className="text-[13px] text-muted-foreground">
                  {strings.contact.invoicesBilledInYear(year)}
                </span>
                <span className="tabular-nums">{formatEuro(billedThisYear)}</span>
              </p>
            </div>

            <p className="mt-3">
              <Link
                className="text-primary hover:underline"
                to="/contacts/$contactId"
                params={{ contactId }}
                search={{ tab: 'invoices' }}
              >
                {strings.contact.toInvoices}
              </Link>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
