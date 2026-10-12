<!-- completed-record id="62" closed="2026-10-02" summary="Safe Markdown authoring beside Rich Text; deferred panel controls keep the initial bundle at 1,032,388 bytes; all 104 browser tests pass" -->
# Slice 62 — Markdown section, safe renderer and source editor (Slice 59 Stage C1)

## Goal

This is the first half of Stage C of the [Slice 59 umbrella](59-markdown-and-work-navigation.md). It adds a registered `markdown` section type:

- The section stores Markdown **source** in `config.markdown` and shows it rendered.
- **Edit** opens the source, with **Preview**, **Save** and **Cancel**.
- A shortcut shows the rendered source read-only.
- Rich Text keeps working, unchanged, beside it until Stage C2 converts it.

### Why Stage C is split

The umbrella's Stage C covers three things: a parser and renderer, an editor, and a schema-v6 conversion. The conversion alone has to:

- rewrite every operation-history payload;
- regenerate all six seeds;
- sweep about 500 `rich-text` references in fixtures and tests.

As one phase, Stage C would touch well over a hundred files, and it would fix the editor and dialect before anyone had used them. AGENTS.md §4 says to re-slice a phase that is sprawling. The split:

- **C1 (this slice)** ships the new type with no data migration. A section's `type` is an open string, so a newly registered type needs no new schema version.
- **C2 (a later slice)** writes the v5→v6 conversion, makes the domain refuse new `rich-text` creates, regenerates the seeds and removes the Rich Text registration.
  - C2 is created with `roadmap.mjs new` once this slice closes.
  - It reuses the umbrella's Stage C text.

## Spec sections

- **§11 and §29–30: the registry.**
  - The registry gains one entry plus the type's own folder. The folder (`markdown-config.ts`) owns the config keys.
  - Contracts declare only the type's recovery capability and, new here, the name of its prose key (Build 1).
  - The §29 capability paragraph (spec line ~1596) and §30's "Seven of the types above are registered today" (line ~1635) are corrected.
- **§14: hand-edited data.** A hand-edited or agent-written config can have the wrong shape.
  - It must still render *something*.
  - The browser must never overwrite it silently (Build 4).
- **§19–22: state and styling.**
  - Styles use tokens only, in both themes, with `--size-hit-target` on coarse pointers.
  - The section and editor are presentational. Page state stays in `ProjectPageStore`.
- **§26: history labels.** The header's label for a prose edit (the label paragraph at line ~1188) names Markdown prose edits too (Build 2).
- **§27 and §32: placement.**
  - The type can be placed on every canvas that takes every type: Home and the work canvases.
  - A shortcut is a read-only projection: it renders, and has no Edit.
- **§31: Archive.** The paragraphs at lines ~1700 ("whitespace-only Rich Text") and ~1747 ("Rich Text whose only config is prose") gain Markdown.
  - A Markdown section with non-blank source is recoverable prose.
  - Restore returns the source intact.
- **§45: the clock.** The browser sets no timestamps. The domain changes only in its capability-driven recovery and label code.
- **§54: MCP.** `create_section` and `update_section` already accept any type string. Their descriptions now state the Markdown source config. Agents read source, never HTML.
- **§62–63: writes.** A Save is one awaited `sections.update` with visible failure.
  - Config is replaced whole on write. That rule comes from `SectionConfigSchema`'s doc comment and the [config-ownership decision](../../decisions/2026-08-section-config-ownership.md), not from §63's text.
  - The rule that a draft survives a live frame comes from the umbrella's Editor row and this plan.
- **§66: section folders.** The `sections/` folder tree gains `markdown/`.
- **§69 and §77–79: evidence and records.**
  - Browser, HTTP and MCP evidence, plus real use and friction notes.
  - One new decision entry.
  - The spec is corrected in the same change.

## Build

### 1. Contracts — Markdown capability and a declared prose key

In `packages/contracts/src/section.ts`:

- **`SectionCapabilitySchema`** gains an optional `proseKey: z.string().min(1)`.
  - A second refinement: `(proseKey !== undefined) === (recovery === 'config')`.
  - Today the domain hard-codes `'text'` in one place and `before.type !== 'rich-text'` in another. The capability table becomes the one source of truth for which config key holds the prose.
- **`SECTION_CAPABILITIES`** changes:
  - `'rich-text'` becomes `{ recovery: 'config', proseKey: 'text' }`;
  - a new entry is added: `markdown: { recovery: 'config', proseKey: 'markdown' }`.
- **Display name.** `displayNameOf('markdown')` already derives `Markdown`, so `SECTION_DISPLAY_NAMES` needs no entry.
- **Doc comment.** The table's doc comment is updated to say this.

Contracts now hold the *name* of one key, never its shape. The amendment to the [config-ownership decision](../../decisions/2026-08-section-config-ownership.md) records why:

- the domain already depends on that name;
- declaring it lets `registry.spec.ts` check that a folder's default config actually has the key, which catches drift.

### 2. Domain — recovery and the history label read the capability

**`section-recovery-policy.ts`**

- `richTextRecovery(config)` becomes `proseRecovery(config, proseKey)`. The rules stay the same, for the declared key:

  | Config | Result |
  |---|---|
  | `{}` | excluded |
  | only `proseKey`, holding a string that is not blank | `{ kind: 'config' }` |
  | only `proseKey`, holding a blank string | excluded |
  | any other key, or a non-string value | `unknown` |

- So a Markdown config of `{ text: 'x' }` is `unknown`: it is kept, not dropped.
- The domain trims the source as text. It never renders or parses Markdown or HTML.

**`section-edit-undo.ts` `sectionUpdateLabel`**

- The prose label applies when all of these hold:
  - the change is to `config`;
  - the type before the change has a `config` capability;
  - that type's `proseKey` is the only key that changed.
- The wording is chosen by the declared key, not by the type name:
  - `markdown` → `Edited Markdown in the <name> section`, matching the umbrella's "new prose actions say Markdown";
  - `text` → `Edited prose in the <name> section`, unchanged for Rich Text.
- Implementation: a small `PROSE_NOUN: Record<string, string>` in the same file, keyed by prose key. If a key has no entry, the label falls back to `prose`.
- After C2 only Markdown remains, and the table shrinks with it.
- Older stored labels are not changed.

**`SectionService`** does not change. `add` already accepts any type string and stores `config` exactly as given. Refusing new `rich-text` creates belongs to C2.

### 3. Shared renderer — `renderMarkdown` and `MarkdownRenderer`

New file: `apps/web/src/app/shared/components/markdown-renderer/markdown-renderer.ts`, with `.scss`.

**Parser.** `markdown-it@^15.0.2` becomes a new `apps/web` dependency.

- It is MIT-licensed and maintained. It ships its own types (`exports` → `dist/markdown-it.d.mts`), and 15.0.2 was published 2026-09-12.
- Checked against the published tarball:
  - the defaults are `html: false`, `linkify: false` and `typographer: false`;
  - `disable(list)` and `validateLink(url)` exist;
  - `validateLink` rejects `/^(vbscript|javascript|file|data):/` unless the URL matches `data:image/(gif|png|jpeg|webp);`;
  - `image`, `table` and `strikethrough` are rule names.
- `marked@18` was rejected because it passes raw HTML through and leaves sanitizing to the caller.
- Before coding, the implementer re-reads the README and `markdown-it.d.mts` for the core-ruler and token APIs used below.

**`renderMarkdown(source: string): string`** is an exported pure function over one module-level instance.

- `new MarkdownIt({ html: false, linkify: false, typographer: false })`:
  - raw HTML in the source is escaped to text, not passed through;
  - the built-in `validateLink` is kept, so unsafe schemes render as plain text.
- `md.disable('image')`: there is no remote image fetch. `![alt](url)` degrades to `!` followed by a link.
- One core rule, `cwm_presentation`, pushed after `inline`, walks the block tokens and descends into each `inline` token's `children`, where `link_open` (autolinks included) lives:
  - **Heading shift.** For `heading_open` and `heading_close` it sets `token.tag` to `h${min(level + 2, 6)}`. That gives `#`→`h3`, `##`→`h4`, `###`→`h5` and `####`–`######`→`h6`. Setting both the opening and closing tag keeps the markup balanced. The frame's title is an `h2`, so the outline nests.
  - **Links.** For `link_open` it sets `target="_blank"` and `rel="noopener noreferrer"`.
  - **Table alignment.** For `th_open` and `td_open` it replaces `style="text-align:X"` with `class="markdown-align-X"`. Angular's sanitizer strips `style`, which would lose the alignment and log a sanitizer warning.

**Supported dialect:**

- headings and paragraphs;
- emphasis and strong;
- ordered and unordered lists;
- blockquotes;
- inline code and fenced code;
- horizontal rules;
- ordinary links and autolinks;
- tables and strikethrough, which markdown-it 15 enables by default. Disabling them would be arbitrary.

**`MarkdownRenderer`**

- A standalone presentational component.
- Inputs: `source: string`, and an optional `emptyText`, which defaults to `No notes yet.`
- Its HTML comes from `computed(() => renderMarkdown(source()))`.
- It binds that HTML with `[innerHTML]`, so Angular's sanitizer is a second layer.
- **No `DomSanitizer.bypassSecurityTrust*` anywhere.** Acceptance step 1 checks this.

**Styling.**

- Content inserted through `innerHTML` gets no `_ngcontent` attribute, so emulated styles would not match it.
- The component therefore uses `encapsulation: ViewEncapsulation.None`.
  - The root class is set with `host: { class: 'markdown-renderer' }`.
  - Every rule, `.markdown-align-*` included, is nested under `.markdown-renderer`.
  - The scss uses no `:host`, because `None` leaves `:host` unrewritten and it would match nothing.
  - Once the lazy chunk loads, these rules are global, and the root class keeps them contained.
  - They still count toward the `anyComponentStyle` budget.
  - This is the repository's first `None` component.
  - The decision entry records why, and why `::ng-deep` was rejected.
- Sizes and surfaces come from tokens only:
  - heading sizes use `--font-size-*`;
  - lists, blockquote rules, code surfaces and table borders use the existing space, border, surface and radius tokens.
- One new token, `--font-mono`, is added to `_tokens.scss`. It is a font stack, so it is the same in both themes.
  - `check-design-tokens.mjs` checks colours, spacing and radii, not font families. Using the token is a review rule, not a lint rule.

### 4. The section — `sections/markdown/`, a thin eager shell around one lazy body

**Bundle constraint.** The initial bundle is **1,045,800 bytes**, against a hard ceiling of 1,050,000 bytes (`@angular/build` counts 1000 bytes per kB).

- That leaves 4.2 kB. It was measured on this branch on 2026-10-01 by summing the initial files listed in `index.html`.
- The [budget decision](../../decisions/2026-08-initial-bundle-budget.md)'s Slice 58 amendment already says the next eager feature needs structural work.
- markdown-it's minified ESM build alone is 138 kB.

So everything except a minimal shell is lazy:

- **`markdown-config.ts`** stays eager, because the shell's placeholder needs it. It follows the `rich-text-config.ts` pattern:
  - `MarkdownConfigSchema = z.object({ markdown: z.string() })`;
  - `createMarkdownConfig()` returns `{ markdown: '' }`;
  - `markdownDefaultConfig()` parses the default through `SectionConfigSchema`;
  - `readMarkdownConfig(config)` returns one of three states:

    | Config | State |
    |---|---|
    | `{}` | `{ state: 'empty' }` — the domain excludes it the same way |
    | exactly `{ markdown: string }` | `{ state: 'ok', markdown }` |
    | anything else | `{ state: 'unreadable' }` |

- **`MarkdownSection`** (`markdown-section.ts`, inline template, no scss) is the eager class that is registered.
  - It declares the seven content inputs.
  - Its whole template is one deferred block:

    ```
    @defer (on immediate) {
      <app-markdown-section-body [section] [save] [readOnly] />
    } @placeholder {
      <p class="markdown-placeholder">{{ placeholderText() }}</p>
    }
    ```

  - The placeholder is the stored source as escaped plain text, on a `<p>` with an inline `style="white-space: pre-wrap"`.
    - The shell has no scss, and the repository has no global utility for this.
    - A small layout shift when the body replaces the placeholder is accepted. The decision entry records it.
    - It is empty when the source is empty or unreadable.
    - So content is visible before the chunk arrives, and the canvas never flashes blank.
  - The shell passes `onConfigChange()` through as `save`.
  - `MarkdownSectionBody` is referenced nowhere else in the `.ts` file except the `imports` array.
- **Build order.** Right after registration, `pnpm build` runs **before** any polish, and the measured initial total is checked against the ceiling.
  - If even the shell exceeds 1,050,000 bytes, implementation stops and the finding is raised.
  - Raising the ceiling requires a new amendment to the budget decision with the user's agreement. It is not a default.
- **`MarkdownSectionBody`** (`markdown-section-body.ts`, `.html`, `.scss`) is lazy. It holds `editing`, `pending` and `failed` signals and a `base`.

  **Idle.**
  - It shows `<app-markdown-renderer [source]>`.
  - Below that is `button[data-markdown-edit]`:
    - its visible text is **Edit**;
    - its accessible name is `Edit Markdown for <name>`, which begins with the visible word (WCAG 2.5.3);
    - it is absent when `readOnly`.
  - Empty source shows the renderer's `No notes yet.`, and Edit stays available.
  - An **unreadable** config:
    - shows `This section's stored content isn't Markdown source, so it can't be edited here.`;
    - has no Edit button and no write path;
    - neither writes nor blanks anything.

    An agent or the API can repair it, and Archive already lists it as `unknown`.

  **Editing.**
  - The editor is rendered with `@if (editing())`. It is already inside the lazy chunk, so no second `@defer` is needed.
  - This means every Edit creates a **fresh** editor instance with a fresh draft. That avoids the one-shot `@defer (when …)` trap: a `when` block never returns to its placeholder, which is why `project-canvas.html:212` wraps its block in an `@if`.
  - Clicking Edit sets `base` to the current source and `editing` to true.
  - When the editor emits `ready`, focus moves to its textarea.

  **Save(draft).**
  - If `draft === current source`: the editor closes, **no write** is made, and focus returns to Edit.
  - Otherwise:
    1. Set `pending = true`. `base` is **not** changed, so a refused Save leaves the stored source equal to `base` and raises no false notice.
    2. Await `save()({ markdown: draft })`, which now returns `Promise<boolean>` (Build 5).
    3. On `true`: clear `editing` and `pending` in the same synchronous block, then focus Edit after the next render. If `pending` cleared in an earlier render, the notice would flash for one frame.
    4. On `false`: keep the editor with its draft and set `failed`. The editor shows a non-alert line, `Not saved — your draft is kept.`
  - When the store had an error message, the canvas's existing `role="alert"` `data-section-error` already announces why. If the store returned `false` before writing (canvas not loaded), there is no canvas message, and the local line stands alone. Either way the error is never announced twice.
  - A second Save while `pending` is ignored.
  - If the component is destroyed before the promise resolves, the answer is dropped.

  **Cancel** closes the editor without writing and returns focus to Edit.

  - There is **no Escape shortcut**. A multi-line draft is too costly to lose to one stray key.

  **Another writer's change.** A `section.updated` live frame, or another writer, can change the stored source while the editor is open.
  - The draft is untouched.
  - `changedElsewhere = editing && !pending && source !== base` shows: `This section changed elsewhere since you started editing. Saving replaces it.`
    - The line is in `role="status"`, so a screen-reader user typing in the textarea hears it.
    - The `!pending` term stops the user's own successful Save from flashing the notice. `replaceSection` patches the source before the promise resolves, while `pending` is still true, and the editor then closes. After a refused Save, `pending` is false again but the source still equals the untouched `base`, so no notice appears.
  - Save still replaces the whole config, last write wins. There is no conflict model.
  - **Known destroy paths** that do drop a draft, as today for every canvas control:
    - section removal;
    - navigating away;
    - a Flow/Grid switch;
    - a `canvasRevision` bump from a failed move rollback, which re-keys every placement (`project-canvas.html:79`).

    The decision entry lists them. Only the `section.updated` path is claimed to be safe.
- **`MarkdownSourceEditor`** (`markdown-source-editor.ts`, `.html`, `.scss`) is lazy and presentational.
  - **Inputs:** `initialSource`, `name`, `pending`, `failed`, `changedElsewhere`, and optional `saveBlocked` (false by default).
  - If a live section update makes config unreadable during editing, keep the editor/draft and show the unreadable notice, but set Save to focusable `aria-disabled` with guards in both editor and body. Cancel remains available. This preserves the draft without silently overwriting foreign config. Test this explicitly.
  - **Outputs:** `saveRequested(draft)`, `cancelRequested`, `ready`.
  - It owns `draft`, seeded once from `initialSource`.
  - **Controls:**
    - **Source:** `textarea[data-markdown-source]`.
      - Its aria-label is `Markdown source for <name>`.
      - It has `rows="10"` and `resize: vertical`.
      - It is `readonly` while pending, so text typed during a successful Save is not lost when the editor closes.
    - **Preview:** `button[data-markdown-preview]` with `aria-pressed`. While pressed, the textarea is replaced by `<app-markdown-renderer [source]="draft()">`.
    - **Save** (`data-markdown-save`) and **Cancel** (`data-markdown-cancel`). While pending they use `aria-disabled="true"`, not native `disabled`; this is the focus-loss rule from Slice 61.
- **Registry entry.** It goes second, after `rich-text`:

  ```
  { type: 'markdown', displayName: 'Markdown', icon: '📄', kind: sectionKindOf('markdown'), createDefaultConfig: markdownDefaultConfig, component: MarkdownSection }
  ```

  - The picker defaults to `types()[0]` (`section-create-dialog.ts:45`), so existing journeys keep Rich Text as the default.
  - C2's removal of Rich Text makes Markdown first.

### 5. Config writes report their result

The umbrella requires that the fire-and-forget blur callback become a callback that reports the write's result. This uses the frame's existing `rename` promise idiom (`project-section-frame.ts:46-47`, `project-canvas.ts:135`).

- **`section-contract.ts`.** `SectionContentInputs.onConfigChange` becomes `(config: SectionConfig) => Promise<boolean>`.
- **`ProjectSectionFrame`.**
  - It drops the `configChanged` output.
  - It gains `saveConfig = input.required<(id: SectionId, config: SectionConfig) => Promise<boolean>>()`.
  - Its stable `emitConfig` arrow returns `this.saveConfig()(this.section().id, config)`.
- **`ProjectCanvas`.**
  - Its `saveConfig(event)` method is replaced by a stable class-property arrow: `saveSectionConfig = (id, config) => this.store.updateConfig(id, config)`.
  - The template binds `[saveConfig]="saveSectionConfig"`.
  - `ProjectPageStore.updateConfig` does not change. It never rejects. `mutate` resolves:
    - `false` on a gateway error, setting `sectionError`;
    - `false` when the canvas is not loaded, with no message;
    - `true` for a write that lands after navigation.
- **Every other mount of the frame** must now supply the required input:
  - `prototype/design-lab/panels/live-panels.html`, four mounts at lines 21, 30, 39 and 48, bound with `[saveConfig]="saveConfig"`;
  - `live-panels.ts`, which gains `saveConfig = async () => true` beside `renameSection`;
  - `project-section-frame.stories.ts`, whose args gain the same.
- **`ShortcutFrame`.** Its no-op becomes `() => Promise.resolve(false)`.
- **`RichTextSection`.** Its input type is widened and it calls `void this.onConfigChange()(…)`. Behaviour is unchanged.
- **Not edited:**
  - the other section components and the design-lab stub. Their `(config) => void` input types accept the promise-returning function, and `SectionContentComponent` types every member as `unknown`;
  - `project-page-store.ts`.

### 6. MCP wording

In `packages/mcp-tools/src/tools/sections.ts`:

- `create_section`'s example type list gains `markdown` and drops nothing. The description adds: `a markdown section's config is { markdown: "<Markdown source>" } — source, never HTML.`
- `update_section` says that config is replaced whole.
- No tool, input schema or output schema changes.

### 7. Spec, decisions, docs

**Spec**

- §29: the capability paragraph adds config prose for Markdown (line ~1596).
- §30:
  - gains a Markdown entry;
  - changes its count from seven to eight registered types;
  - notes that Rich Text stays until Stage C2 converts it.
- §26: the label paragraph (line ~1188) adds `Edited Markdown in …`.
- §31: the Archive paragraphs (lines ~1700 and ~1747) say *Rich Text or Markdown*.
- §66: the `sections/` folder tree gains `markdown/`. The shared renderer sits outside that tree and is documented in web/what.md.

**New decision: `docs/decisions/2026-10-markdown-source-and-rendering.md`.** It records:

- that only the source is persisted;
- the dialect, and the parser choice with marked rejected;
- the heading shift, link attributes and table-alignment classes;
- `ViewEncapsulation.None`;
- the lazy shell measured against the budget;
- the editor model: Save, Cancel, Preview, no Escape, changed-elsewhere notice, last write wins, and the known destroy paths;
- that an unreadable config is not editable;
- the label nouns;
- the declared `proseKey`.

It is indexed in `docs/decisions/README.md` and linked from the `why.md` files of web/projects, web, contracts and domain.

**Dated amendments** (never rewrites), with their README status cells updated:

- [initial bundle budget](../../decisions/2026-08-initial-bundle-budget.md): the measured figure and the new lazy boundary;
- [section config ownership](../../decisions/2026-08-section-config-ownership.md): the declared prose key;
- [content-oriented archive policy](../../decisions/2026-09-content-oriented-archive-policy.md): Markdown counts as config prose;
- [section update history labels](../../decisions/2026-09-section-update-history-labels.md): labels are keyed by the prose key, and Markdown gets its noun.

**Roadmap.** Stage C of the umbrella is annotated with the C1/C2 split and a link to this plan. `goals.md` says Slice 62 is active, and the board is regenerated.

### 8. Approved bundle remedy — defer development-panel controls (§46)

The user approved this bounded structural change on 2026-10-02. The 1,050,000-byte ceiling
stays unchanged. In DevPanel's existing open branch, wrap only DevPanelControls in
`@defer (on immediate)`. Keep the global chord handler, dialog, Close, backdrop and CdkTrapFocus
eager. Until the chunk arrives, show a polite Loading prototype controls… line; on chunk
failure, show Controls could not load. Reload the page to try again. plus a Reload page
button. Close and the chord remain usable in both states. A protected reloadPage method
invokes location.reload() only on that deliberate click.

The block is inside `@if (open())`: closing removes its view; reopening gets a fresh block
and controls instance, retaining the existing root-provided DevPanelStore. Keep the controls
reference only in imports/template so Angular can defer it. Do not alter routes, duplicate
controls, add feature flags, or move prototype code into core.

Tests first in dev-panel.spec.ts, with manual defer behavior: (1) opening focuses the eager
modal and shows the placeholder without controls, completion mounts controls while focus
stays in the dialog; (2) close before completion and reopen yields a fresh block and controls
without resurrecting the prior view; (3) Error keeps Close/chord usable and exposes explicit
reload, verified by spying on reloadPage without navigating jsdom. Existing control/inspector
specs and the browser development-panel journey remain required. Check actual build bytes
and stats: DevPanelControls, DevPanelStore and ProjectLayoutControl must be absent from
initial outputs. Rebuild immediately after this remedy before continuing editor work. If it
still exceeds the ceiling, raise the measured finding without further structural scope.

Added files: apps/web/src/app/prototype/dev-panel/dev-panel.{ts,html,spec.ts};
apps/web/src/app/app.routes.ts (comment only); docs/architecture/web/prototype-tooling/
{overview,what,how,why}.md; docs/decisions/2026-08-development-panel-surface.md (dated
amendment). Existing web architecture and initial-bundle-budget amendment/index now describe
the deferred controls. Spec §46 states the eager modal and lazy controls. No new service edge
or gateway dependency is introduced. This does not change the source-authoring requirements.

## Done when

- **Authoring.** On Home or a work canvas, a person can add a **Markdown** section from the picker, Edit it, Save headings, a list, a link and fenced code, and see them rendered after reload.
- **Source only.** The API returns the exact source in `config.markdown`. HTML never appears in storage, the domain, HTTP or MCP.
- **Writes and drafts.**
  - Cancel after typing, and Save with no change, send no PATCH.
  - A failed Save keeps the draft.
  - A `section.updated` frame never erases a draft.
- **Shortcuts.** A shortcut to a Markdown section renders it, with no Edit.
- **Safety.** Raw HTML shows as literal text. `javascript:` links are not links. Images never load.
- **History.** The header shows `Undo: Edited Markdown in the Markdown section`, and Undo and Redo restore the exact source.
- **Archive.** Removing a non-blank Markdown section lists it in Archive, and Restore returns the source.
- **Agents.** `create_section` and `update_section` round-trip `markdown` source through the in-process registry and over HTTP. `get_project_archive` reports its recovery.
- **Bundle.** The initial bundle stays at or under 1,050,000 bytes, and no initial chunk contains markdown-it.
- **No regressions.** Rich Text behaves exactly as before.
- **Checks and docs.** The required checks pass, and the spec, decision log, architecture and roadmap agree.

## Do not

- **C2's work.** Convert, retire or refuse `rich-text`. Change the schema version, seeds, historical fixtures or history payloads.
- **Richer editing.** Add WYSIWYG, a toolbar, syntax highlighting or Markdown task checkboxes.
- **More content.** Allow raw HTML, remote images or embeds, math or Mermaid, or Markdown in task descriptions or reflection bodies.
- **Concurrency.** Add a conflict-merge model, autosave or a debounce.
- **Domain validation.** Validate section config shapes in the domain (see Open questions).
- **Budget.** Raise the bundle ceiling without a new decision amendment.
- **Other stages.** Change other section components' callback types, shortcut destinations (Stage D) or Sub-Projects (Stage E).

## Acceptance check

1. **Static boundaries.** Run each with `git grep`, since `rg` is not on PATH here:
   - `git grep -n "bypassSecurityTrust" -- apps/web/src` finds nothing.
   - `git grep -ln "markdown-it" -- apps/web/src` finds only `markdown-renderer.ts`.
   - `git grep -n "MarkdownSectionBody\|MarkdownRenderer\|MarkdownSourceEditor" -- apps/web/src/app/features/projects/sections/markdown/markdown-section.ts` finds only the `imports` array and the deferred template.
     - The registry, other features and specs outside `sections/markdown/` and `shared/components/markdown-renderer/` reference none of these names.
     - Specs and stories of the lazy components import them directly, which does not affect the app bundle.
   - `pnpm lint` passes, including the token lint and `docs:check`.
2. **Bundle.**
   - `pnpm build` passes the `maximumError` budget. The console's "1.05 MB" cannot show the margin, so the exact initial bytes are measured the same way as the 1,045,800 baseline: sum the initial files referenced from `apps/web/dist/web/browser/index.html`.
   - `pnpm --filter web exec ng build --stats-json` writes the esbuild metafile `apps/web/dist/web/stats.json`. Read from it:
     - markdown-it's modules, `markdown-renderer.ts` and `markdown-section-body.ts` appear only in outputs that are **not** among the initial files;
     - the shell is in the initial bundle.
   - The byte figure is recorded in the budget amendment.
3. **Offline suite.** `pnpm test` is green, including every named test in the test plan.
4. **Browser end-to-end (`pnpm e2e`).** All tests are green. `apps/e2e/canvas-editing.spec.ts` gains the journey **`markdown section saves source, renders safely and undoes`**:
   1. Add a Markdown section from the picker.
   2. Edit, type `# Plan`, a two-item list, `[docs](https://example.com)`, a fenced code block and `<script>window.__x=1</script>`. Preview shows an `h3` and a `ul`.
   3. Save. `GET /api/projects/:projectId/sections` returns exactly that source.
   4. Reload. The page shows:
      - an `h3`;
      - two `li`;
      - `a[target=_blank][rel~=noopener]`;
      - `pre code`;
      - the literal text `<script>window.__x=1</script>` visible as text, which proves `html: false` escapes rather than strips it;
      - no `script` element in the section.
   5. Record every request with `page.on('request')`:
      - Edit, type a change, then Cancel: **no** `PATCH /api/sections/:id`, and the API source is unchanged.
      - Edit, then Save with no change: **no** PATCH.
      - A settle point stops an absence check from passing just because it ran early: one real changed Save follows, its response is awaited, and the recorded PATCH list then has **exactly one** entry, that Save's.
   6. The header shows `Undo: Edited Markdown in the Markdown section`. Undo restores the previous exact source, and Redo reapplies it. Both are checked through the API.

   A second test, **`markdown shortcut renders read-only`**: an API-created Home shortcut to a Markdown section on a child work canvas renders `h3` content and has no `[data-markdown-edit]`.
5. **HTTP and MCP.**
   - `routes.test.ts` creates and patches a `markdown` section over HTTP, and reads back the exact source.
   - `contract.test.ts` extends three table entries:
     - `create_section`: a Markdown source config is preserved;
     - `update_section`: the source is replaced whole;
     - `get_project_archive`: after removal, a non-blank Markdown section has recovery `{ kind: 'config' }`.
   - Both MCP transports are proved together in Stage F. This slice exercises HTTP MCP in real use (step 8).
6. **Host regression.** `pnpm --filter @cwm/prototype-host acceptance` and `pnpm --filter @cwm/prototype-host mcp-acceptance` pass, unchanged.
7. **Storybook.** `pnpm storybook:build` passes with the new stories and the updated frame story.
8. **Real use (§77).**
   - **Setup.** Copy the `nested-projects` seed to a scratch data file. Start `pnpm dev:host` and `pnpm dev:web` in separate terminals.
   - **Writing.** On the root Home and on a workstream canvas, write real notes in Markdown:
     - at desktop width, and at 375 px;
     - in both themes;
     - in Flow, and in a narrow Grid span.
   - **Archive.** Remove a non-blank section, find it in Archive, Restore it and compare the source.
   - **Agents.** Over HTTP MCP, `create_section` a `markdown` section on a workstream and `update_section` its source. The open tab shows it after the live frame. An editor open on that section keeps its draft and announces the changed-elsewhere notice.
   - **Record.** Write friction into `.prototype/notes.json` with `CURRENT_SLICE = 62`.
   - Stop both servers before Playwright.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/section.ts`, `section.test.ts` | modify | `proseKey` and refinement; `markdown` capability; rich-text `proseKey: 'text'` |
| `packages/domain/src/section-recovery-policy.ts`, `.test.ts` | modify | `proseRecovery` by declared key; Markdown cases |
| `packages/domain/src/section-edit-undo.ts`, `.test.ts` | modify | Prose label from the capability key; `PROSE_NOUN` |
| `apps/web/package.json`, `pnpm-lock.yaml` | modify | `markdown-it@^15.0.2` |
| `apps/web/src/styles/_tokens.scss` | modify | `--font-mono` |
| `apps/web/src/app/shared/components/markdown-renderer/markdown-renderer.ts`, `.scss`, `.spec.ts`, `.stories.ts` | create | `renderMarkdown` and the component; `ViewEncapsulation.None` styles |
| `apps/web/src/app/features/projects/sections/markdown/markdown-config.ts`, `markdown-config.spec.ts` | create | Folder-owned schema, default and three-state reader |
| `…/sections/markdown/markdown-section.ts`, `.spec.ts` | create | Eager shell: inputs, deferred body, plain-text placeholder |
| `…/sections/markdown/markdown-section-body.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts` | create | Lazy idle render, Edit, Save/Cancel, empty, unreadable, changed-elsewhere, focus |
| `…/sections/markdown/markdown-source-editor.ts`, `.html`, `.scss`, `.spec.ts` | create | Draft, Preview, pending, failure line |
| `apps/web/src/app/features/projects/sections/registry.ts`, `registry.spec.ts` | modify | Register second; pinned list; prose key present in the default config |
| `…/sections/section-contract.ts` | modify | `onConfigChange` returns `Promise<boolean>` |
| `…/sections/section-frame/project-section-frame.ts`, `.spec.ts`, `.stories.ts` | modify | `saveConfig` input replaces `configChanged` |
| `apps/web/src/app/features/projects/project-canvas.ts`, `.html`, `.spec.ts` | modify | Stable `saveSectionConfig` bound to the frame |
| `apps/web/src/app/prototype/design-lab/panels/live-panels.ts`, `.html` | modify | Supply the newly required `saveConfig` to four frame mounts |
| `apps/web/src/app/features/projects/shortcuts/shortcut-frame.ts`, `shortcut-frame.spec.ts` | modify | No-op resolves `false`; Markdown shortcut has no Edit |
| `…/sections/rich-text/rich-text-section.ts` | modify | Widened callback type and `void`; behaviour and spec unchanged |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 62` |
| `packages/mcp-tools/src/tools/sections.ts`, `contract.test.ts` | modify | Description wording; three table entries extended |
| `apps/prototype-host/api/routes.test.ts` | modify | HTTP round trip |
| `apps/e2e/canvas-editing.spec.ts` | modify | Two Markdown journeys |
| `Canvas Work Manager — … Specification.md` | modify | §26, §29, §30, §31, §66 corrections (Build 7) |
| `docs/decisions/2026-10-markdown-source-and-rendering.md`, `docs/decisions/README.md` | create / modify | New decision and index |
| `docs/decisions/2026-08-initial-bundle-budget.md`, `2026-08-section-config-ownership.md`, `2026-09-content-oriented-archive-policy.md`, `2026-09-section-update-history-labels.md` | modify | Dated amendments; index status cells |
| `docs/architecture/contracts/what.md`, `how.md`, `why.md` | modify | `proseKey`; decision link |
| `docs/architecture/domain/how.md`, `why.md` | modify | Capability-driven prose recovery and label nouns |
| `docs/architecture/web/projects/overview.md`, `what.md`, `how.md`, `why.md` | modify | Eight types; Markdown folder; lazy shell; save-result callback; new-type guidance |
| `docs/architecture/web/what.md`, `how.md`, `why.md` | modify | Shared renderer, `ViewEncapsulation.None` exception, lazy boundary, dependency |
| `docs/architecture/web/prototype-tooling/how.md` | modify | Only if it lists the live-panels frame inputs |
| `docs/architecture/mcp-tools/what.md` | modify | Only if it quotes the description or type examples |
| `docs/architecture/testing/how.md` | modify | New `canvas-editing.spec.ts` journeys beside its Rich Text entry |
| `docs/guides/first-milestone-walkthrough.md` | modify | Step 14 stays "seven seeded kinds" and adds "add a Markdown section" (it is not seeded) |
| `docs/guides/mcp-setup.md` | modify | Agent example creating Markdown source |
| `docs/roadmap/planned/59-markdown-and-work-navigation.md`, `docs/roadmap/goals.md`, generated `progress.md` | modify | C1/C2 split; status |
| `.prototype/notes.json` | modify | Real-use friction |

Every touched system's four files are read in full during implementation. Any diagram that lists or counts section types is updated in the same commit. `pnpm docs:api` runs before `pnpm docs:check`.

## Test plan — tests first

Each test is written first and seen failing for the intended reason. For behaviour that already works (the Rich Text recovery and label rules), a temporary, reverted fault proves the test is sensitive.

| Test | Proves |
|---|---|
| `section.test.ts`: `markdown is config prose keyed by markdown` | The capability exists; `sectionKindOf` is `view`; the display name is `Markdown` |
| `section.test.ts`: `proseKey is present exactly for config recovery` | The refinement fails both ways |
| `section-recovery-policy.test.ts`: `markdown source with content is recoverable config` | `{ markdown: '# x' }` → config; `{ markdown: ' \n' }` and `{}` are excluded |
| `section-recovery-policy.test.ts`: `markdown with a foreign or non-string key is unknown` | `{ text: 'x' }`, `{ markdown: 1 }` and `{ markdown: 'x', extra: 1 }` |
| `section-recovery-policy.test.ts`: `rich-text rules are unchanged through the declared key` | Existing cases (fault-checked) |
| `section-edit-undo.test.ts`: `a markdown-only source change says Markdown` | `Edited Markdown in the Markdown section`; a renamed section uses its name; title plus source together stays general; the Rich Text label is unchanged |
| `markdown-renderer.spec.ts` › `renderMarkdown`: `shifts headings and closes them at the same level` | Raw output contains `<h3>…</h3>`, `<h4>…</h4>` and `<h6>…</h6>` for `#`, `##` and `######`, with no `<h1` |
| › `escapes raw HTML` | `<script>x</script>` and `<img src=x onerror=y>` produce `&lt;script&gt;` and `&lt;img`, with no `<script` and no `<img` |
| › `unsafe schemes are not links` | `javascript:`, `vbscript:`, `file:` and `data:text/html` produce no `<a` |
| › `images never load` | `![a](https://x/y.png)` produces no `<img` |
| › `links open safely` | `target="_blank" rel="noopener noreferrer"` |
| › `table alignment becomes a class` | `class="markdown-align-center"` and no `style=` |
| › `renders lists, quotes, emphasis, code, rules, tables` | The expected tags |
| `markdown-renderer.spec.ts` › component: `sanitized output keeps link attributes and styles apply` | Through Angular's sanitizer the anchor keeps `target` and `rel`; no sanitizer warning is logged; a blockquote's computed `border-left-style` is `solid`, which proves the unencapsulated styles reach `innerHTML` content. That longhand is written as a literal keyword, so jsdom, which does not resolve `var()`, can read it; keywords are outside the token rule. Under emulated encapsulation the selector would not match, so the test fails for the right reason |
| › `empty source shows the empty text` | `No notes yet.` |
| `markdown-config.spec.ts`: `reads three states` | `{}` is empty; `{ markdown: 'x' }` is ok; `{ markdown: 1 }`, `{ markdown: 'x', extra: 1 }` and `{ text: 'x' }` are unreadable; the default parses as `SectionConfig` |
| `markdown-section.spec.ts`: `placeholder shows plain source, then the body renders` | `DeferBlockBehavior.Manual`, as in `project-workspace-shell.spec.ts:200-202`: the placeholder shows the escaped source; after `render(DeferBlockState.Complete)` the body's `h3` appears |
| `markdown-section.spec.ts`: `passes onConfigChange through as save` | The body's `save` is the same function |
| `markdown-section-body.spec.ts`: `Edit opens the source with focus` | The textarea holds the source and has focus; Edit has its accessible name |
| `markdown-section-body.spec.ts`: `Save writes the whole config once and closes` | One `save({ markdown })`; the editor closes; Edit is focused |
| `markdown-section-body.spec.ts`: `unchanged Save and Cancel write nothing` | Zero calls; focus returns to Edit |
| `markdown-section-body.spec.ts`: `a reopened editor starts from stored source` | Edit, type, Cancel, Edit shows the stored source, not the old draft |
| `markdown-section-body.spec.ts`: `failed Save keeps the draft` | `false` keeps the editor and draft, shows the `Not saved` line, adds no `role=alert`, and shows **no** changed-elsewhere notice |
| `markdown-section-body.spec.ts`: `pending Save cannot be repeated` | Two clicks make one call; the textarea is read-only; the buttons are `aria-disabled` |
| `markdown-section-body.spec.ts`: `a section update does not erase the draft` | A new `section` input while editing keeps the draft, and the `role=status` notice appears. An update during a pending Save that then fails shows the notice once `pending` clears |
| `markdown-section-body.spec.ts`: `own successful Save never shows the changed-elsewhere notice` | The section input is patched to the draft while pending: no notice, checked immediately after the promise resolves and before `whenStable` |
| `markdown-section-body.spec.ts`: `late answer after destroy is ignored` | Resolving after `destroy()` throws nothing |
| `markdown-section-body.spec.ts`: `read-only renders without Edit` | No `[data-markdown-edit]` |
| `markdown-section-body.spec.ts`: `unreadable config is shown, not overwritten` | `{ text: 'x' }` shows the notice, no Edit, and zero calls |
| `markdown-source-editor.spec.ts`: `Preview renders the draft` | `aria-pressed` toggles; the rendered draft replaces the textarea; the draft is kept |
| `registry.spec.ts`: `registers markdown second; config types declare a key their default holds` | The pinned order; every `config` capability's `proseKey` is a key of its `createDefaultConfig()` |
| `project-section-frame.spec.ts`: `content config writes return the saveConfig result` | The frame calls `saveConfig(id, config)` and returns its promise |
| `project-canvas.spec.ts`: `section config save resolves false and shows the error on refusal` | `failOn: { 'sections.update': … }` (as at line 271) resolves `false` to the content, and `data-section-error` shows |
| `shortcut-frame.spec.ts`: `markdown shortcut is read-only` | It renders with no Edit; the no-op resolves `false` |
| `rich-text-section.spec.ts` (existing) | Still green |
| `routes.test.ts`: `a markdown section round-trips its source over HTTP` | POST, then PATCH, then GET returns the exact source |
| `contract.test.ts`: `create_section`, `update_section` and `get_project_archive` entries | Source is preserved and replaced whole; the recovery is `config` |
| `canvas-editing.spec.ts`: the two journeys | Acceptance step 4 |

## Boundaries touched

- **Gateway.** The new components talk to nothing. The write path is unchanged: frame callback → canvas → `ProjectPageStore.updateConfig` → gateway interface.
- **Contracts once.** The config schema lives only in the Markdown folder. Contracts gain only the capability entry and the key name. No type is duplicated.
- **Domain purity.** Changes stay in pure functions over contracts. There is no new service edge and no `Clock` use, and nothing parses Markdown or HTML.
- **MCP calls the domain.** This slice changes only the tool wording.
- **Tokens.**
  - The renderer's unencapsulated styles use tokens only and are scoped under `.markdown-renderer`.
  - `--font-mono` is a token, and its use is reviewed, because the token lint does not cover fonts.
- **Shared, not core.** The renderer lives in `shared/`, not `core/`. No `prototypeMode` checks are added. Disposable infrastructure is untouched.
- **Sanitizer.** There is no `bypassSecurityTrust`. Acceptance step 1 checks this.

## Explicit non-goals

- Everything in *Do not*.
- No Rich Text content migration.
- No Markdown seed content; C2 regenerates the seeds.
- No DOMPurify. markdown-it with `html: false` plus Angular's sanitizer is enough.
- No Save shortcut.
- No auto-sizing textarea.
- No stdio evidence in this slice; Stage F proves both transports.

## Open questions

All have defaults here, and none changes the user's scope.

- **Domain config validation.** **No.** Config stays opaque ([decision](../../decisions/2026-08-section-config-ownership.md)).
  - The tool description states the shape.
  - The browser refuses to overwrite an unreadable config.
  - Archive keeps such a config as `unknown`.
  - If agents misuse the shape in real use, that is a friction note or C2 finding.
- **Picker position.** **Second** in C1. It becomes first in C2.

## Revisions

- **Initial draft (2026-10-01).**
  - Split Stage C into C1 and C2.
  - Measured the initial bundle at 1,045,800 bytes, which forced lazy loading.
  - Chose markdown-it 15.0.2 over marked 18.
  - Reused the frame's `rename` promise idiom.
- **Review round 1 (2026-10-01).** The reviewer returned 16 findings. All were checked against the code, and all held:
  - **Required inputs.** The required `saveConfig` input would break `live-panels.html` (four mounts) and the frame story. Both are added. The design-lab stub widening was dropped as unnecessary.
  - **Styles.** Emulated styles do not reach `innerHTML`. The renderer now uses `ViewEncapsulation.None` under a root class, with a computed-style test.
  - **Bundle.** With only 4.2 kB of headroom, `MarkdownSection` became a thin eager shell around one lazy `MarkdownSectionBody`. It gets a mandatory early build, and raising the ceiling is excluded.
  - **Defer.** A `@defer (when …)` block triggers only once. The editor now sits under `@if` inside the lazy body, and a reopen test was added.
  - **Vacuous e2e assertions.** The no-op Save and Cancel checks now assert that no PATCH is sent, Cancel types first, and the escaped `<script>` text must be visible.
  - **Security tests.** They now test the pure `renderMarkdown` output, so the markdown-it layer is checked independently of Angular's sanitizer. Headings shift both the open and close tags through one core rule.
  - **Spec citations.** Corrected to §26, §29, §30, §31 and §66, with line 1700 added. The replace-whole and draft rules are attributed to their real sources.
  - **Label wording.** The label now follows the umbrella ("Edited Markdown in …") through a key-indexed noun, rather than deviating from it.
  - **Smaller corrections.**
    - The canvas test uses `failOn`.
    - The not-loaded `false` case is noted.
    - The draft claim is narrowed to `section.updated`, with the destroy paths listed.
    - The changed-elsewhere notice no longer flashes on your own Save, and it is now `role=status`.
    - `git grep` and the stats/lazy-chunk table replace the `rg` and minified greps.
    - `testing/how.md` and a correct walkthrough step were added, and the false "token lint enforces fonts" claim was removed.
    - The MCP archive evidence uses `get_project_archive`, and stdio is deferred to Stage F.
    - Table alignment is rewritten to classes.
    - A `readMarkdownConfig` unit test was added.
    - The placeholder test uses `DeferBlockBehavior.Manual`.
- **Review round 2 (2026-10-01).** The reviewer confirmed all 16 round-1 findings closed and the shell design sound. Seven inputs are declared, and only the shell is reachable eagerly.
  - **Substantive.** Setting `base = draft` at Save would show a false changed-elsewhere notice after a refused Save. `base` now stays unchanged, the `!pending` term alone suppresses the notice during the user's own Save, and the failed-Save test asserts no notice.
  - **Minor.**
    - The core rule descends into inline `children` for `link_open`.
    - The computed-style test uses a literal-keyword longhand that jsdom can read.
    - The `ViewEncapsulation.None` mechanics are stated: a host class, and no `:host`.
    - The placeholder uses an inline `pre-wrap` style.
    - The bundle step measures exact bytes from `index.html` and reads module membership from `stats.json`.
    - The PATCH-absence checks gain a settle point.
    - The shared renderer is removed from §66's `sections/` tree.
- **Review round 3 (2026-10-01).** The reviewer confirmed all round-2 findings closed and traced `changedElsewhere` through success, failure, an update while editing, and an update while pending. Verdict: no substantive findings. Two minor notes were folded in:
  - on success, `editing` and `pending` clear together, with an immediate no-flash assertion;
  - a test now covers an update during a pending Save that then fails.

- **Execution gate (2026-10-01).** The mandatory early production build after registration
  measured 1,052.60 kB and failed the unchanged 1,050 kB ceiling by 2.60 kB.
  Markdown's parser/body remained in a 117.80 kB lazy chunk. Per Build 4, implementation
  is stopped at this gate pending the user's decision about bounded structural work or
  a documented budget amendment. Contracts/domain tests and callback tests are green;
  the full editor is not delivered. Independent read-only reviews cover the implemented
  portions while this decision is pending.

- **Checkpoint regression repair (2026-10-01).** The offline suite exposed two failures in
  `section-create-dialog.spec.ts`: its two-item registry slice no longer included Task List
  after Markdown was inserted second. The fixture now supplies the full registry and pins
  all eight options; existing Task List selection/failure assertions remain unchanged.
  This adds that spec to the file-level change list.

- **Independent checkpoint reviews (2026-10-01).** One reviewer checked the contracts/domain
  diff, and another checked the UI/callback diff. Neither found a substantive code or boundary
  defect in the implemented portion. They found missing decision links and premature editing
  claims; the decision, dated amendments and index now exist, and the living docs explicitly
  state that authoring is pending. The structural candidate is a deferred DevPanelControls
  inside the existing dialog, retaining eager chord handling, Close and focus trap. Its bounded
  scope would add loading/error handling, deferred lifecycle/focus tests and tooling docs;
  this candidate has not been implemented or measured.

- **Checkpoint review round 2 (2026-10-01).** The independent reviewer confirmed the
  missing links and premature delivered-behavior prose are resolved, and validated the
  picker fixture repair. Two component doc comments still implied editing exists; both
  now say source rendering only. No substantive findings remain in the checkpoint.
  Offline verification is green: 2,884 workspace tests plus 9 script tests. API generation,
  lint and docs checks pass. Production build remains red at the documented budget gate;
  the editor browser journey remains intentionally red until authoring is implemented.
  Full browser acceptance, Storybook and real-use evidence have not been run. No phase
  completion or closing commit is claimed.

- **Approved remedy (2026-10-02).** User approved deferring only development-panel controls, keeping the shortcut/dialog/Close/focus trap eager and the ceiling unchanged. Build 8 defines concrete scope, failure/focus lifecycle tests and measured acceptance before remaining Markdown authoring resumes.

- **Bundle-remedy plan review (2026-10-02).** Independent reviewer found no substantive omissions or boundary violations in Build 8. Tests will compare block identities across reopen and preserve focus on the exact eager Close button through completion, rather than merely checking focus somewhere inside the modal.

- **Unreadable live-update refinement (2026-10-02).** The existing no-write-path requirement also applies if foreign config arrives while editing. The body preserves the draft and blocks Save via a presentational saveBlocked input plus its own guard; Cancel remains available. This adds a test rather than allowing the browser to repair opaque config silently.

- **Early remedy gate green (2026-10-02).** Unique initial files total 1,032,388 bytes, below the unchanged ceiling. Stats prove controls/store/layout and Markdown parser/body/renderer lazy while shell stays initial. Editor implementation resumes. The first lifecycle run exposed a test setup issue: its second configureTestingModule call reset Manual behavior. The helper now supplies Manual in one call, preserving real placeholder/completion assertions.


- **Independent final review round 1, documentation (2026-10-02).** Reviewer confirmed
  panel lifecycle, gateway boundaries and restored renderer safety. Two findings held:
  the MCP guide conflated browser-owned history with connection-owned history, now corrected;
  §30’s initial type list omitted Markdown despite its eight-type paragraph, now added.


- **Final production bundle (2026-10-02).** Completed editor leaves the initial payload at
  1,032,388 bytes (17,612 bytes under the ceiling). Stats show the eager Markdown shell in
  main; parser/renderer/body/editor in the 125.81 kB lazy output, and panel controls/store/layout
  in a 20.90 kB lazy output. No ceiling change. Renderer fault checks failed as intended when
  images, unsafe links or emulated styles were introduced, then restored; 107 focused UI tests
  and web lint pass. The independent non-owned contracts/domain/transport/callback review
  found no substantive issue, including the settled no-write browser assertions.


- **Independent final review round 2 (2026-10-02).** Boundary/documentation reviewer
  verified the two corrections and returned no substantive findings. A separate correctness
  reviewer found one inventory omission in projects/overview; Markdown is now named there.
  No code defects found. Full offline suite passes 2,904 workspace plus 9 script tests,
  lint and Compodoc pass, and Storybook builds with the new stories.


- **Integrated acceptance and actual use (2026-10-02).** All 104 Playwright tests passed,
  including the two new Markdown journeys. Unchanged HTTP host acceptance and both-transport
  MCP acceptance passed on isolated files. Separate dev:web/dev:host terminals used a scratch
  copy of nested-projects. Real Home/workstream notes were typed, previewed and saved at
  1366 px and 375 px, in both themes, Flow and Grid span 4; exact source, focus restoration
  and page containment passed, with rendered screenshots inspected. Archive Restore retained
  exact source. A real HTTP MCP client created/updated Markdown while the tab stayed open;
  an active editor kept its draft and announced the external replacement. The first harness
  wrongly expected initial focus on Close (the shell focuses the dialog), and one capture
  raced the identity-seeded theme; corrected setup verified Tab to Close and settled identity
  before asserting the theme at capture. No application code repair was needed. Preview-label
  friction was recorded through the panel in .prototype/notes.json under Slice 62; both servers
  were stopped. Green implementation checkpoint: f9d11fc.

## Outcome

**Deliverables.** [MarkdownSection](../../../apps/web/src/app/features/projects/sections/markdown/markdown-section.ts)
now appears second in the eight-type picker beside Rich Text. Its lazy body and fresh source
editor provide Edit, Preview, Save and Cancel, conservative unreadable handling, retained drafts
on refused writes and section.updated, and focus restoration. The shared safe renderer preserves
source while escaping HTML, rejecting unsafe links and disabling images. Contracts declare
proseKey; domain recovery and history labels support Markdown without parsing it. HTTP and MCP
preserve exact source and whole-config replacement, and shortcuts render read-only.

**Deliberate choices.** The [Markdown decision](../../decisions/2026-10-markdown-source-and-rendering.md)
records source ownership, parser/dialect, sanitizer, scoped styles and explicit replacement rather
than merging drafts. A loading placeholder accepts a brief layout shift. The user-approved
[panel amendment](../../decisions/2026-08-development-panel-surface.md) defers controls while keeping
modal chrome and keyboard handling eager. The final production build is 1,032,388 initial bytes,
17,612 below the unchanged 1,050,000-byte ceiling; editor/parser/renderer and controls/store/layout
are only in lazy outputs. The existing 850,000-byte warning remains.

**Deviations.** The required early bundle gate failed at 1,052.60 kB, so editor implementation
paused until the user approved the bounded panel remedy. A picker test fixture was repaired to
include all eight types, five design-lab frame mounts received the awaited callback, and live
foreign/read-only config gained explicit Save blocking while retaining the draft. Independent
plan and diff reviews ran iteratively; their concrete documentation findings were resolved and
final rounds returned no substantive findings. The implementation checkpoint commit followed the
integrated green gates rather than separate commits for each test while the bundle remedy remained
unsettled; the closure is a separate documentation commit.

**Validation and learning.** 2,904 workspace tests plus nine script tests, lint/docs checks,
Compodoc, production stats build, Storybook, all 104 browser tests, HTTP host acceptance and both
MCP transports passed. Actual use on nested-projects exercised Home and Kitchen workstream notes
in both themes and desktop/375 px, Flow/narrow Grid, Archive Restore and HTTP MCP live drafts.
Screenshots were inspected. The [friction log](../../../.prototype/notes.json) records that the
pressed Preview button keeps its label, making the return to source less discoverable. No check
was skipped. Development servers stopped; the developer's data.json was not changed.

**Deferred and open questions.** Stage C2 owns schema v6, Rich Text conversion including every
history snapshot, seed regeneration, retirement/refusal of new Rich Text creates and final removal
of that registration. The Preview-label friction is available for a later UX decision; it does not
block C1 acceptance. No unresolved implementation or review finding remains in this slice.

**Documentation updated.** The spec §§26, 29–31, 46 and 66; contracts/domain and web/project/tooling
architecture; testing/how; MCP setup and milestone walkthrough; the new decision plus config,
Archive, labels, bundle and panel amendments; and the Slice 59 umbrella/goals/board agree with C1.
