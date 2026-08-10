import {
  type EmailTemplate,
  type EmailTemplateInput,
  type SmtpSecurity,
  type SmtpSettingsInput,
  smtpSecurities,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { ReadModeFieldset } from '@/components/read-mode-fieldset'
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
  createEmailTemplate,
  deleteEmailTemplate,
  deleteSmtpSettings,
  emailTemplateListQueryOptions,
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
        <CardTitle>{strings.mail.title}</CardTitle>
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

        <ReadModeFieldset disabled={!editing} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${formId}-host`}>{strings.mail.host}</Label>
            <Input
              id={`${formId}-host`}
              className="mt-2"
              value={form.host}
              onChange={(event) => setForm((f) => ({ ...f, host: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor={`${formId}-port`}>{strings.mail.port}</Label>
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
          </div>
          <div>
            <Label htmlFor={`${formId}-security`}>{strings.mail.security}</Label>
            <Select
              value={form.security}
              onValueChange={(value) => setForm((f) => ({ ...f, security: value as SmtpSecurity }))}
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
          </div>
          <div>
            <Label htmlFor={`${formId}-user`}>{strings.mail.username}</Label>
            <Input
              id={`${formId}-user`}
              className="mt-2"
              autoComplete="off"
              value={form.username}
              onChange={(event) => setForm((f) => ({ ...f, username: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor={`${formId}-password`}>{strings.mail.password}</Label>
            <Input
              id={`${formId}-password`}
              type="password"
              className="mt-2"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => setForm((f) => ({ ...f, password: event.target.value }))}
            />
            <p className="mt-1 text-muted-foreground text-xs">
              {stored?.passwordSet ? strings.mail.passwordSet : ''} {strings.mail.passwordKeepHint}
            </p>
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
            <Input
              id={`${formId}-from`}
              type="email"
              className="mt-2"
              value={form.fromAddress}
              onChange={(event) => setForm((f) => ({ ...f, fromAddress: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor={`${formId}-fromname`}>{strings.mail.fromName}</Label>
            <Input
              id={`${formId}-fromname`}
              className="mt-2"
              value={form.fromName}
              onChange={(event) => setForm((f) => ({ ...f, fromName: event.target.value }))}
            />
          </div>
        </ReadModeFieldset>

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
  active: true,
}

function EmailTemplates() {
  const queryClient = useQueryClient()
  const templates = useQuery(emailTemplateListQueryOptions)
  const [editing, setEditing] = useState<EmailTemplate | 'new' | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['email-templates'] })

  const remove = useMutation({
    mutationFn: (templateId: string) => deleteEmailTemplate(templateId),
    onSuccess: async () => {
      await invalidate()
      toast.success(strings.mail.templateRemoved)
    },
    onError: (error) => toast.error(message(error)),
  })

  const rows = templates.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.mail.templates}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">{strings.mail.templatesHint}</p>

        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{strings.mail.templateEmpty}</p>
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
                  {template.isDefault && (
                    <Badge variant="secondary">{strings.mail.templateDefault}</Badge>
                  )}
                  {!template.active && (
                    <Badge variant="outline" className="text-muted-foreground">
                      {strings.activityType.inactive}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto"
                    aria-label={strings.actions.delete}
                    onClick={() => remove.mutate(template.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
                <p className="mt-1 text-muted-foreground text-sm">{template.subject}</p>
              </li>
            ))}
          </ul>
        )}

        {editing === null ? (
          <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden />
            {strings.mail.templateNew}
          </Button>
        ) : (
          <EmailTemplateForm
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

function EmailTemplateForm({
  template,
  onDone,
  onCancel,
}: {
  template: EmailTemplate | null
  onDone: () => void
  onCancel: () => void
}) {
  const formId = useId()
  const [input, setInput] = useState<EmailTemplateInput>(
    template
      ? {
          name: template.name,
          subject: template.subject,
          body: template.body,
          isDefault: template.isDefault,
          active: template.active,
        }
      : EMPTY_TEMPLATE,
  )
  const [editing, setEditing] = useState(template === null)

  const save = useMutation({
    mutationFn: () =>
      template ? updateEmailTemplate(template.id, input) : createEmailTemplate(input),
    onSuccess: () => {
      toast.success(strings.mail.templateSaved)
      onDone()
    },
    onError: (error) => toast.error(message(error)),
  })

  return (
    <div className="space-y-4 rounded-md border p-4">
      <ReadModeFieldset disabled={!editing} className="space-y-4">
        <div>
          <Label htmlFor={`${formId}-name`}>{strings.mail.templateName}</Label>
          <Input
            id={`${formId}-name`}
            className="mt-2"
            value={input.name}
            onChange={(event) => setInput((current) => ({ ...current, name: event.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor={`${formId}-subject`}>{strings.mail.templateSubject}</Label>
          <Input
            id={`${formId}-subject`}
            className="mt-2"
            value={input.subject}
            onChange={(event) =>
              setInput((current) => ({ ...current, subject: event.target.value }))
            }
          />
        </div>
        <div>
          <Label htmlFor={`${formId}-body`}>{strings.mail.templateBody}</Label>
          <Textarea
            id={`${formId}-body`}
            rows={6}
            className="mt-2"
            value={input.body}
            onChange={(event) => setInput((current) => ({ ...current, body: event.target.value }))}
          />
        </div>

        <p className="text-muted-foreground text-xs">{strings.mail.placeholderHint}</p>

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
              {strings.mail.templateDefault}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${formId}-active`}
              checked={input.active}
              onCheckedChange={(checked) =>
                setInput((current) => ({ ...current, active: checked === true }))
              }
            />
            <Label htmlFor={`${formId}-active`} className="font-normal">
              {strings.mail.templateActive}
            </Label>
          </div>
        </div>
      </ReadModeFieldset>

      <div className="flex gap-2">
        {editing ? (
          <>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={
                save.isPending ||
                input.name.trim() === '' ||
                input.subject.trim() === '' ||
                input.body.trim() === ''
              }
            >
              {save.isPending ? strings.settings.saving : strings.settings.save}
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
