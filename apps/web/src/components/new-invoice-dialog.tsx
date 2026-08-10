import { toBerlinDate } from '@praxi/shared'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { ContactPicker } from '@/components/contact-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { createInvoice } from '@/lib/invoices'
import { strings } from '@/lib/strings'

/**
 * Starting an invoice from the list instead of from a contact's record.
 *
 * The only thing missing on that way is the recipient, so that is all this
 * asks for — the draft is created empty and filled on its own page, where the
 * billable items are. Same call, same landing place; the record's button needs
 * no picker because there the contact is already known.
 *
 * There is nothing to read yet, so the field is editable from the start
 * (CLAUDE.md, read mode first).
 */
export function NewInvoiceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const fieldId = useId()
  const [contactId, setContactId] = useState<string | null>(null)

  useEffect(() => {
    if (open) setContactId(null)
  }, [open])

  const create = useMutation({
    mutationFn: (chosen: string) =>
      createInvoice({
        contactId: chosen,
        invoiceDate: toBerlinDate(new Date().toISOString()),
        activityItemIds: [],
      }),
    onSuccess: (draft) => {
      onOpenChange(false)
      toast.success(strings.invoice.created)
      void navigate({ to: '/invoices/$invoiceId', params: { invoiceId: draft.id } })
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.invoice.saveFailed)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{strings.invoice.create}</DialogTitle>
          <DialogDescription>{strings.invoice.createHint}</DialogDescription>
        </DialogHeader>

        <div>
          <Label htmlFor={fieldId}>{strings.invoice.contact}</Label>
          <ContactPicker
            inputId={fieldId}
            value={contactId}
            locked={false}
            onChange={setContactId}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {strings.actions.cancel}
          </Button>
          <Button
            type="button"
            disabled={contactId === null || create.isPending}
            onClick={() => {
              if (contactId !== null) create.mutate(contactId)
            }}
          >
            {strings.invoice.createConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
