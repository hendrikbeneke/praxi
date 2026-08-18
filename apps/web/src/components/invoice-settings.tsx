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
import { DASH } from '@/components/list-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import {
  invoiceTemplatePagesQueryOptions,
  invoiceTemplateUrl,
  numberRangeListQueryOptions,
  saveNumberRange,
  uploadInvoiceTemplate,
} from '@/lib/invoices'
import { practiceSettingsQueryOptions } from '@/lib/settings'
import { strings } from '@/lib/strings'

/**
 * Everything about invoicing that is configuration rather than wording: the
 * number ranges and the letterhead. Text blocks have their own section,
 * "Textbausteine" (D4), and the payment term went back to the Praxis card where
 * the design puts it (K4) — this is about numbering and paper.
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
    </div>
  )
}

/** The prototype's column widths: the name takes the rest, the four values are
 *  fixed, and the action column is as wide as its button (K4). Header and rows
 *  share it so they cannot drift. */
const RANGE_GRID =
  'grid grid-cols-[minmax(150px,1fr)_108px_88px_128px_132px_auto] items-center gap-x-4'

/**
 * The number ranges as one table — a row per range, not a stacked form per range
 * that repeats all four labels (K4).
 *
 * **Read mode survives the change to a table**, and here it matters more than
 * anywhere: a stray keystroke in "nächste Nummer" reissues a number that has
 * already been printed. The design draws every cell as an input; the rule wins
 * on this one field, so a row shows text until its own "Bearbeiten" is pressed.
 * Recorded in `docs/design-korrektur/abweichungen.md`.
 */
function NumberRanges() {
  const queryClient = useQueryClient()
  const ranges = useQuery(numberRangeListQueryOptions)

  const invoiceRange = (ranges.data ?? []).find((range) => range.code === 'invoice')

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.invoice.numberRanges}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">{strings.invoice.numberRangeHint}</p>

        {!invoiceRange && !ranges.isPending && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            {strings.invoice.numberRangeMissing}
          </p>
        )}

        <div>
          <div
            className={`${RANGE_GRID} pb-2 text-[11.5px] text-muted-foreground uppercase tracking-[0.04em]`}
          >
            <span>{strings.invoice.rangeColumnCode}</span>
            <span>{strings.invoice.prefix}</span>
            <span>{strings.invoice.padding}</span>
            <span>{strings.invoice.nextValue}</span>
            <span>{strings.invoice.rangeColumnPreview}</span>
            <span />
          </div>

          {numberRangeCodes.map((code) => (
            <NumberRangeRow
              key={code}
              code={code}
              range={(ranges.data ?? []).find((entry) => entry.code === code)}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ['number-ranges'] })}
            />
          ))}
        </div>
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
 * One row of the table, for a range that exists or one that does not.
 *
 * The two numbers are held as text rather than as numbers, and that is the whole
 * point: a `type="number"` input cannot be empty without falling back to
 * something, and anything it falls back to is a value the range does not have.
 * A range that has not been created shows `—` in every cell **including the
 * preview**, because there is no next number to preview — an invented number
 * under that heading is exactly the claim this screen must not make.
 */
function NumberRangeRow({
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
      setEditing(false)
      toast.success(exists ? strings.invoice.numberRangeSaved : strings.invoice.numberRangeCreated)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.error.generic)
    },
  })

  return (
    <div className={`${RANGE_GRID} border-t py-2.5`}>
      <div className="min-w-0">
        <p className="font-medium text-sm">{strings.invoice.numberRangeCodes[code]}</p>
        {!exists && (
          <p className="mt-1 text-muted-foreground text-xs">
            {strings.invoice.numberRangeNotCreated}
            {/* The contact range creates itself at the first contact and starts
                at 1 — said here, because otherwise "noch nicht angelegt" reads
                as a task, and creating it by hand is exactly what the whitelist
                in domain/counter.ts exists to make unnecessary. */}
            {code === 'contact' && ` · ${strings.invoice.numberRangeSelfCreating}`}
          </p>
        )}
      </div>

      {editing ? (
        <>
          <Input
            id={`${formId}-prefix`}
            aria-label={strings.invoice.prefix}
            className="h-8"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
          />
          <Input
            id={`${formId}-padding`}
            aria-label={strings.invoice.padding}
            inputMode="numeric"
            className="h-8"
            value={paddingText}
            onChange={(event) => setPaddingText(event.target.value)}
          />
          <Input
            id={`${formId}-next`}
            aria-label={strings.invoice.nextValue}
            inputMode="numeric"
            className="h-8"
            value={nextValueText}
            onChange={(event) => setNextValueText(event.target.value)}
          />
        </>
      ) : (
        <>
          <span className="text-sm">{prefix || DASH}</span>
          <span className="text-sm tabular-nums">{paddingText || DASH}</span>
          <span className="text-sm tabular-nums">{nextValueText || DASH}</span>
        </>
      )}

      <span className="font-mono text-sm">
        {complete ? formatNumber(prefix, padding, nextValue) : DASH}
      </span>

      {editing ? (
        <span className="flex gap-1">
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
        </span>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <Pencil className="size-4" aria-hidden />
          {strings.actions.edit}
        </Button>
      )}
    </div>
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
