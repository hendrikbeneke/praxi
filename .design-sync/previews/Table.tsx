import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const rows = [
  {
    number: 118,
    name: 'Mustermann, Max',
    roles: ['Patient'],
    city: 'Köln',
    dateOfBirth: '04.11.1988',
    appointment: '12.08.2026 · 09:00',
    relative: 'morgen',
  },
  {
    number: 142,
    name: 'Musterfrau, Erika',
    roles: ['Patient', 'Kursteilnehmer'],
    city: 'Bonn',
    dateOfBirth: '21.02.1975',
    appointment: null,
    relative: null,
  },
  {
    number: 87,
    name: 'Beispiel GmbH',
    roles: ['Firmenkunde'],
    city: 'Düsseldorf',
    dateOfBirth: null,
    appointment: '12.08.2026 · 14:30',
    relative: 'morgen',
  },
]

/** Mirrors the Kontaktliste columns exactly: Nr., Name, Rollen, Ort,
 *  Geburtsdatum, Termin (the last only shown in the "Aktuell" order). */
export function Kontaktliste() {
  return (
    <div className="w-full max-w-3xl rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nr.</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Rollen</TableHead>
            <TableHead>Ort</TableHead>
            <TableHead>Geburtsdatum</TableHead>
            <TableHead>Termin</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.number}>
              <TableCell className="tabular-nums">{row.number}</TableCell>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell>
                <span className="flex flex-wrap gap-1">
                  {row.roles.map((role) => (
                    <Badge key={role} variant="outline">
                      {role}
                    </Badge>
                  ))}
                </span>
              </TableCell>
              <TableCell>{row.city}</TableCell>
              <TableCell className="tabular-nums">{row.dateOfBirth ?? '—'}</TableCell>
              <TableCell>
                {row.appointment ? (
                  <span className="flex flex-col">
                    <span className="tabular-nums">{row.appointment}</span>
                    <span className="text-muted-foreground text-xs">{row.relative}</span>
                  </span>
                ) : (
                  '—'
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
