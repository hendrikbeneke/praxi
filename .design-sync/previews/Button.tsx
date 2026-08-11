import { Pencil, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function Varianten() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="default">Speichern</Button>
      <Button variant="destructive">Löschen</Button>
      <Button variant="outline">Archivieren</Button>
      <Button variant="secondary">Zurücksetzen</Button>
      <Button variant="ghost">Abbrechen</Button>
      <Button variant="link">Details anzeigen</Button>
    </div>
  )
}

export function Groessen() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="xs">Speichern</Button>
      <Button size="sm">Speichern</Button>
      <Button size="default">Speichern</Button>
      <Button size="lg">Speichern</Button>
      <Button size="icon" aria-label="Bearbeiten">
        <Pencil />
      </Button>
      <Button size="icon-xs" aria-label="Bearbeiten">
        <Pencil />
      </Button>
      <Button size="icon-sm" aria-label="Bearbeiten">
        <Pencil />
      </Button>
      <Button size="icon-lg" aria-label="Neu anlegen">
        <Plus />
      </Button>
    </div>
  )
}

/** As used in a dialog footer: primary submit next to a ghost cancel, with
 *  the pending state shown while the mutation is in flight. */
export function DialogAktionen() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost">Abbrechen</Button>
        <Button variant="default">Speichern</Button>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" disabled>
          Abbrechen
        </Button>
        <Button variant="default" disabled>
          Wird gespeichert …
        </Button>
      </div>
    </div>
  )
}

/** Icon-only buttons as used next to a contact name (edit) and above a list
 *  (add new). Both carry an aria-label since they have no visible text. */
export function IconButtons() {
  return (
    <div className="flex items-center gap-2">
      <Button size="icon-sm" variant="ghost" aria-label="Bearbeiten">
        <Pencil />
      </Button>
      <Button size="icon-sm" variant="outline" aria-label="Neuer Kontakt">
        <Plus />
      </Button>
    </div>
  )
}
