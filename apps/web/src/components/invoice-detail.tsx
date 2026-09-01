import {
  dueDate,
  formatBerlinDate,
  type Invoice,
  invoicePaymentState,
  type TextTemplate,
  toBerlinDate,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Ban, FileCheck2, FileText, Mail, Pencil, Wallet } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { DateField } from '@/components/date-field'
import {
  type DraftLine,
  InvoicePositions,
  lineFromStored,
  lineToInput,
} from '@/components/invoice-positions'
import { InvoiceSendDialog, InvoiceSendHistory } from '@/components/invoice-send-dialog'
import { DASH } from '@/components/list-card'
import { PaymentCard } from '@/components/payment-card'
import { PaymentStatusBadge } from '@/components/payment-status'
import { ReadValue } from '@/components/read-value'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  cancelInvoice,
  deleteInvoice,
  finalizeInvoice,
  invoiceRecipientsQueryOptions,
  numberRangeListQueryOptions,
  pdfUrl,
  previewUrl,
  textTemplateListQueryOptions,
  updateInvoice,
} from '@/lib/invoices'
import { strings } from '@/lib/strings'

/** "an den Kontakt selbst" — a `Select` needs a value for it, and null is not
 *  one. Chosen so it can never collide with a uuid. */
const RECIPIENT_SELF = 'self'

/**
 * One invoice, read or edited (L8).
 *
 * **One component, two containers**, the shape `ActivityDetail` established:
 * both invoice lists expand it inside the row that was clicked — the Zahlungen
 * page as well as the contact's Rechnungen tab since B3 — and
 * `/invoices/$invoiceId` is a thin page around the same thing. Three places
 * still lead to that route: a Vorgang's rail, the draft a collect from a
 * Vorgang produced, and the link between an invoice and its cancellation. What
 * must not exist is a second *rendering* of the record, because two screens
 * saying different things about an invoice is how a document gets issued that
 * nobody read.
 *
 * **Read mode renders no fields** (K2). This screen never had that pass: it
 * showed every value in a disabled input, so a finalized invoice — which can
 * never be edited by anyone — was a page of grey boxes promising an entry that
 * could not be made.
 */
export function InvoiceDetail({
  invoice,
  startEditing = false,
  onClose,
  onDiscarded,
}: {
  invoice: Invoice
  /** True where the way in meant "edit" — a freshly created draft. Every other
   *  way opens in read mode (CLAUDE.md, read mode first). */
  startEditing?: boolean
  /** Only where the detail is expanded inside a row. */
  onClose?: (() => void) | undefined
  /** A discarded draft has no record left to show. */
  onDiscarded?: (() => void) | undefined
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const formId = useId()

  const templates = useQuery(textTemplateListQueryOptions)
  const ranges = useQuery(numberRangeListQueryOptions)
  const recipients = useQuery(invoiceRecipientsQueryOptions(invoice.contactId))

  const [invoiceDate, setInvoiceDate] = useState(invoice.invoiceDate)
  const [paymentTermDays, setPaymentTermDays] = useState(invoice.paymentTermDays)
  const [recipientId, setRecipientId] = useState(invoice.recipientContactId ?? RECIPIENT_SELF)
  const [introText, setIntroText] = useState(invoice.introText ?? '')
  const [outroText, setOutroText] = useState(invoice.outroText ?? '')
  const [diagnosis, setDiagnosis] = useState(invoice.diagnosis ?? '')
  const [lines, setLines] = useState<DraftLine[]>(() => invoice.lines.map(lineFromStored))
  const [sendOpen, setSendOpen] = useState(false)
  const [editing, setEditing] = useState(startEditing)

  const isDraft = invoice.status === 'draft'
  const canEdit = isDraft && editing

  /** Only a finalized invoice can be cancelled — not a draft, which is
   *  discarded, and not a cancellation document (rule 9). */
  const canCancel =
    invoice.status === 'finalized' && invoice.type === 'invoice' && !invoice.cancelledByInvoiceId

  /**
   * Without a configured range there is no number to assign, so finalizing
   * cannot work. Said here rather than only in the settings: otherwise the
   * whole invoice gets built and the refusal arrives on the last click.
   */
  const hasNumberRange = (ranges.data ?? []).some((range) => range.code === 'invoice')
  const canFinalize = isDraft && hasNumberRange && !ranges.isPending

  /** Follow the stored record when it changes underneath — a save, a
   *  finalization, another tab. Not while editing, or a refetch would take the
   *  form away mid-sentence. */
  useEffect(() => {
    if (editing) return
    setInvoiceDate(invoice.invoiceDate)
    setPaymentTermDays(invoice.paymentTermDays)
    setRecipientId(invoice.recipientContactId ?? RECIPIENT_SELF)
    setIntroText(invoice.introText ?? '')
    setOutroText(invoice.outroText ?? '')
    setDiagnosis(invoice.diagnosis ?? '')
    setLines(invoice.lines.map(lineFromStored))
  }, [invoice, editing])

  /** Leaving edit mode without saving takes the stored invoice back. */
  function discardEdits() {
    setInvoiceDate(invoice.invoiceDate)
    setPaymentTermDays(invoice.paymentTermDays)
    setRecipientId(invoice.recipientContactId ?? RECIPIENT_SELF)
    setIntroText(invoice.introText ?? '')
    setOutroText(invoice.outroText ?? '')
    setDiagnosis(invoice.diagnosis ?? '')
    setLines(invoice.lines.map(lineFromStored))
    setEditing(false)
  }

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['invoices'] })
  }

  const save = useMutation({
    mutationFn: () =>
      updateInvoice(invoice.id, {
        invoiceDate,
        paymentTermDays,
        recipientContactId: recipientId === RECIPIENT_SELF ? null : recipientId,
        introText: introText.trim() === '' ? null : introText.trim(),
        outroText: outroText.trim() === '' ? null : outroText.trim(),
        diagnosis: diagnosis.trim() === '' ? null : diagnosis.trim(),
        lines: lines.map(lineToInput),
      }),
    onSuccess: async () => {
      setEditing(false)
      await invalidate()
      await queryClient.invalidateQueries({ queryKey: ['activities'] })
      toast.success(strings.invoice.saved)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.invoice.saveFailed)
    },
  })

  const cancel = useMutation({
    mutationFn: () => cancelInvoice(invoice.id),
    onSuccess: async (cancellation) => {
      await invalidate()
      await queryClient.invalidateQueries({ queryKey: ['activities'] })
      toast.success(strings.invoice.cancelled)
      // Straight to the new document: that is what one wants to look at, and
      // it is the thing that was just issued.
      void navigate({ to: '/invoices/$invoiceId', params: { invoiceId: cancellation.id } })
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : strings.invoice.cancelFailed),
  })

  /**
   * Finalizing, with or without settling in the same transaction. One mutation
   * for both, because it is one operation on the server too.
   *
   * It is offered in read mode only, which is what lets it be a single call:
   * finalizing snapshots what is *stored*, so as long as the screen could
   * differ from that it had to save first and swallow that save's message.
   */
  const finalize = useMutation({
    mutationFn: (settle: boolean) => finalizeInvoice(invoice.id, settle),
    onSuccess: async (result, settle) => {
      await invalidate()
      await queryClient.invalidateQueries({ queryKey: ['receivables'] })
      await queryClient.invalidateQueries({ queryKey: ['activities'] })

      if (!settle) {
        toast.success(strings.invoice.finalized)
      } else if (result.paidTemplateUsed) {
        toast.success(strings.payment.settled)
      } else {
        toast.warning(strings.payment.settledWithoutTemplate, { duration: 12_000 })
      }
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.invoice.finalizeFailed)
    },
  })

  const discard = useMutation({
    mutationFn: () => deleteInvoice(invoice.id),
    onSuccess: async () => {
      await invalidate()
      await queryClient.invalidateQueries({ queryKey: ['activities'] })
      toast.success(strings.invoice.discarded)
      onDiscarded?.()
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.error.generic)
    },
  })

  function insertTemplate(template: TextTemplate) {
    if (template.kind === 'intro') setIntroText(template.body)
    else setOutroText(template.body)
  }

  const state = invoicePaymentState(
    invoice,
    invoice.paidCents,
    toBerlinDate(new Date().toISOString()),
  )
  const recipientOptions = recipients.data ?? []
  const recipientLabel =
    invoice.recipientSnapshot?.name ??
    recipientOptions.find((entry) => entry.id === invoice.recipientContactId)?.name ??
    invoice.contactName

  return (
    <div className="@container space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="font-semibold">
            {invoice.number
              ? `${strings.invoice.types[invoice.type]} ${invoice.number}`
              : strings.invoice.create}
          </span>
          {isDraft ? (
            <span className="text-[13px] text-muted-foreground">
              {strings.invoice.draftPending}
            </span>
          ) : (
            <Badge variant="secondary">{strings.invoice.statuses[invoice.status]}</Badge>
          )}
        </p>

        {/*
          The design writes the number this invoice would get after
          finalization. It is not written here, and the reason has a history:
          the number range once previewed `2026-0001` — a number stored
          nowhere — and the absence surfaced on finalizing. Two drafts make it
          wrong the same way, because whichever is finalized first takes the
          value. So the sentence says what happens, without the figure one
          would go on to believe.
        */}
        {isDraft && (
          <span className="text-[13px] text-muted-foreground">
            {strings.invoice.numberOnFinalize}
          </span>
        )}
      </div>

      <CancellationLink invoice={invoice} />

      {canEdit ? (
        <>
          <div className="grid gap-4 @2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <Label htmlFor={`${formId}-recipient`}>{strings.invoice.recipient}</Label>
              {recipientOptions.length > 0 ? (
                <Select value={recipientId} onValueChange={setRecipientId}>
                  <SelectTrigger id={`${formId}-recipient`} className="mt-2 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={RECIPIENT_SELF}>{invoice.contactName}</SelectItem>
                    {recipientOptions.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.name}
                        <span className="text-muted-foreground"> · {entry.relationLabel}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                /* No relation, so there is nothing to choose between. The name
                   stands as text rather than as a dropdown of one, and the
                   sentence under it says where a second option would come
                   from — otherwise the field looks broken. */
                <>
                  <ReadValue>{invoice.contactName}</ReadValue>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {strings.invoice.recipientHint}
                  </p>
                </>
              )}
            </div>

            <div>
              <Label htmlFor={`${formId}-date`}>{strings.invoice.invoiceDate}</Label>
              <DateField
                id={`${formId}-date`}
                className="mt-2"
                value={invoiceDate}
                onChange={setInvoiceDate}
              />
            </div>

            <div>
              <Label htmlFor={`${formId}-term`}>{strings.invoice.paymentTermDays}</Label>
              <Input
                id={`${formId}-term`}
                type="number"
                min={0}
                max={365}
                className="mt-2"
                value={paymentTermDays}
                onChange={(event) => setPaymentTermDays(Number(event.target.value) || 0)}
              />
              <p className="mt-1 text-[12.5px] text-muted-foreground tabular-nums">
                {invoiceDate
                  ? `${strings.invoice.dueDate} ${formatBerlinDate(`${dueDate(invoiceDate, paymentTermDays)}T12:00:00Z`)}`
                  : DASH}
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor={`${formId}-diagnosis`}>{strings.invoice.diagnosis}</Label>
            <Input
              id={`${formId}-diagnosis`}
              className="mt-2"
              value={diagnosis}
              onChange={(event) => setDiagnosis(event.target.value)}
            />
            <p className="mt-1 text-muted-foreground text-xs">{strings.invoice.diagnosisHint}</p>
          </div>

          <TextBlock
            id={`${formId}-intro`}
            label={strings.invoice.introText}
            value={introText}
            onChange={setIntroText}
            editing
            templates={(templates.data ?? []).filter((t) => t.kind === 'intro' && t.active)}
            onInsert={insertTemplate}
          />

          <InvoicePositions
            contactId={invoice.contactId}
            lines={lines}
            setLines={setLines}
            editing
            invoiceDate={invoiceDate}
          />

          <TextBlock
            id={`${formId}-outro`}
            label={strings.invoice.outroText}
            value={outroText}
            onChange={setOutroText}
            editing
            templates={(templates.data ?? []).filter((t) => t.kind === 'outro' && t.active)}
            onInsert={insertTemplate}
          />
        </>
      ) : (
        /**
         * **Read mode is the document, not the form with its fields taken
         * out.** What one opens a finalized invoice for is what it says — the
         * texts, the positions, the amount — and the facts about it stand
         * beside it in a rail, the way they do on a Vorgang. Laying the form
         * out again with the values as text would put "Zahlungsziel in Tagen"
         * in the middle of what reads as a letter.
         */
        <div className="grid gap-8 @2xl:grid-cols-[minmax(0,1fr)_250px]">
          <div className="space-y-5">
            {invoice.introText && (
              <p className="whitespace-pre-wrap text-sm">{invoice.introText}</p>
            )}

            <InvoicePositions
              contactId={invoice.contactId}
              lines={lines}
              setLines={setLines}
              editing={false}
              invoiceDate={invoiceDate}
            />

            {invoice.outroText && (
              <p className="whitespace-pre-wrap text-muted-foreground text-sm">
                {invoice.outroText}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4 @2xl:border-l @2xl:pl-6">
            <Rail label={strings.invoice.recipient}>
              <span>{recipientLabel}</span>
            </Rail>

            <Rail label={strings.invoice.types[invoice.type]}>
              <span className="tabular-nums">
                {invoice.number
                  ? `${invoice.number} · ${formatBerlinDate(`${invoice.invoiceDate}T12:00:00Z`)}`
                  : formatBerlinDate(`${invoice.invoiceDate}T12:00:00Z`)}
              </span>
              <span className="text-muted-foreground text-sm tabular-nums">
                {strings.invoice.paymentTermDaysValue(invoice.paymentTermDays)} ·{' '}
                {strings.invoice.dueDate.toLowerCase()}{' '}
                {formatBerlinDate(
                  `${dueDate(invoice.invoiceDate, invoice.paymentTermDays)}T12:00:00Z`,
                )}
              </span>
              {invoice.diagnosis && (
                <span className="text-muted-foreground text-sm">
                  {strings.invoice.diagnosis} {invoice.diagnosis}
                </span>
              )}
            </Rail>

            <Rail label={strings.catalogue.statusColumn}>
              {isDraft ? (
                <span>{strings.invoice.statuses.draft}</span>
              ) : (
                <>
                  <PaymentStatusBadge state={state} />
                  {invoice.lastPaidOn && (
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {strings.invoice.paidOn(formatBerlinDate(`${invoice.lastPaidOn}T12:00:00Z`))}
                    </span>
                  )}
                </>
              )}
            </Rail>
          </div>
        </div>
      )}

      {/* Only on a document: a draft is not a claim, and the server refuses a
          payment against one twice over. */}
      {!isDraft && (
        <>
          <PaymentCard invoice={invoice} />
          <section>
            <p className="font-medium text-sm">{strings.mail.history}</p>
            <div className="mt-2">
              <InvoiceSendHistory invoiceId={invoice.id} />
            </div>
          </section>
        </>
      )}

      {isDraft && !hasNumberRange && !ranges.isPending && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          {strings.invoice.numberRangeMissing}{' '}
          <Link className="underline underline-offset-2" to="/settings">
            {strings.nav.settings}
          </Link>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {/* Read mode only. The preview renders what is *stored*, and while the
            draft is being edited that is not what stands on screen — an empty
            preview beside a filled form is the confusing part, not the missing
            button. */}
        {!canEdit && (
          <Button variant="ghost" asChild>
            <a
              href={isDraft ? previewUrl(invoice.id) : pdfUrl(invoice.id)}
              target="_blank"
              rel="noreferrer"
            >
              <FileText className="size-4" aria-hidden />
              {isDraft ? strings.invoice.preview : strings.invoice.download}
            </a>
          </Button>
        )}

        {!isDraft && (
          <>
            <PaymentStatusBadge state={state} />
            {/* Sending is never automatic and never part of finalizing — it is
                its own action, and only on a document. */}
            <Button variant="ghost" onClick={() => setSendOpen(true)}>
              <Mail className="size-4" aria-hidden />
              {strings.mail.send}
            </Button>
          </>
        )}

        <span className="ml-auto flex flex-wrap items-center gap-2">
          {canEdit ? (
            <>
              <Button variant="ghost" onClick={discardEdits} disabled={save.isPending}>
                {strings.actions.cancel}
              </Button>
              <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? strings.invoice.saving : strings.invoice.saveDraft}
              </Button>
              <FinalizeButtons
                disabled={finalize.isPending || lines.length === 0 || !canFinalize}
                onFinalize={(settle) => {
                  // Save first, then issue: finalizing works on what is stored,
                  // and in edit mode the screen may hold more than that.
                  save.mutate(undefined, { onSuccess: () => finalize.mutate(settle) })
                }}
              />
            </>
          ) : (
            <>
              {canCancel && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" disabled={cancel.isPending}>
                      <Ban className="size-4" aria-hidden />
                      {strings.invoice.cancel}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{strings.invoice.cancelTitle}</AlertDialogTitle>
                      <AlertDialogDescription>{strings.invoice.cancelBody}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{strings.actions.back}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => cancel.mutate()}>
                        {strings.invoice.cancelConfirm}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {isDraft && (
                <>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        disabled={discard.isPending}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        {strings.invoice.discard}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{strings.invoice.discardTitle}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {strings.invoice.discardBody}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{strings.actions.back}</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => discard.mutate()}>
                          {strings.invoice.discard}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <FinalizeButtons
                    disabled={finalize.isPending || invoice.lines.length === 0 || !canFinalize}
                    onFinalize={(settle) => finalize.mutate(settle)}
                  />
                </>
              )}

              {onClose && (
                <Button variant="ghost" onClick={onClose}>
                  {strings.activity.close}
                </Button>
              )}

              {isDraft && (
                <Button onClick={() => setEditing(true)}>
                  <Pencil className="size-4" aria-hidden />
                  {strings.actions.edit}
                </Button>
              )}
            </>
          )}
        </span>
      </div>

      <InvoiceSendDialog invoiceId={invoice.id} open={sendOpen} onOpenChange={setSendOpen} />
    </div>
  )
}

/** One labelled block of the right-hand rail — the same shape the Vorgang
 *  detail uses, so the two records read alike. */
function Rail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      {children}
    </div>
  )
}

/** "Rechnung festschreiben" and "Betrag erhalten" — the second is the card put
 *  through right after the session: one transaction that finalizes, records
 *  the payment and picks the outro for an invoice that is already settled
 *  (rule 9). */
function FinalizeButtons({
  disabled,
  onFinalize,
}: {
  disabled: boolean
  onFinalize: (settle: boolean) => void
}) {
  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" disabled={disabled}>
            <Wallet className="size-4" aria-hidden />
            {strings.payment.settle}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.payment.settleTitle}</AlertDialogTitle>
            <AlertDialogDescription>{strings.payment.settleBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.actions.back}</AlertDialogCancel>
            <AlertDialogAction onClick={() => onFinalize(true)}>
              {strings.payment.settleConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={disabled}>
            <FileCheck2 className="size-4" aria-hidden />
            {strings.invoice.finalize}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.invoice.finalizeTitle}</AlertDialogTitle>
            <AlertDialogDescription>{strings.invoice.finalizeBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.actions.back}</AlertDialogCancel>
            <AlertDialogAction onClick={() => onFinalize(false)}>
              {strings.invoice.finalizeConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function TextBlock({
  id,
  label,
  value,
  onChange,
  editing,
  templates,
  onInsert,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  editing: boolean
  templates: TextTemplate[]
  onInsert: (template: TextTemplate) => void
}) {
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={editing ? id : undefined}>{label}</Label>
        {editing && templates.length > 0 && (
          <Select
            key={value}
            onValueChange={(templateId) => {
              const template = templates.find((entry) => entry.id === templateId)
              if (template) onInsert(template)
            }}
          >
            <SelectTrigger className="w-64" size="sm">
              <SelectValue placeholder={strings.invoice.insertTemplate} />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {editing ? (
        <>
          <Textarea
            id={id}
            rows={3}
            className="mt-2"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <p className="mt-1 text-muted-foreground text-xs">{strings.invoice.textHint}</p>
        </>
      ) : (
        <ReadValue className="whitespace-pre-wrap">{value === '' ? null : value}</ReadValue>
      )}
    </section>
  )
}

/** The other end of a cancellation, from whichever side is open. */
function CancellationLink({ invoice }: { invoice: Invoice }) {
  const target = invoice.cancelledByInvoiceId ?? invoice.cancelsInvoiceId
  const number = invoice.cancelledByInvoiceNumber ?? invoice.cancelsInvoiceNumber
  if (!target || !number) return null

  const label = invoice.cancelledByInvoiceId ? strings.invoice.cancelledBy : strings.invoice.cancels

  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{label} </span>
      <Link
        className="underline underline-offset-2"
        to="/invoices/$invoiceId"
        params={{ invoiceId: target }}
      >
        {number}
      </Link>
    </p>
  )
}
