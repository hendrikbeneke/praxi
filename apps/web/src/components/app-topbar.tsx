import { type CurrentUser, formatContactName } from '@praxi/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useMatches } from '@tanstack/react-router'
import { AccountMenu } from '@/components/account-menu'
import { contactQueryOptions } from '@/lib/contacts'
import { navigation } from '@/lib/navigation'
import { strings } from '@/lib/strings'

/** The same seven entries the sidebar renders — see `lib/navigation.ts` — so
 *  the breadcrumb can never name a section the sidebar itself disagrees with. */
function activeSectionLabel(pathname: string): string | undefined {
  const exact = navigation.find((item) => item.to === pathname)
  if (exact) return exact.label
  return navigation.find((item) => item.to !== '/' && pathname.startsWith(`${item.to}/`))?.label
}

/**
 * The breadcrumb's second segment — a contact's name in its own record, or
 * "Kontakt anlegen" while creating one (D6). Deliberately not a mechanism a
 * route could register itself into: there is exactly one consumer today, so
 * naming its two routes here directly says that plainly, instead of a
 * `useBreadcrumb()` API built for a shape nothing has asked for yet. Build
 * that the day a *second* screen wants a second segment — an activity or an
 * invoice under a contact is the likely next one — not before.
 *
 * Reads the contact from the query cache rather than fetching it again: the
 * route's own loader already ensured it before this component could mount.
 */
function useSecondBreadcrumbSegment(): string | undefined {
  const matches = useMatches()
  const queryClient = useQueryClient()

  const contactMatch = matches.find((match) => match.routeId === '/_app/contacts/$contactId')
  if (contactMatch) {
    const { contactId } = contactMatch.params as { contactId: string }
    const contact = queryClient.getQueryData(contactQueryOptions(contactId).queryKey)
    return contact ? formatContactName(contact) : undefined
  }

  if (matches.some((match) => match.routeId === '/_app/contacts/new')) {
    return strings.contact.createTitle
  }

  return undefined
}

/**
 * The breadcrumb — the active top-level section, and where there is one, a
 * second segment for the specific record — plus the user menu.
 */
export function AppTopbar({ user }: { user: CurrentUser }) {
  const { pathname } = useLocation()
  const section = activeSectionLabel(pathname)
  const page = useSecondBreadcrumbSegment()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-6 border-b bg-card px-5">
      <div className="flex min-w-0 items-center gap-2 font-medium">
        <span className={page ? 'text-muted-foreground' : undefined}>{section}</span>
        {page && (
          <>
            <span className="text-border">/</span>
            <span className="truncate">{page}</span>
          </>
        )}
      </div>
      <AccountMenu user={user} />
    </header>
  )
}
