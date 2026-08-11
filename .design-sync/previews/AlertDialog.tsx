import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

/** The archive confirmation from the contact detail screen
 *  (`routes/_app/contacts.$contactId.tsx`): archiving is a soft delete, so
 *  the description says plainly that nothing is deleted. Forced open
 *  (`defaultOpen`) so the card shows the dialog content, not just the
 *  closed trigger. */
export function KontaktArchivieren() {
  return (
    <AlertDialog defaultOpen>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Archivieren</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kontakt archivieren?</AlertDialogTitle>
          <AlertDialogDescription>
            Der Kontakt verschwindet aus der Liste, bleibt aber erhalten und kann jederzeit
            wiederhergestellt werden. Gelöscht wird nichts.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction>Archivieren</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
