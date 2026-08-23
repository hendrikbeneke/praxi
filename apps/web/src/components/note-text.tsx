/**
 * biome-ignore-all lint/suspicious/noArrayIndexKey: every node below is
 * derived from one string and re-derived whole on each render — nothing is
 * inserted, removed or reordered in place, and none of it holds state. The
 * position in the parsed tree is the only identity these nodes have, and the
 * bug the rule guards against (state following the wrong row after a move)
 * cannot arise where there are no moves and no state.
 */
import { noteMdast } from '@praxi/shared'
import type { Nodes, Parents, TableRow as TableRowNode } from 'mdast'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A note, rendered (L6a).
 *
 * **No HTML is produced anywhere on this path.** `noteMdast` answers with the
 * closed tree `packages/shared/src/note-mdast.ts` defines, and the registry
 * below maps each node type onto React elements — there is no string that
 * could be talked into markup, so there is nothing to sanitize and no
 * `dangerouslySetInnerHTML`. The whole class of injection bugs does not exist
 * here rather than being defended against, which is what a field holding
 * treatment documentation deserves.
 *
 * ## Why a registry and not `react-markdown`
 *
 * Because a new construct has to cost three entries and no rebuild. When
 * `==highlight==` arrives — markdown has no standard for it, so it will be a
 * remark plugin with a node type of its own — it is one entry in
 * `NOTE_MDAST_TYPES`, one Milkdown mark, and one line here. Through
 * `react-markdown` the same node would additionally need a `remark-rehype`
 * handler and a hast element, because that library renders hast rather than
 * mdast; and "no HTML" would be a configuration (`rehype-raw` must never be
 * added) instead of a property of the shape.
 *
 * It also costs nothing: Milkdown already ships remark-parse, remark-gfm and
 * micromark, so the parse behind this is bytes the bundle has anyway.
 *
 * ## Unknown types render their children
 *
 * The normalizer has already flattened everything it does not know, so this
 * should never fire. It is here because "should never" is not a rendering
 * strategy: a note must never fail to display.
 */
export function NoteText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('note-prose text-sm', className)}>
      <Children node={noteMdast(text)} />
    </div>
  )
}

function Children({ node }: { node: Parents }) {
  return (
    <>
      {node.children.map((child, index) => (
        <Node key={index} node={child} />
      ))}
    </>
  )
}

function TableRow({ row, cell }: { row: TableRowNode; cell: 'th' | 'td' }) {
  const Cell = cell
  return (
    <tr>
      {row.children.map((content, index) => (
        <Cell key={index}>
          <Children node={content} />
        </Cell>
      ))}
    </tr>
  )
}

function Node({ node }: { node: Nodes }): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return (
        <p>
          <Children node={node} />
        </p>
      )

    case 'heading': {
      // Three levels, one look — the design draws a single heading style, and
      // the level is kept because it is part of what was written, not because
      // it is meant to be seen as three sizes.
      const Tag = (['h1', 'h2', 'h3'] as const)[Math.min(node.depth, 3) - 1] ?? 'h3'
      return (
        <Tag>
          <Children node={node} />
        </Tag>
      )
    }

    case 'list': {
      const Tag = node.ordered ? 'ol' : 'ul'
      // A task list is a list whose items carry a checkbox; marking it lets
      // the stylesheet drop the bullet without a second node type.
      const task = node.children.some((item) => item.checked !== null && item.checked !== undefined)
      return (
        <Tag
          {...(node.start != null && node.start !== 1 ? { start: node.start } : {})}
          data-task={task ? '' : undefined}
        >
          <Children node={node} />
        </Tag>
      )
    }

    case 'listItem':
      return (
        <li data-checked={node.checked === true ? '' : undefined}>
          {node.checked !== null && node.checked !== undefined && (
            // Read only, deliberately: the reading pane reads. Ticking one off
            // is editing the note, and that happens in the editor.
            <input type="checkbox" checked={node.checked} readOnly aria-hidden tabIndex={-1} />
          )}
          <Children node={node} />
        </li>
      )

    case 'blockquote':
      return (
        <blockquote>
          <Children node={node} />
        </blockquote>
      )

    case 'code':
      return (
        <pre>
          <code>{node.value}</code>
        </pre>
      )

    case 'thematicBreak':
      return <hr />

    case 'table': {
      /* mdast has no header row of its own — in GFM the *first* row is the
         header, which is what the editor's schema says too
         (`table_header_row`). Drawing every row the same would let the two
         disagree about the same note. */
      const [head, ...body] = node.children
      return (
        <div className="note-prose-scroll">
          <table>
            {head && (
              <thead>
                <TableRow row={head} cell="th" />
              </thead>
            )}
            <tbody>
              {body.map((row, index) => (
                <TableRow key={index} row={row} cell="td" />
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    case 'tableRow':
      return <TableRow row={node} cell="td" />

    case 'tableCell':
      return (
        <td>
          <Children node={node} />
        </td>
      )

    case 'strong':
      return (
        <strong>
          <Children node={node} />
        </strong>
      )

    case 'emphasis':
      return (
        <em>
          <Children node={node} />
        </em>
      )

    case 'delete':
      return (
        <del>
          <Children node={node} />
        </del>
      )

    case 'inlineCode':
      return <code>{node.value}</code>

    case 'link':
      /* `rel` and `target` on every link without asking what it points at: a
         note may quote an address a patient sent, and the referrer of a page
         inside a practice's software is not something to hand out. */
      return (
        <a href={node.url} target="_blank" rel="noreferrer noopener">
          <Children node={node} />
        </a>
      )

    case 'text':
      return node.value

    case 'break':
      return <br />

    default:
      return 'children' in node ? <Children node={node as Parents} /> : null
  }
}
