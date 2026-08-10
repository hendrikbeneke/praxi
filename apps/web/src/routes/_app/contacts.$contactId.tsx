import {
  type Activity,
  type ContactUpdate,
  formatBerlinDate,
  formatBerlinTime,
  formatEuro,
  type Note,
  occupiesSlot,
  toBerlinDate,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Archive, ArchiveRestore, ArrowLeft, Pencil, Plus, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { ActivityDialog } from '@/components/activity-dialog'
import { ActivityList } from '@/components/activity-list'
import { ContactForm } from '@/components/contact-form'
import { ContactHeader } from '@/components/contact-header'
import { ContactOverview } from '@/components/contact-overview'
import { NoteChainDialog } from '@/components/note-chain-dialog'
import { NoteDialog } from '@/components/note-dialog'
import { NoteList } from '@/components/note-list'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { activityListQueryOptions } from '@/lib/activities'
import { ApiError } from '@/lib/api'
import { contactQueryOptions, setContactArchived, updateContact } from '@/lib/contacts'
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

  const save = useMutation({
    mutationFn: (input: ContactUpdate) => updateContact(contactId, input),
    onSuccess: async (saved) => {
      queryClient.setQueryData(contactQueryOptions(contactId).queryKey, saved)
      await invalidate()
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
    <>
      <ContactHeader
        contact={contact}
        actions={
          <>
            {isArchived ? (
              <Button
                variant="outline"
                onClick={() => archive.mutate(false)}
                disabled={archive.isPending}
              >
                <ArchiveRestore className="size-4" aria-hidden />
                {strings.contact.unarchive}
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={archive.isPending}>
                    <Archive className="size-4" aria-hidden />
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
            )}

            <Button variant="ghost" asChild>
              <Link to="/contacts">
                <ArrowLeft className="size-4" aria-hidden />
                {strings.actions.back}
              </Link>
            </Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(next) => void navigate({ search: { tab: next as (typeof tabs)[number] } })}
      >
        <TabsList>
          <TabsTrigger value="overview">{strings.contact.tabs.overview}</TabsTrigger>
          <TabsTrigger value="master">{strings.contact.tabs.master}</TabsTrigger>
          <TabsTrigger value="notes">{strings.contact.tabs.notes}</TabsTrigger>
          <TabsTrigger value="activities">{strings.contact.tabs.activities}</TabsTrigger>
          <TabsTrigger value="appointments">{strings.contact.tabs.appointments}</TabsTrigger>
          <TabsTrigger value="invoices">{strings.contact.tabs.invoices}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-6">
          <ContactOverview contact={contact} onDocument={setDocumenting} />
        </TabsContent>

        <TabsContent value="master" className="space-y-6 pt-6">
          <div className="flex max-w-3xl justify-end">
            {!editing && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="size-4" aria-hidden />
                {strings.contact.edit}
              </Button>
            )}
          </div>

          {/* `key` remounts the form when the stored version changes or when
              editing is left, so the fields show what was actually stored —
              that is also what "Abbrechen" relies on. */}
          <ContactForm
            key={`${contact.id}${contact.archivedAt ?? ''}${editing}`}
            contact={contact}
            editing={editing}
            onSubmit={(input) => save.mutate(input)}
            onCancel={() => setEditing(false)}
            pending={save.isPending}
          />
        </TabsContent>

        <TabsContent value="activities" className="pt-6">
          <ContactActivities contactId={contactId} />
        </TabsContent>

        <TabsContent value="appointments" className="pt-6">
          <ContactAppointments contactId={contactId} />
        </TabsContent>

        <TabsContent value="notes" className="pt-6">
          <ContactNotes contactId={contactId} />
        </TabsContent>

        <TabsContent value="invoices" className="pt-6">
          <ContactInvoices contactId={contactId} />
        </TabsContent>
      </Tabs>

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
    </>
  )
}

function ContactActivities({ contactId }: { contactId: string }) {
  const activities = useQuery(activityListQueryOptions({ contactId }))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [edited, setEdited] = useState<Activity | undefined>()

  function open(activity?: Activity) {
    setEdited(activity)
    setDialogOpen(true)
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => open()}>
          <Plus className="size-4" aria-hidden />
          {strings.activity.create}
        </Button>
      </div>

      <ActivityList
        activities={activities.data ?? []}
        onOpen={open}
        emptyText={activities.isPending ? strings.status.loading : strings.activity.empty}
      />

      <ActivityDialog
        activity={edited}
        contactId={contactId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
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

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
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
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setChainOpen(true)}>
          <ShieldCheck className="size-4" aria-hidden />
          {strings.note.chainCheck}
        </Button>
        <Button onClick={() => open()}>
          <Plus className="size-4" aria-hidden />
          {strings.note.create}
        </Button>
      </div>

      <NoteList
        notes={notes.data ?? []}
        emptyText={notes.isPending ? strings.status.loading : strings.note.empty}
        onEdit={(note) => open(note)}
        onAddendum={(note) => open(undefined, note)}
      />

      <NoteDialog
        contactId={contactId}
        note={edited}
        correctsNote={corrects}
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
