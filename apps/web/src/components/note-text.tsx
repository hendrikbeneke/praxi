/**
 * biome-ignore-all lint/suspicious/noArrayIndexKey: every node below is
 * derived from one string and re-derived whole on each render — nothing is
 * inserted, removed or reordered in place, and none of it holds state. The
 * position in the parsed text is the only identity these nodes have, and the
 * bug the rule guards against (state following the wrong row after a move)
 * cannot arise where there are no moves and no state.
 */
import { type Inline, parseNoteText } from '@praxi/shared'
import { Fragment } from 'react'
import { cn } from '@/lib/utils'

/**
 * A note, rendered (D10).
 *
 * **No HTML is produced anywhere on this path.** `parseNoteText` answers with a
 * tree and this maps it onto React elements — there is no string that could be
 * talked into markup, so there is nothing to sanitize and no
 * `dangerouslySetInnerHTML`. The whole class of injection bugs does not exist
 * here rather than being defended against, which is what a field holding
 * treatment documentation deserves.
 *
 * The same component draws the note in the case file and the preview inside
 * the editor, so the preview cannot show something the record will not.
 */
export function NoteText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('space-y-3 text-sm', className)}>
      {parseNoteText(text).map((block, index) => {
        if (block.kind === 'heading') {
          return (
            <h3 key={index} className="mt-4 font-semibold first:mt-0">
              <Line inlines={block.content} />
            </h3>
          )
        }

        if (block.kind === 'paragraph') {
          return (
            <p key={index} className="leading-relaxed">
              {block.lines.map((line, lineIndex) => (
                <Fragment key={lineIndex}>
                  {lineIndex > 0 && <br />}
                  <Line inlines={line} />
                </Fragment>
              ))}
            </p>
          )
        }

        const List = block.kind === 'bullets' ? 'ul' : 'ol'
        return (
          <List
            key={index}
            className={cn(
              'space-y-1 pl-5',
              block.kind === 'bullets' ? 'list-disc' : 'list-decimal',
            )}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="leading-relaxed">
                <Line inlines={item} />
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}

function Line({ inlines }: { inlines: readonly Inline[] }) {
  return (
    <>
      {inlines.map((part, index) =>
        part.kind === 'bold' ? (
          <strong key={index} className="font-semibold">
            {part.text}
          </strong>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}
