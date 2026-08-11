import { useEffect } from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'

/** `Toaster` renders nothing by itself — it is the mount point `sonner`
 *  paints into once something calls `toast()`, exactly like `__root.tsx`
 *  mounts it once and every mutation elsewhere in the app just calls
 *  `toast.success` / `toast.error`. Triggered here on mount so the card has
 *  something to show.
 *
 *  `position="top-center"`, NOT the real app's `bottom-right` (`__root.tsx`)
 *  — this is a preview-capture workaround, not the real convention. The
 *  design-sync render check crops each card around wherever centered
 *  overlays (Dialog, AlertDialog) land, which is why those render correctly;
 *  a `bottom-right` toast landed almost entirely outside that crop and
 *  showed as a sliver. `position` is a real, documented prop of the real
 *  component — composing with `bottom-right` to match the app is correct,
 *  this preview just can't demonstrate that position and stay visible.
 *  The animation override below is a separate, unrelated safety net (kept
 *  in case a slow environment ever screenshots mid-transition) — it did not
 *  fix the cropping issue by itself; changing position did. */
function NoEnterAnimation() {
  return (
    <style>{`
      [data-sonner-toast] { transition: none !important; }
    `}</style>
  )
}

export function Erfolg() {
  useEffect(() => {
    toast.success('Eintrag gespeichert.')
  }, [])

  return (
    <div className="h-32 w-full">
      <NoEnterAnimation />
      <Toaster position="top-center" />
    </div>
  )
}

export function Fehler() {
  useEffect(() => {
    toast.error('Der Eintrag konnte nicht gespeichert werden.')
  }, [])

  return (
    <div className="h-32 w-full">
      <NoEnterAnimation />
      <Toaster position="top-center" />
    </div>
  )
}
