import { useState } from 'react'
import { CheckboxField } from '@/components/catalogue-controls'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { strings } from '@/lib/strings'

/** Real shape: a create/edit dialog over a catalogue entry, ported from
 *  RoleTypeDialog in contact-type-settings.tsx. */
export function RolleAnlegen() {
  const [label, setLabel] = useState('')
  const [showAsTab, setShowAsTab] = useState(false)

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{strings.contactType.createRoleTitle}</DialogTitle>
          <DialogDescription>{strings.contactType.codeHint}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="dialog-preview-code">{strings.contactType.code}</Label>
            <Input id="dialog-preview-code" className="mt-2" placeholder="teilnehmer" />
          </div>
          <div>
            <Label htmlFor="dialog-preview-label">{strings.contactType.label}</Label>
            <Input
              id="dialog-preview-label"
              className="mt-2"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <CheckboxField
            id="dialog-preview-tab"
            label={strings.contactType.showAsTab}
            checked={showAsTab}
            onChange={setShowAsTab}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost">{strings.actions.cancel}</Button>
          <Button>{strings.actions.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
