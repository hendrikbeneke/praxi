import { formatBerlinDateTime } from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Link2, Link2Off, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
  syncGoogleNow,
} from '@/lib/google'
import { strings } from '@/lib/strings'

/**
 * The Google area of the settings.
 *
 * It says what the connection is doing — nothing more. A sync conflict is a
 * scheduling question and lives in the calendar, where scheduling happens.
 */
export function GoogleSettings() {
  const queryClient = useQueryClient()
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
      <CardHeader>
        <CardTitle>{strings.google.title}</CardTitle>
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
              <Badge variant="secondary">
                {strings.google.connectedAs} {data.accountEmail ?? '—'}
              </Badge>
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
            <CalendarPickers
              calendarId={data.calendarId}
              freebusyCalendarIds={data.freebusyCalendarIds}
              onSaved={invalidate}
            />

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{strings.google.lastSync}</dt>
                <dd>
                  {data.lastSyncAt ? formatBerlinDateTime(data.lastSyncAt) : strings.google.never}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{strings.google.queue}</dt>
                <dd className="flex flex-wrap gap-2">
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
              {data.lastError && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">{strings.google.lastError}</dt>
                  <dd className="text-destructive">{data.lastError}</dd>
                </div>
              )}
            </dl>
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
  onSaved,
}: {
  calendarId: string | null
  freebusyCalendarIds: string[]
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
