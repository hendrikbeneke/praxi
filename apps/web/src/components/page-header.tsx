import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-muted-foreground text-sm">{description}</p>}
      </div>
      {actions}
    </header>
  )
}

/**
 * A navigation target whose slice has not been built yet. The sidebar is
 * complete from slice 1 on, so every entry has to lead somewhere — this says
 * plainly that the area is still empty instead of showing a broken page.
 */
export function PlaceholderPage({ title, note }: { title: string; note: string }) {
  return (
    <>
      <PageHeader title={title} />
      <p className="text-muted-foreground text-sm">{note}</p>
    </>
  )
}
