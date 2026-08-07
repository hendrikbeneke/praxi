import { createRootRoute, Outlet } from '@tanstack/react-router'
import { strings } from '@/lib/strings'

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <p className="p-8 text-muted-foreground">{strings.error.notFound}</p>,
})

function RootLayout() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <h1 className="font-semibold text-lg">{strings.app.title}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
