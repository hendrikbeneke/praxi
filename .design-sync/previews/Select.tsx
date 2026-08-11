import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** Forced open (`defaultOpen`) so the card shows the dropdown content, not
 *  just the closed trigger — the state that actually needs a design check. */
export function Geoeffnet() {
  return (
    <div className="w-56">
      <Select defaultOpen value="patient">
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="patient">Patient</SelectItem>
          <SelectItem value="interessent">Interessent</SelectItem>
          <SelectItem value="kursteilnehmer">Kursteilnehmer</SelectItem>
          <SelectItem value="firmenkunde">Firmenkunde</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

export function Geschlossen() {
  return (
    <div className="w-56">
      <Select value="female">
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Keine Angabe</SelectItem>
          <SelectItem value="female">weiblich</SelectItem>
          <SelectItem value="male">männlich</SelectItem>
          <SelectItem value="diverse">divers</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
