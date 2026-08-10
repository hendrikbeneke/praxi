import {
  activityLabel,
  activityTypeLabel,
  dueDate,
  formatBerlinDate,
  formatEuro,
  formatEuroAmount,
  type Invoice,
  type InvoiceLineInput,
  parseEuroAmount,
  sumLines,
  type TextTemplate,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Ban,
  FileCheck2,
  FileText,
  Mail,
  Pencil,
  Plus,
  Wallet,
  X,
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { InvoiceSendDialog, InvoiceSendHistory } from '@/components/invoice-send-dialog'
import { PageHeader } from '@/components/page-header'
import { PaymentCard } from '@/components/payment-card'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { ApiError } from '@/lib/api'
import {
  billableQueryOptions,
  cancelInvoice,
  deleteInvoice,
  finalizeInvoice,
  invoiceQueryOptions,
  numberRangeListQueryOptions,
  pdfUrl,
  previewUrl,
  textTemplateListQueryOptions,
  updateInvoice,
} from '@/lib/invoices'
import { strings } from '@/lib/strings'

export const Route = createFileRoute('/_app/invoices/$invoiceId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(invoiceQueryOptions(params.invoiceId)),
  component: InvoiceDetailPage,
})

function formatDate(date: string): string {
  return formatBerlinDate(`${date}T12:00:00Z`)
}

/** A line while it is being edited. Prices are text so a half-typed amount
 *  does not snap back to a number on every keystroke. */
type DraftLine = {
  key: string
  id?: string
  activityItemId: string | null
  description: string
  feeCode: string
  dateOfService: string
  quantity: number
  priceText: string
}

let keyCounter = 0
function nextKey(): string {
  keyCounter += 1
  return `line-${keyCounter}`
}

function fromStored(line: Invoice['lines'][number]): DraftLine {
  return {
    key: nextKey(),
    id: line.id,
    activityItemId: line.activityItemId,
    description: line.description,
    feeCode: line.feeCode ?? '',
    dateOfService: line.dateOfService ?? '',
    quantity: line.quantity,
    priceText: formatEuroAmount(line.unitPriceCents),
  }
}

function toInput(line: DraftLine): InvoiceLineInput {
  return {
    ...(line.id ? { id: line.id } : {}),
    activityItemId: line.activityItemId,
    description: line.description.trim(),
    feeCode: line.feeCode.trim() === '' ? null : line.feeCode.trim(),
    dateOfService: line.dateOfService === '' ? null : line.dateOfService,
    quantity: line.quantity,
    unitPriceCents: parseEuroAmount(line.priceText) ?? 0,
  }
}

function InvoiceDetailPage() {
  const { invoiceId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: invoice } = useQuery(invoiceQueryOptions(invoiceId))
  const templates = useQuery(textTemplateListQueryOptions)
  const ranges = useQuery(numberRangeListQueryOptions)
  const formId = useId()

  const [invoiceDate, setInvoiceDate] = useState('')
  const [paymentTermDays, setPaymentTermDays] = useState(14)
  const [introText, setIntroText] = useState('')
  const [outroText, setOutroText] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [sendOpen, setSendOpen] = useState(false)
  /**
   * A draft opens in read mode and editing is a deliberate step, like every
   * other detail view (CLAUDE.md, read mode first). It is also what makes the
   * preview honest: in read mode what is on screen *is* what is stored, so the
   * document cannot show something else than the page.
   */
  const [editing, setEditing] = useState(false)

  const isDraft = invoice?.status === 'draft'
  /** A finalized invoice is immutable, so only a draft can ever get here. */
  const canEdit = isDraft && editing
  /** Only a finalized invoice can be cancelled — not a draft, which is
   *  discarded, and not a cancellation document (rule 9). */
  const canCancel =
    invoice?.status === 'finalized' && invoice.type === 'invoice' && !invoice.cancelledByInvoiceId
  /**
   * Without a configured range there is no number to assign, so finalizing
   * cannot work. Said here rather than only in the settings: otherwise the
   * whole invoice gets built and the refusal arrives on the last click.
   */
  const hasNumberRange = (ranges.data ?? []).some((range) => range.code === 'invoice')
  const canFinalize = isDraft && hasNumberRange && !ranges.isPending

  useEffect(() => {
    if (!invoice) return
    setInvoiceDate(invoice.invoiceDate)
    setPaymentTermDays(invoice.paymentTermDays)
    setIntroText(invoice.introText ?? '')
    setOutroText(invoice.outroText ?? '')
    setLines(invoice.lines.map(fromStored))
  }, [invoice])

  /** Leaving edit mode without saving takes the stored invoice back. */
  function discardEdits() {
    if (!invoice) return
    setInvoiceDate(invoice.invoiceDate)
    setPaymentTermDays(invoice.paymentTermDays)
    setIntroText(invoice.introText ?? '')
    setOutroText(invoice.outroText ?? '')
    setLines(invoice.lines.map(fromStored))
    setEditing(false)
  }

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['invoices'] })
  }

  const save = useMutation({
    mutationFn: () =>
      updateInvoice(invoiceId, {
        invoiceDate,
        paymentTermDays,
        introText: introText.trim() === '' ? null : introText.trim(),
        outroText: outroText.trim() === '' ? null : outroText.trim(),
        lines: lines.map(toInput),
      }),
    onSuccess: async () => {
      setEditing(false)
      await invalidate()
      toast.success(strings.invoice.saved)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.invoice.saveFailed)
    },
  })

  const cancel = useMutation({
    mutationFn: () => cancelInvoice(invoiceId),
    onSuccess: async (cancellation) => {
      await invalidate()
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
   * It is offered in read mode only, which is what lets it be a single call.
   * Finalizing snapshots what is *stored*, so as long as the screen could
   * differ from that it had to save first and swallow the success message of
   * that save; that detour went with the edit step.
   *
   * When the invoice was settled but no "already paid" outro block exists, the
   * document still asks for payment — that is said here, once, rather than
   * being discovered on the copy months later.
   */
  const finalize = useMutation({
    mutationFn: (settle: boolean) => finalizeInvoice(invoiceId, settle),
    onSuccess: async (result, settle) => {
      await invalidate()
      await queryClient.invalidateQueries({ queryKey: ['receivables'] })

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
    mutationFn: () => deleteInvoice(invoiceId),
    onSuccess: async () => {
      await invalidate()
      toast.success(strings.invoice.discarded)
      void navigate({ to: '/invoices' })
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.error.generic)
    },
  })

  if (!invoice) return <p className="text-muted-foreground text-sm">{strings.status.loading}</p>

  const total = sumLines(lines.map(toInput))

  function patch(index: number, change: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line, position) => (position === index ? { ...line, ...change } : line)),
    )
  }

  function move(index: number, by: number) {
    setLines((current) => {
      const next = [...current]
      const moved = next[index]
      const displaced = next[index + by]
      if (!moved || !displaced) return current
      next[index] = displaced
      next[index + by] = moved
      return next
    })
  }

  function insertTemplate(template: TextTemplate) {
    if (template.kind === 'intro') setIntroText(template.body)
    else setOutroText(template.body)
  }

  return (
    <>
      <PageHeader
        title={`${strings.invoice.types[invoice.type]} ${invoice.number ?? ''}`.trim()}
        description={invoice.contactName}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isDraft ? 'outline' : 'secondary'}>
              {strings.invoice.statuses[invoice.status]}
            </Badge>

            {canCancel && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={cancel.isPending}>
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
                    <AlertDialogAction onClick={() => cancel.mutate()}>
                      {strings.invoice.cancelConfirm}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* Sending is never automatic and never part of finalizing — it
                is its own action, and only on a document. */}
            {!isDraft && (
              <Button variant="outline" onClick={() => setSendOpen(true)}>
                <Mail className="size-4" aria-hidden />
                {strings.mail.send}
              </Button>
            )}

            {/* Read mode only. The preview renders what is stored, and while
                the draft is being edited that is not what stands on screen —
                an empty preview beside a filled form is the confusing part,
                not the missing button. */}
            {!canEdit && (
              <Button variant="outline" asChild>
                <a
                  href={isDraft ? previewUrl(invoiceId) : pdfUrl(invoiceId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText className="size-4" aria-hidden />
                  {isDraft ? strings.invoice.preview : strings.invoice.download}
                </a>
              </Button>
            )}

            <Button variant="ghost" asChild>
              <Link to="/invoices">
                <ArrowLeft className="size-4" aria-hidden />
                {strings.actions.back}
              </Link>
            </Button>
          </div>
        }
      />

      {/* The other end of the cancellation, from whichever side is open. */}
      <CancellationLink invoice={invoice} />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <Label htmlFor={`${formId}-date`}>{strings.invoice.invoiceDate}</Label>
            <Input
              id={`${formId}-date`}
              type="date"
              className="mt-2"
              disabled={!canEdit}
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
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
              disabled={!canEdit}
              value={paymentTermDays}
              onChange={(event) => setPaymentTermDays(Number(event.target.value) || 0)}
            />
          </div>
          <div>
            <span className="font-medium text-sm">{strings.invoice.dueDate}</span>
            <p className="mt-3 text-sm tabular-nums">
              {invoiceDate ? formatDate(dueDate(invoiceDate, paymentTermDays)) : '—'}
            </p>
          </div>
          <div>
            <span className="font-medium text-sm">{strings.invoice.total}</span>
            <p className="mt-3 font-medium text-sm tabular-nums">{formatEuro(total)}</p>
          </div>
        </div>

        <TextBlock
          id={`${formId}-intro`}
          label={strings.invoice.introText}
          value={introText}
          onChange={setIntroText}
          disabled={!canEdit}
          templates={(templates.data ?? []).filter((t) => t.kind === 'intro' && t.active)}
          onInsert={insertTemplate}
        />

        <section>
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">{strings.invoice.lines}</p>
            {canEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    {
                      key: nextKey(),
                      activityItemId: null,
                      description: '',
                      feeCode: '',
                      dateOfService: invoiceDate,
                      quantity: 1,
                      priceText: '',
                    },
                  ])
                }
              >
                <Plus className="size-4" aria-hidden />
                {strings.invoice.addFreeLine}
              </Button>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="mt-2 text-muted-foreground text-sm">{strings.invoice.emptyDraft}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {lines.map((line, index) => (
                <li key={line.key} className="rounded-md border p-3">
                  <div className="grid gap-2 sm:grid-cols-12">
                    <div className="sm:col-span-4">
                      <Label className="text-xs" htmlFor={`${line.key}-description`}>
                        {strings.invoice.lineDescription}
                      </Label>
                      <Input
                        id={`${line.key}-description`}
                        className="mt-1"
                        disabled={!canEdit}
                        value={line.description}
                        onChange={(event) => patch(index, { description: event.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs" htmlFor={`${line.key}-date`}>
                        {strings.invoice.lineDate}
                      </Label>
                      <Input
                        id={`${line.key}-date`}
                        type="date"
                        className="mt-1"
                        disabled={!canEdit}
                        value={line.dateOfService}
                        onChange={(event) => patch(index, { dateOfService: event.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs" htmlFor={`${line.key}-fee`}>
                        {strings.invoice.lineFeeCode}
                      </Label>
                      <Input
                        id={`${line.key}-fee`}
                        className="mt-1"
                        disabled={!canEdit}
                        value={line.feeCode}
                        onChange={(event) => patch(index, { feeCode: event.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <Label className="text-xs" htmlFor={`${line.key}-quantity`}>
                        {strings.invoice.lineQuantity}
                      </Label>
                      <Input
                        id={`${line.key}-quantity`}
                        type="number"
                        min={1}
                        className="mt-1"
                        disabled={!canEdit}
                        value={line.quantity}
                        onChange={(event) =>
                          patch(index, {
                            quantity: Math.max(1, Number.parseInt(event.target.value, 10) || 1),
                          })
                        }
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Label className="text-xs" htmlFor={`${line.key}-price`}>
                        {strings.invoice.lineUnitPrice}
                      </Label>
                      <Input
                        id={`${line.key}-price`}
                        inputMode="decimal"
                        className="mt-1"
                        disabled={!canEdit}
                        value={line.priceText}
                        onChange={(event) => patch(index, { priceText: event.target.value })}
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-4">
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {formatEuro((parseEuroAmount(line.priceText) ?? 0) * line.quantity)}
                    </span>
                    {canEdit && (
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={strings.invoice.lineMoveUp}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp className="size-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={strings.invoice.lineMoveDown}
                          disabled={index === lines.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown className="size-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={strings.invoice.lineRemove}
                          onClick={() =>
                            setLines((current) =>
                              current.filter((_, position) => position !== index),
                            )
                          }
                        >
                          <X className="size-4" aria-hidden />
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canEdit && <BillablePicker contactId={invoice.contactId} onAdd={setLines} />}

        <TextBlock
          id={`${formId}-outro`}
          label={strings.invoice.outroText}
          value={outroText}
          onChange={setOutroText}
          disabled={!canEdit}
          templates={(templates.data ?? []).filter((t) => t.kind === 'outro' && t.active)}
          onInsert={insertTemplate}
        />

        {/* Only on a document: a draft is not a claim, and the server refuses
            a payment against one twice over. */}
        {!isDraft && <PaymentCard invoice={invoice} />}

        {!isDraft && (
          <Card>
            <CardHeader>
              <CardTitle>{strings.mail.history}</CardTitle>
            </CardHeader>
            <CardContent>
              <InvoiceSendHistory invoiceId={invoiceId} />
            </CardContent>
          </Card>
        )}

        {isDraft && !hasNumberRange && !ranges.isPending && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            {strings.invoice.numberRangeMissing}{' '}
            <Link className="underline underline-offset-2" to="/settings">
              {strings.nav.settings}
            </Link>
          </p>
        )}

        {/* Editing: only the two buttons that leave it again. Issuing a
            document from a form that has unsaved changes in it is the state
            this whole step exists to remove. */}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? strings.invoice.saving : strings.invoice.save}
            </Button>
            <Button variant="ghost" onClick={discardEdits} disabled={save.isPending}>
              {strings.actions.cancel}
            </Button>
          </div>
        )}

        {isDraft && !editing && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden />
              {strings.actions.edit}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={finalize.isPending || lines.length === 0 || !canFinalize}
                >
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
                  <AlertDialogAction onClick={() => finalize.mutate(false)}>
                    {strings.invoice.finalizeConfirm}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* The card put through right after the session: one transaction
                that finalizes, records the payment and picks the outro for an
                invoice that is already settled (rule 9). */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={finalize.isPending || lines.length === 0 || !canFinalize}
                >
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
                  <AlertDialogAction onClick={() => finalize.mutate(true)}>
                    {strings.payment.settleConfirm}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="ml-auto" disabled={discard.isPending}>
                  {strings.invoice.discard}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{strings.invoice.discardTitle}</AlertDialogTitle>
                  <AlertDialogDescription>{strings.invoice.discardBody}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{strings.actions.back}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => discard.mutate()}>
                    {strings.invoice.discard}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <InvoiceSendDialog invoiceId={invoiceId} open={sendOpen} onOpenChange={setSendOpen} />
    </>
  )
}

function TextBlock({
  id,
  label,
  value,
  onChange,
  disabled,
  templates,
  onInsert,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  templates: TextTemplate[]
  onInsert: (template: TextTemplate) => void
}) {
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {!disabled && templates.length > 0 && (
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
      <Textarea
        id={id}
        rows={3}
        className="mt-2"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {!disabled && (
        <p className="mt-1 text-muted-foreground text-xs">{strings.invoice.textHint}</p>
      )}
    </section>
  )
}

/** The contact's items that are on no active invoice. The server decides what
 *  belongs here; this only picks from what it offers. */
function BillablePicker({
  contactId,
  onAdd,
}: {
  contactId: string
  onAdd: (update: (current: DraftLine[]) => DraftLine[]) => void
}) {
  const billable = useQuery(billableQueryOptions(contactId))
  const types = useQuery(activityTypeListQueryOptions(true))
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const items = billable.data ?? []
  if (items.length === 0) {
    return (
      <section>
        <p className="font-medium text-sm">{strings.invoice.billable}</p>
        <p className="mt-1 text-muted-foreground text-sm">
          {billable.isPending ? strings.status.loading : strings.invoice.billableEmpty}
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-md border p-4">
      <p className="font-medium text-sm">{strings.invoice.billable}</p>
      <p className="mt-1 text-muted-foreground text-xs">{strings.invoice.billableHint}</p>

      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 text-sm">
            <Checkbox
              id={`billable-${item.id}`}
              checked={selected.has(item.id)}
              onCheckedChange={(checked) =>
                setSelected((current) => {
                  const next = new Set(current)
                  if (checked === true) next.add(item.id)
                  else next.delete(item.id)
                  return next
                })
              }
            />
            <Label htmlFor={`billable-${item.id}`} className="font-normal">
              {formatBerlinDate(item.occurredAt)} — {item.description}
              {/* Which activity it came from, for the days that carry more
                  than one. Its title, or the label of its type. */}
              <span className="ml-2 text-muted-foreground text-xs">
                {activityLabel(
                  { title: item.activityTitle },
                  activityTypeLabel(types.data, item.activityType),
                )}
              </span>
            </Label>
            <span className="ml-auto tabular-nums">
              {item.quantity} × {formatEuro(item.unitPriceCents)}
            </span>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={selected.size === 0}
        onClick={() => {
          const chosen = items.filter((item) => selected.has(item.id))
          onAdd((current) => [
            ...current,
            ...chosen.map((item) => ({
              key: nextKey(),
              activityItemId: item.id,
              description: item.description,
              feeCode: item.feeCode ?? '',
              dateOfService: item.occurredAt.slice(0, 10),
              quantity: item.quantity,
              priceText: formatEuroAmount(item.unitPriceCents),
            })),
          ])
          setSelected(new Set())
        }}
      >
        {strings.invoice.addSelected}
      </Button>
    </section>
  )
}

/**
 * The link between an invoice and the document that took it back. Shown on
 * both, because from either side the other one is the thing you next want to
 * open (rule 9).
 */
function CancellationLink({ invoice }: { invoice: Invoice }) {
  const target = invoice.cancelledByInvoiceId ?? invoice.cancelsInvoiceId
  const number = invoice.cancelledByInvoiceNumber ?? invoice.cancelsInvoiceNumber
  if (!target || !number) return null

  const label = invoice.cancelledByInvoiceId ? strings.invoice.cancelledBy : strings.invoice.cancels

  return (
    <p className="mb-4 text-sm">
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
