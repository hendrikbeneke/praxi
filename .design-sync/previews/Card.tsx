import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/** As used on the contact detail page: a minimal section card, title plus
 *  content, no footer and no action — the shape used almost everywhere in
 *  this app. */
export function Abschnitt() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Kontakt</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <span>+49 30 1234567</span>
          <span>max.mustermann@praxi.invalid</span>
          <span>Musterstraße 12, 10115 Berlin</span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Name</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <span>Erika Musterfrau</span>
          <span className="text-muted-foreground">Kontaktnummer 0142</span>
        </CardContent>
      </Card>
    </div>
  )
}

/** The full card API: header with a description and a top-right action,
 *  body content and a footer action — not used yet in this app, but part of
 *  the real exported surface. */
export function VollstaendigeKarte() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Beispiel GmbH</CardTitle>
        <CardDescription>Firmenkunde seit 03.02.2025</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm">
            Bearbeiten
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        <span>+49 30 7654321</span>
        <span>buchhaltung@beispiel.test</span>
        <span>Beispielweg 4, 80331 München</span>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Rechnung erstellen</Button>
      </CardFooter>
    </Card>
  )
}
