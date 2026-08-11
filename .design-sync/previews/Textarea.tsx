import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/** The one real use in the app: the internal note on a contact, with a
 *  muted caption clarifying that it never leaves the practice's records. */
export function InterneNotiz() {
  return (
    <div className="grid gap-2">
      <Label htmlFor="internalNote">Interne Notiz</Label>
      <Textarea
        id="internalNote"
        rows={4}
        placeholder="Z. B. Besonderheiten bei der Terminvereinbarung oder Hinweise für die nächste Sitzung."
      />
      <p className="text-sm text-muted-foreground">
        Nur intern sichtbar, erscheint auf keinem Dokument.
      </p>
    </div>
  )
}

/** Filled state, as it appears once the practitioner has written a note. */
export function AusgefuelltMitText() {
  return (
    <div className="grid gap-2">
      <Label htmlFor="internalNoteFilled">Interne Notiz</Label>
      <Textarea
        id="internalNoteFilled"
        rows={4}
        defaultValue="Erika Musterfrau bevorzugt Termine am späten Nachmittag. Bitte vor der Sitzung an die neue Telefonnummer erinnern lassen."
      />
      <p className="text-sm text-muted-foreground">
        Nur intern sichtbar, erscheint auf keinem Dokument.
      </p>
    </div>
  )
}
