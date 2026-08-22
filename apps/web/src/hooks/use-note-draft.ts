import type { NoteDraft, NoteDraftInput } from '@praxi/shared'
import { NOTE_DRAFT_IDLE_MS, NOTE_DRAFT_MAX_WAIT_MS } from '@praxi/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteNoteDraft, loadNoteDraft, saveNoteDraft } from '@/lib/note-drafts'

/**
 * Keeps the note being written on the server while it is being written (L2).
 *
 * Written against the **form state**, not against the dialog that happens to
 * hold it today: L6 moves writing into the reading pane, and this moves with
 * it unchanged.
 *
 * ## The cadence
 *
 * Three seconds after the last keystroke, and at the latest every twenty even
 * if nobody pauses. Pauses of three seconds happen constantly between
 * sentences, so most saves land while the writer is thinking; twenty is the
 * actual promise — never more than twenty seconds of work at stake.
 *
 * There is deliberately **no `beforeunload` handler**: the case this exists
 * for is a browser that crashes, and a crash fires no event. A farewell
 * handler that is missing exactly when it would be needed is not a promise.
 * What there is instead is `flush()`, called when the form closes, so
 * "Abbrechen leaves the draft lying" is true down to the last keystroke.
 *
 * Nothing is sent while the text is blank. A draft without text is not a
 * draft, so emptying the field deletes what is stored rather than leaving a
 * husk to be asked about at the next opening.
 */

export type NoteDraftForm = Omit<NoteDraftInput, 'contactId' | 'noteId'>

type Options = {
  /** False while the form is closed: nothing is loaded, nothing is saved. */
  open: boolean
  contactId: string
  /** The note being edited, or undefined while writing a new one. */
  noteId?: string | undefined
  /** What the form currently holds. */
  form: NoteDraftForm
}

export type NoteDraftState = {
  /** The stored draft found when the form opened — the offer to take over.
   *  Null once it has been accepted or discarded. */
  offer: NoteDraft | null
  accept: () => void
  discard: () => void
  /** Saves what is pending, if anything. Called when the form closes. */
  flush: () => Promise<void>
  /** Drops the stored draft — what "Speichern" does to the draft it came
   *  from, once the note itself is written. */
  clear: () => Promise<void>
}

export function useNoteDraft(options: Options): NoteDraftState {
  const { open, contactId, noteId, form } = options

  const [offer, setOffer] = useState<NoteDraft | null>(null)
  /** The id of the row on the server, so discarding and clearing need no
   *  second lookup. */
  const draftId = useRef<string | null>(null)
  /** What was last written, so an unchanged form sends nothing. */
  const saved = useRef<string | null>(null)
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ceiling = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Suspends saving between opening and the question being answered, so the
   *  empty form the dialog starts with cannot overwrite what is stored. */
  const asking = useRef(false)

  /**
   * What would be sent, and its fingerprint — one value, so "has anything
   * changed" is asked in exactly one place. The timers read it at the moment
   * they fire rather than at the moment they were set, which is what the ref
   * is for; the fingerprint is what the effect below watches.
   */
  const payload: NoteDraftInput = {
    ...form,
    contactId,
    noteId: noteId ?? null,
    text: form.text.trim(),
  }
  const formKey = JSON.stringify(payload)
  const current = useRef(payload)
  current.current = payload

  const stopTimers = useCallback(() => {
    if (idle.current) clearTimeout(idle.current)
    if (ceiling.current) clearTimeout(ceiling.current)
    idle.current = null
    ceiling.current = null
  }, [])

  const write = useCallback(async () => {
    stopTimers()
    const values = current.current
    const fingerprint = JSON.stringify(values)
    if (fingerprint === saved.current) return

    if (values.text === '') {
      // Nothing to keep. What is stored goes, rather than standing as a husk
      // that the next opening would ask about.
      const id = draftId.current
      draftId.current = null
      saved.current = fingerprint
      if (id) await deleteNoteDraft(id).catch(() => undefined)
      return
    }

    /* A failed save is deliberately silent: the next keystroke tries again,
       and a toast every time the server hiccups would interrupt the writing
       this exists to protect. */
    const stored = await saveNoteDraft(values).catch(() => null)
    if (!stored) return

    draftId.current = stored.id
    saved.current = fingerprint
  }, [stopTimers])

  // What is on the server when the form opens, and what the question offers.
  useEffect(() => {
    if (!open) return

    let cancelled = false
    asking.current = true
    draftId.current = null
    saved.current = null
    setOffer(null)

    loadNoteDraft({ contactId, noteId })
      .then((found) => {
        if (cancelled) return
        if (found) {
          draftId.current = found.id
          setOffer(found)
        } else {
          asking.current = false
        }
      })
      .catch(() => {
        if (!cancelled) asking.current = false
      })

    return () => {
      cancelled = true
      asking.current = false
      stopTimers()
    }
  }, [open, contactId, noteId, stopTimers])

  // The cadence. Restarted by every change to the form; the ceiling is not,
  // which is what makes it a ceiling and not a second idle timer.
  useEffect(() => {
    if (!open || asking.current) return
    // Nothing has moved since the last write — no timer, so an unrelated
    // re-render cannot postpone a save that is already due.
    if (formKey === saved.current) return

    if (idle.current) clearTimeout(idle.current)
    idle.current = setTimeout(() => void write(), NOTE_DRAFT_IDLE_MS)
    if (!ceiling.current) {
      ceiling.current = setTimeout(() => {
        ceiling.current = null
        void write()
      }, NOTE_DRAFT_MAX_WAIT_MS)
    }
  }, [open, write, formKey])

  const accept = useCallback(() => {
    asking.current = false
    setOffer(null)
  }, [])

  const discard = useCallback(() => {
    asking.current = false
    setOffer(null)
    const id = draftId.current
    draftId.current = null
    saved.current = null
    if (id) void deleteNoteDraft(id).catch(() => undefined)
  }, [])

  const flush = useCallback(async () => {
    if (asking.current) {
      stopTimers()
      return
    }
    await write()
  }, [write, stopTimers])

  const clear = useCallback(async () => {
    stopTimers()
    const id = draftId.current
    draftId.current = null
    saved.current = null
    asking.current = false
    if (id) await deleteNoteDraft(id).catch(() => undefined)
  }, [stopTimers])

  return { offer, accept, discard, flush, clear }
}
