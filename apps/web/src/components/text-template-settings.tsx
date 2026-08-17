import {
  type TextTemplate,
  type TextTemplateInput,
  type TextTemplateKind,
  textTemplateKinds,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'
import {
  ActiveStatus,
  CheckboxField,
  DeleteButton,
  DetailField,
  OrderButtons,
} from '@/components/catalogue-controls'
import { InlineDetailRow, useInlineDetail } from '@/components/inline-detail-row'
import { DASH, ListCard, ListCardTitleBar } from '@/components/list-card'
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
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import {
  createTextTemplate,
  deleteTextTemplate,
  moveTextTemplate,
  textTemplateListQueryOptions,
  updateTextTemplate,
} from '@/lib/invoices'
import { strings } from '@/lib/strings'

/**
 * Intro and outro text blocks (rule 8's text templates), a settings section
 * of its own (D4: "Textbausteine") — split out of "Rechnungsstellung", which
 * is about the number range and the letterhead, not wording. Inline detail
 * instead of the form that used to sit appended below the list, and `/move`
 * instead of no reordering at all. `moveTextTemplate` reorders within a
 * template's own `kind` on the server (intro and outro are separate
 * sequences), so the two kinds render as two separate, separately-ordered
 * groups rather than one interleaved list.
 */
export function TextTemplateSettings() {
  const queryClient = useQueryClient()
  const templates = useQuery(textTemplateListQueryOptions)
  const detail = useInlineDetail()
  const [creating, setCreating] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['text-templates'] })
  const onError = (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : strings.error.generic)

  const save = useMutation({
    mutationFn: (input: { id?: string; values: TextTemplateInput }) =>
      input.id ? updateTextTemplate(input.id, input.values) : createTextTemplate(input.values),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      setCreating(false)
      toast.success(strings.invoice.templateSaved)
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (templateId: string) => deleteTextTemplate(templateId),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      toast.success(strings.invoice.templateRemoved)
    },
    onError,
  })

  const move = useMutation({
    mutationFn: (input: { id: string; delta: 1 | -1 }) => moveTextTemplate(input.id, input.delta),
    onSuccess: invalidate,
    onError,
  })

  const rows = templates.data ?? []

  return (
    <ListCard>
      <ListCardTitleBar
        title={strings.invoice.templates}
        hint={strings.invoice.templatesHint}
        action={
          <Button
            size="sm"
            onClick={() => {
              detail.close()
              setCreating((current) => !current)
            }}
          >
            <Plus className="size-4" aria-hidden />
            {strings.invoice.templateNew}
          </Button>
        }
      />

      {creating && (
        <div className="border-b bg-muted/20 p-4">
          <TextTemplateForm
            pending={save.isPending}
            onCancel={() => setCreating(false)}
            onSubmit={(values) => save.mutate({ values })}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="p-4 text-muted-foreground text-sm">
          {templates.isPending ? strings.status.loading : strings.invoice.templateEmpty}
        </p>
      ) : (
        textTemplateKinds.map((kind) => {
          const kindRows = rows.filter((template) => template.kind === kind)
          if (kindRows.length === 0) return null

          return (
            <div key={kind} className="border-b last:border-b-0">
              <p className="px-4 pt-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {strings.invoice.templateKinds[kind]}
              </p>
              <Table>
                <TableBody>
                  {kindRows.map((template, index) => (
                    <Fragment key={template.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => {
                          setCreating(false)
                          detail.toggle(template.id)
                        }}
                      >
                        <TableCell>
                          <span className="font-medium">{template.name}</span>
                          {template.isDefault && (
                            <Badge variant="secondary" className="ml-2">
                              {strings.invoice.templateDefault}
                            </Badge>
                          )}
                          {template.isPaidVariant && (
                            <Badge variant="outline" className="ml-2">
                              {strings.invoice.templatePaidVariant}
                            </Badge>
                          )}
                          <span className="ml-2 truncate text-muted-foreground text-xs">
                            {template.body}
                          </span>
                        </TableCell>
                        <TableCell>
                          <ActiveStatus active={template.active} />
                        </TableCell>
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <OrderButtons
                            index={index}
                            count={kindRows.length}
                            pending={move.isPending}
                            onMove={(i, delta) => {
                              const row = kindRows[i]
                              if (row) move.mutate({ id: row.id, delta: delta as 1 | -1 })
                            }}
                          />
                        </TableCell>
                      </TableRow>

                      {detail.isOpen(template.id) && (
                        <InlineDetailRow colSpan={3}>
                          {detail.editing ? (
                            <TextTemplateForm
                              template={template}
                              pending={save.isPending}
                              onCancel={detail.stopEditing}
                              onSubmit={(values) => save.mutate({ id: template.id, values })}
                            />
                          ) : (
                            <div className="space-y-4">
                              <dl className="flex flex-wrap gap-8">
                                <DetailField
                                  label={strings.invoice.templateDefault}
                                  value={
                                    template.isDefault ? strings.invoice.templateDefault : DASH
                                  }
                                />
                                {template.kind === 'outro' && (
                                  <DetailField
                                    label={strings.invoice.templatePaidVariant}
                                    value={
                                      template.isPaidVariant
                                        ? strings.invoice.templatePaidVariant
                                        : DASH
                                    }
                                  />
                                )}
                              </dl>
                              <p className="max-w-prose whitespace-pre-wrap text-sm">
                                {template.body}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                                <Button size="sm" variant="outline" onClick={detail.startEditing}>
                                  {strings.actions.edit}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={detail.close}>
                                  {strings.actions.close}
                                </Button>
                                <DeleteButton
                                  disabled={false}
                                  onConfirm={() => remove.mutate(template.id)}
                                  title={strings.invoice.templateRemoveTitle}
                                  body={strings.invoice.templateRemoveBody}
                                />
                              </div>
                            </div>
                          )}
                        </InlineDetailRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        })
      )}
    </ListCard>
  )
}

function toValues(template: TextTemplate): TextTemplateInput {
  return {
    kind: template.kind,
    name: template.name,
    body: template.body,
    isDefault: template.isDefault,
    isPaidVariant: template.isPaidVariant,
    sortOrder: template.sortOrder,
    active: template.active,
  }
}

const EMPTY: TextTemplateInput = {
  kind: 'intro',
  name: '',
  body: '',
  isDefault: false,
  isPaidVariant: false,
  sortOrder: 100,
  active: true,
}

function TextTemplateForm({
  template,
  pending,
  onCancel,
  onSubmit,
}: {
  template?: TextTemplate
  pending: boolean
  onCancel: () => void
  onSubmit: (values: TextTemplateInput) => void
}) {
  const [values, setValues] = useState<TextTemplateInput>(template ? toValues(template) : EMPTY)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="text-template-kind">{strings.invoice.templateKind}</Label>
          <Select
            value={values.kind}
            onValueChange={(value) =>
              setValues({
                ...values,
                kind: value as TextTemplateKind,
                // The paid variant only exists for an outro; the check
                // constraint says so too.
                isPaidVariant: value === 'outro' ? values.isPaidVariant : false,
              })
            }
          >
            <SelectTrigger id="text-template-kind" className="mt-2 w-full">
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
          <Label htmlFor="text-template-name">{strings.invoice.templateName}</Label>
          <Input
            id="text-template-name"
            className="mt-2"
            value={values.name}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="text-template-body">{strings.invoice.templateBody}</Label>
        <Textarea
          id="text-template-body"
          rows={4}
          className="mt-2"
          value={values.body}
          onChange={(event) => setValues({ ...values, body: event.target.value })}
        />
      </div>

      <div className="flex flex-wrap gap-6">
        <CheckboxField
          id="text-template-default"
          label={strings.invoice.templateDefault}
          hint={strings.invoice.templateDefaultHint}
          checked={values.isDefault}
          onChange={(checked) => setValues({ ...values, isDefault: checked })}
        />
        {values.kind === 'outro' && (
          <CheckboxField
            id="text-template-paid"
            label={strings.invoice.templatePaidVariant}
            hint={strings.invoice.templatePaidVariantHint}
            checked={values.isPaidVariant}
            onChange={(checked) => setValues({ ...values, isPaidVariant: checked })}
          />
        )}
        <CheckboxField
          id="text-template-active"
          label={strings.invoice.templateActive}
          checked={values.active}
          onChange={(checked) => setValues({ ...values, active: checked })}
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {strings.actions.cancel}
        </Button>
        <Button
          type="button"
          disabled={pending || values.name.trim() === '' || values.body.trim() === ''}
          onClick={() => onSubmit(values)}
        >
          {strings.actions.save}
        </Button>
      </div>
    </div>
  )
}
