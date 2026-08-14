## About this design system

This is a **partial** import: 15 of the ~45 UI components in the Praxi practice-management app — the shadcn/ui primitives and the two praxi-specific patterns that back exactly two screens, the **Kontaktliste** (contact list) and **Kontaktdetails** (contact detail) view. It is not the whole app's UI. Read `guidelines/contact-list.md` and `guidelines/contact-detail.md` before proposing a layout for either screen — they list every field, column and section the real screen shows, in German, and a redesign must keep every one of them; nothing may be silently dropped.

No provider or root wrapper is required — every component here renders standalone. The one exception is composition, not context: wrap editable form sections in `<ReadModeFieldset disabled={!editing}>` (from the Patterns group) whenever you're building a form that has a read-only and an edit state, which is the norm in this app (see "Read mode first" below).

## Styling idiom

Tailwind CSS utility classes, shadcn/ui "new-york" style, neutral base color. Never invent a class outside this system's own vocabulary (no arbitrary hex colors, no ad-hoc `text-[#...]`) — use the semantic color tokens below, which are CSS custom properties consumed as Tailwind utilities:

| Token | Utility form | Use |
|---|---|---|
| `--background` / `--foreground` | `bg-background` / `text-foreground` | page background / default text |
| `--card` / `--card-foreground` | `bg-card` / `text-card-foreground` | `Card` surfaces |
| `--popover` / `--popover-foreground` | `bg-popover` / `text-popover-foreground` | `Popover`, `Select`, `AlertDialog` surfaces |
| `--primary` / `--primary-foreground` | `bg-primary` / `text-primary-foreground` | primary actions, the default `Button` variant |
| `--secondary` / `--secondary-foreground` | `bg-secondary` / `text-secondary-foreground` | secondary emphasis (e.g. a settled-state `Badge`) |
| `--muted` / `--muted-foreground` | `bg-muted` / `text-muted-foreground` | de-emphasized text, hint lines, disabled surfaces |
| `--accent` / `--accent-foreground` | `bg-accent` / `text-accent-foreground` | hover states |
| `--destructive` | `bg-destructive` / `text-destructive` | destructive actions, error text, "not documented"-style warnings |
| `--border` / `--input` / `--ring` | `border-border`, `border-input`, `ring-ring` | borders and focus rings |

Radius scale: `rounded-md` is the default control radius; `rounded-xl` is `Card`'s; `rounded-full` is `Badge`'s. Spacing follows Tailwind's default scale (`gap-2`, `gap-4`, `gap-6`, `px-3`, `px-6` are the recurring values across these components) — don't introduce a new spacing scale.

The brand typeface is **Source Sans 3**, self-hosted (weights 400/600, `font-family: var(--font-sans)`) — no CDN, no remote `@font-face` (CLAUDE.md: no external fonts, no CDN, no telemetry). It's already the default body font; don't set a different `font-family` when composing with these components, and don't add a second webfont.

Numeric/tabular data (contact numbers, dates, amounts) is set with `tabular-nums` in the real app so columns of numbers align — carry that over in any table or list composition.

## Where the truth lives

- `styles.css` (root) — the token definitions above, `@import`ed into every rendered design.
- `_ds_bundle.css` — the compiled component styles, reachable through `styles.css`'s import.
- Each component's `.prompt.md` under `components/<group>/<Name>/` — real usage examples and the exact prop API.
- `guidelines/contact-list.md`, `guidelines/contact-detail.md` — the field inventories for the two screens this system exists to redesign.

## Read mode first

This app's forms default to **read-only** and become editable only after an explicit "Bearbeiten" action — never build a form that starts pre-filled and immediately editable, except a brand-new record that has nothing to read yet. The mechanism is `ReadModeFieldset`: it's a real `<fieldset>` that also disables Radix `Select` inside it (a plain `disabled` attribute alone does not stop a Radix `Select` from opening). Compose it around a group of `Label`+`Input`/`Select`/`Textarea`/`Checkbox` fields, toggle `disabled` between the read and edit states, and pair it with a "Bearbeiten" / "Speichern" / "Abbrechen" button row outside the fieldset.

## An idiomatic composition

```tsx
import { ReadModeFieldset } from '@/components/read-mode-fieldset'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function NameSection({ editing }: { editing: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Name</CardTitle>
      </CardHeader>
      <ReadModeFieldset disabled={!editing}>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="firstName">Vorname</Label>
            <Input id="firstName" className="mt-2" defaultValue="Erika" />
          </div>
          <div>
            <Label htmlFor="lastName">Nachname</Label>
            <Input id="lastName" className="mt-2" defaultValue="Musterfrau" />
          </div>
        </CardContent>
      </ReadModeFieldset>
      {editing && (
        <div className="flex justify-end gap-2 px-6">
          <Button variant="ghost">Abbrechen</Button>
          <Button>Speichern</Button>
        </div>
      )}
    </Card>
  )
}
```

# PraxiWeb (@praxi/web@0.0.0)

This design system is the published @praxi/web React library, bundled as a single
browser global. All 15 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.PraxiWeb`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).
- `guidelines/` — the design system's own usage guidance (2 doc(s), see `guidelines/index.md`). Read these before composing larger layouts.

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.PraxiWeb.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { AlertDialog } = window.PraxiWeb;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<AlertDialog />);
```

## Tokens

118 CSS custom properties from @praxi/web. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (23): `--tw-border-style`, `--tw-shadow-color`, `--tw-inset-shadow-color`, …
- **spacing** (5): `--tw-space-y-reverse`, `--tw-inset-shadow`, `--tw-inset-shadow-alpha`, …
- **typography** (10): `--tw-font-weight`, `--tw-tracking`, `--font-sans`, …
- **radius** (2): `--radius-xs`, `--radius`
- **shadow** (7): `--tw-shadow`, `--tw-shadow-alpha`, `--tw-ring-shadow`, …
- **other** (71): `--tw-translate-x`, `--tw-translate-y`, `--tw-translate-z`, …

## Components

### primitives
- `AlertDialog`
- `Badge`
- `Button`
- `Card`
- `Checkbox`
- `Input`
- `Label`
- `Popover`
- `Select`
- `Table`
- `Tabs`
- `Textarea`

### patterns
- `DateField`
- `PageHeader`
- `ReadModeFieldset`
