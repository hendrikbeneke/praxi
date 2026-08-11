import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import {
  CalendarDays,
  ClipboardList,
  Coins,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  Stethoscope,
  Users,
  Wallet,
} from 'lucide-react'
import { ThemePicker } from '@/components/theme-picker'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { currentUserQueryOptions, resetCache, signOut } from '@/lib/auth'
import { strings } from '@/lib/strings'

/**
 * The authenticated area. Pathless (`_app`), so the sidebar wraps every page
 * without appearing in the URL.
 *
 * The guard runs in `beforeLoad`, before any child component renders — an
 * unauthenticated visitor never sees the shell flash. `ensureQueryData` reuses
 * the cached answer, so navigating between pages costs no extra request.
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQueryOptions)
    if (!user) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    return { user }
  },
  component: AppLayout,
})

const navigation = [
  { to: '/', label: strings.nav.dashboard, icon: LayoutDashboard },
  { to: '/contacts', label: strings.nav.contacts, icon: Users },
  { to: '/appointments', label: strings.nav.appointments, icon: CalendarDays },
  { to: '/activities', label: strings.nav.activities, icon: ClipboardList },
  // The money, in the order it moves: what is owed to us and not yet demanded,
  // what has been demanded, what has been demanded and not yet paid.
  { to: '/billable', label: strings.nav.billable, icon: Coins },
  { to: '/invoices', label: strings.nav.invoices, icon: FileText },
  { to: '/receivables', label: strings.nav.receivables, icon: Wallet },
  { to: '/services', label: strings.nav.services, icon: Stethoscope },
  { to: '/settings', label: strings.nav.settings, icon: Settings },
] as const

function AppLayout() {
  const { user, queryClient } = Route.useRouteContext()
  const navigate = useNavigate()

  const signOutMutation = useMutation({
    mutationFn: signOut,
    // Whether or not the request succeeded, the local session is over.
    onSettled: async () => {
      await resetCache(queryClient)
      await navigate({ to: '/login' })
    },
  })

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
        <div className="px-5 py-4">
          <p className="font-semibold">{strings.app.title}</p>
        </div>
        <Separator />

        <nav className="flex-1 space-y-1 p-3">
          {navigation.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              // `activeOptions` keeps "Übersicht" from lighting up on every
              // page just because every path starts with "/".
              activeOptions={{ exact: to === '/' }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-accent-foreground data-[status=active]:bg-accent data-[status=active]:font-medium data-[status=active]:text-accent-foreground"
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>

        <Separator />
        <div className="space-y-3 p-3">
          <p className="truncate px-3 text-muted-foreground text-xs">{user.name}</p>
          <ThemePicker />
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 px-3 text-muted-foreground"
            onClick={() => signOutMutation.mutate()}
            disabled={signOutMutation.isPending}
          >
            <LogOut className="size-4" aria-hidden />
            {strings.nav.signOut}
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}
