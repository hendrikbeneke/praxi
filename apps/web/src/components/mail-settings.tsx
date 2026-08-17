import {
  type EmailTemplate,
  type EmailTemplateInput,
  type SmtpSecurity,
  type SmtpSettingsInput,
  smtpSecurities,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Pencil, Plus } from 'lucide-react'
import { Fragment, useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import {
  ActiveStatus,
  CheckboxField,
  DeleteButton,
  DetailField,
  OrderButtons,
} from '@/components/catalogue-controls'
import { InlineDetailRow, useInlineDetail } from '@/components/inline-detail-row'
import {
  ListCard,
  ListCardHeaderCell,
  ListCardHeaderRow,
  ListCardTitleBar,
} from '@/components/list-card'
import { ReadValue } from '@/components/read-value'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import {
  createEmailTemplate,
  deleteEmailTemplate,
  deleteSmtpSettings,
  emailTemplateListQueryOptions,
  moveEmailTemplate,
  saveSmtpSettings,
  sendTestMail,
  smtpSettingsQueryOptions,
  updateEmailTemplate,
} from '@/lib/mail'
import { strings } from '@/lib/strings'

/** Everything about sending mail: the account and the covering notes. */
export function MailSettings() {
  return (
    <div className="space-y-6">
      <SmtpAccount />
      <EmailTemplates />
    </div>
  )
}

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : strings.error.generic
}

type FormState = {
  host: string
  port: number
  security: SmtpSecurity
  username: string
  password: string
  fromAddress: string
  fromName: string
}

const EMPTY: FormState = {
  host: '',
  port: 587,
  security: 'starttls',
  username: '',
  password: '',
  fromAddress: '',
  fromName: '',
}

function SmtpAccount() {
  const formId = useId()
  const queryClient = useQueryClient()
  const settings = useQuery(smtpSettingsQueryOptions)
  const stored = settings.data

  const [form, setForm] = useState<FormState>(EMPTY)
  /** Read mode first — an account that exists opens to be looked at. A new one
   *  is being written, so it opens editable. */
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (settings.isPending) return
    setForm(
      stored
        ? {
            host: stored.host,
            port: stored.port,
            security: stored.security,
            username: stored.username ?? '',
            // Never filled: the API does not return it, and an empty field
            // means "leave the stored one alone".
            password: '',
            fromAddress: stored.fromAddress,
            fromName: stored.fromName ?? '',
          }
        : EMPTY,
    )
    setEditing(stored === null)
  }, [stored, settings.isPending])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['smtp'] })

  const save = useMutation({
    mutationFn: (input: SmtpSettingsInput) => saveSmtpSettings(input),
    onSuccess: async () => {
      await invalidate()
      setEditing(false)
      toast.success(strings.mail.saved)
    },
    onError: (error) => toast.error(message(error)),
  })

  const remove = useMutation({
    mutationFn: deleteSmtpSettings,
    onSuccess: async () => {
      await invalidate()
      toast.success(strings.mail.removed)
    },
    onError: (error) => toast.error(message(error)),
  })

  const test = useMutation({
    mutationFn: sendTestMail,
    onSuccess: (result) => {
      if (result.ok) toast.success(strings.mail.testOk(result.recipient))
      else toast.error(`${strings.mail.testFailed} ${result.error ?? ''}`)
    },
    onError: (error) => toast.error(message(error)),
  })

  function submit() {
    save.mutate({
      host: form.host,
      port: form.port,
      security: form.security,
      username: form.username === '' ? null : form.username,
      // Empty keeps whatever is stored; the field cannot show it.
      ...(form.password === '' ? {} : { password: form.password }),
      fromAddress: form.fromAddress,
      fromName: form.fromName === '' ? null : form.fromName,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.mail.accountTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-muted-foreground text-sm">{strings.mail.description}</p>

        {stored?.keyMismatch && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            {strings.google.keyMismatch}
          </p>
        )}

        {!stored && !settings.isPending && (
          <p className="text-muted-foreground text-sm">{strings.mail.notConfigured}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${formId}-host`}>{strings.mail.host}</Label>
            {editing ? (
              <Input
                id={`${formId}-host`}
                className="mt-2"
                value={form.host}
                onChange={(event) => setForm((f) => ({ ...f, host: event.target.value }))}
              />
            ) : (
              <ReadValue>{stored?.host}</ReadValue>
            )}
          </div>
          <div>
            <Label htmlFor={`${formId}-port`}>{strings.mail.port}</Label>
            {editing ? (
              <Input
                id={`${formId}-port`}
                type="number"
                min={1}
                max={65535}
                className="mt-2"
                value={form.port}
                onChange={(event) =>
                  setForm((f) => ({ ...f, port: Number(event.target.value) || 0 }))
                }
              />
            ) : (
              <ReadValue>{stored?.port}</ReadValue>
            )}
          </div>
          <div>
            <Label htmlFor={`${formId}-security`}>{strings.mail.security}</Label>
            {editing ? (
              <Select
                value={form.security}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, security: value as SmtpSecurity }))
                }
              >
                <SelectTrigger id={`${formId}-security`} className="mt-2 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {smtpSecurities.map((value) => (
                    <SelectItem key={value} value={value}>
                      {strings.mail.securities[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <ReadValue>{stored && strings.mail.securities[stored.security]}</ReadValue>
            )}
          </div>
          <div>
            <Label htmlFor={`${formId}-user`}>{strings.mail.username}</Label>
            {editing ? (
              <Input
                id={`${formId}-user`}
                className="mt-2"
                autoComplete="off"
                value={form.username}
                onChange={(event) => setForm((f) => ({ ...f, username: event.target.value }))}
              />
            ) : (
              <ReadValue>{stored?.username}</ReadValue>
            )}
          </div>
          <div>
            <Label htmlFor={`${formId}-password`}>{strings.mail.password}</Label>
            {editing ? (
              <Input
                id={`${formId}-password`}
                type="password"
                className="mt-2"
                autoComplete="new-password"
                placeholder={stored?.passwordSet ? strings.mail.passwordPlaceholder : undefined}
                value={form.password}
                onChange={(event) => setForm((f) => ({ ...f, password: event.target.value }))}
              />
            ) : (
              /* Dots, not DASH: the API never returns the password, so "stored
                 but not showable" has to read differently from "not set at all"
                 — that distinction is the only thing this line carries. */
              <ReadValue>{stored?.passwordSet ? '••••••••••' : undefined}</ReadValue>
            )}
            {stored?.passwordSet && editing && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={() =>
                  save.mutate({
                    host: form.host,
                    port: form.port,
                    security: form.security,
                    username: form.username === '' ? null : form.username,
                    // Explicit null is what clears it.
                    password: null,
                    fromAddress: form.fromAddress,
                    fromName: form.fromName === '' ? null : form.fromName,
                  })
                }
              >
                {strings.mail.passwordClear}
              </Button>
            )}
          </div>
          <div>
            <Label htmlFor={`${formId}-from`}>{strings.mail.fromAddress}</Label>
            {editing ? (
              <Input
                id={`${formId}-from`}
                type="email"
                className="mt-2"
                value={form.fromAddress}
                onChange={(event) => setForm((f) => ({ ...f, fromAddress: event.target.value }))}
              />
            ) : (
              <ReadValue>{stored?.fromAddress}</ReadValue>
            )}
          </div>
          <div>
            <Label htmlFor={`${formId}-fromname`}>{strings.mail.fromName}</Label>
            {editing ? (
              <Input
                id={`${formId}-fromname`}
                className="mt-2"
                value={form.fromName}
                onChange={(event) => setForm((f) => ({ ...f, fromName: event.target.value }))}
              />
            ) : (
              <ReadValue>{stored?.fromName}</ReadValue>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" disabled={save.isPending} onClick={submit}>
                {save.isPending ? strings.settings.saving : strings.settings.save}
              </Button>
              {stored && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  {strings.actions.cancel}
                </Button>
              )}
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden />
              {strings.actions.edit}
            </Button>
          )}

          {stored && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={test.isPending}
                onClick={() => test.mutate()}
              >
                <Mail className="size-4" aria-hidden />
                {strings.mail.test}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {strings.mail.remove}
              </Button>
            </>
          )}
        </div>

        {/* The safeguard, where the button is: there is no field for another
            address, and there cannot be one. */}
        {stored && <p className="text-muted-foreground text-xs">{strings.mail.testHint}</p>}
      </CardContent>
    </Card>
  )
}

const EMPTY_TEMPLATE: EmailTemplateInput = {
  name: '',
  subject: '',
  body: '',
  isDefault: false,
  sortOrder: 100,
  active: true,
}

/**
 * Inline detail instead of the form that used to sit appended below the
 * list, and `/move` (D2) instead of no reordering at all. The placeholder
 * dialog is this list's own — `strings.mail.placeholderList` is a fixed,
 * different set from the number-range prefix placeholders in
 * "Rechnungsstellung" (YYYY/MM/Q), and the two must never be shown together
 * or share a name (the README's own warning, D4).
 */
function EmailTemplates() {
  const queryClient = useQueryClient()
  const templates = useQuery(emailTemplateListQueryOptions)
  const detail = useInlineDetail()
  const [creating, setCreating] = useState(false)
  const [placeholdersOpen, setPlaceholdersOpen] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['email-templates'] })

  const save = useMutation({
    mutationFn: (input: { id?: string; values: EmailTemplateInput }) =>
      input.id ? updateEmailTemplate(input.id, input.values) : createEmailTemplate(input.values),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      setCreating(false)
      toast.success(strings.mail.templateSaved)
    },
    onError: (error) => toast.error(message(error)),
  })

  const remove = useMutation({
    mutationFn: (templateId: string) => deleteEmailTemplate(templateId),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      toast.success(strings.mail.templateRemoved)
    },
    onError: (error) => toast.error(message(error)),
  })

  const move = useMutation({
    mutationFn: (input: { id: string; delta: 1 | -1 }) => moveEmailTemplate(input.id, input.delta),
    onSuccess: invalidate,
    onError: (error) => toast.error(message(error)),
  })

  const rows = templates.data ?? []

  return (
    <ListCard>
      <ListCardTitleBar
        title={strings.mail.templates}
        hint={strings.mail.templatesHint}
        action={
          <Button
            size="sm"
            onClick={() => {
              detail.close()
              setCreating((current) => !current)
            }}
          >
            <Plus className="size-4" aria-hidden />
            {strings.mail.templateNew}
          </Button>
        }
      />

      {creating && (
        <div className="border-b bg-muted/20 p-4">
          <EmailTemplateForm
            pending={save.isPending}
            onCancel={() => setCreating(false)}
            onSubmit={(values) => save.mutate({ values })}
            onOpenPlaceholders={() => setPlaceholdersOpen(true)}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="p-4 text-muted-foreground text-sm">
          {templates.isPending ? strings.status.loading : strings.mail.templateEmpty}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <ListCardHeaderRow>
              <ListCardHeaderCell>{strings.mail.templateName}</ListCardHeaderCell>
              <ListCardHeaderCell>{strings.catalogue.active}</ListCardHeaderCell>
              <ListCardHeaderCell className="w-[72px]" />
            </ListCardHeaderRow>
          </TableHeader>
          <TableBody>
            {rows.map((template, index) => (
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
                        {strings.mail.templateDefault}
                      </Badge>
                    )}
                    <span className="ml-2 truncate text-muted-foreground text-xs">
                      {template.subject}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ActiveStatus active={template.active} />
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <OrderButtons
                      index={index}
                      count={rows.length}
                      pending={move.isPending}
                      onMove={(i, delta) => {
                        const row = rows[i]
                        if (row) move.mutate({ id: row.id, delta: delta as 1 | -1 })
                      }}
                    />
                  </TableCell>
                </TableRow>

                {detail.isOpen(template.id) && (
                  <InlineDetailRow colSpan={3}>
                    {detail.editing ? (
                      <EmailTemplateForm
                        template={template}
                        pending={save.isPending}
                        onCancel={detail.stopEditing}
                        onSubmit={(values) => save.mutate({ id: template.id, values })}
                        onOpenPlaceholders={() => setPlaceholdersOpen(true)}
                      />
                    ) : (
                      <div className="space-y-4">
                        <dl className="flex flex-wrap gap-8">
                          <DetailField
                            label={strings.mail.templateSubject}
                            value={template.subject}
                          />
                        </dl>
                        <p className="max-w-prose whitespace-pre-wrap text-sm">{template.body}</p>
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
                            title={strings.mail.templateRemoveTitle}
                            body={strings.mail.templateRemoveBody}
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
      )}

      <AlertDialog open={placeholdersOpen} onOpenChange={setPlaceholdersOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.mail.placeholderDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {strings.mail.placeholderDialogDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="divide-y">
            {strings.mail.placeholderList.map((placeholder) => (
              <div
                key={placeholder.token}
                className="grid grid-cols-[auto_1fr] items-baseline gap-4 py-2"
              >
                <dt className="font-mono text-xs tabular-nums">{placeholder.token}</dt>
                <dd className="text-muted-foreground text-sm">{placeholder.meaning}</dd>
              </div>
            ))}
          </dl>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setPlaceholdersOpen(false)}>
              {strings.actions.close}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListCard>
  )
}

function toValues(template: EmailTemplate): EmailTemplateInput {
  return {
    name: template.name,
    subject: template.subject,
    body: template.body,
    isDefault: template.isDefault,
    sortOrder: template.sortOrder,
    active: template.active,
  }
}

function EmailTemplateForm({
  template,
  pending,
  onCancel,
  onSubmit,
  onOpenPlaceholders,
}: {
  template?: EmailTemplate
  pending: boolean
  onCancel: () => void
  onSubmit: (values: EmailTemplateInput) => void
  onOpenPlaceholders: () => void
}) {
  const [input, setInput] = useState<EmailTemplateInput>(
    template ? toValues(template) : EMPTY_TEMPLATE,
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div>
          <Label htmlFor="email-template-subject">{strings.mail.templateSubject}</Label>
          <Input
            id="email-template-subject"
            className="mt-2"
            value={input.subject}
            onChange={(event) => setInput({ ...input, subject: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="email-template-name">{strings.mail.templateName}</Label>
          <Input
            id="email-template-name"
            className="mt-2"
            value={input.name}
            onChange={(event) => setInput({ ...input, name: event.target.value })}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="email-template-body">{strings.mail.templateBody}</Label>
        <Textarea
          id="email-template-body"
          rows={6}
          className="mt-2"
          value={input.body}
          onChange={(event) => setInput({ ...input, body: event.target.value })}
        />
        <p className="mt-2 flex flex-wrap items-baseline gap-2 text-muted-foreground text-xs">
          {strings.mail.placeholderPrompt}
          <button
            type="button"
            className="text-foreground underline underline-offset-2"
            onClick={onOpenPlaceholders}
          >
            {strings.mail.viewPlaceholders}
          </button>
        </p>
      </div>

      <div className="flex flex-wrap gap-6">
        <CheckboxField
          id="email-template-default"
          label={strings.mail.templateDefault}
          checked={input.isDefault}
          onChange={(checked) => setInput({ ...input, isDefault: checked })}
        />
        <CheckboxField
          id="email-template-active"
          label={strings.mail.templateActive}
          checked={input.active}
          onChange={(checked) => setInput({ ...input, active: checked })}
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {strings.actions.cancel}
        </Button>
        <Button
          type="button"
          disabled={
            pending ||
            input.name.trim() === '' ||
            input.subject.trim() === '' ||
            input.body.trim() === ''
          }
          onClick={() => onSubmit(input)}
        >
          {strings.actions.save}
        </Button>
      </div>
    </div>
  )
}
