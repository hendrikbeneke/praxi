import { Plus } from 'lucide-react'

import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'

/** As used at the top of the Kontakte list: a title, a short description of
 *  what the list holds, and the primary action for the screen. */
export function MitAktionen() {
  return (
    <PageHeader
      title="Kontakte"
      description="Personen und Organisationen der Praxis."
      actions={
        <Button>
          <Plus />
          Neuer Kontakt
        </Button>
      }
    />
  )
}

/** The minimal case: neither description nor actions given. Screens that
 *  have nothing to say beyond the title, or no primary action at all. */
export function NurTitel() {
  return <PageHeader title="Einstellungen" />
}
