import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { Toaster } from '@/components/ui/sonner'
import { strings } from '@/lib/strings'

/**
 * The root holds no chrome: the sidebar belongs to the authenticated area and
 * would be wrong on the login page. It lives in `_app.tsx` instead.
 *
 * The query client is in the router context so route guards can await data
 * before a component renders — that is what keeps the app shell from flashing
 * for an unauthenticated visitor.
 */
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
  notFoundComponent: () => <p className="p-8 text-muted-foreground">{strings.error.notFound}</p>,
})

function RootLayout() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <Outlet />
      <Toaster position="bottom-right" />
    </div>
  )
}
