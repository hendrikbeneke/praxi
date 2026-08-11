import { formatBerlinDateTime, invoiceSendInputSchema, unknownPlaceholders } from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Mail } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import {
  emailTemplateListQueryOptions,
  invoiceSendDraftQueryOptions,
  invoiceSendsQueryOptions,
  sendInvoice,
} from '@/lib/mail'
import { strings } from '@/lib/strings'

/** Whether the field holds something that can be sent to — the *same* schema
 *  the server validates the send with, so the button and the API cannot
 *  disagree about what an address is. */
function validAddress(value: string): boolean {
  return invoiceSendInputSchema.shape.recipient.safeParse(value.trim()).success
}

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

  /** Undefined means "whichever is the default" — the server decides, and the
   *  answer says which one it took. */
  const [templateId, setTemplateId] = useState<string | undefined>()
  const draft = useQuery({ ...invoiceSendDraftQueryOptions(invoiceId, templateId), enabled: open })
  const templates = useQuery({ ...emailTemplateListQueryOptions, enabled: open })

  const [recipient, setRecipient] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  /** Set when a template was switched to but its text was not taken over,
   *  because the practitioner had already written their own. */
  const [notReplaced, setNotReplaced] = useState(false)

  /**
   * Whether subject or body have been typed in since the last time a template
   * filled them. It is the question the activity dialog asks before applying a
   * type's presets, and the answer is the same: do not overwrite silently —
   * say so, and offer taking it over as an action with a name.
   *
   * A ref rather than state, and set by the change handlers rather than
   * compared after the fact: the effect below must not depend on the very
   * fields it writes into, or it would fight with typing.
   */
  const edited = useRef(false)

  // A fresh dialog starts over: the template choice of a previous invoice must
  // not survive into this one.
  useEffect(() => {
    if (open) return
    setTemplateId(undefined)
    setNotReplaced(false)
    edited.current = false
  }, [open])

  const applyDraft = useCallback((next: { subject: string; body: string }) => {
    setSubject(next.subject)
    setBody(next.body)
    edited.current = false
    setNotReplaced(false)
  }, [])

  useEffect(() => {
    const data = draft.data
    if (!data) return

    // An address typed in by hand survives a change of template.
    setRecipient((current) => (current === '' ? (data.recipient ?? '') : current))

    if (edited.current) setNotReplaced(true)
    else applyDraft(data)
  }, [draft.data, applyDraft])

  /**
   * Re-scanned on every keystroke rather than taken from the draft: the text
   * is editable, so one can be typed in here — and a `{{kontonummer}}` must be
   * noticed before it is sent, not by the recipient afterwards.
   */
  const unknown = [...new Set([...unknownPlaceholders(subject), ...unknownPlaceholders(body)])]

  const send = useMutation({
    mutationFn: () => sendInvoice(invoiceId, { recipient: recipient.trim(), subject, body }),
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

  /**
   * Blocked is only what typing cannot mend — a draft invoice, no SMTP
   * account. Everything else hangs on **what is in the fields right now**: a
   * button disabled because the contact had no address would still be disabled
   * after one was typed in, which is a screen insisting on a state that no
   * longer exists.
   */
  const blocked = draft.data?.canSend === false
  const recipientOk = validAddress(recipient)
  const ready = recipientOk && subject.trim() !== '' && body.trim() !== ''

  const selectable = (templates.data ?? []).filter((entry) => entry.active)
  const chosenTemplate = templateId ?? draft.data?.templateId ?? undefined

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
            {/* Explains why the field opened empty, and nothing more — so it
                goes as soon as an address stands in it. */}
            {draft.data?.recipientAddressMissing && !recipientOk ? (
              <p className="mt-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
                {strings.mail.noRecipientAddress}
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground text-xs">{strings.mail.recipientHint}</p>
            )}
          </div>

          {/* Always shown, even with a single template: which covering note is
              in force should be readable, not guessed from the text. */}
          {selectable.length > 0 && (
            <div>
              <Label htmlFor={`${formId}-template`}>{strings.mail.template}</Label>
              <Select
                value={chosenTemplate}
                onValueChange={(value) => {
                  setTemplateId(value)
                  setNotReplaced(false)
                }}
              >
                <SelectTrigger id={`${formId}-template`} className="mt-2 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectable.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {notReplaced && (
                <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-dashed px-3 py-2">
                  <span className="text-muted-foreground text-sm">
                    {strings.mail.templateChanged}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => draft.data && applyDraft(draft.data)}
                  >
                    {strings.mail.templateApply}
                  </Button>
                </div>
              )}
            </div>
          )}

          {draft.data?.templateMissing && (
            <p className="text-muted-foreground text-sm">{strings.mail.noTemplate}</p>
          )}

          <div>
            <Label htmlFor={`${formId}-subject`}>{strings.mail.subject}</Label>
            <Input
              id={`${formId}-subject`}
              className="mt-2"
              value={subject}
              onChange={(event) => {
                edited.current = true
                setSubject(event.target.value)
              }}
            />
          </div>

          <div>
            <Label htmlFor={`${formId}-body`}>{strings.mail.body}</Label>
            <Textarea
              id={`${formId}-body`}
              rows={8}
              className="mt-2"
              value={body}
              onChange={(event) => {
                edited.current = true
                setBody(event.target.value)
              }}
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
