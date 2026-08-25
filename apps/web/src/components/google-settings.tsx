import {
  EVENT_TITLE_PREVIEW,
  EVENT_TITLE_PREVIEW_SPARSE,
  formatBerlinDateTime,
  formatRelativeBerlin,
  isEmptyEventTitleTemplate,
  resolveEventTitle,
  unknownEventTitlePlaceholders,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Link2, Link2Off, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { DASH } from '@/components/list-card'
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
import { ApiError } from '@/lib/api'
import {
  connectGoogle,
  disconnectGoogle,
  googleCalendarsQueryOptions,
  googleStatusQueryOptions,
  setFreebusyCalendars,
  setGoogleCalendar,
  setGoogleEventTitle,
  syncGoogleNow,
} from '@/lib/google'
import { strings } from '@/lib/strings'

/**
 * The Google area of the settings.
 *
 * It says what the connection is doing — nothing more. A sync conflict is a
 * scheduling question and lives in the calendar, where scheduling happens.
 */
/** The status strip's three columns and its small caps labels — 11.5px with
 *  .04em, as the prototype sets them. Its own scale, not `listHeaderClass`:
 *  that one belongs to a list's column labels. */
const STRIP = 'grid sm:grid-cols-3'
const STRIP_LABEL = 'text-[11.5px] text-muted-foreground uppercase tracking-[0.04em]'

export function GoogleSettings() {
  const queryClient = useQueryClient()
  /* Relative, not absolute: "vor 2 Std." answers "is the projection current"
     without arithmetic, which is what the line is for. Held as a value so the
     render stays a pure function of its input, like every other caller. */
  const now = new Date()
  const status = useQuery(googleStatusQueryOptions)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['google'] })

  const connect = useMutation({
    mutationFn: connectGoogle,
    onSuccess: (result) => {
      // A new window, because the callback comes back on 127.0.0.1 — a
      // different origin, which cannot carry this page's session.
      window.open(result.authUrl, '_blank', 'noopener,width=520,height=680')
      toast.info(strings.google.connectHint)
    },
    onError: (error) => toast.error(message(error)),
  })

  const sync = useMutation({
    mutationFn: syncGoogleNow,
    onSuccess: async (result) => {
      await invalidate()
      toast.success(strings.google.syncResult(result))
    },
    onError: (error) => toast.error(message(error)),
  })

  if (status.isPending) return null

  const data = status.data
  if (!data) return null

  return (
    <Card>
      {/* Which account is connected belongs beside the card's name, as the
          design puts it — it says what this card is about, where the buttons
          below say what can be done with it (K4). */}
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <CardTitle>{strings.google.title}</CardTitle>
        {data.connected && (
          <Badge variant="secondary">
            {strings.google.connectedAs} {data.accountEmail ?? DASH}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-muted-foreground text-sm">{strings.google.description}</p>

        {!data.configured && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            {strings.google.notConfigured}
          </p>
        )}

        {data.keyMismatch && (
          <p className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {strings.google.keyMismatch}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {data.connected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={sync.isPending}
                onClick={() => sync.mutate()}
              >
                <RefreshCw className="size-4" aria-hidden />
                {strings.google.syncNow}
              </Button>
              <DisconnectButton onDone={invalidate} />
            </>
          ) : (
            <>
              <Badge variant="outline">{strings.google.notConnected}</Badge>
              <Button
                size="sm"
                disabled={!data.configured || connect.isPending}
                onClick={() => connect.mutate()}
              >
                <Link2 className="size-4" aria-hidden />
                {strings.google.connect}
              </Button>
            </>
          )}
        </div>

        {data.connected && (
          <>
            {/* The status strip sits above the pickers, as the design puts it,
                with all three fields — and "Letzter Fehler" is always one of
                them. It used to appear only when there was an error, which is
                the wrong way round: rule 13 asks that a stuck row be nameable,
                and a field that is absent while things are fine cannot be read
                as "nothing has gone wrong" (K4). */}
            <dl className={`${STRIP} gap-x-6 gap-y-3`}>
              <div>
                <dt className={STRIP_LABEL}>{strings.google.lastSync}</dt>
                <dd className="mt-1 text-sm">
                  {data.lastSyncAt
                    ? formatRelativeBerlin(data.lastSyncAt, now)
                    : strings.google.never}
                </dd>
              </div>
              <div>
                <dt className={STRIP_LABEL}>{strings.google.queue}</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  {data.queuePending === 0 ? (
                    strings.google.queueEmpty
                  ) : (
                    <>
                      <span>{strings.google.queuePending(data.queuePending)}</span>
                      {data.queueStuck > 0 && (
                        <Badge variant="destructive">
                          {strings.google.queueStuck(data.queueStuck)}
                        </Badge>
                      )}
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className={STRIP_LABEL}>{strings.google.lastError}</dt>
                <dd className={`mt-1 text-sm ${data.lastError ? 'text-destructive' : ''}`}>
                  {data.lastError ?? DASH}
                </dd>
              </div>
            </dl>

            <CalendarPickers
              calendarId={data.calendarId}
              freebusyCalendarIds={data.freebusyCalendarIds}
              eventTitleTemplate={data.eventTitleTemplate}
              onSaved={invalidate}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : strings.error.generic
}

/** Writing needs more than read access; the picker says which calendars can
 *  actually take an event. */
function writable(accessRole: string): boolean {
  return accessRole === 'owner' || accessRole === 'writer'
}

const NO_CALENDAR = '__none__'

function CalendarPickers({
  calendarId,
  freebusyCalendarIds,
  eventTitleTemplate,
  onSaved,
}: {
  calendarId: string | null
  freebusyCalendarIds: string[]
  eventTitleTemplate: string
  onSaved: () => Promise<void> | void
}) {
  const calendars = useQuery(googleCalendarsQueryOptions)

  const saveCalendar = useMutation({
    mutationFn: (value: string | null) => setGoogleCalendar(value),
    onSuccess: async () => {
      await onSaved()
      toast.success(strings.google.saved)
    },
    onError: (error) => toast.error(message(error)),
  })

  const saveFreebusy = useMutation({
    mutationFn: (ids: string[]) => setFreebusyCalendars(ids),
    onSuccess: async () => {
      await onSaved()
      toast.success(strings.google.saved)
    },
    onError: (error) => toast.error(message(error)),
  })

  const rows = calendars.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="google-practice-calendar">{strings.google.practiceCalendar}</Label>
        <p className="mt-1 text-muted-foreground text-xs">{strings.google.practiceCalendarHint}</p>
        <Select
          value={calendarId ?? NO_CALENDAR}
          onValueChange={(value) => saveCalendar.mutate(value === NO_CALENDAR ? null : value)}
        >
          <SelectTrigger id="google-practice-calendar" className="mt-2 w-full sm:max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CALENDAR}>{strings.google.practiceCalendarNone}</SelectItem>
            {rows.map((calendar) => (
              <SelectItem
                key={calendar.id}
                value={calendar.id}
                disabled={!writable(calendar.accessRole)}
              >
                {calendar.summary}
                {!writable(calendar.accessRole) && ` (${strings.google.practiceCalendarReadOnly})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* The title stands under the calendar it is written to, because that
          is what it governs. */}
      <EventTitleField template={eventTitleTemplate} onSaved={onSaved} />

      <div>
        <span className="font-medium text-sm">{strings.google.freebusyCalendars}</span>
        <p className="mt-1 text-muted-foreground text-xs">{strings.google.freebusyCalendarsHint}</p>
        <div className="mt-2 space-y-2">
          {rows.map((calendar) => {
            const checked = freebusyCalendarIds.includes(calendar.id)
            return (
              <div key={calendar.id} className="flex items-center gap-2">
                <Checkbox
                  id={`freebusy-${calendar.id}`}
                  checked={checked}
                  disabled={saveFreebusy.isPending}
                  onCheckedChange={(next) =>
                    saveFreebusy.mutate(
                      next === true
                        ? [...freebusyCalendarIds, calendar.id]
                        : freebusyCalendarIds.filter((id) => id !== calendar.id),
                    )
                  }
                />
                <Label htmlFor={`freebusy-${calendar.id}`} className="font-normal">
                  {calendar.summary}
                </Label>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Disconnecting asks what should happen to the events in Google rather than
 * assuming. Leaving them is the default, because it loses nothing; deleting
 * names afterwards what it could not remove, with date and time, so those can
 * be found by hand.
 */
function DisconnectButton({ onDone }: { onDone: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false)
  const [remaining, setRemaining] = useState<{ startsAt: string; endsAt: string }[]>([])

  const disconnect = useMutation({
    mutationFn: (deleteRemoteEvents: boolean) => disconnectGoogle(deleteRemoteEvents),
    onSuccess: async (result) => {
      await onDone()
      setOpen(false)
      setRemaining(result.remaining)
      toast.success(
        result.attempted > 0
          ? strings.google.disconnectedWithDeletions(result.deleted, result.attempted)
          : strings.google.disconnected,
      )
    },
    onError: (error) => toast.error(message(error)),
  })

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Link2Off className="size-4" aria-hidden />
        {strings.google.disconnect}
      </Button>

      {open && (
        <div className="w-full space-y-3 rounded-md border p-4">
          <p className="font-medium text-sm">{strings.google.disconnectTitle}</p>
          <p className="text-muted-foreground text-sm">{strings.google.disconnectQuestion}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <Button
                size="sm"
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate(false)}
              >
                {strings.google.disconnectKeep}
              </Button>
              <p className="mt-2 text-muted-foreground text-xs">
                {strings.google.disconnectKeepHint}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <Button
                size="sm"
                variant="destructive"
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate(true)}
              >
                {strings.google.disconnectDelete}
              </Button>
              <p className="mt-2 text-muted-foreground text-xs">
                {strings.google.disconnectDeleteHint}
              </p>
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {strings.actions.cancel}
          </Button>
        </div>
      )}

      {remaining.length > 0 && (
        <div className="w-full rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p>{strings.google.disconnectRemaining}</p>
          <ul className="mt-2 space-y-1">
            {remaining.map((entry) => (
              <li key={entry.startsAt} className="font-mono text-xs">
                {formatBerlinDateTime(entry.startsAt)} – {formatBerlinDateTime(entry.endsAt)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

/**
 * What an event's title is built from (B1) — a template over a closed set of
 * placeholders, where a checkbox with two settings used to be.
 *
 * **This is the § 203 surface of the whole application**, so three things sit
 * around the field rather than in a tooltip: the sentence that the title is
 * all Google learns, a preview with made-up values so the practitioner reads
 * the actual line before it exists, and the refusals — an unknown placeholder
 * and a template that cannot produce a title are named here and cannot be
 * saved. The server refuses the same two through
 * `eventTitleTemplateSchema`; this is the readable half.
 *
 * The presets are a convenience and "Eigene Vorlage" is the escape from them.
 * Which one is selected is *derived* from the stored template rather than
 * remembered separately — two places holding "which preset" would eventually
 * disagree with the text in the field.
 */
function EventTitleField({
  template,
  onSaved,
}: {
  template: string
  onSaved: () => Promise<void> | void
}) {
  const [draft, setDraft] = useState(template)

  // The stored value is the truth whenever it changes — after a save, and
  // after a reconnect put it back to the contact number.
  useEffect(() => setDraft(template), [template])

  const save = useMutation({
    mutationFn: (value: string) => setGoogleEventTitle(value),
    onSuccess: async () => {
      await onSaved()
      toast.success(strings.google.saved)
    },
    onError: (error) => toast.error(message(error)),
  })

  const unknown = unknownEventTitlePlaceholders(draft)
  const empty = isEmptyEventTitleTemplate(draft)
  const preview = resolveEventTitle(draft, EVENT_TITLE_PREVIEW)
  /** Saveable, but it needs a Vorgang — and an appointment can have none. The
   *  push refuses an empty title rather than letting Google draw "(kein
   *  Titel)", so this is worth knowing here rather than from a stuck row. */
  const failsWithoutActivity =
    !empty && unknown.length === 0 && resolveEventTitle(draft, EVENT_TITLE_PREVIEW_SPARSE) === ''
  const preset = strings.google.eventTitlePresets.find((entry) => entry.template === draft)
  const canSave = unknown.length === 0 && !empty && draft.trim() !== '' && draft !== template

  return (
    <div>
      <span className="font-medium text-sm">{strings.google.eventTitle}</span>
      <p className="mt-1 max-w-prose text-muted-foreground text-xs">
        {strings.google.eventTitleLead}
      </p>

      <div className="mt-3 grid gap-3 sm:max-w-md">
        <div>
          <Label htmlFor="google-title-preset" className="font-normal text-xs">
            {strings.google.eventTitlePreset}
          </Label>
          <Select
            value={preset?.template ?? CUSTOM_TEMPLATE}
            onValueChange={(value) => {
              if (value !== CUSTOM_TEMPLATE) setDraft(value)
            }}
          >
            <SelectTrigger id="google-title-preset" className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {strings.google.eventTitlePresets.map((entry) => (
                <SelectItem key={entry.template} value={entry.template}>
                  {entry.label}
                </SelectItem>
              ))}
              {/* Last, and never a way *into* anything: picking it changes
                  nothing, it is what the list says when the text below is
                  none of the four. */}
              <SelectItem value={CUSTOM_TEMPLATE}>{strings.google.eventTitleCustom}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="google-title-template" className="font-normal text-xs">
            {strings.google.eventTitleTemplate}
          </Label>
          <Input
            id="google-title-template"
            className="mt-1 font-mono text-sm"
            value={draft}
            aria-invalid={unknown.length > 0 || empty ? true : undefined}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
      </div>

      {/* The line Google will show, before it shows it. */}
      <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2 sm:max-w-md">
        <p className="text-[11.5px] text-muted-foreground uppercase tracking-wide">
          {strings.google.eventTitlePreview}
        </p>
        <p className="mt-1 font-medium text-sm">{preview}</p>
        <p className="mt-1 text-muted-foreground text-xs">{strings.google.eventTitlePreviewHint}</p>
      </div>

      {failsWithoutActivity && (
        <p className="mt-2 max-w-prose text-amber-700 text-xs dark:text-amber-500">
          {strings.google.eventTitleSometimesEmpty}
        </p>
      )}

      {unknown.length > 0 && (
        <p className="mt-2 max-w-prose text-destructive text-xs">
          {strings.google.eventTitleUnknown(unknown)}
        </p>
      )}
      {empty && draft.trim() !== '' && (
        <p className="mt-2 max-w-prose text-destructive text-xs">
          {strings.google.eventTitleEmpty}
        </p>
      )}

      <dl className="mt-3 sm:max-w-md">
        {strings.google.eventTitlePlaceholderList.map((entry) => (
          <div key={entry.token} className="grid grid-cols-[auto_1fr] items-baseline gap-3 py-0.5">
            <dt className="font-mono text-muted-foreground text-xs">{entry.token}</dt>
            <dd className="text-muted-foreground text-xs">{entry.meaning}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 max-w-prose text-muted-foreground text-xs">
        {strings.google.eventTitleChainHint}
      </p>

      <div className="mt-3">
        <Button size="sm" disabled={!canSave || save.isPending} onClick={() => save.mutate(draft)}>
          {strings.settings.save}
        </Button>
      </div>

      <p className="mt-3 max-w-prose text-muted-foreground text-xs">
        {strings.google.eventTitleBare}
      </p>
      <p className="mt-1 max-w-prose text-muted-foreground text-xs">
        {strings.google.eventTitleFuture} {strings.google.eventTitleReset}
      </p>
    </div>
  )
}

/** The last entry of the preset list — a *label* for "none of the above",
 *  never a value that gets stored. */
const CUSTOM_TEMPLATE = '__custom__'
