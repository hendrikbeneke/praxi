import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppSidebar } from '@/components/app-sidebar'
import { AppTopbar } from '@/components/app-topbar'
import { currentUserQueryOptions } from '@/lib/auth'
import { practiceSettingsQueryOptions } from '@/lib/settings'
import { userPreferencesQueryOptions } from '@/lib/user-preferences'

/**
 * The authenticated area. Pathless (`_app`), so the shell wraps every page
 * without appearing in the URL.
 *
 * The guard runs in `beforeLoad`, before any child component renders — an
 * unauthenticated visitor never sees the shell flash. Practice settings and
 * preferences are ensured here too, alongside the user: `AppSidebar` reads
 * the practice name and the collapsed state, `AppTopbar`'s account menu reads
 * the theme and start page, and none of them should flash between an unset
 * and a loaded value on first paint.
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQueryOptions)
    if (!user) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    await Promise.all([
      context.queryClient.ensureQueryData(practiceSettingsQueryOptions),
      context.queryClient.ensureQueryData(userPreferencesQueryOptions),
    ])
    return { user }
  },
  component: AppLayout,
})

function AppLayout() {
  const { user } = Route.useRouteContext()

  return (
    <div className="flex min-h-svh">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar user={user} />
        <main className="min-w-0 flex-1 overflow-auto px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
