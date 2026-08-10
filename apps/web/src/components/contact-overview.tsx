import {
  type Activity,
  ageInYears,
  type Contact,
  dueDate,
  formatBerlinDate,
  formatBerlinDateTime,
  formatEuro,
  formatRelativeBerlin,
  GUARDIAN_RELATION_CODE,
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
import { relationListQueryOptions } from '@/lib/contact-types'
import { billableQueryOptions, invoiceListQueryOptions } from '@/lib/invoices'
import { noteListQueryOptions } from '@/lib/notes'
import { strings } from '@/lib/strings'

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
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <GuardianHint contact={contact} />
      <ContactDetails contact={contact} />
      <ActivitySummary contactId={contact.id} onDocument={onDocument} />
      <RecentActivities contactId={contact.id} />
      <BillableSummary contactId={contact.id} />
      <InvoiceSummary contactId={contact.id} />
      <div className="lg:col-span-2">
        <ContactRelations contactId={contact.id} />
      </div>
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
    <div className="flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm lg:col-span-2">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      <span>{strings.contact.guardianMissing}</span>
    </div>
  )
}

function ContactDetails({ contact }: { contact: Contact }) {
  const hasAddress = contact.street || contact.postalCode || contact.city

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.contact.sectionContact}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {contact.phone && (
          <p>
            <a className="underline underline-offset-2" href={`tel:${contact.phone}`}>
              {contact.phone}
            </a>
          </p>
        )}
        {contact.email && (
          <p>
            <a className="underline underline-offset-2" href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
          </p>
        )}
        {hasAddress && (
          <address className="not-italic text-muted-foreground">
            {contact.street && <div>{contact.street}</div>}
            <div>
              {[contact.postalCode, contact.city].filter(Boolean).join(' ')}
              {contact.country !== 'DE' && ` · ${contact.country}`}
            </div>
          </address>
        )}
        {!contact.phone && !contact.email && !hasAddress && (
          <p className="text-muted-foreground">{strings.contact.noContactData}</p>
        )}
      </CardContent>
    </Card>
  )
}

/** What an activity was about, in one line: its title, or the services on it. */
function activityLabel(activity: Activity): string {
  if (activity.title) return activity.title
  if (activity.items.length === 0) return strings.activity.noItems
  return activity.items.map((item) => item.description).join(', ')
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
      <CardContent className="space-y-4 text-sm">
        {activities.isPending ? (
          <Pending />
        ) : (
          <>
            <div>
              <p className="text-muted-foreground text-xs">{strings.contact.nextAppointment}</p>
              {next?.appointment ? (
                <p className="mt-1">
                  <span className="tabular-nums">
                    {formatBerlinDateTime(next.appointment.startsAt)}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {formatRelativeBerlin(next.appointment.startsAt, now)}
                  </span>
                  <span className="block text-muted-foreground">{activityLabel(next)}</span>
                </p>
              ) : (
                <p className="mt-1 text-muted-foreground">{strings.contact.noNextAppointment}</p>
              )}
            </div>

            <div>
              <p className="text-muted-foreground text-xs">{strings.contact.lastActivity}</p>
              {last ? (
                <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
                  <p>
                    <span className="tabular-nums">{formatBerlinDateTime(last.occurredAt)}</span>
                    <span className="block text-muted-foreground">{activityLabel(last)}</span>
                  </p>
                  <Button size="sm" variant="outline" onClick={() => onDocument(last)}>
                    <FileText className="size-4" aria-hidden />
                    {strings.contact.document}
                  </Button>
                </div>
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

  const documented = new Set(
    (notes.data ?? [])
      .map((note) => note.activityId)
      .filter((activityId): activityId is string => activityId !== null),
  )

  const rows = [...(activities.data ?? [])]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, RECENT_ACTIVITIES)

  return (
    <Card className="lg:col-span-2">
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
                className="flex flex-wrap items-baseline gap-x-3 rounded-md px-2 py-1.5 text-sm"
              >
                <span className="w-32 shrink-0 tabular-nums">
                  {formatBerlinDate(activity.occurredAt)}
                </span>
                <span className="flex-1">{activityLabel(activity)}</span>
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
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <span>{strings.contact.billableCount(items.length)}</span>
              <span className="font-medium tabular-nums">{formatEuro(total)}</span>
            </p>
            {draft && (
              <p className="mt-2">
                <Link
                  className="underline underline-offset-2"
                  to="/invoices/$invoiceId"
                  params={{ invoiceId: draft.id }}
                >
                  {strings.contact.openDraft}
                </Link>
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Invoices, counted.
 *
 * "Fällig seit" is the honest word until slice 8: nothing here knows about
 * payments yet, so an invoice that was settled in cash the same day still
 * counts as due. When the `payment` table arrives this block gets the real
 * status — open, partly paid, paid, overdue — and the caveat below goes.
 */
function InvoiceSummary({ contactId }: { contactId: string }) {
  const invoices = useQuery(invoiceListQueryOptions({ contactId }))

  const rows = invoices.data ?? []
  const finalized = rows.filter((invoice) => invoice.status === 'finalized')
  const today = toBerlinDate(new Date().toISOString())
  const due = finalized.filter(
    (invoice) => dueDate(invoice.invoiceDate, invoice.paymentTermDays) < today,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.invoice.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {invoices.isPending ? (
          <Pending />
        ) : (
          <>
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <span>{strings.contact.invoicesFinalized(finalized.length)}</span>
              {due.length > 0 && (
                <Badge variant="outline">{strings.contact.invoicesDue(due.length)}</Badge>
              )}
            </p>
            <p className="text-muted-foreground text-xs">{strings.contact.paymentsNotTracked}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
