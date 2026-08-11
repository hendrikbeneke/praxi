# Design-sync notes — Praxi App Design System

## Scope decision (2026-08-11)

This repo is the application itself (`apps/web`), not a component library —
no `dist/`, no `.d.ts` exports, no Storybook. First sync is scoped tightly to
what the user actually wants to redesign with Claude Design: the **Kontaktliste**
(`contacts.index.tsx`) and **Kontaktdetails** (`contacts.$contactId.tsx`)
screens, plus the primitives/patterns they're built from. 15 components:

- 12 shadcn primitives (`components/ui/*`): Badge, Button, Card, Checkbox,
  Input, Label, Popover, Select, Table, Textarea, AlertDialog, Tabs
- 3 praxi-specific standalone components: PageHeader, DateField,
  ReadModeFieldset

Deliberately **excluded**: the other ~30 components under `apps/web/src/components`
— they're screens/dialogs coupled to `@tanstack/react-query` and
`@tanstack/react-router` (data fetching, mutations), not composable UI
building blocks. TimeField, ReadModeFooter, CatalogueControls also excluded —
not used by either target screen. `components/ui/dialog.tsx`, `separator.tsx`,
`sonner.tsx` also excluded for the same reason.

Every graded/authored preview should be for these 15 — this campaign's scope
is narrower than "the whole app", intentionally.

## No dist — hand-written entry, not synth-from-src

`resolvePackage`'s built-in synth-entry fallback does `export * from <every
tsx/jsx under src/>`, which would pull in every route, every API-coupled
component, generated route trees, etc. — wrong for an app repo. Instead:

- `apps/web/.ds-sync-scratch/entry.tsx` hand-lists exactly the 15 components'
  real named exports (re-exporting compound sub-parts too, e.g. `CardHeader`,
  `SelectContent`, `TableRow` — needed for realistic compositions in
  previews). Regenerate by hand if the scope changes; it's gitignored.
- `cfg.entry` points at it, so `ENTRY_OVERRIDE` is set and the "scan whole
  src/" path in `resolvePackage` is never taken. `cfg.componentSrcMap` still
  supplies the component *names* (apps/web's `package.json` has no
  `main`/`module`/`types`, so `exportedNames()` returns empty — every name
  comes from the map).
- `cfg.tsconfig: "tsconfig.json"` (apps/web's own) so the `@/*` → `./src/*`
  alias resolves in the entry file and its imports.

All 15 components' own imports were checked before scoping: pure (`cn` from
`@/lib/utils`, `strings` from `@/lib/strings`, `useReadOnly` context, and
`@praxi/shared`'s date-format module via the built `packages/shared/dist`
which is already symlinked into `apps/web/node_modules/@praxi/shared`) — no
API calls, no router, no query client needed. No `cfg.provider` required.

## CSS — compiled, not the Tailwind 4 source

`apps/web/src/styles.css` is a Tailwind 4 *source* file (`@import
"tailwindcss"` + `@theme` tokens) — not usable as `cfg.cssEntry` directly, it
has none of the actual utility classes. Instead:

- Ran `pnpm --filter @praxi/web build` (plain `vite build`, needs
  `packages/shared` already built — it was) and copied the resulting
  `apps/server/public/assets/index-*.css` to
  `apps/web/.ds-sync-scratch/compiled.css`.
- `cfg.cssEntry` points at that copy. **Resync risk**: the hashed filename
  changes every build — re-run the build and re-copy before resyncing if
  `apps/web/src` changed (`cp apps/server/public/assets/index-*.css
  apps/web/.ds-sync-scratch/compiled.css`, single file, no glob needed since
  `build` clears the dir first).
- **Stale as of 2026-08-11**: the app now ships a self-hosted brand font
  (Source Sans 3) — see "Font resync — 2026-08-11" below for what that means
  for `cssEntry` and `cfg.extraFonts`.

## Grouping via docsMap stubs

No real per-component docs exist (this is an app, not a documented library).
Two tiny stub files carry the `category` frontmatter that groups the DS pane:
`.design-sync/docs-stubs/primitives.md` (`category: Primitives`) and
`.design-sync/docs-stubs/patterns.md` (`category: Patterns`), each referenced
by every component in its group via `cfg.docsMap`. Prompt bodies are
synthesized from the `.d.ts` + previews as usual — only the grouping is
pinned this way.

## Field-inventory guidelines

`.design-sync/guidelines/contact-list.md` and `contact-detail.md` list every
field, column and section on the two target screens in German, with the
exact strings from `apps/web/src/lib/strings.ts`. Written so Claude Design
can propose a new layout for Kontaktdetails without silently dropping a
field — that's the actual reason this sync exists. Wired via
`cfg.guidelinesGlob: ["../../.design-sync/guidelines/*.md"]` (package-relative
from `apps/web`, pointing up to the repo-root `.design-sync/`).

## Config overrides must be followed by a full rebuild before scoped agents touch that component

`preview-rebuild.mjs` stamps a `cfgSlice` per component into `ds-bundle/.stories-map.json`
at full-build time; it refuses (`[CONFIG_STALE]`) to scope-rebuild a component whose
live `cfg.overrides` entry no longer matches that stamp. Adding/changing an override
in `config.json` (e.g. the `Popover`/`AlertDialog` `cardMode` overrides added
2026-08-11) without an intervening full `package-build.mjs` run left those two
components unbuildable by the batch-C subagent — it correctly refused to touch
`package-build.mjs` (orchestrator-only) and reported the blocker instead of working
around it. Fixed by running a full rebuild once all overrides were set, then scoped
`package-capture.mjs --components Popover,AlertDialog` picked up cleanly. **Rule for
next time**: decide all `cfg.overrides` entries *before* dispatching preview-authoring
subagents, or re-run a full build immediately after any override change and before
telling an agent to touch that component.

## Font resync — 2026-08-11

`apps/web/src` gained a self-hosted brand font: `apps/web/src/styles/tokens.css`
defines `--font-sans` as `"Source Sans 3","Source Sans Pro",-apple-system,…`
and ships two `@font-face` rules (latin, latin-ext variable-weight subsets,
400–600) pointing at `apps/web/src/assets/fonts/*.woff2`. This resync hit
both font tags and only one was fixable from the repo:

- **`[FONT_DANGLING]`, fixed.** `cfg.cssEntry` is the *compiled* CSS copy
  (see above) — Vite rewrites the `@font-face` `url()`s to absolute,
  cache-busted paths (`/assets/source-sans-3-latin-<hash>.woff2`), which
  don't resolve as filesystem paths when the converter scans them. Added
  `"extraFonts": ["src/styles/tokens.css"]` to `.design-sync/config.json` —
  that file's `@font-face` rules use plain relative `url("../assets/fonts/…")`
  paths, which resolve correctly, and its fonts get copied into `fonts/` and
  merged into the shipped `fonts/fonts.css`. **Residual wrinkle, harmless but
  worth knowing**: `fonts/fonts.css` ends up with the compiled copy's *broken*
  minified rules AND the `extraFonts`-derived *working* ones for the same
  family/weight — the working ones are appended last, and per the CSS Fonts
  cascade (last matching `@font-face` wins for identical descriptors) they're
  the ones actually used. `[FONT_DANGLING]` no longer fires and the render
  check is clean, so this is accepted as resolved rather than chased further;
  if a future resync ever wants a single clean rule per family, the real fix
  is sourcing `cssEntry` from something that doesn't emit hashed font URLs at
  all (out of scope for a token-only change).
- **`[FONT_MISSING]` "Source Sans Pro", accepted as a non-issue, user
  confirmed.** It's the second name in the `--font-sans` fallback list —
  since Source Sans 3 is always shipped and self-hosted, that fallback is
  provably unreachable in both the real app and in designs built from this
  DS. User chose "document, don't source a second font" over hosting Source
  Sans Pro too. Nothing to fix on a future resync unless the fallback list
  itself changes.
- `.design-sync/conventions.md`'s styling-idiom section claimed "no custom
  fonts ship with this bundle — system font stack" — corrected to describe
  Source Sans 3. Caught by the base skill's "validate before shipping" step;
  worth specifically re-checking that paragraph on any future font-related
  change, since nothing else flags stale prose automatically.

## Re-sync risks

- The compiled CSS copy goes stale silently if `apps/web/src/**` changes
  without a rebuild — no automatic check catches this. Rebuild + re-copy
  before every resync (see above).
- `apps/web/.ds-sync-scratch/entry.tsx` is hand-maintained. Adding a
  component to scope means: add its export(s) to the entry file, add a
  `componentSrcMap` entry, add a `docsMap` entry (or a new stub for a new
  group), then rebuild.
- Scope is intentionally partial (15 of ~45 components). If a later session
  wants more of `apps/web`'s UI in the DS project, re-open the scope decision
  above rather than silently growing `componentSrcMap` — the excluded
  components need the same "is it actually composable, does it need
  query/router" check the included 15 got.
- Preview authoring and grading subagents run on Sonnet (user's explicit
  request, cost/token reasons for a Max-plan session) — only the orchestrating
  session runs on the higher-effort model.
