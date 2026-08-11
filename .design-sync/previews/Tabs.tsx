import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/** The six-tab navigation on the contact detail screen
 *  (`routes/_app/contacts.$contactId.tsx`), shown with "Übersicht" active. */
export function Kontaktreiter() {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Übersicht</TabsTrigger>
        <TabsTrigger value="master">Stammdaten</TabsTrigger>
        <TabsTrigger value="notes">Notizen</TabsTrigger>
        <TabsTrigger value="activities">Vorgänge</TabsTrigger>
        <TabsTrigger value="appointments">Termine</TabsTrigger>
        <TabsTrigger value="invoices">Rechnungen</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="pt-6">
        <p className="text-muted-foreground text-sm">Inhalt des Tabs Übersicht</p>
      </TabsContent>
      <TabsContent value="master" className="pt-6">
        <p className="text-muted-foreground text-sm">Inhalt des Tabs Stammdaten</p>
      </TabsContent>
      <TabsContent value="notes" className="pt-6">
        <p className="text-muted-foreground text-sm">Inhalt des Tabs Notizen</p>
      </TabsContent>
      <TabsContent value="activities" className="pt-6">
        <p className="text-muted-foreground text-sm">Inhalt des Tabs Vorgänge</p>
      </TabsContent>
      <TabsContent value="appointments" className="pt-6">
        <p className="text-muted-foreground text-sm">Inhalt des Tabs Termine</p>
      </TabsContent>
      <TabsContent value="invoices" className="pt-6">
        <p className="text-muted-foreground text-sm">Inhalt des Tabs Rechnungen</p>
      </TabsContent>
    </Tabs>
  )
}
