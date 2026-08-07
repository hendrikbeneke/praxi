import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { routeTree } from './routeTree.gen'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // This is a local, single-user application; aggressive refetching buys
      // nothing and only produces noise.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
})

/**
 * The query client goes into the router context so route guards and loaders
 * can fetch before a component renders — that is what lets `_app` decide
 * whether anybody is signed in without the shell flashing first.
 */
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  context: { queryClient },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element missing')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
