import {
  formatNumber,
  type NumberRange,
  type NumberRangeCode,
  numberRangeCodes,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileUp, Pencil } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ReadModeFieldset } from '@/components/read-mode-fieldset'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import {
  invoiceTemplatePagesQueryOptions,
  invoiceTemplateUrl,
  numberRangeListQueryOptions,
  saveNumberRange,
  uploadInvoiceTemplate,
} from '@/lib/invoices'
import { practiceSettingsQueryOptions, updatePracticeSettings } from '@/lib/settings'
import { strings } from '@/lib/strings'

/**
 * Everything about invoicing that is configuration rather than wording: the
 * number range, the payment term default, and the letterhead. Text blocks
 * moved to their own settings section, "Textbausteine" (D4) — this is about
 * numbering and paper, not what the invoice says.
 *
 * The number range is here and not created automatically on purpose — it may
 * continue a numbering that began in the previous system, so it is set up by
 * hand once and adjusted at the turn of the year (CLAUDE.md rule 8).
 */
export function InvoiceSettings() {
  return (
    <div className="space-y-6">
      <NumberRanges />
      <PaymentTerm />
      <Letterhead />
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

/** Whole numbers only, and only where the field holds one. `''` stays `null`
 *  so an empty field can never pass for a value. */
function toNumber(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const value = Number.parseInt(text, 10)
  return Number.isSafeInteger(value) ? value : null
}

/**
 * One number range, existing or not.
 *
 * The two numbers are held as text rather than as numbers, and that is the
 * whole point of this form: a `type="number"` input cannot be empty without
 * falling back to something, and anything it falls back to is a value the
 * range does not have. A range that has not been created must show empty
 * fields and no preview, because there is no next number to preview.
 */
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
  const exists = range !== undefined

  const [prefix, setPrefix] = useState('')
  const [paddingText, setPaddingText] = useState('')
  const [nextValueText, setNextValueText] = useState('')
  /**
   * Read mode first (CLAUDE.md), and nowhere does it matter more: a stray
   * keystroke in `next_value` reissues a number that has already been printed.
   * A range that does not exist yet is being created, so it opens editable.
   */
  const [editing, setEditing] = useState(!exists)

  const reset = useCallback(() => {
    setPrefix(range?.prefix ?? '')
    setPaddingText(range === undefined ? '' : String(range.padding))
    setNextValueText(range === undefined ? '' : String(range.nextValue))
  }, [range])

  useEffect(() => {
    reset()
    setEditing(range === undefined)
  }, [reset, range])

  const padding = toNumber(paddingText)
  const nextValue = toNumber(nextValueText)
  const complete =
    padding !== null && padding >= 1 && padding <= 12 && nextValue !== null && nextValue >= 1

  const save = useMutation({
    mutationFn: () => {
      if (padding === null || nextValue === null) throw new Error('incomplete')
      return saveNumberRange(code, { prefix, padding, nextValue })
    },
    onSuccess: () => {
      onSaved()
      toast.success(exists ? strings.invoice.numberRangeSaved : strings.invoice.numberRangeCreated)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.error.generic)
    },
  })

  return (
    <div className="rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-sm">{strings.invoice.numberRangeCodes[code]}</p>
        {!exists && <Badge variant="outline">{strings.invoice.numberRangeNotCreated}</Badge>}
      </div>

      {/* The contact range creates itself at the first contact and starts at 1
          — said here, because otherwise "noch nicht angelegt" reads as a task,
          and creating it by hand is exactly what the whitelist in
          domain/counter.ts exists to make unnecessary. */}
      {!exists && code === 'contact' && (
        <p className="mt-2 text-muted-foreground text-sm">
          {strings.invoice.numberRangeSelfCreating}
        </p>
      )}

      <ReadModeFieldset disabled={!editing} className="mt-3 grid gap-4 sm:grid-cols-4">
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
            inputMode="numeric"
            className="mt-2"
            value={paddingText}
            onChange={(event) => setPaddingText(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`${formId}-next`}>{strings.invoice.nextValue}</Label>
          <Input
            id={`${formId}-next`}
            inputMode="numeric"
            className="mt-2"
            value={nextValueText}
            onChange={(event) => setNextValueText(event.target.value)}
          />
        </div>
        <div>
          <span className="font-medium text-sm">{strings.invoice.nextNumberPreview}</span>
          {/* Only once there is something to preview. An invented number under
              this label is exactly the claim this form must not make. */}
          <p className="mt-3 font-mono text-sm">
            {complete ? formatNumber(prefix, padding, nextValue) : '—'}
          </p>
        </div>
      </ReadModeFieldset>

      {editing ? (
        <div className="mt-4 flex gap-2">
          {exists && (
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
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !complete}>
            {save.isPending
              ? strings.invoice.saving
              : exists
                ? strings.invoice.save
                : strings.invoice.numberRangeCreate}
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

/**
 * The one field left in `practice_settings` that belongs under
 * "Rechnungsstellung" rather than "Praxis" — a default for new invoices, not
 * master data about the practice. Its own card with its own "Bearbeiten",
 * saved through the same `PATCH /api/settings` as the Praxis panel: each
 * sends only the field it owns, so the two can never clobber each other (see
 * `updatePracticeSettings` on the server).
 */
function PaymentTerm() {
  const queryClient = useQueryClient()
  const settings = useQuery(practiceSettingsQueryOptions)
  const [editing, setEditing] = useState(false)
  const [daysText, setDaysText] = useState('')

  useEffect(() => {
    if (settings.data) setDaysText(String(settings.data.defaultPaymentTermDays))
  }, [settings.data])

  const save = useMutation({
    mutationFn: (defaultPaymentTermDays: number) =>
      updatePracticeSettings({ defaultPaymentTermDays }),
    onSuccess: (saved) => {
      queryClient.setQueryData(practiceSettingsQueryOptions.queryKey, saved)
      setEditing(false)
      toast.success(strings.invoice.paymentTermSaved)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.invoice.paymentTermSaveFailed)
    },
  })

  const parsed = toNumber(daysText)
  const complete = parsed !== null && parsed >= 0 && parsed <= 365

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>{strings.invoice.paymentTermTitle}</CardTitle>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden />
            {strings.actions.edit}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <ReadModeFieldset disabled={!editing}>
          <div className="max-w-48">
            <Label htmlFor="payment-term-days">{strings.settings.defaultPaymentTermDays}</Label>
            <Input
              id="payment-term-days"
              className="mt-2"
              inputMode="numeric"
              value={daysText}
              onChange={(event) => setDaysText(event.target.value)}
            />
            {editing && !complete && (
              <p className="mt-1 text-destructive text-sm">{strings.validation.paymentTerm}</p>
            )}
          </div>
        </ReadModeFieldset>

        {editing && (
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => {
                if (settings.data) setDaysText(String(settings.data.defaultPaymentTermDays))
                setEditing(false)
              }}
            >
              {strings.actions.cancel}
            </Button>
            <Button
              size="sm"
              disabled={save.isPending || !complete}
              onClick={() => parsed !== null && save.mutate(parsed)}
            >
              {save.isPending ? strings.settings.saving : strings.settings.save}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The uploaded letterhead the invoice content is printed onto (rule 11).
 *
 * Whether one is stored is read from the server, not remembered from an upload
 * in this session: "Briefbogen anzeigen" was offered unconditionally and
 * answered 404 when there was none, which claims a state exactly the way a
 * prefilled form does — only it is discovered later.
 *
 * The page count comes with it and stays visible, because one page against two
 * decides what the *second* sheet of a long invoice looks like.
 */
function Letterhead() {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const settings = useQuery(practiceSettingsQueryOptions)
  const pages = useQuery({
    ...invoiceTemplatePagesQueryOptions,
    enabled: settings.data?.invoiceTemplateSet === true,
  })

  const upload = useMutation({
    mutationFn: (file: File) => uploadInvoiceTemplate(file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success(strings.invoice.letterheadUploaded)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.error.generic)
    },
    onSettled: () => {
      if (inputRef.current) inputRef.current.value = ''
    },
  })

  /** The settings row can say a template is set; only the file itself can say
   *  it is still there, and the page count is what answers both. */
  const stored = settings.data?.invoiceTemplateSet === true && pages.data != null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.invoice.letterhead}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{strings.invoice.letterheadHint}</p>

        <p className="mt-4 text-sm">
          {stored ? (
            <>
              <Badge variant="secondary">
                {pages.data === 1
                  ? strings.invoice.letterheadOnePage
                  : strings.invoice.letterheadTwoPages}
              </Badge>
              <span className="ml-2 text-muted-foreground">
                {pages.data === 1
                  ? strings.invoice.letterheadOnePageHint
                  : strings.invoice.letterheadTwoPagesHint}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">{strings.invoice.letterheadNone}</span>
          )}
        </p>

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
            {stored ? strings.invoice.letterheadReplace : strings.invoice.letterheadUpload}
          </Button>

          {/* Only when there is something behind it. */}
          {stored && (
            <Button variant="ghost" asChild>
              <a href={invoiceTemplateUrl} target="_blank" rel="noreferrer">
                {strings.invoice.letterheadShow}
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
