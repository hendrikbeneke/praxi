import { createContext, useContext } from 'react'

/**
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS — read before replacing it with a plain <fieldset>.
 *
 * `<fieldset disabled>` is the whole read-mode mechanism (CLAUDE.md, read
 * mode first), and it works because the browser disables every form control
 * inside it. What being disabled suppresses is the **click**: a disabled
 * control never dispatches one, which is why buttons, inputs and checkboxes
 * are all correctly dead in read mode.
 *
 * Radix' Select does not open on click. It opens on `pointerdown`, and
 * pointer events *are* delivered to disabled form controls — the HTML spec
 * only holds back the click. So the trigger looked disabled and was not
 * focusable, and still opened its list on the first press. The choice was
 * then never saved, which is worse than a dropdown that does nothing: the
 * screen said something had been changed.
 *
 * That is not one forgotten `disabled` attribute, it is a class of mistake
 * that catches the next dropdown too — there were nine. So the state lives in
 * a context here and `Select` reads it: "a dropdown in read mode cannot be
 * operated" becomes a property of the component rather than a rule somebody
 * has to remember at the tenth one.
 *
 * Checked alongside it, with the reason each one needs nothing: Popover opens
 * on click, Checkbox acts on click, Tabs on mousedown — all three are
 * suppressed on a disabled control. A DropdownMenu or a combobox primitive
 * would open on `pointerdown` exactly like Select, but neither is used
 * anywhere in this application. If one arrives, it has to read this context.
 *
 * This deviates from two conventions — it reaches into a `ui/` component and
 * it replaces a native element with one of ours. The reason is the one above
 * and nothing else: the alternative was nine explicit attributes, which is a
 * rule someone must keep in mind, not a property of the code.
 *
 * What deliberately stays reachable inside it: links. Downloading a file from
 * a locked note in read mode is right, because **reading is allowed in read
 * mode**. That is the question to ask of any new control before putting it in
 * here — anything that changes the record belongs inside the fieldset,
 * anything that only shows what is already there does not have to.
 * ─────────────────────────────────────────────────────────────────────────
 */

const ReadOnlyContext = createContext(false)

/** True when this subtree sits in a fieldset that is currently read-only. */
export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext)
}

/** A `<fieldset>` that also says so to the components the browser cannot
 *  reach. Same props, same element; use it wherever read mode is gated. */
export function ReadModeFieldset({ disabled, ...props }: React.ComponentProps<'fieldset'>) {
  return (
    <ReadOnlyContext.Provider value={disabled === true}>
      <fieldset disabled={disabled} {...props} />
    </ReadOnlyContext.Provider>
  )
}
