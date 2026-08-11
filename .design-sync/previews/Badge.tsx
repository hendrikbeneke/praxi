import { Badge } from '@/components/ui/badge'

export function Varianten() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Patient</Badge>
      <Badge variant="secondary">Archiviert</Badge>
      <Badge variant="destructive">Nicht dokumentiert</Badge>
      <Badge variant="outline">Interessent</Badge>
      <Badge variant="ghost">Kursteilnehmer</Badge>
      <Badge variant="link">Firmenkunde</Badge>
    </div>
  )
}

/** As used on a contact's role list and activity list: outline badges for
 *  roles, secondary for a settled state, destructive for something missing. */
export function ImKontext() {
  return (
    <div className="flex flex-col gap-3">
      <span className="flex flex-wrap items-center gap-1">
        <Badge variant="outline">Patient</Badge>
        <Badge variant="outline">Kursteilnehmer</Badge>
      </span>
      <span className="flex items-center gap-2">
        <span className="font-medium">Erika Musterfrau</span>
        <Badge variant="secondary">Archiviert</Badge>
      </span>
      <span className="flex items-center gap-2">
        <Badge variant="secondary">Dokumentiert</Badge>
        <Badge variant="destructive">Nicht dokumentiert</Badge>
      </span>
    </div>
  )
}
