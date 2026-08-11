import { ReadModeFieldset } from '@/components/read-mode-fieldset'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** The two fields this fixture composes, matching the "Name" section of the
 *  real Kontaktdetails form. */
function NameFelder() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="firstName">Vorname</Label>
        <Input id="firstName" defaultValue="Erika" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lastName">Nachname</Label>
        <Input id="lastName" defaultValue="Musterfrau" />
      </div>
    </div>
  )
}

/** Editing mode: `disabled={false}`, an ordinary editable form. This is the
 *  state a record enters only once "Bearbeiten" has been pressed. */
export function Bearbeitbar() {
  return (
    <ReadModeFieldset disabled={false} className="w-80">
      <NameFelder />
    </ReadModeFieldset>
  )
}

/** Read mode: `disabled={true}`, the default a record opens in (CLAUDE.md,
 *  "read mode first"). The browser fades every control inside the fieldset —
 *  that greyed-out look is the whole point of the component and is not
 *  fought here. */
export function Lesemodus() {
  return (
    <ReadModeFieldset disabled={true} className="w-80">
      <NameFelder />
    </ReadModeFieldset>
  )
}
