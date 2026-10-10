<!-- plan id="69" status="active" summary="A shortcut to an untitled section is named with its source's owner on its frame and in history labels, so it cannot be mistaken for a local section" -->
# Slice 69 — Distinguishable names for untitled shortcut sources

## Goal

A shortcut whose source section has no title can be told apart from the canvas's own sections. This
applies on its frame, in its control labels and in the header's Undo/Redo labels.

**Source.** Friction note `note-2026-10-03-001` (Slice 65 real use).
- Kitchen's Work canvas took a shortcut to Garden's untitled brief.
- Its frame and the header label (`Undo: Added the Markdown shortcut`) both said only "Markdown".
- It sat directly under Kitchen's own untitled "Markdown" brief, and only the small breadcrumb line
  told them apart.
- Untitled sections are the default, and Work canvases now take shortcuts, so this collision will
  be common.

## Spec sections

- **§27:** shortcuts are read-only references that identify where they came from.
- **§31:** a section has a derived name ([decision](../../decisions/2026-09-a-section-has-a-name.md)),
  and the frame's title.
- **§32:** the frame's revealed controls (Move, Collapse, resize, Remove) and their accessible names.
- **§26:** header Undo/Redo labels name what changed (the Slice 55 label paragraph).
- **§54:** MCP receipts and `get_operation_history` carry those labels.
- **§57:** the Activity summary of an added shortcut.
- **§77, §79:** real use and friction.

*Corrected at start:* the candidate cited §20 for accessible names and §57 for history labels.
§20 is "Do Not Create One Global Mega-Store"; accessible frame controls are §31/§32, and history
labels are §26 and §54. §57 is Activity, which this slice does touch (one summary line).

## Build

- **One naming rule, shared by every surface.** A shortcut's display name is the source's `nameOf`
  when the source has a title override. When it does not, the name also says whose section it is:
  `Markdown (Garden)`. The form is settled with a §78 decision.
  - *Corrected at start:* the candidate said "owned by the domain". The web app depends only on
    `@cwm/contracts` and cannot import the domain. `nameOf` itself lives in contracts for exactly
    this reason ("for every surface that has to say one"), so the new rule sits beside it.
  - The owner name already travels: `ResolvedSectionShortcut.sourceProjectName`. **No contract
    shape changes.**
- **Frame.** The title and the Move/Collapse/Remove accessible names use the new name. The
  breadcrumb line stays. The canvas's resize-handle names, insertion-point labels and move
  announcement for a shortcut placement use it too.
- **Labels.** New history labels and the new Activity summary use the new name. Stored labels and
  summaries are historical and are not rewritten.
- **Tests.** Contracts, domain label/service, web frame and canvas, e2e and MCP acceptance (below).

## Done when

- **On a `nested-projects` copy, Kitchen's Work canvas** holds its own untitled Markdown brief
  above a shortcut to Garden's untitled brief.
  - The two frames show different names (`Markdown`, `Markdown (Garden)`), and so do the shortcut's
    control labels.
  - The header reads `Undo: Added the Markdown (Garden) shortcut`.
  - A titled source still shows just its title.
- **MCP.** An agent's `add_section_shortcut` receipt label uses the same rule.
- **Gates.** `pnpm test`, `pnpm lint` and the affected e2e pass, and real use is recorded.

## Do not

- Rename stored sections, add titles automatically, or rewrite stored history labels or Activity
  summaries.
- Change local section naming. Only shortcuts gain the owner qualifier.
- Make shortcut titles editable, or add a per-shortcut name override (the Slice 59 non-goal
  "editable shortcut content").

<!-- ───────────── Written when the slice starts ───────────── -->

## Design

**Where shortcut names come from today.**

| Surface | Code | Today |
|---|---|---|
| Frame title, Move/Collapse/Remove aria | `ShortcutFrame.sourceName` (`shortcut-frame.ts:36`) | `nameOf(shortcut.source)` |
| Resize handles, insertion labels, move announcement | `ProjectCanvas.placementName` (`project-canvas.ts:211`) | `nameOf(placement.shortcut.source)` |
| History label on create | `SectionShortcutService.create` (`section-shortcut-service.ts:184`) | `shortcutWriteLabel(…, nameOf(source))` |
| History label on update/move/remove | `sourceNameOf` (`:330`) → `shortcutWriteLabel` | `nameOf(source)` or `null` |
| Activity summary on create | `:178` | `` `Added a shortcut to ${nameOf(source)}` `` |

Update, move and remove Activity summaries name no section (`Updated a shortcut`, …) and stay so.

**The rule.** A new pure function in `packages/contracts/src/section-shortcut.ts`:

```ts
export const shortcutNameOf = (
  source: Pick<ProjectSection, 'type' | 'title'>,
  ownerName: string | null,
): string
```

- A source with a title override (`normaliseSectionTitle(source.title) !== undefined`) → `nameOf(source)`,
  the title alone. A person who named it chose the name.
- An untitled source with a known owner → `` `${nameOf(source)} (${ownerName})` ``, e.g.
  `Markdown (Garden)`, `Task List (Kitchen)`.
- An untitled source whose owner is unknown (`null`, or blank after trim) → `nameOf(source)`. This
  is defensive; integrity keeps the owner present.
- The owner is the source's **owning project**, by `name`, whatever page of it the source sits on.
  A Home shortcut to the root's own Reflections-page section is `Reflections (Home renovation)`.
  That still tells it apart from Kitchen's `Reflections (Kitchen)` beside it on the seeded Home,
  which today both read `Reflections`.

**Why this form** (recorded in the decision):
- *`Garden's Markdown`* — rejected: possessives misbehave for names ending in *s* (`Cabinets's`
  or `Cabinets'`), and the rule would need English grammar.
- *`Markdown · Garden`* — rejected: reads badly inside a label (`Added the Markdown · Garden
  shortcut`), and a screen reader may skip the dot.
- *`Markdown from Garden`* — rejected: Slice 68's refusal already uses `"Markdown" from "Garden"`
  as prose about a placement; as a name it reads as a sentence fragment in labels.
- *Qualify every shortcut, titled ones too* — rejected: the friction is about undistinguished
  defaults, and the candidate keeps titled names unchanged.
- *Qualify only on an actual collision on the same canvas* — rejected: the name would change when
  an unrelated section is added or renamed, the stored label would depend on canvas state, and
  the domain would need to read the destination page to label a write.
- *Parenthesised owner* — chosen. It works in a heading, an aria label and inside
  `Added the … shortcut` without grammar.

**Renaming the owner.** The name is read, never stored, on the frame: it follows the owner's
current name, like the breadcrumb, on the next resolved read. Labels and the Activity summary are
computed at write time and frozen, and `shortcutNameFor` re-reads the owner on each update, move
and remove. So after Garden is renamed `Veg garden`, one placement's history can hold both
`… the Markdown (Garden) shortcut` and `… the Markdown (Veg garden) shortcut`. This is accepted and
recorded in the decision's consequences: stored labels are historical (Slice 55's rule), and each
label was true when written.

**Domain.**
- `shortcutWriteLabel` keeps its signature (`name: string | null`); only its doc comment and the
  parameter name change (`sourceName` → `shortcutName`). The `a shortcut` fallback for `null` stays.
- `create` already holds `byProject`. It computes
  `const name = shortcutNameOf(source, byProject.get(source.projectId)?.name ?? null)` once and
  uses it for both the Activity summary and the label.
- `sourceNameOf` (`:330`) becomes `shortcutNameFor(placement)`: a plain `sections.find` (unchanged:
  it must never refuse) then a plain `projects.find(source.projectId)`, returning
  `shortcutNameOf(source, project?.name ?? null)`, or `null` when the source is missing.
  `projects` is already a dependency of the service; no new edge.

**Web.**
- `ShortcutFrame.sourceName` is renamed `name` and computes
  `shortcutNameOf(shortcut.source, shortcut.sourceProjectName)`. The template's four uses follow.
- `ProjectCanvas.placementName`'s shortcut branch uses the same call. Section placements keep
  `nameOf`.

## Acceptance check

1. **Contracts** (`pnpm --filter @cwm/contracts test`): `shortcutNameOf` cases pass (test plan 1).
2. **Domain** (`pnpm --filter @cwm/domain test`):
   - On the existing `setupNestedSource` fixture (an untitled Task List in a workstream named
     `Kitchen`), every placement write's label reads `… the Task List (Kitchen) shortcut`, and
     the add's Activity summary reads `Added a shortcut to Task List (Kitchen)`.
   - A titled source (`title: 'Prep'`) gives `Added the Prep shortcut`.
   - The archived-source and hidden-source removals still label with the qualified name.
3. **Web unit** (`pnpm --filter web test`): the frame and canvas specs (test plan 4–5).
4. **E2E** (`pnpm --filter @cwm/e2e e2e canvas-editing.spec.ts project-history.spec.ts`), on `nested-projects`:
   - Kitchen's Work canvas: Kitchen's own brief's `[data-section-title-edit]` has aria label
     `Rename Markdown`; the Garden shortcut's `[data-shortcut-frame]` has accessible name exactly
     `Markdown (Garden)` (`toHaveAccessibleName`: the frame is `aria-labelledby` its `h2`, whose
     `↗` glyph is `aria-hidden`, so a plain `toHaveText` would not match); its Remove aria label
     is `Remove shortcut to Markdown (Garden)` and its Collapse aria label is
     `Collapse Markdown (Garden)`.
   - The header reads `Undo: Added the Markdown (Garden) shortcut`, and the later resize, move,
     collapse and remove labels carry the same name.
   - The root Home journey's Progress shortcut reads `Progress (Kitchen)` in its labels.
   - The existing titled `Canonical source` shortcut's Remove aria label is unchanged.
   - On Home renovation's Home (`canvas-editing.spec.ts:375`, which already counts its four
     seeded shortcut frames), two `[data-shortcut-frame]`s have the accessible names
     `Reflections (Kitchen)` and `Reflections (Home renovation)`: the same-project case, named apart.
5. **MCP, both transports** (`pnpm --filter @cwm/prototype-host mcp-acceptance`):
   - The existing titled `Prep` receipt labels are unchanged (`Added the Prep shortcut`).
   - The untitled case reuses the Slice 65 `onWork` add (`:449-452`), which already places
     `section-project-work-manager-brief`, an untitled Markdown section owned by `Work Manager`.
     Its receipt label is `Added the Markdown (Work Manager) shortcut`, and `childHistory.undo.label`
     (read at `:459`) is the same. No new source is added, so the Home block's placement count and
     history-cursor order (`:406-436`) are untouched.
6. **Storybook** (`pnpm storybook:build`, and the `ShortcutFrame` story's Interactions run in
   `pnpm storybook`): the play function finds `Remove shortcut to Markdown (Website launch)`.
   `pnpm test` does not run play functions, so this is checked by hand and recorded.
7. **Live run** (§77): `pnpm dev:host` + `pnpm dev:web` on a scratch `nested-projects` copy.
   - On Kitchen's Work canvas, add a shortcut to Garden's brief below Kitchen's brief, and see
     `Markdown` and `Markdown (Garden)` and the header label.
   - On Home renovation's Home, see the seeded `Reflections (Kitchen)` and
     `Reflections (Home renovation)` shortcuts named apart.
   - Over HTTP MCP, add a shortcut to an untitled section and read the receipt label.
   - Record the run as the resolution of `note-2026-10-03-001` in `.prototype/notes.json`, plus a
     new note for any friction found.

## File-level change list

**Code**
- `packages/contracts/src/section-shortcut.ts` — add `shortcutNameOf` with its doc comment.
- `packages/contracts/src/section-shortcut.test.ts` — `shortcutNameOf` cases.
- `packages/domain/src/section-shortcut-service.ts` — `create` uses one computed name for the
  Activity summary and the label; `sourceNameOf` → `shortcutNameFor` reading the owner.
- `packages/domain/src/shortcut-history.ts` — `shortcutWriteLabel` parameter rename and doc comment
  (names a shortcut, not a section). No logic change.
- `packages/domain/src/section-shortcut-service.test.ts` — updated label expectations; titled case;
  Activity summary assertion.
- `apps/web/src/app/features/projects/shortcuts/shortcut-frame.ts` / `.html` — `name` computed
  through `shortcutNameOf`.
- `apps/web/src/app/features/projects/shortcuts/shortcut-frame.spec.ts` — untitled and titled cases.
- `apps/web/src/app/features/projects/shortcuts/shortcut-frame.stories.ts` — the play function's
  `Remove shortcut to Markdown` (`:134`) becomes `Remove shortcut to Markdown (Website launch)`.
- `apps/web/src/app/features/projects/project-canvas.ts` — `placementName`'s shortcut branch.
- `apps/web/src/app/features/projects/project-canvas.spec.ts` — a shortcut placement's control
  labels use the qualified name.
- `apps/e2e/canvas-editing.spec.ts` — the Work-canvas journey's names and labels (`:199-272`), and
  the two Reflections frame titles on the seeded Home (`:375`).
- `apps/e2e/project-history.spec.ts` — the Progress shortcut labels (`:139-172`).
- `apps/prototype-host/scripts/mcp-acceptance.mjs` — two label checks on the existing `onWork` add
  (`:449-459`).
- `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` — `CURRENT_SLICE = 69`.

**Documentation**
- `docs/decisions/2026-10-untitled-shortcut-sources-name-their-owner.md` — new §78 entry: the
  rule, the options above, the same-project case, historical labels left as recorded, and the
  owner-rename consequence (frame follows; labels mix old and new names).
- `docs/decisions/README.md` — index the new entry under Contracts, where `shortcutNameOf` lives;
  mark the two amended entries.
- `docs/decisions/2026-09-a-section-has-a-name.md` — dated amendment: a shortcut uses
  `shortcutNameOf`, which qualifies an untitled source; `nameOf` is unchanged.
- `docs/decisions/2026-09-section-restore-and-shortcut-history.md` — dated amendment: labels name
  the shortcut by the new rule.
- `Canvas Work Manager — Prototype Product, Design & Development Specification.md` — a *Since Slice
  69* note in §27 "Shortcuts on Home", after "identifies where it came from", covering the frame,
  its control names, newly recorded history labels and the add's Activity summary. One clause at
  §54's example label (`"Collapsed the Tasks shortcut"`, ~:2922) says that an untitled source's
  shortcut is named with its owner (§27).
- `docs/architecture/contracts/how.md`, `what.md`, `overview.md` — `shortcutNameOf` beside `nameOf`;
  `why.md` links the decision.
- `docs/architecture/domain/how.md` — the `shortcutWriteLabel` row says it receives the shortcut's
  name; `why.md` links the decision.
- `docs/architecture/web/projects/how.md` — the frame and canvas name shortcuts through
  `shortcutNameOf`; `why.md` links the decision.
- `docs/guides/first-milestone-walkthrough.md` — step 15 (`:139-141`) says Kitchen's header offers
  **Undo: Added the Markdown shortcut**; it becomes `Markdown (Garden)`, and the step notes that the
  shortcut and Kitchen's own brief are now named apart.
- `docs/architecture/testing/what.md` — the acceptance row (`:81`) gains "Slice 69's untitled-source
  receipt label"; `testing/how.md`'s e2e journey notes (~`:249-254`) are checked for the frame-name
  assertion.
- `.prototype/notes.json` — resolve `note-2026-10-03-001`; any new friction note.
- `docs/roadmap/goals.md` — at close, mark Slice 69 done in "Now".
- This plan — Revisions and Outcome.

## Test plan — tests first

Each is written and seen to fail before the change it drives.

1. **`shortcutNameOf`** (contracts, new): titled source → title alone; untitled Markdown with owner
   `Garden` → `Markdown (Garden)`; whitespace-only title is untitled; `null` owner → `Markdown`;
   blank owner → `Markdown`. *Fails:* the function does not exist.
2. **Service labels, untitled** (domain, changed): the existing "labels each recorded placement
   write…" test expects `… the Task List (Kitchen) shortcut` for add, collapse, expand, resize,
   update, move and remove, and the Activity summaries include `Added a shortcut to Task List
   (Kitchen)`. *Fails:* labels read `Task List`.
3. **Service labels, titled and unavailable** (domain): a source added with `title: 'Prep'` labels
   `Added the Prep shortcut` (passes before and after — it pins the unchanged half and is said to
   be a guard, not a driver). The archived and hidden removal cases expect
   `Removed the Task List (Kitchen) shortcut`. *Fails* on the qualified name. The `null` fallback
   stays pinned by `shortcut-history.test.ts:304-305`.
4. **Frame** (web, changed): with the fixture's untitled Markdown source and `sourceProjectName:
   'Website launch'`, the `h2` text is `Markdown (Website launch)` and the Move, Collapse and Remove
   aria labels carry it. *Fails:* the frame shows `Markdown`. A titled source (`title: 'Launch
   brief'`) shows `Launch brief` everywhere — a guard that passes before and after.
5. **Canvas** (web, new case): the spec's `shortcut()` helper (`project-canvas.spec.ts:81-96`) is an
   untitled **task-list** owned by `Website launch`. With a section and one such placement, the
   shortcut's end resize handle is named with `Task List (Website launch)`, its insertion-point
   label reads `Insert before Task List (Website launch)`, and a keyboard move of the shortcut's grip
   announces `Moved Task List (Website launch) to position …` in `[data-canvas-live-region]`
   (following the section-move case at `:525-538`). *Fails:* the name is unqualified.
6. **E2E and MCP** (acceptance 4–5): the updated expectations fail against the old build; the new
   Kitchen-brief-vs-shortcut assertion is the friction note's exact scenario.

## Boundaries touched

- **Contracts defined once.** The rule is one function in `packages/contracts`, beside `nameOf`;
  no web or domain copy. The web imports it from `@cwm/contracts`, as it already does `nameOf`.
- **Components depend on gateway interfaces.** Unchanged: the frame and canvas only read the
  resolved shortcut they already receive.
- **Domain depends on repositories and `Clock` only.** `shortcutNameFor` reads `ProjectRepository`,
  already in `SectionShortcutService`'s dependencies; no new service edge.
- **MCP tools call domain services.** No MCP tool changes; the label arrives in the receipt.
- **No literal colors/spacing.** No style changes.

## Explicit non-goals

- The Add shortcut picker's option names (`ShortcutSource.name`) — the picker already groups by
  breadcrumb, and a name there is a choice, not a placement on the canvas.
- Conflict titles in `shortcut-history.ts` (`page-changed` names the **section**, not a shortcut).
- A new `name` field on `ResolvedSectionShortcut` or in `list_section_shortcuts` output — agents
  already receive `source.title` and `sourceProjectName`.
- Disambiguating two **titled** sections that share a title, or a shortcut whose title equals a local
  section's title — the person chose those names.
- A page qualifier for same-project sources (`Reflections (Reflections page)`) — the breadcrumb line
  shows the page; recorded as a revisit trigger in the decision.
- Rewriting stored labels or Activity summaries; any converter (prototype data is disposable, but
  history text is not schema).

## Open questions

- **The exact form.** Resolved by default as `Markdown (Garden)` and recorded in the decision; it is
  wording, not shape, so it does not block implementation. The user may overrule it at review.

## Revisions

**Execution review, 2026-10-09.** An independent reviewer rechecked the plan against the current
code and returned no substantive findings. Its optional strengthening was taken: a domain guard
renames the source's owning project, verifies the next write uses its current name, and verifies
the stored add label and Activity summary retain the original name. This extends test-plan item 3
without changing the file list or naming rule.

**Implementation green point.** Contract cases failed because the helper did not exist; domain
labels, unavailable-source removal and owner rename failed on unqualified names; frame/canvas
tests failed on unqualified headings and resize names. The changed browser assertions failed on
Garden/Progress labels and seeded Reflections names, and MCP failed on its untitled receipt.
After implementation, all 2,969 Vitest tests plus nine Node checks passed, all 26 affected browser
journeys passed, both MCP transports passed, and the Storybook build and live Remove Placement
Interactions passed. Lint and documentation checks are green after regenerating Compodoc.
The first concurrent offline run timed out in an existing five-second import-lint test;
the full rerun passed with no timeout changes. An overlapping docs check saw the Node check's
temporary malformed-Mermaid fixture; the subsequent check passed after that fixture was removed.

<!-- One entry per review round: what the reviewer found, what changed. -->

**Round 1** (independent reviewer, against the code). No boundary violations; the line numbers and
fixture facts held. Ten findings, all verified and taken:
1. The planned new MCP source would have broken the Home block's placement count and cursor order.
   The check now reuses the existing untitled `onWork` add (`Markdown (Work Manager)`).
2. The milestone walkthrough's step 15 quotes the old label; added to the change list.
3. The testing docs' acceptance row is added.
4. The canvas spec's helper is a task-list owned by `Website launch`; expected strings corrected,
   and the move announcement gained a test.
5. The frame's titled case is called a guard, not a driver.
6. The Storybook play-function edit gained a verification step (acceptance 7).
7. The same-project case (`Reflections (Home renovation)`) gained an e2e assertion on the seeded Home.
8. The spec change also touches §54's example label, and the §27 note names labels and Activity.
9. The decision is indexed under Contracts.
10. The decision and Design record the owner-rename consequence.

**Round 2** (same reviewer, re-reading the revised plan against the code). No substantive
findings: the `Work Manager` fixture (`agent-heavy`, untitled brief, untouched before `:449`), the
`onWork` receipt and `childHistory.undo.label`, the fake gateway's `shortcuts.move` for the
announcement test, and the seeded Home test at `:372-376` all hold. Two minor findings, both taken:
1. "Exactly" titles cannot use `toHaveText`: the shortcut `h2` holds an `aria-hidden` `↗` and the
   section title is a `Rename <name>` button. Acceptance 4 now names the locators
   (`toHaveAccessibleName` on `[data-shortcut-frame]`, the `Rename Markdown` aria label).
2. Acceptance items 6 and 7 were out of order; renumbered.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome
