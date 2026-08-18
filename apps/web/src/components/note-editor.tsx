import { NOTE_MARKERS } from '@praxi/shared'
import { Bold, Eye, Heading, List, ListOrdered, Pencil } from 'lucide-react'
import { useRef } from 'react'
import { NoteText } from '@/components/note-text'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { strings } from '@/lib/strings'

/**
 * The note field: a plain `<textarea>` holding Markdown, a toolbar that writes
 * the markers, and a preview toggle (D10).
 *
 * **The text in the box *is* the stored string.** Nothing parses it on the way
 * in and nothing re-serializes it on the way out, which is the whole reason
 * this is not a ProseMirror editor: one of those holds a document model, so
 * opening a note and saving it without typing would rewrite list markers and
 * collapse blank lines — and for a note that is about to be locked, the hashed
 * text would not be the text that was typed. A normalization on the way *in*
 * is harmless while it is idempotent; one on the way *out of storage* is not.
 * See the note on `canonicalNote`.
 *
 * ## Why the toolbar uses `document.execCommand`
 *
 * Because it is the only way that leaves the browser's undo stack intact, and
 * that was measured rather than assumed (Chrome 151, a real Cmd+Z through the
 * input pipeline):
 *
 * | how the toolbar writes | Cmd+Z afterwards |
 * | --- | --- |
 * | React-controlled update (native setter + `input` event) | nothing happens |
 * | `el.value = …` | nothing happens |
 * | `setRangeText` | nothing happens |
 * | `execCommand('insertText', …)` | restores the pre-toolbar text |
 *
 * "Nothing happens" is worse than it sounds: the programmatic assignment does
 * not merely fail to add an entry, it **empties the stack**. Three typed
 * paragraphs would be unrecoverable after one click on Fett — in a field
 * holding treatment documentation.
 *
 * The project bans `execCommand` for *formatting* — `execCommand('bold')` in a
 * `contentEditable`, an API that invents markup browser by browser. This is
 * not that: it inserts a plain string we composed ourselves into a textarea,
 * the result is still plain text, and the only thing the API contributes is
 * the undo entry. It fires a normal `input` event, so the controlled value
 * updates like any keystroke. Deprecated for a decade with no successor —
 * **do not "modernize" this call site.** The convention in CLAUDE.md says the
 * same thing.
 */
export function NoteEditor({
  id,
  value,
  onChange,
  previewing,
  onTogglePreview,
  rows = 10,
}: {
  id: string
  value: string
  onChange: (next: string) => void
  previewing: boolean
  onTogglePreview: () => void
  rows?: number
}) {
  const field = useRef<HTMLTextAreaElement>(null)

  /** Writes through the browser so the edit joins the undo history. Falls
   *  back to the controlled value where `execCommand` is refused, because a
   *  toolbar that silently does nothing is worse than one that costs an undo
   *  step. */
  function insert(text: string, selectionStart?: number, selectionEnd?: number) {
    const element = field.current
    if (!element) return

    element.focus()
    if (selectionStart !== undefined) {
      element.setSelectionRange(selectionStart, selectionEnd ?? selectionStart)
    }
    if (!document.execCommand('insertText', false, text)) {
      element.setRangeText(text, element.selectionStart, element.selectionEnd, 'end')
      onChange(element.value)
    }
  }

  /** Bold wraps the selection; with nothing selected it leaves the caret
   *  between the markers, which is where the next character belongs. */
  function toggleBold() {
    const element = field.current
    if (!element) return
    const { selectionStart, selectionEnd } = element
    const selected = element.value.slice(selectionStart, selectionEnd)

    insert(`${NOTE_MARKERS.bold}${selected}${NOTE_MARKERS.bold}`)
    if (selected === '') {
      const caret = selectionStart + NOTE_MARKERS.bold.length
      element.setSelectionRange(caret, caret)
    }
  }

  /**
   * A block marker goes in front of every line the selection touches, and
   * comes off again when it is already there — pressing the button twice
   * undoes it, which is what a toggle in a toolbar means.
   */
  function toggleBlock(marker: string) {
    const element = field.current
    if (!element) return

    const text = element.value
    const from = text.lastIndexOf('\n', element.selectionStart - 1) + 1
    const rawTo = text.indexOf('\n', element.selectionEnd)
    const to = rawTo === -1 ? text.length : rawTo

    const lines = text.slice(from, to).split('\n')
    // A numbered marker matches by shape, not literally: the line may read
    // "3. " where the button writes "1. ".
    const pattern = marker === NOTE_MARKERS.numbered ? /^\d+\.\s/ : null
    const has = lines.every((line) => (pattern ? pattern.test(line) : line.startsWith(marker)))

    const next = lines
      .map((line) => {
        if (!has) return marker + (pattern ? line.replace(pattern, '') : stripMarkers(line))
        return pattern ? line.replace(pattern, '') : line.slice(marker.length)
      })
      .join('\n')

    insert(next, from, to)
  }

  /** One block marker at a time: a line is a heading or a bullet, not both. */
  function stripMarkers(line: string): string {
    return line
      .replace(/^\d+\.\s/, '')
      .replace(/^## /, '')
      .replace(/^- /, '')
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <ToolButton label={strings.note.formatBold} onClick={toggleBold}>
          <Bold className="size-4" aria-hidden />
        </ToolButton>
        <ToolButton
          label={strings.note.formatHeading}
          onClick={() => toggleBlock(NOTE_MARKERS.heading)}
        >
          <Heading className="size-4" aria-hidden />
        </ToolButton>
        <ToolButton
          label={strings.note.formatBullets}
          onClick={() => toggleBlock(NOTE_MARKERS.bullet)}
        >
          <List className="size-4" aria-hidden />
        </ToolButton>
        <ToolButton
          label={strings.note.formatNumbered}
          onClick={() => toggleBlock(NOTE_MARKERS.numbered)}
        >
          <ListOrdered className="size-4" aria-hidden />
        </ToolButton>

        <Button
          type="button"
          variant={previewing ? 'default' : 'ghost'}
          size="sm"
          className="ml-auto h-8"
          onClick={onTogglePreview}
        >
          {previewing ? (
            <Pencil className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
          {previewing ? strings.note.previewOff : strings.note.previewOn}
        </Button>
      </div>

      {/* The preview replaces the field rather than standing beside it: both
          places a note is written are narrow, and two columns would halve the
          writing area for something one looks at rarely. */}
      {previewing ? (
        <div className="min-h-[--rows] rounded-md border bg-muted/30 px-3 py-2">
          {value.trim() === '' ? (
            <p className="text-muted-foreground text-sm">{strings.note.previewEmpty}</p>
          ) : (
            <NoteText text={value} />
          )}
        </div>
      ) : (
        <Textarea
          id={id}
          ref={field}
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {/* The syntax is typed faster than it is clicked once one knows it. */}
      <p className="mt-1 text-muted-foreground text-xs">{strings.note.formatHint}</p>
    </div>
  )
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
