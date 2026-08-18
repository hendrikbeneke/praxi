import {
  type Activity,
  activityStatuses,
  type ContactRoleInput,
  type ContactUpdate,
  formatBerlinDate,
  formatBerlinTime,
  formatEuro,
  invoicePaymentState,
  type Note,
  noteTypes,
  occupiesSlot,
  toBerlinDate,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Pencil, Plus, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { ActivityList } from '@/components/activity-list'
import { CountChip } from '@/components/chip'
import { ContactForm } from '@/components/contact-form'
import { ContactHeader } from '@/components/contact-header'
import { ContactOverview } from '@/components/contact-overview'
import { ContentWidth } from '@/components/content-width'
import { NoteChainDialog } from '@/components/note-chain-dialog'
import { NoteDialog } from '@/components/note-dialog'
import { NoteList } from '@/components/note-list'
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
import { activityListQueryOptions } from '@/lib/activities'
import { ApiError } from '@/lib/api'
import {
  contactQueryOptions,
  setContactArchived,
  setContactRoles,
  updateContact,
} from '@/lib/contacts'
import { createInvoice, invoiceListQueryOptions } from '@/lib/invoices'
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
})

export const Route = createFileRoute('/_app/contacts/$contactId')({
  validateSearch: searchSchema,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(contactQueryOptions(params.contactId)),
  component: ContactDetailPage,
})

function ContactDetailPage() {
  const { contactId } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const { data: contact } = useQuery(contactQueryOptions(contactId))

  /** Master data is read far more often than it is changed, so the page starts
   *  read-only and a stray keystroke cannot land in a field nobody opened. */
  const [editing, setEditing] = useState(false)
  /** The activity the "Dokumentieren" button on the overview points at. */
  const [documenting, setDocumenting] = useState<Activity | undefined>()

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

      <div className="px-8 pt-6 pb-11">
        {/* Only the tab content is capped; the strip above runs to the edge. */}
        <ContentWidth max={1100}>
          <TabsContent value="overview">
            <ContactOverview contact={contact} onDocument={setDocumenting} />
          </TabsContent>

          <TabsContent value="master">
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
          </TabsContent>

          <TabsContent value="activities">
            <ContactActivities contactId={contactId} />
          </TabsContent>

          <TabsContent value="appointments">
            <ContactAppointments contactId={contactId} />
          </TabsContent>

          <TabsContent value="notes">
            <ContactNotes contactId={contactId} />
          </TabsContent>

          <TabsContent value="invoices">
            <ContactInvoices contactId={contactId} />
          </TabsContent>
        </ContentWidth>
      </div>

      {/* Opened from the overview, so it lives here rather than in the notes
          tab — the point is to document without going looking for the tab. */}
      {documenting && (
        <NoteDialog
          contactId={contactId}
          activityId={documenting.id}
          open
          onOpenChange={(next) => !next && setDocumenting(undefined)}
        />
      )}
    </Tabs>
  )
}

/**
 * The contact's activities — the same list and the same inline detail as the
 * Vorgänge page (D8), with the contact left out of every row and out of the
 * detail's rail: it would repeat on each row and its link would lead back to
 * this page.
 */
function ContactActivities({ contactId }: { contactId: string }) {
  const activities = useQuery(activityListQueryOptions({ contactId }))
  const [creating, setCreating] = useState(false)

  const rows = activities.data ?? []
  const now = new Date().toISOString()
  const activityChips = [
    ...activityStatuses.map((status) => ({
      label: strings.activity.statuses[status],
      count: rows.filter((entry) => entry.status === status).length,
    })),
    {
      label: strings.counts.activitiesBilled,
      count: rows.filter((entry) => entry.billingState === 'billed').length,
    },
    {
      label: strings.counts.activitiesUnbilled,
      count: rows.filter((entry) => entry.billingState === 'open').length,
    },
    {
      label: strings.counts.activitiesNoAppointment,
      count: rows.filter((entry) => entry.appointment === null).length,
    },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CountRow
          summary={strings.counts.activities(
            rows.length,
            rows.filter((entry) => entry.occurredAt > now).length,
          )}
          chips={activityChips}
        />
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          {strings.activity.create}
        </Button>
      </div>

      <ActivityList
        activities={rows}
        emptyText={activities.isPending ? strings.status.loading : strings.activity.empty}
        showContact={false}
        contactId={contactId}
        creating={creating}
        onCreated={() => setCreating(false)}
        onCancelCreate={() => setCreating(false)}
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
  const states = rows.map((invoice) => invoicePaymentState(invoice, invoice.paidCents, today))
  const invoiceChips = [
    {
      label: strings.counts.invoicesOpen,
      count: states.filter((state) => state.status === 'open').length,
    },
    {
      label: strings.counts.invoicesPaid,
      count: states.filter((state) => state.status === 'paid').length,
    },
    {
      /* Overdue is a second axis, not a status (CLAUDE.md rule 9) — an invoice
         can be partly paid and overdue at once, so this counts the axis. */
      label: strings.counts.invoicesOverdue,
      count: states.filter((state) => state.daysOverdue !== null).length,
    },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CountRow summary={strings.counts.invoices(rows.length)} chips={invoiceChips} />
        <Button className="ml-auto" onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="size-4" aria-hidden />
          {strings.invoice.create}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {invoices.isPending ? strings.status.loading : strings.invoice.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((entry) => (
            <li key={entry.id}>
              <Link
                to="/invoices/$invoiceId"
                params={{ invoiceId: entry.id }}
                className="flex flex-wrap items-baseline gap-x-3 rounded-md border px-4 py-3 hover:bg-accent/50"
              >
                <span className="font-medium">
                  {entry.number ?? strings.invoice.statuses.draft}
                </span>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {formatBerlinDate(`${entry.invoiceDate}T12:00:00Z`)}
                </span>
                <Badge variant={entry.status === 'draft' ? 'outline' : 'secondary'}>
                  {strings.invoice.statuses[entry.status]}
                </Badge>
                <span className="ml-auto tabular-nums">{formatEuro(entry.totalCents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function ContactNotes({ contactId }: { contactId: string }) {
  const notes = useQuery(noteListQueryOptions({ contactId }))
  const noteRows = notes.data ?? []
  /* Locked state first, then one chip per type that actually occurs — a type
     with no note is left out rather than shown as a zero, because these count
     and do not filter (K3). */
  const noteChips = [
    {
      label: strings.counts.notesLocked,
      count: noteRows.filter((n) => n.lockedAt !== null).length,
    },
    { label: strings.counts.notesOpen, count: noteRows.filter((n) => n.lockedAt === null).length },
    ...noteTypes.map((type) => ({
      label: strings.note.types[type],
      count: noteRows.filter((n) => n.type === type).length,
    })),
  ]

  const [dialogOpen, setDialogOpen] = useState(false)
  const [edited, setEdited] = useState<Note | undefined>()
  const [corrects, setCorrects] = useState<Note | undefined>()
  const [chainOpen, setChainOpen] = useState(false)

  function open(note?: Note, addendumTo?: Note) {
    setEdited(note)
    setCorrects(addendumTo)
    setDialogOpen(true)
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CountRow summary={strings.counts.notes(noteRows.length)} chips={noteChips} />
        <Button variant="outline" className="ml-auto" onClick={() => setChainOpen(true)}>
          <ShieldCheck className="size-4" aria-hidden />
          {strings.note.chainCheck}
        </Button>
        <Button onClick={() => open()}>
          <Plus className="size-4" aria-hidden />
          {strings.note.create}
        </Button>
      </div>

      <NoteList
        notes={noteRows}
        emptyText={notes.isPending ? strings.status.loading : strings.note.empty}
        onEdit={(note) => open(note)}
        onAddendum={(note) => open(undefined, note)}
      />

      <NoteDialog
        contactId={contactId}
        note={edited}
        correctsNote={corrects}
        // The pencil on a note is already the "edit" step, so it goes straight
        // in — this is the dialog that gets used every day.
        startEditing
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next)
          if (!next) {
            setEdited(undefined)
            setCorrects(undefined)
          }
        }}
      />

      <NoteChainDialog contactId={contactId} open={chainOpen} onOpenChange={setChainOpen} />
    </>
  )
}

/**
 * The calendar entries of this contact, taken from their activities rather
 * than from a second endpoint — an appointment always belongs to one.
 */
function ContactAppointments({ contactId }: { contactId: string }) {
  const activities = useQuery(activityListQueryOptions({ contactId }))

  const entries = (activities.data ?? [])
    .filter((activity) => activity.appointment !== null)
    .map((activity) => ({ activity, appointment: activity.appointment }))

  if (activities.isPending) {
    return <p className="text-muted-foreground text-sm">{strings.status.loading}</p>
  }

  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">{strings.appointment.empty}</p>
  }

  return (
    <ul className="space-y-2">
      {entries.map(({ activity, appointment }) =>
        appointment ? (
          <li
            key={appointment.id}
            className="flex flex-wrap items-baseline gap-x-3 rounded-md border px-4 py-3"
          >
            <span className="font-medium">{formatBerlinDate(appointment.startsAt)}</span>
            <span className="text-muted-foreground text-sm tabular-nums">
              {formatBerlinTime(appointment.startsAt)}–{formatBerlinTime(appointment.endsAt)}
            </span>
            <Badge variant={occupiesSlot(appointment.status) ? 'outline' : 'secondary'}>
              {strings.appointment.status[appointment.status]}
            </Badge>
            {activity.title && (
              <span className="text-muted-foreground text-sm">{activity.title}</span>
            )}
          </li>
        ) : null,
      )}
    </ul>
  )
}

/**
 * The count row above a tab's list: a prose summary, then one chip per category
 * that has something in it (K3).
 *
 * Zero-count chips are dropped. With a filter the zero would be an answer worth
 * showing; these only count, so "Nicht erschienen 0" is a category the contact
 * has never had — noise beside the ones they do have.
 */
function CountRow({
  summary,
  chips,
}: {
  summary: string
  chips: { label: string; count: number }[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-[13.5px] text-muted-foreground">{summary}</p>
      {chips
        .filter((chip) => chip.count > 0)
        .map((chip) => (
          <CountChip key={chip.label} label={chip.label} count={chip.count} />
        ))}
    </div>
  )
}
