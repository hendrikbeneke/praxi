import { useState } from 'react'

import { DateField } from '@/components/date-field'
import { Label } from '@/components/ui/label'

/** Empty state: no date entered yet. This is a controlled component, so the
 *  preview holds its own state exactly like a real form would. */
export function Leer() {
  const [value, setValue] = useState('')
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="dateOfBirth">Geburtsdatum</Label>
      <DateField id="dateOfBirth" value={value} onChange={setValue} twoDigitYear="past" />
    </div>
  )
}

/** Filled with a real date — the field's most common use, the date of birth
 *  on a contact of kind "person". Renders closed: the calendar popover only
 *  opens on click, and the closed input plus button is the correct default. */
export function Ausgefuellt() {
  const [value, setValue] = useState('1988-11-04')
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="dateOfBirthFilled">Geburtsdatum</Label>
      <DateField
        id="dateOfBirthFilled"
        value={value}
        onChange={setValue}
        twoDigitYear="past"
      />
    </div>
  )
}
