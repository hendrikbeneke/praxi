import {
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
import { ArrowDown, ArrowLeft, ArrowUp, FileCheck2, FileText, Plus, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
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
import { ApiError } from '@/lib/api'
import {
  billableQueryOptions,
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

  const isDraft = invoice?.status === 'draft'
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

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['invoices'] })
  }

  /**
   * `silent` is for the save that finalizing does first. Reporting "saved"
   * there is worse than saying nothing: the practitioner pressed Festschreiben,
   * and a success message next to a failed finalization reads as if the
   * document had been issued.
   */
  const save = useMutation({
    mutationFn: (_options: { silent?: boolean } = {}) =>
      updateInvoice(invoiceId, {
        invoiceDate,
        paymentTermDays,
        introText: introText.trim() === '' ? null : introText.trim(),
        outroText: outroText.trim() === '' ? null : outroText.trim(),
        lines: lines.map(toInput),
      }),
    onSuccess: async (_data, options) => {
      await invalidate()
      if (!options.silent) toast.success(strings.invoice.saved)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.invoice.saveFailed)
    },
  })

  const finalize = useMutation({
    mutationFn: () => finalizeInvoice(invoiceId),
    onSuccess: async () => {
      await invalidate()
      toast.success(strings.invoice.finalized)
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

            <Button variant="ghost" asChild>
              <Link to="/invoices">
                <ArrowLeft className="size-4" aria-hidden />
                {strings.actions.back}
              </Link>
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <Label htmlFor={`${formId}-date`}>{strings.invoice.invoiceDate}</Label>
            <Input
              id={`${formId}-date`}
              type="date"
              className="mt-2"
              disabled={!isDraft}
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
              disabled={!isDraft}
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
          disabled={!isDraft}
          templates={(templates.data ?? []).filter((t) => t.kind === 'intro' && t.active)}
          onInsert={insertTemplate}
        />

        <section>
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">{strings.invoice.lines}</p>
            {isDraft && (
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
                        disabled={!isDraft}
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
                        disabled={!isDraft}
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
                        disabled={!isDraft}
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
                        disabled={!isDraft}
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
                        disabled={!isDraft}
                        value={line.priceText}
                        onChange={(event) => patch(index, { priceText: event.target.value })}
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-4">
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {formatEuro((parseEuroAmount(line.priceText) ?? 0) * line.quantity)}
                    </span>
                    {isDraft && (
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

        {isDraft && <BillablePicker contactId={invoice.contactId} onAdd={setLines} />}

        <TextBlock
          id={`${formId}-outro`}
          label={strings.invoice.outroText}
          value={outroText}
          onChange={setOutroText}
          disabled={!isDraft}
          templates={(templates.data ?? []).filter((t) => t.kind === 'outro' && t.active)}
          onInsert={insertTemplate}
        />

        {isDraft && !hasNumberRange && !ranges.isPending && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            {strings.invoice.numberRangeMissing}{' '}
            <Link className="underline underline-offset-2" to="/settings">
              {strings.nav.settings}
            </Link>
          </p>
        )}

        {isDraft && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button onClick={() => save.mutate({})} disabled={save.isPending}>
              {save.isPending ? strings.invoice.saving : strings.invoice.save}
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
                  <AlertDialogAction
                    onClick={async () => {
                      // Save first: finalizing snapshots what is stored, not
                      // what is on screen. Silently — `save` reports its own
                      // failure, and a "saved" toast here would sit next to a
                      // failed finalization and contradict it.
                      try {
                        await save.mutateAsync({ silent: true })
                      } catch {
                        // Already reported by the mutation's onError; the
                        // point of catching is not to finalize unsaved data.
                        return
                      }
                      finalize.mutate()
                    }}
                  >
                    {strings.invoice.finalizeConfirm}
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
