import { Separator } from '@/components/ui/separator'

/** Real shape: divides the sidebar's title, navigation and account sections
 *  (routes/_app.tsx). */
export function Horizontal() {
  return (
    <div className="w-64 rounded-md border">
      <div className="px-5 py-4">
        <p className="font-semibold">Praxisverwaltung</p>
      </div>
      <Separator />
      <div className="space-y-1 p-3 text-muted-foreground text-sm">
        <p>Kontakte</p>
        <p>Termine</p>
      </div>
      <Separator />
      <div className="p-3 text-muted-foreground text-xs">Erika Musterfrau</div>
    </div>
  )
}

export function Vertikal() {
  return (
    <div className="flex h-16 items-center gap-4 text-sm">
      <span>Speichern</span>
      <Separator orientation="vertical" />
      <span>Abbrechen</span>
    </div>
  )
}
