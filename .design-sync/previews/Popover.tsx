import { Pencil } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** The role editor from the contact header (`components/contact-header.tsx`):
 *  a ghost pencil button opens a small popover with one checkbox row per
 *  role type. Forced open (`defaultOpen`) so the card shows the content,
 *  not just the closed trigger. */
export function Rollenbearbeitung() {
  return (
    <div className="flex flex-wrap items-center gap-1 pt-24 pl-4">
      <Badge variant="outline">Patient</Badge>

      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Rollen bearbeiten">
            <Pencil className="size-3.5" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <p className="mb-3 font-medium text-foreground text-sm">Rollen</p>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Checkbox id="role-patient" checked />
              <Label htmlFor="role-patient" className="font-normal">
                Patient
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox id="role-kursteilnehmer" checked={false} />
              <Label htmlFor="role-kursteilnehmer" className="font-normal">
                Kursteilnehmer
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox id="role-interessent" checked={false} />
              <Label htmlFor="role-interessent" className="font-normal">
                Interessent
              </Label>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
