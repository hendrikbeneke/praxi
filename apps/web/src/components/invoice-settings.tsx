import {
  formatNumber,
  type NumberRange,
  type NumberRangeCode,
  numberRangeCodes,
  type TextTemplate,
  type TextTemplateInput,
  type TextTemplateKind,
  textTemplateKinds,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
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
import { ApiError } from '@/lib/api'
import {
  createTextTemplate,
  deleteTextTemplate,
  invoiceTemplateUrl,
  numberRangeListQueryOptions,
  saveNumberRange,
  textTemplateListQueryOptions,
  updateTextTemplate,
  uploadInvoiceTemplate,
} from '@/lib/invoices'
import { strings } from '@/lib/strings'

/**
 * Everything about invoicing that is configuration rather than data: the
 * number ranges, the text blocks, and the letterhead.
 *
 * The number range is here and not created automatically on purpose — it may
 * continue a numbering that began in the previous system, so it is set up by
 * hand once and adjusted at the turn of the year (CLAUDE.md rule 8).
 */
export function InvoiceSettings() {
  return (
    <div className="space-y-6">
      <NumberRanges />
      <Letterhead />
      <TextTemplates />
    </div>
  )
}

function NumberRanges() {
  const queryClient = useQueryClient()
  const ranges = useQuery(numberRangeListQueryOptions)

  const invoiceRange = (ranges.data ?? []).find((range) => range.code === 'invoice')

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.invoice.numberRanges}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-muted-foreground text-sm">{strings.invoice.numberRangeHint}</p>

        {!invoiceRange && !ranges.isPending && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            {strings.invoice.numberRangeMissing}
          </p>
        )}

        {numberRangeCodes.map((code) => (
          <NumberRangeForm
            key={code}
            code={code}
            range={(ranges.data ?? []).find((entry) => entry.code === code)}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ['number-ranges'] })}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function NumberRangeForm({
  code,
  range,
  onSaved,
}: {
  code: NumberRangeCode
  range: NumberRange | undefined
  onSaved: () => void
}) {
  const formId = useId()
  const [prefix, setPrefix] = useState('')
  const [padding, setPadding] = useState(1)
  const [nextValue, setNextValue] = useState(1)
  /**
   * Read mode first (CLAUDE.md), and nowhere does it matter more: a stray
   * keystroke in `next_value` reissues a number that has already been printed.
   * A range that does not exist yet is being created, so it opens editable.
   */
  const [editing, setEditing] = useState(range === undefined)

  const reset = useCallback(() => {
    setPrefix(range?.prefix ?? (code === 'invoice' ? `${new Date().getFullYear()}-` : ''))
    setPadding(range?.padding ?? (code === 'invoice' ? 4 : 1))
    setNextValue(range?.nextValue ?? 1)
  }, [range, code])

  useEffect(() => {
    reset()
    setEditing(range === undefined)
  }, [reset, range])

  const save = useMutation({
    mutationFn: () => saveNumberRange(code, { prefix, padding, nextValue }),
    onSuccess: () => {
      onSaved()
      toast.success(strings.invoice.numberRangeSaved)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.error.generic)
    },
  })

  return (
    <div className="rounded-md border p-4">
      <p className="font-medium text-sm">{strings.invoice.numberRangeCodes[code]}</p>

      <fieldset disabled={!editing} className="mt-3 grid gap-4 sm:grid-cols-4">
        <div>
          <Label htmlFor={`${formId}-prefix`}>{strings.invoice.prefix}</Label>
          <Input
            id={`${formId}-prefix`}
            className="mt-2"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`${formId}-padding`}>{strings.invoice.padding}</Label>
          <Input
            id={`${formId}-padding`}
            type="number"
            min={1}
            max={12}
            className="mt-2"
            value={padding}
            onChange={(event) => setPadding(Number(event.target.value) || 1)}
          />
        </div>
        <div>
          <Label htmlFor={`${formId}-next`}>{strings.invoice.nextValue}</Label>
          <Input
            id={`${formId}-next`}
            type="number"
            min={1}
            className="mt-2"
            value={nextValue}
            onChange={(event) => setNextValue(Number(event.target.value) || 1)}
          />
        </div>
        <div>
          <span className="font-medium text-sm">{strings.invoice.nextNumberPreview}</span>
          <p className="mt-3 font-mono text-sm">{formatNumber(prefix, padding, nextValue)}</p>
        </div>
      </fieldset>

      {editing ? (
        <div className="mt-4 flex gap-2">
          {range && (
            <Button
              size="sm"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => {
                reset()
                setEditing(false)
              }}
            >
              {strings.actions.cancel}
            </Button>
          )}
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? strings.invoice.saving : strings.invoice.save}
          </Button>
        </div>
      ) : (
        <Button className="mt-4" size="sm" variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="size-4" aria-hidden />
          {strings.actions.edit}
        </Button>
      )}
    </div>
  )
}

function Letterhead() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pages, setPages] = useState<number | null>(null)

  const upload = useMutation({
    mutationFn: (file: File) => uploadInvoiceTemplate(file),
    onSuccess: (result) => {
      setPages(result.pages)
      toast.success(strings.invoice.letterheadUploaded)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.error.generic)
    },
    onSettled: () => {
      if (inputRef.current) inputRef.current.value = ''
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.invoice.letterhead}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{strings.invoice.letterheadHint}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) upload.mutate(file)
            }}
          />
          <Button
            variant="outline"
            disabled={upload.isPending}
            onClick={() => inputRef.current?.click()}
          >
            <FileUp className="size-4" aria-hidden />
            {strings.invoice.letterheadUpload}
          </Button>

          <Button variant="ghost" asChild>
            <a href={invoiceTemplateUrl} target="_blank" rel="noreferrer">
              {strings.invoice.letterheadShow}
            </a>
          </Button>

          {pages !== null && <Badge variant="secondary">{pages}</Badge>}
        </div>
      </CardContent>
    </Card>
  )
}

const EMPTY_TEMPLATE: TextTemplateInput = {
  kind: 'intro',
  name: '',
  body: '',
  isDefault: false,
  isPaidVariant: false,
  active: true,
}

function TextTemplates() {
  const queryClient = useQueryClient()
  const templates = useQuery(textTemplateListQueryOptions)
  const [editing, setEditing] = useState<TextTemplate | 'new' | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['text-templates'] })

  const remove = useMutation({
    mutationFn: (templateId: string) => deleteTextTemplate(templateId),
    onSuccess: async () => {
      await invalidate()
      toast.success(strings.invoice.templateRemoved)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.error.generic)
    },
  })

  const rows = templates.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.invoice.templates}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{strings.invoice.templateEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((template) => (
              <li key={template.id} className="rounded-md border px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <button
                    type="button"
                    className="font-medium underline underline-offset-2"
                    onClick={() => setEditing(template)}
                  >
                    {template.name}
                  </button>
                  <Badge variant="outline">{strings.invoice.templateKinds[template.kind]}</Badge>
                  {template.isDefault && (
                    <Badge variant="secondary">{strings.invoice.templateDefault}</Badge>
                  )}
                  {template.isPaidVariant && (
                    <Badge variant="secondary">{strings.invoice.templatePaidVariant}</Badge>
                  )}
                  {!template.active && (
                    <Badge variant="outline" className="text-muted-foreground">
                      {strings.invoice.templateActive}: —
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto"
                    aria-label={strings.note.remove}
                    onClick={() => remove.mutate(template.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-muted-foreground text-sm">
                  {template.body}
                </p>
              </li>
            ))}
          </ul>
        )}

        {editing === null ? (
          <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden />
            {strings.invoice.templateNew}
          </Button>
        ) : (
          <TextTemplateForm
            template={editing === 'new' ? null : editing}
            onDone={async () => {
              await invalidate()
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </CardContent>
    </Card>
  )
}

function TextTemplateForm({
  template,
  onDone,
  onCancel,
}: {
  template: TextTemplate | null
  onDone: () => void
  onCancel: () => void
}) {
  const formId = useId()
  const [input, setInput] = useState<TextTemplateInput>(
    template
      ? {
          kind: template.kind,
          name: template.name,
          body: template.body,
          isDefault: template.isDefault,
          isPaidVariant: template.isPaidVariant,
          active: template.active,
        }
      : EMPTY_TEMPLATE,
  )
  /** Clicking a template's name opens it; a new one is being written, an
   *  existing one is being looked at (CLAUDE.md, read mode first). */
  const [editing, setEditing] = useState(template === null)

  const save = useMutation({
    mutationFn: () =>
      template ? updateTextTemplate(template.id, input) : createTextTemplate(input),
    onSuccess: () => {
      toast.success(strings.invoice.templateSaved)
      onDone()
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.error.generic)
    },
  })

  return (
    <div className="space-y-4 rounded-md border p-4">
      <fieldset disabled={!editing} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${formId}-kind`}>{strings.invoice.templateKind}</Label>
            <Select
              value={input.kind}
              onValueChange={(value) =>
                setInput((current) => ({
                  ...current,
                  kind: value as TextTemplateKind,
                  // The paid variant only exists for an outro; the check
                  // constraint says so too.
                  isPaidVariant: value === 'outro' ? current.isPaidVariant : false,
                }))
              }
            >
              <SelectTrigger id={`${formId}-kind`} className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {textTemplateKinds.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {strings.invoice.templateKinds[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor={`${formId}-name`}>{strings.invoice.templateName}</Label>
            <Input
              id={`${formId}-name`}
              className="mt-2"
              value={input.name}
              onChange={(event) =>
                setInput((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
        </div>

        <div>
          <Label htmlFor={`${formId}-body`}>{strings.invoice.templateBody}</Label>
          <Textarea
            id={`${formId}-body`}
            rows={4}
            className="mt-2"
            value={input.body}
            onChange={(event) => setInput((current) => ({ ...current, body: event.target.value }))}
          />
        </div>

        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${formId}-default`}
              checked={input.isDefault}
              onCheckedChange={(checked) =>
                setInput((current) => ({ ...current, isDefault: checked === true }))
              }
            />
            <Label htmlFor={`${formId}-default`} className="font-normal">
              {strings.invoice.templateDefault}
            </Label>
          </div>

          {input.kind === 'outro' && (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${formId}-paid`}
                checked={input.isPaidVariant}
                onCheckedChange={(checked) =>
                  setInput((current) => ({ ...current, isPaidVariant: checked === true }))
                }
              />
              <Label htmlFor={`${formId}-paid`} className="font-normal">
                {strings.invoice.templatePaidVariant}
              </Label>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id={`${formId}-active`}
              checked={input.active}
              onCheckedChange={(checked) =>
                setInput((current) => ({ ...current, active: checked === true }))
              }
            />
            <Label htmlFor={`${formId}-active`} className="font-normal">
              {strings.invoice.templateActive}
            </Label>
          </div>
        </div>

        <p className="text-muted-foreground text-xs">{strings.invoice.templateDefaultHint}</p>
        {input.kind === 'outro' && (
          <p className="text-muted-foreground text-xs">{strings.invoice.templatePaidVariantHint}</p>
        )}
      </fieldset>

      <div className="flex gap-2">
        {editing ? (
          <>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending || input.name.trim() === '' || input.body.trim() === ''}
            >
              {save.isPending ? strings.invoice.saving : strings.invoice.save}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {strings.actions.cancel}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden />
              {strings.actions.edit}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {strings.actions.close}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
