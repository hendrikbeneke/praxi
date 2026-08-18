import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { ContactForm } from '@/components/contact-form'
import { ContentWidth } from '@/components/content-width'
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
      {/* The same full-bleed strip the record has, and for the same reason:
          the design separates the title from the form with a rule that runs
          the whole width. The shell gives this route no padding (K6). */}
      <div className="border-b bg-card px-8 pt-[22px] pb-[18px]">
        <PageHeader
          className="mb-0"
          title={strings.contact.createTitle}
          description={strings.contact.createHint}
          actions={
            <Button variant="ghost" asChild>
              <Link to="/contacts">
                <ArrowLeft className="size-4" aria-hidden />
                {strings.actions.back}
              </Link>
            </Button>
          }
        />
      </div>

      <div className="px-8 pt-6 pb-11">
        {/* Creating is the one place roles travel with the master data: nothing
            else can be editing them yet, so there is nothing to overwrite. */}
        <ContentWidth max={1100}>
          <ContactForm
            onSubmit={(input, roles) => mutation.mutate({ ...input, roles })}
            onCancel={() => void navigate({ to: '/contacts' })}
            pending={mutation.isPending}
          />
        </ContentWidth>
      </div>
    </>
  )
}
