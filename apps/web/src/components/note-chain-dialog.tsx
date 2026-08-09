import { chainEntryOk, chainOk, formatBerlinDate, formatBerlinDateTime } from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, TriangleAlert } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { chainQueryOptions } from '@/lib/notes'
import { strings } from '@/lib/strings'

/**
 * The verification view.
 *
 * It names each affected note by date and id, and keeps the three causes
 * apart — an altered row, a cut chain, and bytes that no longer match their
 * hash all mean different things and call for different responses.
 */
export function NoteChainDialog({
  contactId,
  open,
  onOpenChange,
}: {
  contactId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const report = useQuery({ ...chainQueryOptions(contactId), enabled: open })

  const data = report.data
  const ok = data ? chainOk(data) : false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{strings.note.chainTitle}</DialogTitle>
          <DialogDescription>
            {report.isPending
              ? strings.note.chainRunning
              : !data || data.entries.length === 0
                ? strings.note.chainEmpty
                : ok
                  ? strings.note.chainOkBody(data.entries.length)
                  : strings.note.chainBrokenBody}
          </DialogDescription>
        </DialogHeader>

        {data && data.entries.length > 0 && (
          <>
            <div
              className={`flex items-center gap-2 rounded-md border px-4 py-3 ${
                ok ? '' : 'border-destructive/40 bg-destructive/5'
              }`}
            >
              {ok ? (
                <CheckCircle2 className="size-5 text-muted-foreground" aria-hidden />
              ) : (
                <TriangleAlert className="size-5 text-destructive" aria-hidden />
              )}
              <span className="font-medium text-sm">
                {ok ? strings.note.chainOk : strings.note.chainBroken}
              </span>
            </div>

            <ul className="space-y-2">
              {data.entries.map((entry) => {
                const entryOk = chainEntryOk(entry)
                return (
                  <li
                    key={entry.noteId}
                    className={`rounded-md border px-4 py-3 text-sm ${
                      entryOk ? '' : 'border-destructive/40'
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-medium">
                        {formatBerlinDate(`${entry.noteDate}T12:00:00Z`)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {strings.note.lockedAt} {formatBerlinDateTime(entry.lockedAt)}
                      </span>
                      {entryOk && (
                        <span className="ml-auto text-muted-foreground text-xs">
                          {strings.note.chainEntryOk}
                        </span>
                      )}
                    </div>

                    {/* The id, so the row can be found in the database when it
                        has to be. */}
                    {!entryOk && (
                      <p className="mt-1 font-mono text-muted-foreground text-xs">{entry.noteId}</p>
                    )}

                    {!entry.contentOk && (
                      <p className="mt-2 text-destructive">{strings.note.chainContentBroken}</p>
                    )}
                    {!entry.linkOk && (
                      <p className="mt-2 text-destructive">{strings.note.chainLinkBroken}</p>
                    )}

                    {entry.files
                      .filter((file) => file.status !== 'ok')
                      .map((file) => (
                        <p key={file.fileId} className="mt-2 text-destructive">
                          {file.fileName}:{' '}
                          {file.status === 'missing'
                            ? strings.note.chainFileMissing
                            : strings.note.chainFileMismatch}
                        </p>
                      ))}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
