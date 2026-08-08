import { type ContactInput, formatContactName } from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Archive, ArchiveRestore, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { ContactForm } from '@/components/contact-form'
import { PageHeader } from '@/components/page-header'
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
import { ApiError } from '@/lib/api'
import { contactQueryOptions, setContactArchived, updateContact } from '@/lib/contacts'
import { strings } from '@/lib/strings'

export const Route = createFileRoute('/_app/contacts/$contactId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(contactQueryOptions(params.contactId)),
  component: ContactDetailPage,
})

function ContactDetailPage() {
  const { contactId } = Route.useParams()
  const queryClient = useQueryClient()
  const { data: contact } = useQuery(contactQueryOptions(contactId))

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['contacts'] })

  const save = useMutation({
    mutationFn: (input: ContactInput) => updateContact(contactId, input),
    onSuccess: async (saved) => {
      queryClient.setQueryData(contactQueryOptions(contactId).queryKey, saved)
      await invalidate()
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
      <PageHeader
        title={formatContactName(contact)}
        description={`${strings.contact.contactNumber} ${contact.contactNumber}`}
        actions={
          <div className="flex items-center gap-2">
            {isArchived && <Badge variant="secondary">{strings.contact.archivedBadge}</Badge>}

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
          </div>
        }
      />

      <Tabs defaultValue="master">
        <TabsList>
          <TabsTrigger value="master">{strings.contact.tabs.master}</TabsTrigger>
          <TabsTrigger value="notes">{strings.contact.tabs.notes}</TabsTrigger>
          <TabsTrigger value="activities">{strings.contact.tabs.activities}</TabsTrigger>
          <TabsTrigger value="appointments">{strings.contact.tabs.appointments}</TabsTrigger>
          <TabsTrigger value="invoices">{strings.contact.tabs.invoices}</TabsTrigger>
        </TabsList>

        <TabsContent value="master" className="pt-6">
          {/* `key` remounts the form when the server's version changes, so the
              fields show what was actually stored. */}
          <ContactForm
            key={contact.id + (contact.archivedAt ?? '')}
            contact={contact}
            onSubmit={(input) => save.mutate(input)}
            pending={save.isPending}
          />
        </TabsContent>

        {/* Present but empty — these fill up in slices 4, 5 and 6. */}
        {(['notes', 'activities', 'appointments', 'invoices'] as const).map((tab) => (
          <TabsContent key={tab} value={tab} className="pt-6">
            <p className="text-muted-foreground text-sm">{strings.placeholder.comingSoon}</p>
          </TabsContent>
        ))}
      </Tabs>
    </>
  )
}
