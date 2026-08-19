import { MiniMonth } from '@/components/mini-month'
import { Button } from '@/components/ui/button'
import { strings } from '@/lib/strings'

/**
 * The calendar's **left** rail: the way in, the month, and the slot finder
 * (D-K2).
 *
 * K10 put all of this on the right, in one rail with the day's overview, and
 * wrote down why: two columns rather than three was a D9 decision, and the
 * composition was the design's own, only mirrored. The design images of this
 * round settle it the other way — three columns, and this is the left one.
 *
 * The split is not cosmetic. Everything here is a *question one asks of the
 * calendar* — take me to that month, find me an hour, start something new —
 * while the right rail answers with a day or with the entry that was clicked.
 * Sharing a column meant the finder and the day's schedule took turns, so
 * looking for a gap hid the day one was looking for it in.
 */
export function CalendarSidebar({
  anchor,
  visible,
  occupied,
  finder,
  onNew,
  onPickDay,
}: {
  /** The day the calendar is describing. */
  anchor: string
  /** Every day the grid currently shows, for the month's week band. */
  visible: ReadonlySet<string>
  /** Days with at least one slot-holding entry. */
  occupied: ReadonlySet<string>
  /** The slot finder, passed in rather than rendered here: its search is the
   *  same piece of state the grid paints its offers from, and that belongs to
   *  the page. */
  finder: React.ReactNode
  onNew: () => void
  onPickDay: (date: string) => void
}) {
  return (
    <aside className="hidden w-[238px] shrink-0 flex-col gap-5 overflow-auto border-r bg-card p-4 lg:flex">
      <Button className="w-full" onClick={onNew}>
        {strings.appointment.newAppointment}
      </Button>

      <MiniMonth anchor={anchor} visible={visible} occupied={occupied} onPick={onPickDay} />

      {finder}
    </aside>
  )
}
