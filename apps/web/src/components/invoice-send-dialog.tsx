import { formatBerlinDateTime, unknownPlaceholders } from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Mail } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
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
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { invoiceSendDraftQueryOptions, invoiceSendsQueryOptions, sendInvoice } from '@/lib/mail'
import { strings } from '@/lib/strings'

/**
 * Sending a finalized invoice.
 *
 * The draft comes from the server with the placeholders already filled, so
 * what is on screen is what goes out. It stays editable — recipient included,
 * which is the difference to the test send, that has no recipient at all.
 */
export function InvoiceSendDialog({
  invoiceId,
  open,
  onOpenChange,
}: {
  invoiceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const formId = useId()
  const queryClient = useQueryClient()
  const draft = useQuery({ ...invoiceSendDraftQueryOptions(invoiceId), enabled: open })

  const [recipient, setRecipient] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  useEffect(() => {
    if (!draft.data) return
    setRecipient(draft.data.recipient ?? '')
    setSubject(draft.data.subject)
    setBody(draft.data.body)
  }, [draft.data])

  /**
   * Re-scanned on every keystroke rather than taken from the draft: the text
   * is editable, so one can be typed in here — and a `{{kontonummer}}` must be
   * noticed before it is sent, not by the recipient afterwards.
   */
  const unknown = [...new Set([...unknownPlaceholders(subject), ...unknownPlaceholders(body)])]

  const send = useMutation({
    mutationFn: () => sendInvoice(invoiceId, { recipient, subject, body }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
      if (result.ok) {
        toast.success(strings.mail.sent(result.recipient))
        onOpenChange(false)
      } else {
        // Not thrown: the attempt ran and is in the log. The server's answer
        // usually names the reason, and it belongs on screen.
        toast.error(`${strings.mail.sendFailed} ${result.error ?? ''}`)
      }
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : strings.error.generic),
  })

  const blocked = draft.data?.canSend === false
  const ready = recipient.trim() !== '' && subject.trim() !== '' && body.trim() !== ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{strings.mail.sendTitle}</DialogTitle>
          <DialogDescription>{strings.mail.sendDescription}</DialogDescription>
        </DialogHeader>

        {blocked && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            {draft.data?.blockedReason}
          </p>
        )}

        <div className="space-y-4">
          <div>
            <Label htmlFor={`${formId}-recipient`}>{strings.mail.recipient}</Label>
            <Input
              id={`${formId}-recipient`}
              type="email"
              className="mt-2"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
            <p className="mt-1 text-muted-foreground text-xs">{strings.mail.recipientHint}</p>
          </div>

          <div>
            <Label htmlFor={`${formId}-subject`}>{strings.mail.subject}</Label>
            <Input
              id={`${formId}-subject`}
              className="mt-2"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor={`${formId}-body`}>{strings.mail.body}</Label>
            <Textarea
              id={`${formId}-body`}
              rows={8}
              className="mt-2"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>

          {unknown.length > 0 && (
            <p className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {strings.mail.unknownPlaceholders(unknown)}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {strings.actions.cancel}
          </Button>
          <Button disabled={blocked || !ready || send.isPending} onClick={() => send.mutate()}>
            <Mail className="size-4" aria-hidden />
            {send.isPending ? strings.mail.sending : strings.mail.sendNow}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Every attempt on one invoice, newest first. Failures stay in the list —
 *  that is what makes a repeated send traceable. */
export function InvoiceSendHistory({ invoiceId }: { invoiceId: string }) {
  const sends = useQuery(invoiceSendsQueryOptions(invoiceId))
  const rows = sends.data ?? []

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{strings.mail.historyEmpty}</p>
  }

  return (
    <ul className="space-y-1 text-sm">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-muted-foreground">{formatBerlinDateTime(row.sentAt)}</span>
          <span>{row.recipient}</span>
          <span className={row.ok ? 'text-muted-foreground' : 'text-destructive'}>
            {row.ok ? strings.mail.historyOk : strings.mail.historyFailed}
          </span>
          {row.error && <span className="text-destructive text-xs">{row.error}</span>}
        </li>
      ))}
    </ul>
  )
}
