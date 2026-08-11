import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** As used above every form field: bold, above the control it names. */
export function FeldBeschriftung() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lastName">Nachname</Label>
        <Input id="lastName" defaultValue="Mustermann" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" defaultValue="max.mustermann@praxi.invalid" />
      </div>
    </div>
  )
}

/** As used next to a checkbox: lighter weight, on the same line rather than
 *  above the control. */
export function NebenCheckbox() {
  return (
    <div className="flex items-center gap-3">
      <Checkbox id="role-patient" checked />
      <Label htmlFor="role-patient" className="font-normal">
        Patient
      </Label>
    </div>
  )
}
