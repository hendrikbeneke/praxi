import {
  type Activity,
  activityLabel,
  activityStatuses,
  activityTypeLabel,
  type ContactRoleInput,
  type ContactUpdate,
  dueDate,
  formatBerlinDate,
  formatBerlinMonth,
  formatBerlinTime,
  formatEuro,
  type Invoice,
  invoicePaymentState,
  type Note,
  occupiesSlot,
  type PaymentState,
  toBerlinDate,
} from '@praxi/shared'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Pencil, Plus, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { ActivityList } from '@/components/activity-list'
import { filterChipClass } from '@/components/chip'
import { ContactForm } from '@/components/contact-form'
import { ContactHeader } from '@/components/contact-header'
import { ContactOverview } from '@/components/contact-overview'
import { ContentWidth } from '@/components/content-width'
import { NoteChainDialog } from '@/components/note-chain-dialog'
import { NoteForm, type NoteFormTarget } from '@/components/note-form'
import { NotePanel, NoteReader, orderNotes } from '@/components/note-panel'
import { PaymentStatusBadge } from '@/components/payment-status'
import { RecordTab, RecordTabsList } from '@/components/record-tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { pastActivitiesQueryOptions, upcomingActivitiesQueryOptions } from '@/lib/activities'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { ApiError } from '@/lib/api'
import {
  contactAppointmentsQueryOptions,
  contactQueryOptions,
  setContactArchived,
  setContactRoles,
  updateContact,
} from '@/lib/contacts'
import { billableQueryOptions, createInvoice, invoiceListQueryOptions } from '@/lib/invoices'
import { noteTypeListQueryOptions } from '@/lib/note-types'
import { noteListQueryOptions } from '@/lib/notes'
import { strings } from '@/lib/strings'

/**
 * The tab lives in the URL so a record can be linked to on the tab that
 * matters — a note to self, or a jump from the invoice list straight into the
 * documentation — and so the back button returns to where one was.
 */
const tabs = ['overview', 'master', 'notes', 'activities', 'appointments', 'invoices'] as const

const searchSchema = z.object({
  tab: z.enum(tabs).default('overview'),
  /**
   * The Vorgang this page was opened for, and what that means is the tab's
   * business: the Vorgänge tab opens it in read mode ("Letzte Vorgänge" on
   * the overview, L5), the Notizen tab starts a note about it
   * ("Dokumentieren", L6b). One parameter, because it is one fact — which
   * Vorgang is in question — and it is in the URL for the same reason `tab`
   * is: a link has to survive the back button.
   */
  activityId: z.uuid().optional(),
})

export const Route = createFileRoute('/_app/contacts/$contactId')({
  validateSearch: searchSchema,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(contactQueryOptions(params.contactId)),
  component: ContactDetailPage,
})

function ContactDetailPage() {
  const { contactId } = Route.useParams()
  const { tab, activityId } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const { data: contact } = useQuery(contactQueryOptions(contactId))

  /** Master data is read far more often than it is changed, so the page starts
   *  read-only and a stray keystroke cannot land in a field nobody opened. */
  const [editing, setEditing] = useState(false)
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['contacts'] })

  /**
   * Two requests, in this order and never the other way round: the roles are
   * their own resource and deliberately cannot travel in the update payload
   * (see `contactUpdateSchema`).
   *
   * If the second one fails the first has already been written, and the screen
   * says exactly that — the master data is saved, the roles are not — and
   * **stays in edit mode** with the ticks as they were typed, so trying again
   * is pressing "Speichern" again. Silently reporting success would leave the
   * record disagreeing with the screen; dropping back to read mode would throw
   * away the only copy of what was meant.
   */
  const save = useMutation({
    mutationFn: async ({ input, roles }: { input: ContactUpdate; roles: ContactRoleInput[] }) => {
      const saved = await updateContact(contactId, input)
      return await setContactRoles(contactId, roles)
        .then((withRoles) => ({ contact: withRoles, rolesFailed: false }))
        .catch(() => ({ contact: saved, rolesFailed: true }))
    },
    onSuccess: async ({ contact: saved, rolesFailed }) => {
      queryClient.setQueryData(contactQueryOptions(contactId).queryKey, saved)
      await invalidate()
      if (rolesFailed) {
        toast.error(strings.contact.rolesSaveFailed)
        return
      }
      setEditing(false)
      toast.success(strings.contact.saved)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.contact.saveFailed)
    },
  })

  const archive = useMutation({
    mutationFn: (archived: boolean) => setContactArchived(contactId, archived),
    onSuccess: async (saved) => {
      queryClient.setQueryData(contactQueryOptions(contactId).queryKey, saved)
      await invalidate()
      toast.success(saved.archivedAt ? strings.contact.archived : strings.contact.unarchived)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.error.generic)
    },
  })

  if (!contact) return <p className="text-muted-foreground text-sm">{strings.status.loading}</p>

  const isArchived = Boolean(contact.archivedAt)

  return (
    <Tabs
      value={tab}
      /* The deep-linked Vorgang goes with the tab it belongs to: leaving and
         coming back would otherwise re-open a row nobody clicked. */
      onValueChange={(next) => void navigate({ search: { tab: next as (typeof tabs)[number] } })}
    >
      {/* The header strip runs the full width and carries the tab row, so the
          rule under the tabs spans the whole field. The page itself therefore
          gets no padding from the shell — see `lib/page-chrome.ts`. */}
      <ContactHeader
        contact={contact}
        actions={
          isArchived ? (
            <Button
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => archive.mutate(false)}
              disabled={archive.isPending}
            >
              {strings.contact.unarchive}
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="text-muted-foreground"
                  disabled={archive.isPending}
                >
                  {strings.contact.archive}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{strings.contact.archiveTitle}</AlertDialogTitle>
                  <AlertDialogDescription>{strings.contact.archiveBody}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{strings.contact.cancel}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => archive.mutate(true)}>
                    {strings.contact.archive}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        }
      >
        <RecordTabsList>
          <RecordTab value="overview">{strings.contact.tabs.overview}</RecordTab>
          <RecordTab value="master">{strings.contact.tabs.master}</RecordTab>
          <RecordTab value="notes">{strings.contact.tabs.notes}</RecordTab>
          <RecordTab value="activities">{strings.contact.tabs.activities}</RecordTab>
          <RecordTab value="appointments">{strings.contact.tabs.appointments}</RecordTab>
          <RecordTab value="invoices">{strings.contact.tabs.invoices}</RecordTab>
        </RecordTabsList>
      </ContactHeader>

      {/* The strip above runs to the edge; below it the cap is per tab, because
          the design does not treat them alike (L5). The Übersicht spreads its
          six cards over the whole field — measured at 268..1696 in a 1728 px
          window, which is the page inset on both sides and nothing else —
          while every other tab is a column of text and stops at 1180. */}
      <div className="px-8 pt-6 pb-11">
        <TabsContent value="overview">
          <ContactOverview
            contact={contact}
            onDocument={(activity) =>
              void navigate({ search: { tab: 'notes', activityId: activity.id } })
            }
            onOpenActivity={(activityId) =>
              void navigate({ search: { tab: 'activities', activityId } })
            }
          />
        </TabsContent>

        <TabsContent value="master">
          <ContentWidth>
            {!editing && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
                <p className="text-[13.5px] text-muted-foreground">
                  {strings.contact.masterReadHint}
                </p>
                <Button size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="size-3.5" aria-hidden />
                  {strings.actions.edit}
                </Button>
              </div>
            )}

            {/* `key` remounts the form when the stored version changes or when
                editing is left, so the fields show what was actually stored —
                that is also what "Abbrechen" relies on. */}
            <ContactForm
              key={`${contact.id}${contact.archivedAt ?? ''}${editing}`}
              contact={contact}
              editing={editing}
              onSubmit={(input, roles) => save.mutate({ input, roles })}
              onCancel={() => setEditing(false)}
              pending={save.isPending}
            />
          </ContentWidth>
        </TabsContent>

        <TabsContent value="activities">
          <ContentWidth>
            <ContactActivities contactId={contactId} openActivityId={activityId} />
          </ContentWidth>
        </TabsContent>

        <TabsContent value="appointments">
          <ContentWidth>
            <ContactAppointments contactId={contactId} />
          </ContentWidth>
        </TabsContent>

        <TabsContent value="notes">
          <ContentWidth>
            <ContactNotes
              contactId={contactId}
              documentActivityId={tab === 'notes' ? activityId : undefined}
              onFormOpened={() => void navigate({ search: { tab: 'notes' }, replace: true })}
            />
          </ContentWidth>
        </TabsContent>

        <TabsContent value="invoices">
          <ContentWidth>
            <ContactInvoices contactId={contactId} />
          </ContentWidth>
        </TabsContent>
      </div>
    </Tabs>
  )
}

/**
 * The contact's activities — the same list and the same inline detail as the
 * Vorgänge page (D8), with the contact left out of every row and out of the
 * detail's rail: it would repeat on each row and its link would lead back to
 * this page.
 */
function ContactActivities({
  contactId,
  openActivityId,
}: {
  contactId: string
  /** Arrived here from "Letzte Vorgänge" on the overview (L5) — that Vorgang
   *  opens in read mode. */
  openActivityId: string | undefined
}) {
  /* Two queries, two rules (L3) — see `activityListPartSchema`. The chips
     below still count and filter what has been loaded, which is what they did
     before; L7 decides whether they move to the server with the rest. */
  const upcoming = useQuery(upcomingActivitiesQueryOptions({ contactId }))
  const past = useInfiniteQuery(pastActivitiesQueryOptions({ contactId }))
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<string | undefined>()

  const upcomingRows = upcoming.data ?? []
  const pastRows = past.data?.pages.flatMap((page) => page.items) ?? []
  const rows = [...upcomingRows, ...pastRows]
  const now = new Date().toISOString()

  /** Each chip carries the test it filters by, so the count and the narrowing
   *  cannot say different things. */
  const activityChips = [
    ...activityStatuses.map((status) => ({
      id: `status:${status}`,
      label: strings.activity.statuses[status],
      matches: (entry: Activity) => entry.status === status,
    })),
    {
      id: 'billed',
      label: strings.counts.activitiesBilled,
      matches: (entry: Activity) => entry.billingState === 'billed',
    },
    {
      id: 'unbilled',
      label: strings.counts.activitiesUnbilled,
      matches: (entry: Activity) => entry.billingState === 'open',
    },
    {
      id: 'no-appointment',
      label: strings.counts.activitiesNoAppointment,
      matches: (entry: Activity) => entry.appointment === null,
    },
  ]

  const active = activityChips.find((chip) => chip.id === filter)
  const shownUpcoming = active ? upcomingRows.filter(active.matches) : upcomingRows
  const shownPast = active ? pastRows.filter(active.matches) : pastRows

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterRow
          summary={strings.counts.activities(
            rows.length,
            rows.filter((entry) => entry.occurredAt > now).length,
          )}
          chips={activityChips.map((chip) => ({
            id: chip.id,
            label: chip.label,
            count: rows.filter(chip.matches).length,
          }))}
          active={filter}
          onChange={setFilter}
        />
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          {strings.activity.create}
        </Button>
      </div>

      <ActivityList
        openActivityId={openActivityId}
        upcoming={shownUpcoming}
        past={shownPast}
        emptyText={
          upcoming.isPending || past.isPending ? strings.status.loading : strings.activity.empty
        }
        showContact={false}
        contactId={contactId}
        creating={creating}
        onCreated={() => setCreating(false)}
        onCancelCreate={() => setCreating(false)}
        hasMorePast={past.hasNextPage}
        loadingMorePast={past.isFetchingNextPage}
        onLoadMorePast={() => void past.fetchNextPage()}
      />
    </>
  )
}

/**
 * The contact's invoices, plus the shortcut that starts a draft from whatever
 * is still open for them. The draft is created empty and filled on its own
 * page — the billable picker lives there, where the lines are edited.
 */
function ContactInvoices({ contactId }: { contactId: string }) {
  const navigate = useNavigate()
  const invoices = useQuery(invoiceListQueryOptions({ contactId }))
  const [filter, setFilter] = useState<string | undefined>()

  const create = useMutation({
    mutationFn: () =>
      createInvoice({
        contactId,
        invoiceDate: toBerlinDate(new Date().toISOString()),
        activityItemIds: [],
      }),
    onSuccess: (draft) => {
      toast.success(strings.invoice.created)
      void navigate({ to: '/invoices/$invoiceId', params: { invoiceId: draft.id } })
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.invoice.saveFailed)
    },
  })

  const rows = invoices.data ?? []
  const today = toBerlinDate(new Date().toISOString())
  const withState = rows.map((invoice) => ({
    invoice,
    state: invoicePaymentState(invoice, invoice.paidCents, today),
  }))

  type Row = (typeof withState)[number]
  const invoiceChips = [
    { id: 'open', label: strings.counts.invoicesOpen, matches: (r: Row) => r.state.openCents > 0 },
    {
      id: 'paid',
      label: strings.counts.invoicesPaid,
      matches: (r: Row) => r.state.status === 'paid',
    },
    {
      /* Overdue is a second axis, not a status (CLAUDE.md rule 9) — an invoice
         can be partly paid and overdue at once, so this filters the axis. */
      id: 'overdue',
      label: strings.counts.invoicesOverdue,
      matches: (r: Row) => r.state.daysOverdue !== null,
    },
  ]

  const active = invoiceChips.find((chip) => chip.id === filter)
  const shown = active ? withState.filter(active.matches) : withState

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterRow
          summary={strings.counts.invoices(rows.length)}
          chips={invoiceChips.map((chip) => ({
            id: chip.id,
            label: chip.label,
            count: withState.filter(chip.matches).length,
          }))}
          active={filter}
          onChange={setFilter}
        />
        <Button className="ml-auto" onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="size-4" aria-hidden />
          {strings.invoice.createAction}
        </Button>
      </div>

      <BillableCard contactId={contactId} onCreate={() => create.mutate()} />

      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {invoices.isPending
            ? strings.status.loading
            : rows.length === 0
              ? strings.invoice.empty
              : strings.invoice.emptyFiltered}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-[10px] border bg-card">
          {shown.map(({ invoice: entry, state }) => (
            <li key={entry.id} className="border-t first:border-t-0">
              <Link
                to="/invoices/$invoiceId"
                params={{ invoiceId: entry.id }}
                className="flex items-center gap-3.5 px-4 py-3 hover:bg-accent"
              >
                <span className="w-[84px] shrink-0 font-semibold tabular-nums">
                  {entry.number ?? strings.invoice.statuses.draft}
                </span>
                <span className="w-[84px] shrink-0 text-[13.5px] text-muted-foreground tabular-nums">
                  {formatBerlinDate(`${entry.invoiceDate}T12:00:00Z`)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-muted-foreground">
                  {invoiceScope(entry)}
                </span>
                <span className="w-[84px] shrink-0 text-right tabular-nums">
                  {formatEuro(entry.totalCents)}
                </span>
                {entry.status === 'draft' ? (
                  <Badge variant="outline">{strings.invoice.statuses.draft}</Badge>
                ) : (
                  <PaymentStatusBadge state={state} withDays={false} />
                )}
                <span className="shrink-0 whitespace-nowrap text-right text-[12.5px] text-muted-foreground tabular-nums">
                  {invoiceHint(entry, state)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * What an invoice covers — "2 Vorgänge · Juli" — for the middle of a row.
 *
 * Activities, not lines: several lines routinely come out of one session, so
 * counting lines would answer a different question. `line.activityId` is
 * derived on read and null on a free line typed by hand (K7); an invoice made
 * only of those falls back to counting its lines, because "0 Vorgänge" would
 * be a strange way to describe something that plainly has content.
 */
function invoiceScope(entry: Invoice): string {
  const activities = new Set(
    entry.lines.map((line) => line.activityId).filter((id): id is string => id !== null),
  )
  const count =
    activities.size > 0
      ? strings.invoice.scopeActivities(activities.size)
      : strings.invoice.scopeLines(entry.lines.length)

  const months = [
    ...new Set(
      entry.lines
        .map((line) => line.dateOfService)
        .filter((date): date is string => date !== null)
        .map((date) => formatBerlinMonth(`${date}T12:00:00Z`)),
    ),
  ]
  if (months.length === 0) return count

  const span = months.length === 1 ? months[0] : `${months[0]} – ${months[months.length - 1]}`
  return `${count} · ${span}`
}

/** When it is due, since when it was due, or when it was paid — the last thing
 *  a row says. A draft says nothing: it is not a claim yet. */
function invoiceHint(entry: Invoice, state: PaymentState): string {
  if (entry.status === 'draft') return ''

  if (state.status === 'paid' || state.status === 'overpaid') {
    return entry.lastPaidOn
      ? strings.invoice.paidOn(formatBerlinDate(`${entry.lastPaidOn}T12:00:00Z`))
      : strings.payment.statuses[state.status]
  }
  if (state.status === 'cancelled' || state.status === 'cancellation') return ''

  const due = formatBerlinDate(`${dueDate(entry.invoiceDate, entry.paymentTermDays)}T12:00:00Z`)
  return state.daysOverdue === null ? strings.invoice.dueOn(due) : strings.invoice.overdueSince(due)
}

/**
 * What is billable but on no invoice, over the list — the card the design puts
 * there, with the way into a draft on it.
 *
 * It reads the same query the overview's own summary does, so standing on this
 * tab costs no extra request. It appears only when there is something: a card
 * saying "0,00 €" would be a claim that something is waiting.
 */
function BillableCard({ contactId, onCreate }: { contactId: string; onCreate: () => void }) {
  const billable = useQuery(billableQueryOptions(contactId))
  const items = billable.data ?? []

  if (items.length === 0) return null

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
  const activities = new Set(items.map((item) => item.activityId))

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-[10px] border bg-muted/45 px-4 py-3.5">
      <div>
        <p className="font-semibold">{strings.billable.cardTitle}</p>
        <p className="mt-[3px] text-[13px] text-muted-foreground">
          {strings.billable.cardLine(activities.size)}
        </p>
      </div>
      <span className="flex items-center gap-3.5">
        <span className="font-semibold text-[19px] tabular-nums">{formatEuro(total)}</span>
        <Button size="sm" variant="outline" onClick={onCreate}>
          {strings.invoice.createAction}
        </Button>
      </span>
    </div>
  )
}

function ContactNotes({
  contactId,
  documentActivityId,
  onFormOpened,
}: {
  contactId: string
  /** A Vorgang handed over by "Dokumentieren" on the overview — the form
   *  opens on it once, and the parameter is dropped again so that going back
   *  to this tab later does not re-open a form nobody asked for. */
  documentActivityId?: string | undefined
  onFormOpened: () => void
}) {
  const notes = useQuery(noteListQueryOptions({ contactId }))
  const noteTypes = useQuery(noteTypeListQueryOptions)
  const noteRows = notes.data ?? []
  const [filter, setFilter] = useState<string | undefined>()

  /* Locked state first, then the addendum, then one chip per type flagged
     `show_as_tab` — the flag alone decides that last group, so a chip appears
     even where the count is zero: at a filter a zero is an answer (K7), and
     which types are worth a chip is the practitioner's call rather than a
     consequence of what this contact happens to have.

     "Nachtrag" stands with Gesperrt and Offen rather than among the types,
     because that is what it is: a property of the note itself. It is not a
     note type and never becomes one (L1) — the design draws it between the
     types, which no general order can reproduce. */
  const noteChips = [
    {
      id: 'locked',
      label: strings.counts.notesLocked,
      matches: (note: Note) => note.lockedAt !== null,
    },
    {
      id: 'open',
      label: strings.counts.notesOpen,
      matches: (note: Note) => note.lockedAt === null,
    },
    {
      id: 'addendum',
      label: strings.counts.notesAddendum,
      matches: (note: Note) => note.correctsNoteId !== null,
    },
    ...(noteTypes.data ?? [])
      .filter((type) => type.showAsTab)
      /* An addendum is deliberately not counted under its type. It carries
         one — it starts on its parent's — but "Nachtrag" displaces it
         everywhere it is shown, in the row and in the reading pane's header,
         and a count that said otherwise would not add up against the rows. */
      .map((type) => ({
        id: `type:${type.id}`,
        label: type.label,
        matches: (note: Note) => note.correctsNoteId === null && note.noteTypeId === type.id,
      })),
  ]

  /**
   * **Counting and filtering are two rules, not one** (L6b).
   *
   * - **Counted** row by row, on the row's own property: an addendum counts
   *   under "Nachtrag" and under nothing else.
   * - **Filtered** with closure in both directions: a matching note brings its
   *   addenda along, and a matching addendum brings its note along.
   *
   * The rule from L1 survives that unchanged — an addendum never stands alone,
   * because alone in a filtered list it would sit there with nothing to say
   * what it corrects, while the panel renders it indented under exactly that
   * note. What follows is that a chip reading "2 Sitzung" can produce three
   * rows, and that is the lesser evil: a number beside a word reads as "there
   * are this many", not as "this many rows are coming".
   */
  const shownFor = (matches: (note: Note) => boolean): Note[] => {
    const keep = new Set(noteRows.filter(matches).map((note) => note.id))

    // Both directions, to a fixed point — the screen only ever nests one level
    // deep, but nothing in the database says an addendum may not have one.
    for (let pass = 0; pass <= noteRows.length; pass++) {
      let grew = false
      for (const note of noteRows) {
        if (note.correctsNoteId === null) continue
        const linked = keep.has(note.id) !== keep.has(note.correctsNoteId)
        if (!linked) continue
        keep.add(note.id)
        keep.add(note.correctsNoteId)
        grew = true
      }
      if (!grew) break
    }

    return noteRows.filter((note) => keep.has(note.id))
  }

  const active = noteChips.find((chip) => chip.id === filter)
  const shown = active ? shownFor(active.matches) : noteRows
  const noTypes = noteTypes.data?.length === 0

  const [form, setForm] = useState<NoteFormTarget | null>(null)
  const [meta, setMeta] = useState({ noteDate: '', typeLabel: '' })
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [chainOpen, setChainOpen] = useState(false)

  /** Stable, and a no-op when nothing moved: the form reports its date and
   *  type on every change so the provisional row can follow, and an
   *  unconditional setState here would re-render the form that reported. */
  const takeMeta = useCallback((next: { noteDate: string; typeLabel: string }) => {
    setMeta((current) =>
      current.noteDate === next.noteDate && current.typeLabel === next.typeLabel ? current : next,
    )
  }, [])

  useEffect(() => {
    if (!documentActivityId) return
    setForm({ kind: 'create', activityId: documentActivityId })
    onFormOpened()
  }, [documentActivityId, onFormOpened])

  // The first note unless the chosen one is still in the list — which is what
  // makes a filter usable: narrowing the list moves the reading pane with it
  // instead of leaving it on something no longer shown.
  const ordered = orderNotes(shown)
  const selected = ordered.find((note) => note.id === selectedId) ?? ordered[0]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterRow
          summary={strings.counts.notes(noteRows.length)}
          chips={noteChips.map((chip) => ({
            id: chip.id,
            label: chip.label,
            count: noteRows.filter(chip.matches).length,
          }))}
          active={filter}
          onChange={setFilter}
        />
        <Button variant="outline" className="ml-auto" onClick={() => setChainOpen(true)}>
          <ShieldCheck className="size-4" aria-hidden />
          {strings.note.chainCheck}
        </Button>
        {/* Without a note type nothing can be saved, so the button says so
            instead of opening a form that cannot be submitted. */}
        <Button onClick={() => setForm({ kind: 'create' })} disabled={noTypes}>
          <Plus className="size-4" aria-hidden />
          {strings.note.create}
        </Button>
      </div>

      {noTypes && (
        <p className="mb-4 text-muted-foreground text-sm">
          <span className="font-medium text-foreground">{strings.note.typesEmpty}</span>{' '}
          {strings.note.typesEmptyHint}
        </p>
      )}

      <NotePanel
        notes={shown}
        provisional={
          form === null || form.kind === 'edit'
            ? undefined
            : {
                noteDate: meta.noteDate,
                typeLabel: meta.typeLabel,
                correctsNoteId: form.kind === 'addendum' ? form.correctsNote.id : null,
              }
        }
        selectedId={form?.kind === 'edit' ? form.note.id : selected?.id}
        /* Picking another note leaves the form the way "Abbrechen" does —
           flushed by the form itself on unmount of nothing, so what was typed
           stays as a draft and is offered again. Reading must always be one
           click away. */
        onSelect={(noteId) => {
          setSelectedId(noteId)
          setForm(null)
        }}
        emptyText={notes.isPending ? strings.status.loading : strings.note.empty}
      >
        {form ? (
          <NoteForm
            /* A different target is a different form: the key is what resets
               every field, the editor included, without an effect to keep in
               step with the props. */
            key={
              form.kind === 'edit'
                ? `edit:${form.note.id}`
                : form.kind === 'addendum'
                  ? `addendum:${form.correctsNote.id}`
                  : `create:${form.activityId ?? ''}`
            }
            contactId={contactId}
            target={form}
            onMeta={takeMeta}
            onSaved={(saved) => {
              setForm(null)
              setSelectedId(saved.id)
            }}
            onCancel={() => setForm(null)}
          />
        ) : (
          selected && (
            <NoteReader
              note={selected}
              onEdit={(note) => setForm({ kind: 'edit', note })}
              onAddendum={(note) => setForm({ kind: 'addendum', correctsNote: note })}
            />
          )
        )}
      </NotePanel>

      <NoteChainDialog contactId={contactId} open={chainOpen} onOpenChange={setChainOpen} />
    </>
  )
}

/**
 * The calendar entries of this contact, taken from their activities rather
 * than from a second endpoint — an appointment always belongs to one.
 */
/**
 * The contact's calendar entries — **all** of them (L5).
 *
 * It used to read the Vorgang list and keep the rows that had a Termin, which
 * meant that an appointment belonging to this contact but to no Vorgang — a
 * call back, a slot held for them, possible since D-K1 — was missing from the
 * one screen that claims to list their appointments. The query now asks
 * `appointment` directly and hands back what the calendar sees.
 */
function ContactAppointments({ contactId }: { contactId: string }) {
  const appointments = useQuery(contactAppointmentsQueryOptions(contactId))
  const types = useQuery(activityTypeListQueryOptions(true))

  const entries = appointments.data ?? []

  if (appointments.isPending) {
    return <p className="text-muted-foreground text-sm">{strings.status.loading}</p>
  }

  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">{strings.appointment.empty}</p>
  }

  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-wrap items-baseline gap-x-3 rounded-md border px-4 py-3"
        >
          <span className="font-medium">{formatBerlinDate(entry.startsAt)}</span>
          <span className="text-muted-foreground text-sm tabular-nums">
            {formatBerlinTime(entry.startsAt)}–{formatBerlinTime(entry.endsAt)}
          </span>
          <Badge variant={occupiesSlot(entry.status) ? 'outline' : 'secondary'}>
            {strings.appointment.status[entry.status]}
          </Badge>
          <span className="text-muted-foreground text-sm">
            {/* The same two-part naming the calendar uses (D-K2), minus the
                contact — inside their own record it would repeat on every
                row. */}
            {entry.activityType === null
              ? (entry.title ?? strings.appointment.untitled)
              : activityLabel(
                  { title: entry.activityTitle },
                  activityTypeLabel(types.data, entry.activityType),
                )}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The filter row above a tab's list: a prose summary, then one chip per
 * category — and clicking one narrows the list (K3, corrected in K7).
 *
 * K3 built these as plain counts, on the reading that the prototype's chips
 * were controls without a function. That was a misreading: `nzFilter`,
 * `vgFilter` and `reFilter` narrow the three lists there. So they filter here
 * too — and **a zero stays visible**, because at a filter it is an answer
 * ("Überfällig 0") rather than the noise it would be at a bare count.
 *
 * The active chip is toggled off by clicking it again, as in the prototype.
 * **The count comes first**, as on every filter chip: there the number is the
 * statement — how many rows to expect — while a tab's number is an aside to
 * its name (K8, `components/chip.tsx`).
 */
function FilterRow<Id extends string>({
  summary,
  chips,
  active,
  onChange,
}: {
  summary: string
  chips: { id: Id; label: string; count: number }[]
  active: Id | undefined
  onChange: (next: Id | undefined) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-[13.5px] text-muted-foreground">{summary}</p>
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className={filterChipClass(active === chip.id)}
          onClick={() => onChange(active === chip.id ? undefined : chip.id)}
        >
          <span className="font-semibold tabular-nums">{chip.count}</span>
          {chip.label}
        </button>
      ))}
    </div>
  )
}
