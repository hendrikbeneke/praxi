import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { ContactForm } from '@/components/contact-form'
import { ContentWidth } from '@/components/content-width'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { createContact } from '@/lib/contacts'
import { practiceSettingsQueryOptions } from '@/lib/settings'
import { strings } from '@/lib/strings'
import { countryListQueryOptions } from '@/lib/value-lists'

export const Route = createFileRoute('/_app/contacts/new')({
  /* Both are needed *before* the form mounts, not after: `ContactForm` reads
     its defaults once, when react-hook-form is created, so a country arriving
     a moment later would never reach the field. */
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(practiceSettingsQueryOptions),
      context.queryClient.ensureQueryData(countryListQueryOptions),
    ])
  },
  component: NewContactPage,
})

function NewContactPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  /*
   * The country a new contact starts on is DERIVED, never a constant.
   *
   * `practice_settings.country` is the practice's own country — a system
   * property, because which law applies hangs on it — and the overwhelming
   * majority of a practice's contacts live in the same one. So it is the
   * suggestion, and it is one only: a creation form may suggest, as long as
   * the screen says nothing is stored yet (CLAUDE.md, "a form never claims a
   * state that does not exist").
   *
   * It goes through the `country` catalogue by ISO code rather than being
   * written into the field directly, because the column holds a catalogue id.
   * Where the practitioner has not put their own country into that catalogue,
   * there is nothing to point at and the field stays empty — which is the
   * honest answer, not a fallback to 'DE'.
   *
   * Only here. An existing contact shows what is stored, empty included.
   */
  const settings = useQuery(practiceSettingsQueryOptions)
  const countries = useQuery(countryListQueryOptions)
  const defaultCountryId = countries.data?.find(
    (entry) => entry.isoCode === settings.data?.country,
  )?.id

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
        <ContentWidth>
          <ContactForm
            defaultCountryId={defaultCountryId}
            onSubmit={(input, roles) => mutation.mutate({ ...input, roles })}
            onCancel={() => void navigate({ to: '/contacts' })}
            pending={mutation.isPending}
          />
        </ContentWidth>
      </div>
    </>
  )
}
