<!-- plan id="72" status="active" summary="Shared control primitives (buttons, icon button, field, select, checkbox, pill, tool, link) with one action hierarchy, adopted across product surfaces (TH04, TH05)" -->
# Slice 72 — Primitives

## Goal

Give every product control one shared, token-built primitive (button in four ranks, icon button,
tool, field, select, checkbox and radio, pill, link) with one size scale and comfortable targets.
Then adopt those primitives on every product surface, so that browser-default controls disappear
and each form shows its commit action as the primary one.

## Spec sections

§21 (primitives before polished pages; no literals; new control-size tokens), §22 (both themes),
§67 (the Lab's buttons and inputs panels show the real primitives), §69 (verification), §77
(design-first use; tests change with intent), §79 (friction notes). The umbrella
[70](70-ui-ux-overhaul.md) and the [overhaul protocol](../../guides/ui-ux-overhaul-protocol.md) §6–§7
apply. Governing decisions:
- [Depth direction](../../decisions/2026-10-frosted-glass-depth-direction.md), with its contrast amendment
- [accents stay split per theme](../../decisions/2026-10-accents-stay-split-per-theme.md)
- [scaffolding stays](../../decisions/2026-10-prototype-scaffolding-stays-for-now.md)
- [untitled shortcut sources name their owner](../../decisions/2026-10-untitled-shortcut-sources-name-their-owner.md)

Direction principles 2 (borders only where a control needs a boundary), 3 (one primary action per
surface; destructive actions separated) and 4 (state in shape and words) are the ones this slice
implements.

## Build

The work runs in three parts, with a user checkpoint between A and B:

- **A, the primitives.** Control tokens, `_controls.scss`, the icon set, Lab specimens and one
  Storybook file. No product surface adopts anything yet (protocol §7.1).
- **Checkpoint.** The user looks at the Lab primitives in both themes, at 1440 and at a 375 touch
  emulation, and confirms or swaps the removal marks (open question 4). The answer can change
  part A before adoption starts.
- **B, adoption.** Every product surface swaps its control styling for the primitives and deletes
  the component rules that painted controls. This is appearance only.
- **C, accessible names and focus.** These are behaviour changes, so tests come first. C does not
  depend on the checkpoint, and may be built while it waits.

## Done when

The Lab shows every primitive and state from tokens alone, in both themes. No product surface
renders a browser-default button, field, select, checkbox or radio. Each form or dialog shows one
primary action, and destructive actions use one separated danger treatment. Buttons use at most
two heights and fields one, every product control is at least 24 px with a pointer and 44 px on
touch, apart from pre-listed exceptions, and app-owned icons come from one SVG set. The
accessibility findings are gone from axe and the accessibility tree. Each closed finding has a
before/after pair on a sheet that the user accepts at Gate 2.

## Do not

- Build menus, dialogs, drawers or toasts as lifts, or move focus after dialogs, menus or route
  changes. That is TH06, slice 3 (Lifts and focus).
- Change section-tool emphasis at rest, the insertion affordance or its hit area. That is TH08,
  slice 5.
- Reshape list rows, move the Todos checkbox, or make Timeline rows navigate. That is TH09, slice 6.
- Change navigation structure, group headings or breadcrumbs (slice 7), or copy and vocabulary
  (slice 9).
- Restyle the dev panel or other TH12 scaffolding.
- Replace user-chosen project or workstream emoji. They are content from the contract.
- Raise tints for contrast. Contrast is reported, not gated.
- Add animation. The duration tokens may be used only for colour transitions on hover. They are
  capped by reduced motion already.

<!-- ───────────── Written when the slice starts ───────────── -->

## Scope check: TH04–TH06

The umbrella's Phase 2 list groups "primitives: TH04–06", and [themes.json](../70-ui-ux/themes.json)
marks TH06's layer as `primitives`. The approved sequence (umbrella, "Proposed slice sequence")
gives TH06 to slice 3, and its findings support that:

- the task drawer becomes a lift that takes focus and closes on Escape;
- More becomes a menu;
- page settings and menus return focus.

All of that is lift and focus behaviour, not control styling. **This slice is TH04 and TH05 only.**
Two TH04/TH05 findings touch TH06's ground, and each is held to its primitive part:

- **W4-019** separates the destructive action inside today's inline More panel. Slice 3 turns that
  panel into a menu and keeps the separation.
- **W2-001 / W4-002** move focus into the New project field when the form opens. That is the
  form's own control, not a lift or a route change. TH06's **W1-004 and W3-007** report the same
  defect from other walkthroughs, so this slice closes them too. Slice 3 must not re-plan them.
  W3-003, focus lost on a route change, stays with slice 3.

## Findings closed

Ids are from [themes.json](../70-ui-ux/themes.json). All 37 are reproduced in
[reproduction.json](../70-ui-ux/reproduction.json); W2-012 is reproduced in part. The plan
claims 33 closed and 4 advanced. It also closes three findings from other themes:
- TH01's L5-006, which slice 71 advanced by defining `--field-line`, closes here by adopting it on
  every field;
- TH06's W1-004 and W3-007 (see the scope check).

| Finding | Theme | Closed by |
|---|---|---|
| L2-001, L1-009, W1-019, W4-033 | TH04 | Progress, Reflections (section and page), Todos, Agents and Archived projects controls use the primitives; no browser-default button remains |
| L5-001 | TH04 | Timeline rows become app rows (the `row` button variant); kind labels become pills. Check: 0 axe `color-contrast` violation nodes on `.timeline__kind` in the after cells |
| L2-002 | TH04 | One field treatment for text, number, date, select and textarea, with `--field-line` adopted (closes slice 71's advanced L5-006 adoption) |
| L2-009 | TH04 | Two button heights (sm, md) and one field height; on touch all become the hit target. Proved by the control census |
| L2-008 | TH04 | Sidebar New project, project-nav Add workstream, header undo, redo and More use `.icon-button` with shared marks. The canvas insertion "+" uses the shared mark, and its geometry stays with slice 5 |
| L2-013, W1-012, W4-009 | TH04 | App-owned icons become one monochrome SVG set: page kinds, section types, widgets, activity actors, and the text glyphs `+ ⋯ ✓ × ↗`. Pages no longer share an emoji with a user's workstream. The Task List type mark is a list, not a ticked box. **Excluded on purpose:** the `'📁'` and `'🧩'` fallbacks that stand in for a missing user icon (`project-header.html`, `project-page-navigation.html`, `project-work-item.ts`, and four dashboard widget templates). They fill the user-content slot, so they stay in the content family. They are listed on the sheet |
| W1-038, W4-032, L2-007 | TH04 | One destructive treatment (`--danger`). Removing a section uses the danger tool with a "remove section" mark. Deleting a task uses a quiet tool with the trash mark. Removing a shortcut uses a neutral tool with an "unlink" mark |
| L5-021, W1-002, W3-008 | TH04 | Checkbox at least 24 px with a pointer and 44 px on touch; New project "+" is a 24 px+ icon button with room for the ring |
| W2-012 | TH04 | Close, Dismiss, Restore, Open source and the permission toggles become buttons or checkboxes that meet the targets |
| W2-005 | TH04 | On touch, the More panel controls, the page toggles, the task add row and project-navigation rows reach the hit target |
| L5-005 | TH04 | The Timeline row button carries `aria-expanded` and `aria-controls` |
| L5-003, W1-022 | TH04 | The Reflections prompt select and the subject picker have visible labels; the progress bar is named (next row) |
| L5-004 | TH04 | The bar is named "{frame name} progress", where the frame name is what the frame displays: the section's `nameOf` name in a section frame, and `shortcutNameOf(source, owner)` in a shortcut frame. Each frame provides that name through a new `SECTION_FRAME_NAME` injection token (a `Signal<string>`) in its own `providers`. `NgComponentOutlet` content inherits the frame's injector, so no new `ngComponentOutletInputs` key is needed. A new key would make `setInput` throw on content components that lack it. `ProgressSection` reads the token, falling back to `nameOf(section())`. `aria-describedby` points at the bar's own summary, through a per-instance id. The name never comes from the frame's h2, which holds a "Rename X" button (slice 5's L6-009) |
| W1-003, W2-001, W4-002, W1-004, W3-007 | TH04, TH06 | The New project field has a visible "Project name" label (the text `apps/e2e/ux/tasks.ts` uses), and opening the form moves focus into it |
| L1-020, W1-010, W4-015 | TH05 | Every dialog, inline editor and form marks its commit action `--primary`; Cancel is secondary; mode switches are ghost. The More panel is the one named exception (next row, and L2-006 below) |
| W4-019 | TH05 | In the More panel, Archive project sits apart in a danger group, below a separator, and uses the danger button, as does its confirm, "Archive it". The panel's three inline edits (Rename, Save, Set) are **secondary**, not primary: three primaries on one surface would break principle 3. Slice 3 rebuilds the panel as a menu with page-settings forms (L3-025) and owns its primary action |
| L2-010, W3-019 | TH05 | One `.link` look (accent and underline) for real links; Close and Restore are buttons everywhere |
| W3-017 | TH05 | Shortcut picker Add buttons name their source (`shortcutNameOf`). Revoke names its agent, and each agent's permission checkboxes are a fieldset whose legend is the agent |

**Advanced, not closed (they stay open, owner named):**

- **L3-015** (TH04). Rows look clickable and the open row is marked. "Clicking gives something
  new or goes to the task" is slice 6.
- **L3-019** (TH05). The links and non-links are fixed. The detached checkbox is row shape, slice 6.
- **L2-006** (TH05). Every listed surface gains a primary commit except the More panel's
  Rename, Save and Set, which stay secondary (W4-019 row). One emphasis "everywhere" for the More
  panel is slice 3's, when it becomes a menu with page-settings forms (L3-025).
- **W1-050** (TH05). Restore looks like a button. The two labels stay different on purpose: a
  removed section restores its *saved content* ([archived-region.ts](../../../apps/web/src/app/features/projects/archived-region/archived-region.ts)),
  and naming is slice 9's.


## Acceptance check

**A, primitives.**

1. `apps/web/src/styles/_tokens.scss` gains the control family:
   - heights `--control-height-sm` (2rem) and `--control-height-md` (2.5rem). Both are multiplied
     by `--knob-space-scale`, so the Lab's density knob moves them;
   - `--size-target-min` (1.5rem), beside the existing `--size-hit-target` (2.75rem). Neither
     follows a knob, so density can never shrink a target below the minimum;
   - the checkbox and radio box size, and the check-mark and chevron dimensions and offsets
     (`--control-check-size`, `--control-mark-*`, `--control-chevron-*`). The token lint rejects
     any literal length outside the tokens file;
   - control padding, the control radius and the field-line weight, as aliases of existing
     space, radius and border tokens wherever one fits;
   - colours for the primary, secondary, ghost and danger fills and borders, and for hover,
     pressed and selected, all derived once under `:root` from the existing accent, danger,
     text and surface literals. **No new base literal.**
2. `apps/web/src/styles/_controls.scss` is new and is imported by `styles.scss` after `base`. It
   holds the classes below and **no literal** (the token lint covers it):
   - `.button`, with `--primary`, `--secondary` (the default look), `--ghost`, `--danger`, `--sm`
     and `--row` (a full-width list-row button, left-aligned);
   - `.icon-button`, with `--sm` and `--danger`;
   - `.tool`, a quiet square icon button for frame and row chrome. Its at-rest visibility stays
     owned by the frames until slice 5;
   - `.field` for `input` and `textarea`, and `.select` for `select`. A native `select` has no
     `::after`, so its chevron is two `linear-gradient` background layers in `currentColor`,
     positioned by tokens (no data URI, so no literal);
   - `.checkbox` and `.radio`: native inputs with `appearance: none` and a mark drawn from tokens.
     Under `forced-colors: active`, these and `.select` go back to `appearance: auto`;
   - `.pill`, with neutral, accent, success, warning and danger;
   - `.link`;
   - `.control-label`, a visible field label;
   - `.danger-zone`, the separated group for destructive actions.

   Every interactive class has a min target of `--size-target-min`. Under
   `@media (hover: none), (any-pointer: coarse)` it has `--size-hit-target` (the app's existing
   touch query). Disabled uses `--opacity-disabled` and `--cursor-disabled`. Focus is the one
   base `:focus-visible` ring, so no primitive declares an outline. Selection is shown in shape:
   `aria-pressed`, `aria-checked`, `aria-expanded="true"` (the open Timeline row) and `:checked`
   add a mark or an inset ring, not only a fill (principle 4).

   **Danger at rest is never filled.** It uses danger-coloured text and border on the
   danger surface, so a Revoke is not the loudest control on its page (L1-009).

   **Specificity.** Angular's emulated encapsulation makes a component's `button {…}` into
   `button[_ngcontent-…]` (0,1,1), and `.x {…}` into (0,2,0). Both beat a global `.button`
   (0,1,0). So adoption *deletes* every component rule that paints a control. It does not
   override them.
3. **Icons.** `Icon` gains the marks for: more, close, check, open, unlink, remove-section; the
   page kinds (home, todos, archive, reflections); each section type; each dashboard widget; and
   the three activity actors. Every `IconName` renders a non-empty SVG (spec), and every glyph
   stays `aria-hidden`.
4. **Lab.** In `/prototype/design`, the Buttons and Inputs panels render the real primitives, not
   `lab-button` and `lab-input`, and their badge reads "shared". A Controls panel shows:
   - every variant and size;
   - rest, hover (forced with a class for the specimen), `:focus-visible`, pressed, selected,
     disabled and danger;
   - checkbox, radio, select, date, number and textarea;
   - pills, links and the danger zone;
   - all specimens over a sheet and over a pane.

   Cards, menus and states keep "not yet a shared component".
5. **Storybook.** `shared/controls/controls.stories.ts` holds one story per primitive family,
   each with its states, and shows both themes through the existing toolbar.
6. **Checkpoint.** The orchestrator captures the Lab Controls panel at 1440 dark and light and at
   375 touch light, and shows it to the user with open question 4. **Part B does not start until
   the user has answered.**

**B, adoption.** This part changes appearance only.

7. Every product file in the change list uses the primitives. The component SCSS keeps only
   layout (grid placement, gaps, inline size, margins) and never paints a control. There are two
   checks after adoption:
   - **Element selectors.**
     `grep -rnE "(^|[[:space:],>+~(])(button|input|select|textarea)([[:space:]]|[[:punct:]]|$)" apps/web/src/app --include=*.scss`
     is run before adoption, and its output is pasted into the plan as the baseline: 77 lines in 26 files at planning (comments and prose words included). After adoption, every remaining line is either a selector exception
     (Capture scope) or a rule whose declarations are layout only. The review lists each one.
   - **Class paint.** A dedicated review pass greps each adopted component's SCSS for
     `color`, `background`, `border`, `box-shadow`, `opacity` or `font-*` on a selector that
     targets a control (`__submit`, `__danger`, `__close`, `__retry`, `__remove`,
     `__toggle` and the like). It must report none outside the exceptions.
   - Every control converted to icon-only keeps its current accessible name through `aria-label`
     ("Close" stays "Close", "Close task details" stays). The e2e suite proves it.
8. **Action hierarchy.** Exactly one `--primary` per surface: the commit action. This applies to
   the section-create and work-create dialogs, the Markdown editor, the Reflections composer and
   section, the task quick-add, sidebar New project, and the Progress manual value. In each,
   Cancel is secondary and mode switches are ghost.

   The More panel is the named exception. It has no primary. Its three inline edits are
   secondary, and Archive project and "Archive it" sit in a `.danger-zone` after a separator.

   Verified on the visual pairs and by `grep -c "button--primary"` per template, which must be
   ≤ 1 (0 for `project-more-menu.html`). The counts are recorded in the sheet.
9. **Control census** (from capture `layout.json`). Part A's harness change replaces the inline
   collector in `capture.ts` with an exported `collectControls` in `layout.mjs`, so the harness
   test can exercise it. It covers `button, input, select, textarea, a, [role=button]` and records:
   - tag, type, role and class;
   - computed border;
   - a `scope` field: `prototype` inside `app-dev-panel` or on a `/prototype/` route, `prose`
     inside `.markdown-renderer`, otherwise `product`;
   - for checkboxes and radios, both the input box and the box of the enclosing or associated
     `<label>`. **The target is the larger of the two**, as WCAG 2.5.8 measures it.

   Only `product` scope is gated:
   - **1440 and 1024.** Product `.button` elements use at most two heights (sm and md, ±0.5 px);
     fields, selects and textareas one minimum height; every product control is at least 24×24,
     except the pre-listed exceptions.
   - **375 touch.** Every product control is at least 44 px tall (and at least 24 px wide),
     except the pre-listed exceptions.
   - No 375 cell scrolls horizontally (`metrics.document` ≤ `metrics.viewport`).

   The sheet lists every remaining violation. An unlisted violation is a defect.
10. **Accessibility.** Installed axe-core 4.13 ships `target-size` disabled. The harness commit
    therefore enables it in `capture.ts` (`options({ rules: { 'target-size': { enabled: true } } })`)
    *before* the "before" run, so both sides measure it. Across the after cells, axe reports:
    - **0** `select-name`, `aria-progressbar-name` and `button-name` violations;
    - **0** `target-size` violations outside the listed exceptions.

    `color-contrast` violation and incomplete counts are reported per theme, before and after.
    Remaining serious results are listed as accepted exceptions under the contrast amendment.
11. **Forced colours.** `apps/e2e/ux/primitives-verification.ts` (new; it carries its own theme lock, copying the pattern in `capture.ts`: lock through the real toggle, then assert `data-theme`) captures `/projects/project-kitchen` (nested-projects,
    1440) and `/settings` (agent-heavy) in both themes, under `forcedColors: 'active'`. The
    captures show the checkbox, radio, select chevron and pill boundaries, and they go in the
    sheet.
12. **Bundle.** `pnpm --filter web build` keeps the initial total ≤ 1050 kB, and the number is
    recorded. The new global CSS is offset by the component control rules it deletes.

**C, names and focus.** These are behaviour changes, each test written red first (see the test
plan).

13. Opening New project, in the sidebar and in the phone drawer, puts focus in a visibly labelled
    name field.
14. The Timeline row button reports `aria-expanded` and controls its details. The `li` no longer
    carries `aria-expanded`.
15. The progress bar, the prompt select and the subject picker have accessible names. Each
    shortcut picker Add, and each Revoke, names what it acts on. Agent permission checkboxes are
    grouped under the agent's name.

(Page-link marks are already `aria-hidden` spans, so swapping them for SVG is appearance only.
The one consequence is a §77 edit to a unit test that reads `textContent`. See the test plan.)

**Whole slice.**

16. `pnpm test` (offline), then `pnpm lint` (which includes `docs:check`), run one after the other.
    Then the **full** `pnpm e2e`. A purely visual change must not edit an e2e test. The edits
    allowed are the §77 locator changes from part C, listed in the test plan:
    - `apps/e2e/ux/tasks.ts:83`, the core-task script that `ux:capture` runs;
    - `shortcut-picker.stories.ts:141`;
    - any spec found by grepping for `name: 'Add'` or `'Revoke'`.
17. `pnpm --filter web storybook:build` passes.
18. The before/after sheet is built by `build-sheet.mjs --profile 72` and published privately. The
    user accepts it at Gate 2.
19. The app is used on busy-week, nested-projects and agent-heavy, at 1440 and at 375 touch, and
    any friction is recorded in `.prototype/notes.json`. `CURRENT_SLICE` = 72.

## Capture scope

- **Must change.** Every cell that shows a control: paint, and control geometry by design.
- **Must not change.**
  - Plane colours and the planes' own paint (slice 71).
  - Route content and the order of controls.
  - Every e2e journey and the [phone layout](../../../apps/e2e/phone-layout.spec.ts).
- **Geometry is not invariant in this slice.** Control heights change, so the content inside
  sheets reflows. Slice 71's ±1 px box gate does not apply. The sheet *reports* plane-box
  movement and gates on acceptance 9 instead. Its slice-71 Lab exceptions become a per-slice
  profile:
  - profile 71 keeps today's rules and regressions;
  - profile 72 expects the new Lab Controls panel and the re-rendered Buttons and Inputs panels.
    It **reports, without failing,** the control-identity changes it intends: Add and Revoke
    names, glyph text becoming SVG (`+`, `⋯`, `×`, emoji marks), and changed control counts.
    Today `build-sheet.mjs` fails on changed control text. Those changes go in a listed table.
- **Pre-listed census exceptions.** Each is named, with its owner. The list is filled in when the
  "before" capture is read, before any adoption, and committed right after that run (Implementation
  sequence, step 0.2). **Filled from the "before" census (2026-10-14).** Matched by class or
  accessible name; each stays a reported violation on the sheet, not a silent pass:
  - links inside rendered Markdown prose (WCAG 2.5.8 inline exception). Excluded by `prose` scope;
  - dev panel and Lab rail controls (TH12 scaffolding). Excluded by `prototype` scope;
  - the canvas insertion points, `Insert before …` and `Insert at the end` (slice 5, TH08), and the
    section resize handle (slice 5; not flagged at rest);
  - the section frame's title button, `.section-frame__title-button` ("Rename …"), whose
    heading role and name are slice 5's L6-009;
  - the task row's title button, `.task-row__title` ("…, open details"), which is row shape
    (slice 6, TH09, L3-015);
  - dashboard widget row title links, `.widget-row__title` (slice 6 owns rows).

  Everything else the census flags is closed by this slice: the task-row and Todos checkboxes,
  New project, every unclassed `input`, `select` and `textarea`, Add task, the project-navigation
  toggle and root link, Open source, the Todos, Reflections and owner links (`.link`), Complete,
  the drawer's Close and More's danger button.
- **Selector exceptions (acceptance 7).**
  - `apps/web/src/app/prototype/**`.
  - `markdown-renderer` element rules for rendered prose.
  - Each layout-only rule left in a product file, named with a one-line reason when found.
- **Visual acceptance pairs (one screen).** Each pair is shown before and after:

  | Surface | Seed and setting | Shows |
  |---|---|---|
  | `busy-week-project-dark-1440` (plus its scroll crops) | Progress and Reflections controls, task checkbox | L2-001, L1-009, W1-019, L2-002, L5-021, W4-009 |
  | `nested-projects-project-dark-1440` | Timeline rows | L5-001, L3-015 (advanced) |
  | `kitchen-section-create-light-1440` | Add a section dialog | L1-020, L2-006, W1-010, W4-015 |
  | `kitchen-more-dark-1440` | More panel | W4-019, L2-009, note-003 |
  | `archive-dark-1440` | Root Archive page | L2-010, W1-050, W3-019 |
  | `todos-light-1440` (nested-projects) | Todos page | L3-019 (links) |
  | `settings-agents-dark-1440` (agent-heavy) | Settings › AI & Agents | W3-017, L1-009 |
  | `settings-light-1440`, `settings-archived-projects-light-1440` (agent-heavy) | Appearance radios, archived selects | W4-033 |
  | `new-project-dark-1440`, `new-project-light-375` | Sidebar New project form | W1-002, W1-003, W2-001, W3-008 |
  | `nested-projects-project-light-1440` | Project header and navigation | L2-008, L2-013, W1-012 |
  | `kitchen-task-drawer-dark-1440`, `nested-projects-project-dark-1440` (four shortcuts) | Section, shortcut and task removal | W1-038, W4-032, L2-007 |
  | `kitchen-more-light-375`, `kitchen-page-settings-light-375`, `archive-light-375`, `settings-agents-light-375` | Touch targets: More panel, page toggles, Dismiss and Restore, permission toggles | W2-005, W2-012 |
  | `prototype-design-dark-1440`, `prototype-design-light-1440` | Lab Controls | The primitives |
  | `primitives-verification` forced-colours captures | Kitchen and Settings | Acceptance 11 |

  The cell ids are `apps/e2e/ux/matrix.ts`'s. There is no plain Kitchen cell, so Kitchen
  appears through its state cells.

  L5-003, L5-004, W1-022 and L5-005 are accessibility-tree findings. Their evidence is the axe
  counts (acceptance 10) and the part C tests. L2-009's evidence is the census table.

- **Storybook.** One new story file (`controls.stories.ts`). The existing 19 story files show the
  adopted primitives through their components. The one story edit is the §77 locator in
  `shortcut-picker.stories.ts`.

## Behaviour vs. appearance

- **Appearance:** parts A and B. Every existing web, e2e and Storybook test stays green without
  edits, apart from the §77 changes listed below. A test that fails because of a restyle is a
  defect in the slice, not in the test. Checkboxes, radios and selects stay native elements, so
  keyboard, form and `check()` behaviour does not change.
- **Behaviour:** part C (§77). Test, implementation and doc change together:
  - New project focuses its field on open;
  - Timeline `aria-expanded` moves from the `li` to the button;
  - new accessible names (prompt, subject, progress bar, Add, Revoke, permission groups);
  - the registries' `icon` becomes an `IconName`. Accessible names do not change, because the
    marks were already `aria-hidden`, but one unit test that reads `textContent` does.

  The tests that change on purpose are named in the test plan.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/styles/_tokens.scss` | modify | Control heights, `--size-target-min`, and the control colour, border and radius aliases derived once under `:root` |
| `apps/web/src/styles/_controls.scss` | create | The primitive classes (acceptance 2); no literals |
| `apps/web/src/styles/_control-states.scss` | create | No-output mixins for hover and pressed, used by `_controls.scss` and by the Lab's forced-state specimens, so they cannot drift |
| `apps/web/src/styles.scss` | modify | `@use './styles/controls'` after base |
| `apps/web/src/app/shared/components/icon/icon.ts`, `icon.spec.ts` | modify | New marks; every `IconName` renders |
| `apps/web/src/app/shared/controls/controls.stories.ts` | create | Storybook view of the primitives (protocol §7.1) |
| `apps/web/src/app/features/projects/project-page-registry.ts`, `features/projects/sections/registry.ts`, `features/dashboard/widgets/registry.ts`, `features/activity/activity-feed.ts` | modify | `icon` becomes an `IconName` |
| Their render sites: `project-page-navigation.html`, `section-create-dialog.html`, `section-frame/project-section-frame.html`, `shortcuts/shortcut-frame.html`, `shortcuts/shortcut-picker.html`, `dashboard-widget-frame` template, the activity feed template, `project-more-menu.html` (found by grep for `.icon` reads) | modify | Render `<app-icon>`, not an emoji string |
| `core/shell/sidebar/sidebar.html`, `.scss`, `.ts`, `.spec.ts` | modify | New project: an icon button, a visible label, focus on open, `.field` and `--primary` |
| `core/shell/app-shell.html`, `.scss`; `core/shell/top-bar/top-bar.html`, `.scss` | modify | Drawer Close and the menu and theme buttons become `.icon-button` |
| `features/projects/project-header.html`, `.scss`; `history/project-history-controls.html`, `.scss`; `history/project-history-feedback.ts` | modify | More, undo and redo as icon buttons; Retry secondary; Dismiss a ghost button |
| `features/projects/project-more-menu.html`, `.scss` | modify | Fields; Rename, Save and Set as **secondary** (no primary on this surface); `.danger-zone` with danger Archive project and "Archive it" (W4-019) |
| `features/projects/project-page-navigation.html`, `.scss`, `.spec.ts` | modify | Toggle and Add-workstream icon buttons; page marks; checkboxes; 44 px rows on touch |
| `features/projects/project-workspace-shell.html`, `.scss`; `project-canvas.html`, `.scss`; `section-recovery-notice.html`, `.scss` | modify | Retry and recovery buttons by rank |
| `features/projects/section-create-dialog.html`, `.scss`; `work-create-dialog.html`, `.scss` | modify | Fields and selects; primary Create; secondary Cancel; ghost mode switch |
| `features/projects/sections/section-frame/project-section-frame.html`, `.scss`; `shortcuts/shortcut-frame.html`, `.scss` | modify | `.tool` for handle and collapse; remove-section danger tool; unlink tool; title field |
| `features/projects/canvas-chrome/insertion-point.ts`, `.scss` | modify | The shared plus mark only; geometry untouched |
| `features/projects/sections/tasks/task-list-section.html`, `.scss`; `features/tasks/task-row.html`, `.scss` | modify | Quick-add field with a primary Add task; `.checkbox`; delete as a quiet trash tool |
| `features/tasks/task-detail-drawer.html`, `.scss` | modify | Fields and select; Close as an icon button (the drawer itself stays inline; slice 3) |
| `features/projects/sections/markdown/markdown-section-body.html`, `.scss`; `markdown-source-editor.html`, `.scss` | modify | Edit is ghost; textarea `.field`; Save primary |
| `features/projects/sections/progress/progress-section.html`, `.scss`, `.spec.ts` | modify | Formula buttons as a pressed set; manual `.field` and primary Set; progress bar named |
| `features/projects/sections/reflections/reflection-composer.html`, `.scss`, `.spec.ts`; `reflections-section.html`, `.scss` | modify | Fields, a labelled prompt select, primary Add reflection, Edit as ghost |
| `features/projects/pages/reflections-page.html`, `.scss`, `.spec.ts` | modify | Same, plus the labelled subject picker |
| `features/projects/sections/timeline/timeline-section.html`, `.scss`, `.spec.ts` | modify | `.button--row`; kind `.pill`; `aria-expanded` and `aria-controls` on the button |
| `features/projects/pages/todos-page.html`, `.scss`; `pages/archive-page.html`, `.scss`; `archived-region/archived-region.html`, `.scss` | modify | `.link` for real links; plain text for non-links; Restore and Complete as secondary buttons; `.select`; `.checkbox` |
| `features/projects/shortcuts/shortcut-picker.html`, `.scss`, `.spec.ts` | modify | Add names its source |
| `features/settings/agents/agent-connections-page.html`, `.scss`, spec | modify | Revoke as a danger button named by the agent; permission fieldset and legend; `.checkbox` |
| `features/settings/archived-projects/archived-projects-page.html`, `.scss`; `features/settings/settings-page.ts` | modify | `.select`, Restore, and `.radio` for Appearance |
| `features/activity/activity-feed.scss`, `features/projects/project-header.scss` status | modify | Badges and status as `.pill` |
| `apps/web/src/app/prototype/design-lab/panels/primitive-panels.html`, `.scss`; `panels/control-panels.ts`, `.html`, `.scss`; `design-lab-page.html`, `design-lab-page.ts` (imports the panel), `design-lab-page.spec.ts` | modify, create | The Buttons and Inputs panels use the primitives and read "shared"; the new Controls specimen panel |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 72` |
| `apps/e2e/ux/capture.ts`, `apps/e2e/ux/layout.mjs`, `apps/e2e/ux/harness.test.mjs` | modify | `collectControls` moves out of `capture.ts` into `layout.mjs`. It covers textarea and `[role=button]`, and records tag, type, role, class, computed border, scope, and the label box for checkboxes and radios. axe `target-size` is enabled. A red harness test comes first, and all of it is committed before the "before" run |
| `apps/e2e/ux/primitives-verification.ts` | create | Forced-colours captures of Kitchen and Settings in both themes (acceptance 11), written to `primitives-verification.json`. It lands with the harness commit, so the "before" run has them too. Its own theme lock copies the `capture.ts` pattern. It never imports `depth-verification.ts`, which exports nothing, and importing it would register that file's test a second time |
| `apps/e2e/ux-capture.config.ts` | modify | Add `primitives-verification.ts` to `testMatch`. `playwright.config.ts` ignores `ux/`, so it would otherwise never run |
| `apps/web/src/app/features/projects/sections/section-frame-name.ts` | create | The `SECTION_FRAME_NAME` token |
| `sections/section-frame/project-section-frame.ts`, `shortcuts/shortcut-frame.ts` | modify | Provide `SECTION_FRAME_NAME` as a factory that reads the frame's existing `name` signal (`useFactory: () => inject(ProjectSectionFrame).name`, and likewise for the shortcut frame), so the frame and the bar share one name computation |
| `apps/e2e/ux/tasks.ts` | modify | §77: the core-task Add locator follows the source-named Add (line 83) |
| `apps/e2e/primitives.spec.ts` | create | The e2e behaviour tests in the test plan |
| `apps/web/src/app/features/projects/shortcuts/shortcut-picker.stories.ts` | modify | §77: the Add locator in its play function |
| `docs/roadmap/70-ui-ux/tooling/build-sheet.mjs`, `build-sheet.test.mjs` | modify | `--profile 71/72`; profile 72 also reads `primitives-verification.json` from the before and after directories and pairs its forced-colours captures by surface and theme, gates on the census, overflow and axe names, reports geometry, and expects the Lab Controls panel; regressions first |
| e2e specs that name changed controls exactly (`archive.spec.ts` stays; others found by grepping for `name: 'Add'` and `'Revoke'`) | modify | §77 locator updates only, listed at implementation |
| `apps/web/src/app/features/projects/sections/progress/progress-section.ts` | modify | The bar's name comes from its own `section()` (L5-004) |
| `docs/decisions/2026-10-control-primitives-are-global-classes.md`, `docs/decisions/README.md` | created at planning; amend at close | Open question 2's answer, indexed. Amended with measured bundle and specificity results when the slice closes |
| `docs/decisions/2026-10-app-icons-are-one-svg-set.md` | created at planning; amend at checkpoint | Open question 3's answer: app-owned marks are SVG; user emoji, and the `📁` and `🧩` fallbacks in their slot, stay content |
| Spec §21, §67 | modify | §21: primitives live in `_controls.scss` over native elements. §67: buttons and inputs are shared primitives in the Lab |
| `docs/architecture/web/overview.md`, `why.md`, `what.md`, `how.md` | modify | The controls partial and the rule that components position primitives but never paint them; the icon set; `core` now imports `shared/components/icon` |
| `docs/architecture/web/core/how.md`, `what.md` | modify | Sidebar New project focus |
| `docs/architecture/web/projects/how.md`, `what.md` | modify | Timeline expanded state; registry icons; the More danger zone |
| `docs/architecture/web/dashboard/what.md` | modify | Widget icons |
| `docs/architecture/web/tasks/how.md`, `what.md` | modify | The task-row checkbox and delete tool; the drawer's Close |
| `docs/architecture/web/prototype-tooling/how.md`, `what.md` | modify | The Lab Controls panel; the shared badges |
| `docs/architecture/testing/how.md`, `what.md` | modify | The control census and sheet profiles |
| `docs/roadmap/active/70-ui-ux-overhaul.md` | modify | A pointer to slice 72 under the handoff, and a line recording that TH06 stays with slice 3 except W1-004 and W3-007, which close here |
| `.prototype/notes.json` | modify | Friction from real use only. Note-005's answer is recorded by the other session, not here |

## Implementation sequence (next stage: A and C)

Written 2026-10-14 from the code, after the answers were recorded, and reviewed once (see
Revisions). It orders the work up to the checkpoint, and the part C work that runs while the
checkpoint waits. Each step ends at a green commit that names slice 72 and its §N. **The docs
named in a step's row land in that step's commit** (AGENTS.md §2). Part B is outlined at the end,
and is sequenced in detail only after the checkpoint answer. Stage 0 is the first implementation
work, so it also waits for the user's go-ahead.

**Four facts from the code fix the order.**

- The "before" capture must see today's product *and* today's Lab. Part A rewrites the Lab's
  Buttons and Inputs panels, and part C changes accessible names and one visible label. So the
  harness commit and the "before" run come first, before any A or C commit. Stage 0 changes no
  product file; `CURRENT_SLICE` shows the same in both runs.
- The capture serves `apps/web/dist/web/browser` statically on 4201 (`ux-capture.config.ts`).
  Every capture run is therefore preceded by `pnpm --filter web build` at the same commit, and
  that build's initial total is recorded. It is the baseline for acceptance 12.
- `build-sheet.mjs` reads `depth-verification.json` from `verificationDir` and from `beforeDir`
  (for the tokens behind the composite-contrast model), and pairs its fallbacks by `theme` and
  `mode` only. So `primitives-verification.json` is **a separate file, not the same shape**: a
  `forcedColors` list keyed by `surface` (`kitchen`, `settings`) and `theme`. Profile 72 reads it
  from both directories in addition to `depth-verification.json`, and pairs by surface and
  theme. The file lands **with the harness commit**, so every forced-colours capture has a
  before side.
- The census exceptions can only be listed after the "before" capture is read. So they are a
  second small commit after the run, not part of the harness commit.

### Stage 0 — harness and baseline

| Step | Red first | Then | Docs | Commit |
|---|---|---|---|---|
| 0.1 | First export a `collectControls` stub from `layout.mjs` returning `[]`, so the test file loads. Then `harness.test.mjs`: on a JSDOM page with stubbed `getBoundingClientRect` (as the existing test does), `collectControls` returns tag, type, role, class, border and `scope` (`prototype` inside `app-dev-panel` and on `/prototype/`, `prose` inside `.markdown-renderer`, otherwise `product`); a checkbox inside a `<label>` and one with a `for` label each report the larger box. It fails on the assertions. Run with `node --test apps/e2e/ux/harness.test.mjs`, which `pnpm test` does not run | Move the inline collector out of `capture.ts:108` into `collectControls`; widen it to textarea and `[role=button]`; enable axe `target-size` at `capture.ts:88`; create `primitives-verification.ts` (theme lock copied from `capture.ts`, `forcedColors: 'active'`, writes `primitives-verification.json` as above) and add it to `ux-capture.config.ts`'s `testMatch`; set `CURRENT_SLICE = 72` | `testing/how.md`, `what.md`: the census fields, `target-size`, the forced-colours file | Slice 72 harness: control census and forced colours (§69) |
| 0.2 | — | `pnpm --filter web build` (record the initial total), then `pnpm --filter @cwm/e2e ux:capture` at 0.1's commit. Record the commit and output directory here. Re-run the acceptance 7 grep and paste its output as the baseline (77 lines in 26 files at planning). Read the census and write the **pre-listed exceptions** under Capture scope, each with an owner | This plan | Slice 72: before capture, selector baseline, census exceptions (§69) |

Ports 4201 (web) and 4321 (host) only; kill the web and host children if a run is stopped.

**Stage 0 record (2026-10-14).**

- **Harness.** Committed as `d9ea46b`.
- **Build.** `pnpm --filter web build` at `d9ea46b` gave an initial total of **1030.09 kB**
  (styles 8.78 kB). That is the acceptance 12 baseline: 19.91 kB under the 1050 kB ceiling.
- **"Before" capture.** `UX_PRIMITIVES=1 pnpm --filter @cwm/e2e ux:capture` at `d9ea46b`, into
  `apps/e2e/ux-output/d9ea46b36273160b1dc0f4eea7c0b2f32031a6bc/`. All 182 cells were captured and
  the core-task baseline passed. The four forced-colours captures are in
  `primitives-verification.json`. The Depth run skipped, because it needs `UX_DEPTH=1`. **The
  after run sets both flags,** because profile 72 reads the composite tokens from the after
  side's `depth-verification.json`.
- **Selector baseline (acceptance 7).** The grep returned 77 lines in 26 files, as at planning.
  The output is committed as [slice-72-selector-baseline.txt](../70-ui-ux/slice-72-selector-baseline.txt).
- **Census.**
  - 7,874 controls, 7,098 of them `product` scope, with 154 distinct product target violations.
    The exceptions are listed under Capture scope.
  - axe `target-size` ran (for example, 78 passing nodes on `busy-week-project-dark-1440`) and
    reported **0 violations**. Its spacing exception passes small controls that are far enough
    apart, so the census, not axe, is the strict size gate.
- **Before axe counts, all cells.**
  - `select-name`: 68 nodes in 62 cells.
  - `aria-progressbar-name`: 56 nodes in 56 cells.
  - `button-name`: 0.
  - `color-contrast`: 142 nodes in 28 cells.

**Stage A record (2026-10-14).**

- **Bundle.** With the primitives in place and nothing adopted, the initial total is
  **1047.37 kB**, 2.63 kB under the ceiling.
  - Styles went from 8.78 to 19.35 kB: about 8 kB of control classes and 2.5 kB of tokens.
  - Main grew 5 kB, for the 23 new icon marks.
  - Part B must delete more eager control paint than it adds markup. The bundle is measured
    after each adoption group, not only at the end. If a group pushes the total over, the
    deletions in that group are the first place to look.
- **Two mixin partials.** `_control-states.scss` also holds the focus ring, which `_base.scss`
  now includes. That gives the Lab's forced focus specimen the same source as the real ring.
- **The token lint does not scan inline templates in `.ts` files.** The stories' layout `style`
  attributes were written with tokens anyway. The hole is recorded here and was not widened.

### Stage A — the primitives (no product file changes)

| Step | Red first | Then | Docs |
|---|---|---|---|
| A1 | The token lint is the test. Run `pnpm --filter web lint` with a deliberate literal in a draft `_controls.scss`, and watch it fail at that line. (`check-design-tokens.mjs` exempts only `_tokens.scss` and `_breakpoints.scss`) | Control tokens in `_tokens.scss` (acceptance 1), defined once and themed per theme only where a base colour differs. A no-output partial `styles/_control-states.scss` holds one `@mixin` per forced state (hover, pressed), so the Lab can show them without a Lab-only selector. Then `_controls.scss` (acceptance 2), whose `:hover` and `:active` rules include those mixins, and its `@use` in `styles.scss`. Build, and compare the initial total with 0.2's: an early number shows how much B's deletions must pay back | `web/overview.md`, `how.md`, `what.md`: the controls partial and the "position, never paint" rule |
| A2 | First commit an exported `ICON_NAMES` list with today's nine names and an `icon.spec` that iterates it (green). Then add the new names to the list and the type: the spec fails, because `@switch` renders nothing for them | The marks in acceptance 3, drawn on the existing 24-unit grid with the existing stroke style. **Delegable:** the SVG paths are mechanical. The brief is the list, the grid, the stroke rules and "monochrome, `currentColor`, no fills except dots" | `web/what.md`: the icon set |
| A3 | `design-lab-page.spec` (§77): the Buttons and Inputs badges read "shared" and render `.button` and `.field`; cards, menus and states still read "not yet" | Rewrite those two panels in `primitive-panels.html`. Create `panels/control-panels.ts/.html/.scss`, the Controls panel. Its forced-state specimen classes include the A1 mixins, so they cannot drift from the real rules | `web/prototype-tooling/how.md`, `what.md` |
| A4 | — (stories are not appearance tests) | `shared/controls/controls.stories.ts`, one story per family. `pnpm --filter web storybook:build` | — |
| A5 | — | `pnpm test`, then `pnpm lint`, then the full `pnpm e2e`. A is the only part with no product change, so an e2e failure here points at a global style leak. Commit. Build, then capture the Lab Controls panel at 1440 dark and light and at 375 touch light. Show it to the user with question 4 (removal marks). **Stop for the answer before B** | — |

A1–A4 may be one commit each.

### Stage C — names and focus (may run while the checkpoint waits)

Each row is test red → implement → green → commit, with its docs. C starts after A5, so
`.control-label` and `ICON_NAMES` exist. No C step depends on the removal-marks answer. The rows
touch files part B will touch again, which is fine: one session, in order.

| Step | Red test | Implementation | Docs |
|---|---|---|---|
| C1 | `sidebar.spec`: opening New project focuses `#new-project-name`; the label uses `.control-label`, not `.create-project__label`, and reads "Project name" | Focus after the form renders (`afterNextRender` or a `viewChild` effect, matching the nearest existing idiom); swap the label class | `web/core/how.md`, `what.md` |
| C2 | `timeline-section.spec` (§77: replaces the `li` assertion at line 85): the button has `aria-expanded` false→true and `aria-controls` = the details id; the `li` has none. Two instances on one page have distinct ids | Move `aria-expanded` and the `(click)` from the `li` to the button (`timeline-section.html:2`); a per-instance id prefix | `web/projects/how.md`, `what.md` |
| C3 | `progress-section.spec` (three cases in the test plan), `shortcut-frame.spec` (two owners) | `section-frame-name.ts`, the providers on both frames, and the bar's name and `aria-describedby` | `web/projects/how.md` |
| C4 | `reflection-composer.spec`, `reflections-page.spec`: "Prompt" and "Subject" | Visible `.control-label`s | `web/projects/what.md` |
| C5 | `shortcut-picker.spec`, `agent-connections-page.spec` | Source-named Add; agent-named Revoke; fieldset and legend. The §77 locators move with it: `tasks.ts:83` (`{name:'Add',exact:true}`), `shortcut-picker.stories.ts:141`, and any other hit of `rg "'(Add|Revoke)'" apps` | `web/projects/what.md` and the settings docs |
| C6 | Registry specs and `project-page-navigation.spec:164` (§77 `textContent`) | `icon: IconName` in the four registries, with `<app-icon>` at their render sites | `web/projects/what.md`, `web/dashboard/what.md` |
| C7 | `apps/e2e/primitives.spec.ts`: focus at 375 and a label box taller than 1 px (both red) | Already green from C1. The checkbox Space test and the drawer Close name tests are **guards**: native behaviour that passes at once, which is expected. They protect part B | `testing/what.md` if it lists specs |

C6 changes product appearance (emoji to SVG) before B and before the user has seen the icon style
at the checkpoint. That is accepted: it is after the "before" capture, and the pairs show it.

**Also during the wait:** `build-sheet.mjs --profile 71|72` and its test cases (test plan row),
built on `7c6d53d`. Profile 72 reads `primitives-verification.json` from both directories and
pairs forced-colours captures by surface and theme. Profile 71's existing regressions must stay
green. Run with `node --test docs/roadmap/70-ui-ux/tooling/build-sheet.test.mjs`, which `pnpm test`
does not run.

### Part B — outline only

B goes surface group by surface group. Each group is adopted, then its component control rules
are deleted, then `pnpm test`, then the group's e2e specs:

1. shell (sidebar, app shell, top bar);
2. project chrome (header, history, More, navigation, workspace shell, canvas, recovery notice);
3. dialogs (section create, work create, shortcut picker);
4. sections and frames (frame, shortcut frame, insertion mark, Markdown, tasks and the task row,
   Progress, Reflections, Timeline, activity);
5. pages (Todos, Archive, archived region, Reflections page, the task drawer);
6. settings (agents, archived projects, Appearance).

Then acceptance 7's two checks and the class-paint review pass; the after capture; the bundle
check; the sheet; the reviews (AGENTS step 4); real use; and Gate 2. Groups 4 and 5 are the
candidates for parallel subagents, because their files do not overlap, once group 1 has set the
idiom. They get a brief with the primitive classes, the specificity rule and the exceptions.

## Test plan — tests first

**Behaviour (part C).** Each test is written red first.

| Test | Proves |
|---|---|
| `sidebar.spec`: opening New project focuses the name field | W2-001, W4-002 |
| `sidebar.spec`: the label element no longer carries the hiding `.create-project__label` rule; it uses the shared `.control-label`, and reads "Project name" | W1-003, at unit level; the visible box is proved in e2e |
| `timeline-section.spec`: the row button has `aria-expanded`, false then true, and `aria-controls` points at the rendered details id; the `li` has no `aria-expanded` | L5-005 (§77: replaces any `li` assertion) |
| `progress-section.spec`: `role=progressbar` is named "{title} progress" and described by its own summary | L5-004, W1-022 |
| `reflection-composer.spec`: the prompt select is labelled "Prompt" | L5-003 |
| `reflections-page.spec`: the subject picker is labelled "Subject" | L5-003 |
| `shortcut-picker.spec`: two sources with the same type have distinct Add names, using `shortcutNameOf` | W3-017 |
| agent connections spec: Revoke names the agent; each agent's checkboxes sit in a fieldset whose legend is the agent name | W3-017 |
| `project-page-navigation.spec`: page link text is `Home · Todos · Archive · Reflections`, each with an `app-icon` | L2-013, W1-012 (§77: line 164 reads `textContent`, which included the emoji) |
| `icon.spec`: every `IconName` renders a non-empty, `aria-hidden` SVG | The registries cannot name a missing mark |
| registry specs (page, section, widget): every `icon` is an `IconName` | Typed, so it fails at compile time; the spec guards the runtime lists |
| `design-lab-page.spec`: the Buttons and Inputs badges read "shared" and render `.button` and `.field`; cards, menus and states still read "not yet" | §77: replaces "labels each primitive panel as not yet a shared component" |
| `apps/e2e/ux/harness.test.mjs`: a control record has tag, type, role and class | Acceptance 9 can see control kinds |
| `build-sheet.test.mjs`: profile 72 flags a 23 px button at 1440, a 40 px button at 375 touch, a third button height and an unlisted exception; it passes a listed one. It reports, without failing, an intended control rename (Add, glyph to SVG), and it ignores `prototype` and `prose` scope. Profile 71 keeps its existing regressions | The census gate cannot pass falsely |
| e2e `primitives.spec.ts`: at 375 touch, tapping New project leaves focus in the field, and the "Project name" label has a box taller than 1 px | W2-001, W1-003 in a real browser |
| e2e `primitives.spec.ts`: Tab reaches a task checkbox, Space completes the task, and the checkbox still reports checked | The restyled native checkbox keeps its behaviour |
| e2e `primitives.spec.ts`: the shell drawer Close and the task drawer's "Close task details" keep their names after becoming icon buttons | No name is lost in the icon conversions |
| `progress-section.spec`: given `SECTION_FRAME_NAME`, the bar is named from it. Without the token, it falls back to `nameOf(section())`. The name never contains "Rename" | L5-004 |
| `shortcut-frame.spec`: two untitled Progress shortcuts from different owners give their bars distinct names (`shortcutNameOf`) | L5-004's case of several bars on one canvas |
| `timeline-section.spec` and `progress-section.spec`: two instances of the same source on one page (a section and its shortcut) have distinct `aria-controls` and `aria-describedby` targets | No duplicate ids |

**Not unit-tested, on purpose.** Appearance is judged by the capture and its census (protocol
§7.2), not by snapshots: the primitive look, the action hierarchy, the target sizes and forced
colours. These are proven by acceptance 7–11.

## Boundaries touched

- **No literals in components.** New values live in `_tokens.scss`. `_controls.scss` is a styles
  partial that uses `var()` only, and the token lint scans it. The select chevron is drawn with
  `currentColor` gradients and the checkbox mark with token-sized borders, never with data URIs.
- **Components depend on gateway interfaces only.** Primitives are CSS classes and one existing
  presentational component (`Icon`), so no service or adapter is involved.
- **`core/` never imports `prototype/`.** `core` gains its first import from
  `shared/components/icon`, which imports nothing from `core`, `features` or `prototype`.
- **Contracts defined once.** `Project.icon` stays a string in the contract, and seeds are
  untouched. `IconName` is a web view type, not a parallel contract type.
- **No `if (prototypeMode)`.** **No contract, domain, host or persistence change.**
- **Bundle ceiling.** It is measured (acceptance 12). The initial budget is 21 kB under the
  ceiling, so the global CSS must be paid for by deleted component rules.

## Explicit non-goals

- Menus, dialogs as lifts, the drawer, toasts and focus return (slice 3).
- Section-chrome emphasis, insertion and resize geometry (slice 5).
- Row shape, the Todos checkbox position, Timeline navigation, and empty, loading and error states
  (slice 6).
- Navigation structure and the group-heading styles that keep L2-016 open (slice 7).
- Copy changes beyond accessible names: "Restore saved content" stays (slice 9).
- A custom listbox or date picker. Native `select` and `input[type=date]` stay, styled.
- Angular button or field components (see open question 2).
- The dev panel's controls (TH12).
- Snapshot tests of appearance.

## Open questions

**All answered (2026-10-14).** The user chose the default for questions 2, 3 and 4. The user
has not yet said to start implementing, so part A waits for that word.

1. **Muted text colour (note `note-2026-10-14-005`). Answered 2026-10-14: option A.** The user
   keeps the colour. The sheet's composite model is corrected to use what really sits behind the
   panes. That work lands outside this slice: the session that started this plan is doing it in
   `build-sheet.mjs`, its test, `depth-verification.ts`, the Depth decision and the note.
   Option D (label weight, size and tracking) was not chosen. This slice therefore adds no label
   type tokens. `.control-label` uses the existing type tokens, and its weight and size follow
   only what TH04 and TH05 ask for: a visible label on each field.

   **Precondition.** Part B's sheet work, `build-sheet.mjs --profile 72` and its tests, starts only
   after the option-A commit has landed. It is built and tested on top of that commit, so the two
   sessions never edit `build-sheet.mjs` at the same time. **Met:** option A landed in `7c6d53d`.
   `build-sheet.mjs` now takes a real-backing composite and an optional fourth `verificationDir`
   argument, and its test has 10 cases. The decision and notes landed in `f71be24`. Profile 72 is
   built on those.
2. **How primitives are built. Answered: global classes** ([decision](../../decisions/2026-10-control-primitives-are-global-classes.md)). The default was **global classes in `_controls.scss` over native
   elements**, applied in templates (`<button class="button button--primary">`). Why:
   - no JavaScript;
   - every native behaviour that the e2e suite relies on stays intact;
   - it works in Storybook, which already loads `styles.scss`;
   - it is cheap to throw away (§77).

   The alternative is attribute components (`button[appButton]` with a typed `variant`, as Angular
   Material does). They give compile-time variant checks but add JS to every chunk and a second
   surface to maintain.
3. **App-owned icons. Answered: one monochrome SVG set** ([decision](../../decisions/2026-10-app-icons-are-one-svg-set.md)). The default was to replace the registry emoji (page kinds, section types,
   widgets, activity actors) and the text glyphs with one monochrome SVG set in `Icon`, and keep
   user-chosen project and workstream emoji as content. This is what closes L2-013, W1-012 and
   W4-009. The alternative is to keep the emoji and fix only the three collisions. It leaves
   L2-013 open and keeps platform-dependent colour emoji in chrome.
4. **The three removal marks** (W1-038, W4-032). **Answered: keep the defaults and review them at
   the checkpoint.** The defaults:
   - section remove is a danger tool with a "remove section" mark (a frame with a cross);
   - task delete is a quiet trash tool;
   - shortcut remove is a neutral "unlink" tool.

   The user sees them at the checkpoint and can swap them before adoption.

## Revisions

- **Round 1 (2026-10-14):** A fresh reviewer returned 19 findings (9 substantive). Each
  substantive one was checked against the code, and all held.
  - **Adoption check.** The grep used `\s`, which ERE reads as a literal, so it saw 16 of 77
    lines. It now uses `[[:space:]]`, and the before-adoption baseline is recorded. A class-paint
    review pass was added, because encapsulated component rules (0,1,1 and 0,2,0) beat a global
    `.button`.
  - **§77 edits.** The rig's core-task script (`tasks.ts:83`) and a story play function both
    locate `Add` by its exact name. They join the change list as §77 edits, and "Project name"
    stays the visible label because `tasks.ts` uses it.
  - **Rig.** axe 4.13 ships `target-size` disabled, so the harness commit enables it before the
    "before" run. The census collector moves into `layout.mjs`, where it is testable. It gains
    textarea, `[role=button]`, a scope field, and label boxes for checkboxes.
  - **Progress bar.** Labelling it by the frame heading would read "Rename …", and would point at
    the wrong frame from inside a shortcut. The bar is now named from its own `section()`.
  - **Scope.** TH06's W1-004 and W3-007 are the same defect as W2-001, so they close here.
  - **More panel.** It would have had three primaries. It is now a named exception: its inline
    edits are secondary, and "Archive it" is danger.
  - **Visual pairs.** They now use the matrix's real cell ids. Forced colours gets a producer.
  - **Fallback emoji.** They are excluded as content stand-ins, and listed.
  - **Minor.**
    - Acceptance 16 dropped: the page marks were already `aria-hidden`.
    - The sidebar label test is fixed, and icon conversions keep their accessible names.
    - Danger is never filled at rest.
    - The select chevron uses gradients, not `::after`.
    - The check and chevron dimensions become tokens.
    - Control heights follow the density knob.
    - Profile 72 reports intended renames.
    - The expanded-row state is styled, and L5-001 has an axe check.
    - Missing files are added: the tasks docs, `primitives.spec.ts` and `design-lab-page.ts`.
- **Muted text answered (2026-10-14).** The user chose note-005's option A. That fix is made
  outside this slice. D is dropped, so open question 1 is recorded as answered, and the
  checkpoint now asks only about the removal marks.
- **Round 2 (2026-10-14):** The same reviewer confirmed round 1 resolved, except item 5 (in part)
  and item 7, and found three new substantive problems. All were verified.
  - **Progress bar name.** An untitled bar read "Progress progress", and untitled shortcuts from
    different owners collided. Each frame now provides its displayed name (`nameOf` or
    `shortcutNameOf`) through a `SECTION_FRAME_NAME` injection token, not an outlet input, which
    `setInput` would reject on other content components. A two-owner test was added.
  - **L2-006** names the More panel's Rename, Save and Set. Leaving them secondary means it is
    advanced, not closed (now 33 closed and 4 advanced). The stale change-list row was fixed.
  - **Forced colours.** The new verification file would never run: it is outside `testMatch`,
    and `playwright.config.ts` ignores `ux/`. `ux-capture.config.ts` joins the change list.
  - **Minor.**
    - ARIA references use per-instance ids, tested with a section and its shortcut on one page.
    - The Boundaries wording now matches the gradient chevron.
    - The W2-005 and W2-012 pairs name cells that show their controls, and the removal pair names
      a cell with shortcuts.
    - The fallback-emoji exclusion is recorded in the icon decision.
- **Round 3 (2026-10-14):** The same reviewer confirmed all round-2 items resolved. It verified
  against the templates that `NgComponentOutlet` content inherits each frame's providers. One new
  substantive problem was verified: `depth-verification.ts` exports nothing, and importing it would
  re-register its test. The new verification file now carries its own theme lock, copied from the
  `capture.ts` pattern.
  - **Minor.**
    - The `build-sheet.mjs` work waits for the option-A commit.
    - The frames provide the token from their existing `name` signal.
- **Round 4 (2026-10-14):** No substantive findings. The reviewer confirmed the round-3 fixes
  against the code: both frames' `name` signals are public computeds, and the outlets use no
  custom injector. A last pass found the counts, the numbering, the §77 edit targets and the
  boundaries consistent.
- **Answers recorded (2026-10-14).** The user chose the defaults for questions 2–4. Questions 2
  and 3 became decision entries, indexed and linked from `web/why.md`. Question 4 is reviewed at the
  checkpoint. Option A's commits (`7c6d53d`, `f71be24`) meet part B's precondition.
- **Implementation sequence, round 5 (2026-10-14):** The sequence for Stage 0, A and C was
  written from the code and reviewed by a fresh reviewer. Its nine findings (three substantive)
  were each checked against the code, and all held.
  - **Build before capture.** The capture serves the static `dist`, so each run is now preceded
    by a web build, whose size is the acceptance 12 baseline.
  - **Docs in the same commit.** Each step now names its docs (AGENTS.md §2).
  - **Forced-colours pairing.** The sheet pairs fallbacks by theme and mode only, and needs
    `depth-verification.json`'s tokens. So `primitives-verification.json` is a separate file
    keyed by surface and theme, read from both directories.
  - **Minor.**
    - The host port is 4321, not 4311.
    - The 0.1 and A2 red tests now fail on assertions, not imports.
    - The `node --test` commands outside `pnpm test` are named.
    - The C7 checkbox test is a guard.
    - The Lab's forced states share mixins with the real rules (`_control-states.scss`).
    - The §77 locator grep matches `{name:'Add'}`.
    - Stage 0 also waits for the go-ahead.
