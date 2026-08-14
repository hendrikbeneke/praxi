import type { CurrentUser } from '@praxi/shared'
import { useLocation } from '@tanstack/react-router'
import { AccountMenu } from '@/components/account-menu'
import { navigation } from '@/lib/navigation'

/** The same seven entries the sidebar renders — see `lib/navigation.ts` — so
 *  the breadcrumb can never name a section the sidebar itself disagrees with. */
function activeSectionLabel(pathname: string): string | undefined {
  const exact = navigation.find((item) => item.to === pathname)
  if (exact) return exact.label
  return navigation.find((item) => item.to !== '/' && pathname.startsWith(`${item.to}/`))?.label
}

/**
 * A single breadcrumb segment — the active top-level section — and the user
 * menu. No second, per-page segment yet: nothing today supplies one, and
 * building the extension point before a screen needs it would be guessing at
 * its shape (D6 is the first candidate, for a contact's name).
 */
export function AppTopbar({ user }: { user: CurrentUser }) {
  const { pathname } = useLocation()
  const section = activeSectionLabel(pathname)

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-6 border-b bg-card px-5">
      <div className="min-w-0 font-medium">{section}</div>
      <AccountMenu user={user} />
    </header>
  )
}
