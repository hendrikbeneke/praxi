import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

/** As used on a contact's role list: one row per role, ticked immediately
 *  without a save button. */
export function Rollen() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Checkbox id="role-patient" checked />
        <Label htmlFor="role-patient" className="font-normal">
          Patient
        </Label>
      </div>
      <div className="flex items-center gap-3">
        <Checkbox id="role-interessent" />
        <Label htmlFor="role-interessent" className="font-normal">
          Interessent
        </Label>
      </div>
      <div className="flex items-center gap-3">
        <Checkbox id="role-kursteilnehmer" disabled />
        <Label htmlFor="role-kursteilnehmer" className="font-normal">
          Kursteilnehmer
        </Label>
      </div>
    </div>
  )
}

/** As used above the contact list: a single filter checkbox toggling
 *  archived contacts in or out of view. */
export function ListenFilter() {
  return (
    <div className="flex items-center gap-3">
      <Checkbox id="show-archived" />
      <Label htmlFor="show-archived" className="font-normal">
        Archivierte anzeigen
      </Label>
    </div>
  )
}
