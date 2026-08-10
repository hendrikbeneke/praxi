import type { SyncConflict } from '@praxi/shared'
import { formatBerlinDate, formatBerlinTime } from '@praxi/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { resolveGoogleConflict } from '@/lib/google'
import { strings } from '@/lib/strings'

/**
 * Appointments changed here and in Google at the same time.
 *
 * This sits in the calendar and not in the settings: a conflict is a
 * scheduling fact, not a configuration one. The settings say whether the sync
 * works; what to do about a slot belongs where slots are looked at.
 *
 * There is no merge and no "combine" button — the two versions stand side by
 * side and one of them is chosen.
 */
export function SyncConflictBanner({ conflicts }: { conflicts: SyncConflict[] }) {
  const [open, setOpen] = useState(false)

  if (conflicts.length === 0) return null

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <span>{strings.google.conflictsBanner(conflicts.length)}</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setOpen(true)}>
          {strings.google.conflictsOpen}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{strings.google.conflictsTitle}</DialogTitle>
            <DialogDescription>{strings.google.conflictsDescription}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {conflicts.map((conflict) => (
              <ConflictRow key={conflict.appointmentId} conflict={conflict} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function interval(startsAt: string, endsAt: string): string {
  return `${formatBerlinDate(startsAt)}, ${formatBerlinTime(startsAt)}–${formatBerlinTime(endsAt)}`
}

function ConflictRow({ conflict }: { conflict: SyncConflict }) {
  const queryClient = useQueryClient()

  const resolve = useMutation({
    mutationFn: (keep: 'local' | 'remote') => resolveGoogleConflict(conflict.appointmentId, keep),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['google'] })
      await queryClient.invalidateQueries({ queryKey: ['appointments'] })
      toast.success(strings.google.conflictResolved)
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : strings.error.generic),
  })

  return (
    <div className="rounded-md border p-4">
      <p className="font-medium text-sm">
        {strings.google.contactNumberShort} {conflict.contactNumber}
      </p>
      {conflict.reason === 'overlap' && (
        <p className="mt-1 text-muted-foreground text-xs">
          {strings.google.conflictReasons.overlap}
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border p-3">
          <p className="text-muted-foreground text-xs">{strings.google.conflictLocal}</p>
          <p className="mt-1 text-sm">{interval(conflict.localStartsAt, conflict.localEndsAt)}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate('local')}
          >
            {strings.google.conflictKeepLocal}
          </Button>
        </div>

        <div className="rounded-md border p-3">
          <p className="text-muted-foreground text-xs">{strings.google.conflictRemote}</p>
          <p className="mt-1 text-sm">
            {interval(conflict.remoteStartsAt, conflict.remoteEndsAt)}
            {conflict.remoteCancelled && ` · ${strings.google.conflictCancelled}`}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate('remote')}
          >
            {strings.google.conflictKeepRemote}
          </Button>
        </div>
      </div>
    </div>
  )
}
