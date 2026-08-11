import { useState } from 'react'
import { TimeField } from '@/components/time-field'
import { Label } from '@/components/ui/label'

export function Ausgefuellt() {
  const [value, setValue] = useState('09:30')
  return (
    <div>
      <Label htmlFor="preview-time-filled">Uhrzeit</Label>
      <TimeField id="preview-time-filled" className="mt-2" value={value} onChange={setValue} />
    </div>
  )
}

export function Leer() {
  const [value, setValue] = useState('')
  return (
    <div>
      <Label htmlFor="preview-time-empty">Uhrzeit</Label>
      <TimeField id="preview-time-empty" className="mt-2" value={value} onChange={setValue} />
    </div>
  )
}
