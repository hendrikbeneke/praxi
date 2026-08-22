import { useEffect, useRef } from 'react'
import { strings } from '@/lib/strings'

/**
 * The end of a list that loads as it is scrolled (L3).
 *
 * An `IntersectionObserver` rather than a scroll handler: it fires when this
 * element comes into view, whatever is scrolling — the window, a card with its
 * own overflow, a dialog — and costs nothing in between.
 *
 * `rootMargin` starts the fetch a screen early, so the rows are usually there
 * before the reader arrives at them.
 *
 * When there is nothing more to fetch it renders nothing at all: "das war
 * alles" under every list is a line one reads once and then never again.
 */
export function InfiniteSentinel({
  hasMore,
  loading,
  onReach,
}: {
  hasMore: boolean
  loading: boolean
  onReach: () => void
}) {
  const anchor = useRef<HTMLDivElement | null>(null)
  /** Read inside the observer, so a callback identity that changes on every
   *  render does not tear the observer down and build it up again. */
  const reach = useRef(onReach)
  reach.current = onReach

  useEffect(() => {
    const element = anchor.current
    if (!element || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reach.current()
      },
      { rootMargin: '600px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasMore])

  if (!hasMore) return null

  return (
    <div ref={anchor} className="py-4 text-center text-muted-foreground text-sm">
      {loading ? strings.status.loading : null}
    </div>
  )
}
