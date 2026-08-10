import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { ContactForm } from '@/components/contact-form'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { createContact } from '@/lib/contacts'
import { strings } from '@/lib/strings'

export const Route = createFileRoute('/_app/contacts/new')({
  component: NewContactPage,
})

function NewContactPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: createContact,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success(strings.contact.created)
      await navigate({ to: '/contacts/$contactId', params: { contactId: created.id } })
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.contact.saveFailed)
    },
  })

  return (
    <>
      <PageHeader
        title={strings.contact.createTitle}
        actions={
          <Button variant="ghost" asChild>
            <Link to="/contacts">
              <ArrowLeft className="size-4" aria-hidden />
              {strings.actions.back}
            </Link>
          </Button>
        }
      />
      {/* Creating is the one place roles travel with the master data: nothing
          else can be editing them yet, so there is nothing to overwrite. */}
      <ContactForm
        onSubmit={(input, roles) => mutation.mutate({ ...input, roles })}
        pending={mutation.isPending}
      />
    </>
  )
}
