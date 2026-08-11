import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** As used in a contact form: a label above the field, id/htmlFor linked. */
export function MitLabel() {
  return (
    <div className="grid gap-2">
      <Label htmlFor="lastName">Nachname</Label>
      <Input id="lastName" placeholder="Nachname" />
    </div>
  )
}

/** Filled state, plus the type variants used across the app: email, phone
 *  and the free-text search field on the contact list. */
export function Ausgefuellt() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="lastNameFilled">Nachname</Label>
        <Input id="lastNameFilled" defaultValue="Mustermann" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" type="email" defaultValue="max.mustermann@praxi.invalid" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="phone">Telefon (mobil)</Label>
        <Input id="phone" type="tel" defaultValue="0151 23456789" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="search">Suche</Label>
        <Input id="search" placeholder="Name, Firma oder Kontaktnummer" />
      </div>
    </div>
  )
}

/** Disabled, as inside a read-mode fieldset before "Bearbeiten" is pressed. */
export function Deaktiviert() {
  return (
    <div className="grid gap-2">
      <Label htmlFor="lastNameDisabled">Nachname</Label>
      <Input id="lastNameDisabled" defaultValue="Musterfrau" disabled />
    </div>
  )
}

/** Validation error: aria-invalid drives the red border and ring, with the
 *  message rendered below the field. */
export function Fehlerzustand() {
  return (
    <div className="grid gap-2">
      <Label htmlFor="email-error">E-Mail</Label>
      <Input id="email-error" type="email" defaultValue="max.mustermann@" aria-invalid="true" />
      <p className="text-sm text-destructive">Bitte eine gültige E-Mail-Adresse eingeben.</p>
    </div>
  )
}
