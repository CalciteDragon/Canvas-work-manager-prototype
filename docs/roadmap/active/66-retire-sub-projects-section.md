<!-- plan id="66" status="active" summary="Sub-Projects views and their placements leave at schema v7 without losing work; the type is refused on create and load" -->
# Slice 66 — Retire the Sub-Projects section (Slice 59 Stage E)

## Goal

Remove the Sub-Projects section as a canvas view and creation option, and convert every stored
Sub-Projects view, its shortcuts and the history actions that could bring either back. No project,
page, task, reflection or authored content is lost (Stage E of
[Slice 59](../planned/59-markdown-and-work-navigation.md)).

## Spec sections

- **§14 (owned-file upgrades).** Schema version 7, reached through a named v6→v7 step that extends
  the existing backup, owner-lock and validate-before-replace pipeline.
- **§26, §29 (line 1424).** "A Sub-Projects section is a *view* of that hierarchy" becomes history.
  A project's work hierarchy is shown and created only through the project column's **Work** list
  and its **Add workstream** plus (Slice 60).
- **§29 (line 1618), §30 (lines 1640, 1661).** The registered types become six: Markdown, Task
  List, Progress, Reflections, Timeline, Recent Activity. `sub-projects` joins `rich-text` as a
  retired type. §30's aspirational "Prototype" list keeps its history and gains a Slice 66 note.
- **§31 (lines 1784–1787, 1901).** Recovery prose that lists Sub-Projects as a disposable view
  loses it. The archived-project sentence at 1901 is re-worded: archived descendants are reached
  through Archive and workspace Settings (Slices 44, 47), not a section.
- **§54.** `list_sections` stops naming `sub-projects` among view types. `create_section` refuses it
  through the domain. No tool, grant or input shape changes.
- **§66 (section structure), §69 and §77 (verification and actual use).**

Spec line 2816 already promises that the legacy `sub-projects` identifier is unchanged. That stays
true: the identifier remains the stored name of a retired type, never a renamed one.

## Build

- Retire `sub-projects` in contracts and domain: drop it from `SECTION_CAPABILITIES`, list it in
  `RETIRED_SECTION_TYPES` with replacement guidance, and refuse it in `SectionService.add` for every
  caller. Integrity refuses it on load, with a narrow exemption for actions already `retired`.
- A named v6→v7 converter removes Sub-Projects views and their shortcuts, densely renumbers the
  affected pages, and retires the history actions whose subject is one of them. It reports what it
  removed. The v5→v6 step is frozen and stops validating.
- Delete the web section folder, its registry entry and the section-level hierarchy callback that
  only it called. Regenerate seeds. Update tests, e2e journeys, acceptance scripts, the spec, the
  architecture tree, the guides and a new §78 decision.

## Done when

Upgrading copies from every supported version (2–6) reaches v7, removes exactly the Sub-Projects
views and the shortcuts sourced from them, and keeps every project, page, task, reflection, other
section and other shortcut. A repeat upgrade changes no bytes. After restart no Undo or Redo can
recreate a Sub-Projects view or its placement, while unrelated actions keep their order and still
step. Browser, HTTP and both MCP transports refuse the type. Workstreams are still created, listed,
completed and archived through the project column. All required checks pass, and the slice is used
in the real app.

## Do not

- Rename stored `kind: 'subproject'`, project ids, MCP tool names, URL shapes or the legacy type
  string. Do not relabel stored history labels.
- Add a replacement hierarchy view, a status or due-date column to the Work list, or any new
  section type. Changing what the Work list shows is a product question for after real use.
- Delete history actions, touch actions whose only link to a removed view is a placement
  neighbour, or change the history state machine.
- Rewrite frozen fixtures (`nested-projects-v2/v3`, `history-v4`, `history-v5-rich-text`) or older
  conversion semantics beyond freezing the v5→v6 step's output.
- Do Stage F's integrated acceptance matrix; this slice proves its own rows only.

<!-- ───────────── Written when the slice starts ───────────── -->

## Findings from the repository that shape the plan

- **Where Sub-Projects views live.** In seeds, three live views: `section-project-launch-sub-projects`
  (busy-week), `section-project-renovation-sub-projects` and `section-project-kitchen-sub-projects`
  (nested-projects), all at position 2 from `sliceTenCanvas` in `seeds.ts`. No seed has a shortcut
  to one, and no seed has history. The developer's `.prototype/data.json` holds none.
- **Shortcut sources are not type-restricted.** `SectionShortcutService` accepts any live section in
  the same root as a source, so a Home or Work shortcut to a Sub-Projects view is legal data today
  and must be handled.
- **Where a Sub-Projects view can appear in history.** Every payload that names a section or a
  shortcut, by subject:

  | Operation | Subject field | Can recreate the view or placement? |
  |---|---|---|
  | `section.add`, `section.remove` | `section` (full snapshot) | yes: Redo of add, Undo of a deleted removal |
  | `section.update`, `section.move`, `section.restore` | `sectionId` | no, but mutates the view if present |
  | `shortcut.add`, `shortcut.remove` | `shortcut` (full snapshot, with `sourceSectionId`) | yes: placement |
  | `shortcut.update`, `shortcut.move` | `shortcutId` | no, but mutates the placement if present |
  | `task.add`, `reflection.add` | `container.section` | always a container type; a view here is corrupt |
  | page, project, task/reflection transitions | none | no |

  `PlacementSnapshot.previous/next` may name a removed view or shortcut as a **neighbour**. The
  existing neighbour fallback already treats a missing neighbour as "no evidence", so those actions
  stay untouched.
- **`retired` is already an action state** ([decision](../../decisions/2026-09-operation-history-retired-actions.md)).
  It is terminal: no transition selects a retired action, `nextOperationAction` skips it in both
  directions, and `recordOperationAction` discards retired actions above the cursor like any other
  redo branch. The state machine's invariant is "at or below the cursor: applied or retired; above:
  undone or retired", so marking **any** action retired in place, with the cursor left where it is,
  keeps the invariant. `retireOperationAction` itself must not be reused here: it moves the cursor
  to `order − 1`, which is only correct for the next step, not for an action in the middle of a stack.
- **Integrity already refuses retired types** (`assertNotRetired` in `data-store.ts`) on
  `sections`, on `section.add`/`section.remove` snapshots and on created containers, regardless of
  action state. A retired action keeps its snapshot (the payload schema requires it), so the check
  must skip actions whose `state` is `retired`.
- **The refusal message is Rich Text-specific.** `SectionService.add` says "add a Markdown section
  instead" for every retired type. A Sub-Projects refusal needs its own replacement.
- **`onProjectHierarchyChange` on a section has one caller.** `SubProjectsSection.create` is the only
  section that calls it. `projectHierarchyRevision` stays: `TimelineSection` reads it. The page-level
  `onProjectHierarchyChange` (Todos, Archive, Reflections pages) stays.
- **The v5→v6 step validates.** `upgradeMarkdownSections` ends with `validateDocumentIntegrity` and
  rejects anything but 5 or 6. At `SCHEMA_VERSION = 7` that validation would retarget, so it has to be
  frozen, as Slice 63 froze v4→v5.
- **Ordering.** `listPlacements` sorts a page's live sections and shortcuts by `position`, then `id`;
  `renumberPlacements` keeps a sibling's `updatedAt`. The converter uses the same order and the same
  rule, with no clock.

## Design

### 1. Contracts — `packages/contracts/src/section.ts`, `document.ts`

- `SCHEMA_VERSION = 7`.
- Remove `'sub-projects'` from `SECTION_CAPABILITIES`.
- `RETIRED_SECTION_TYPES` changes from a string list to a frozen record of **type → replacement
  sentence**:
  - `'rich-text'`: "add a Markdown section instead";
  - `'sub-projects'`: "create a workstream instead — Add workstream beside Work in the project
    column, or create_project with a parentProjectId".

  The sentence reaches people and agents alike, so it names both surfaces.

  `isRetiredSectionType(type)` keeps its signature (own-key check). A new
  `retiredSectionReplacement(type): string | undefined` returns the sentence. The doc comment points
  to both decisions.
- `SECTION_DISPLAY_NAMES` keeps `'sub-projects': 'Sub-Projects'`: the refusal message and any
  displayed historical name still need it. Its doc comment says why it outlives the type.

### 2. Domain — `section-service.ts`

`SectionService.add` keeps the Slice 63 check in the same position (after actor and grant checks,
before any lookup), and its message becomes
`` `${displayNameOf(type)} sections are retired and can no longer be created; ${retiredSectionReplacement(type)}.` ``.
The refusal order Slice 63 pinned is unchanged. Nothing else in the domain names the type.
`section-recovery-policy` needs no change: an undeclared type already reads as `unknown`.

### 3. Integrity — `packages/repositories/src/data-store.ts`

- The `sections` check is unchanged and now also refuses `sub-projects`.
- Only the two `assertNotRetired` calls on actions — the `section.add`/`section.remove` snapshot and
  the created `container.section` — are skipped for an action whose `state` is `'retired'`. A retired
  action can never execute again (no transition selects it and nothing un-retires it), so its
  snapshot can never recreate anything. Every other action check still applies to retired actions:
  history membership, unique order, the high-water bound, `operationProjectOf`, the `project.add`
  absence anchor and generation reachability. The comment says this and links the new decision.
- Everything else is unchanged. A non-retired `section.update`/`move`/`restore` naming a missing
  section is already legal (it reports `missing`), so integrity does not need to resolve them.

### 4. The v6→v7 converter — `packages/prototype-data/src/upgrade-retired-work-views.ts`

`upgradeRetiredWorkViews(input: unknown)` reads opaque v6 JSON, writes literal v7 data, and
validates the final document with `validateDocumentIntegrity`. It is now the chain's only
validating step. It matches the literal string `'sub-projects'`, never `RETIRED_SECTION_TYPES`, so
its behaviour cannot drift when contracts change.

**Versions.** It accepts 6 and 7. At 7 it runs the same conversion: a clean file comes back
`changed: false` and is never written; a hand-edited v7 file holding a Sub-Projects view is
converted and written, so the integrity message's remedy works. Anything else is a `RangeError`.

**Algorithm**, in this order, over plain JSON:

1. **Resolve section types.** Build `sectionId → type` from `sections` (live and archived), every
   `section.add`/`section.remove` snapshot (every action state) and every `task.add`/
   `reflection.add` `container.section`. Disagreement for one id refuses the conversion with a
   diagnostic naming the id and the sources. `retiredViews` = ids whose type is `'sub-projects'`.
   A `container.section` of that type refuses: it is corrupt, not convertible.
2. **Resolve shortcut sources.** Build `shortcutId → sourceSectionId` from `sectionShortcuts` and
   every `shortcut.add`/`shortcut.remove` snapshot, in every action state. Disagreement refuses.
   `retiredPlacements` = shortcut ids whose source is in `retiredViews`, whether the shortcut is live
   or exists only in a snapshot.
3. **Remove records.** Drop every section in `retiredViews` (live and archived) and every live
   shortcut in `retiredPlacements`. Nothing else in `sections`, `sectionShortcuts`, `pages`,
   `projects`, `tasks`, `reflections` or `activity` changes. **Activity guard:** integrity refuses an
   `entityType: 'section'` event whose section is missing (`data-store.ts`, the activity-target check).
   The domain no longer writes such events, but a hand edit or an older build could have. If an event
   targets a section in `retiredViews`, the converter refuses with a diagnostic naming the event and
   the section, instead of letting final validation fail with a generic message. Nothing is written.
4. **Renumber.** For each page that lost a **live** section or a shortcut, sort its remaining live
   sections and shortcuts with the domain's exact comparator — `position`, then
   `id.localeCompare` (`byPositionThenId` in `page-placements.ts`) — and assign `0..n−1`. Every
   later placement shifts, shortcuts included (on the `nested-projects` Home the four shortcuts at
   7–10 become 6–9). Only `position` changes; `updatedAt` is kept, matching `renumberPlacements`'
   sibling rule. Archived sections keep their stale positions. Pages that lost nothing are not
   touched, even if already sparse.
5. **Retire actions.** For each action whose `state` is not already `retired`, its subject is
   looked up by the table in *Findings*:
   - `section.add`/`section.remove`: `section.id` in `retiredViews`;
   - `section.update`/`section.move`/`section.restore`: `sectionId` in `retiredViews`;
   - `shortcut.add`/`shortcut.remove`: `shortcut.id` in `retiredPlacements` (equivalently its
     `sourceSectionId` in `retiredViews`);
   - `shortcut.update`/`shortcut.move`: `shortcutId` in `retiredPlacements`.

   A matching action's `state` becomes `'retired'`; no other field changes (id, order, label,
   createdAt, expiresAt, operation). A subject that resolves nowhere (an id in no source) is left
   untouched and counted as `unresolvedActions`: like Slice 63's orphans it already reports
   `missing` and can recreate nothing. Every other action is untouched, including those that name a
   removed record only as a placement neighbour.
6. **Settle histories.** Each history that gained a retired action gets `revision + 1`, so a client
   holding the old revision refuses `history_revision_stale` and re-reads. `cursor` and
   `orderHighWaterMark` are unchanged. A test asserts the state-machine invariant on every history
   after conversion.

**Result:** `{ document, changed, removedSections, removedShortcuts, retiredActions,
renumberedPages, unresolvedActions }`, the first four as sorted id lists. `changed` is true when the
version moved or step 3 or 5 changed something; orphans alone never set it.

**Why retire rather than delete.** Retirement is the existing, visible meaning of "this action can
never succeed again". It keeps every order, the cursor and the labels exactly where they were, and
needs no new history rule. Deleting would open holes in the middle of a stack, which pruning
deliberately never does, and would lose the record that the step existed. The cost is the narrow
integrity exemption in §3.

### 5. The chain — `upgrade-markdown-sections.ts`, `upgrade-cli.ts`

- **`upgradeMarkdownSections` is frozen.** It no longer validates and returns opaque JSON. It accepts
  5, 6 and 7. It writes the literal version 6 for a v5 input and keeps the input's version
  otherwise, so a hand-edited v7 file holding `rich-text` still converts (the Slice 63 remedy keeps
  working). Its refusals and counts are unchanged.
- **`upgradeDataFile`** accepts 2–7, chains `v2→3 → v3→4 → v4→5 → v5→6 → v6→7`, and writes only when
  some step changed the document. Backup-before-write, temp-file-then-rename, owner lock and
  no-write-on-failure are untouched.
- **`upgradeMessage`** reports the removed sections and shortcuts by id, the retired action count
  and the renumbered page count, alongside the existing counts. The backup path is already named.

### 6. Web

- **Delete** `sections/sub-projects/` (six files) and its registry entry and import.
- **Remove the section-level `onProjectHierarchyChange` callback**, whose only caller is gone:
  `SectionContentInputs` and its key check in `section-contract.ts`; the frame output and input
  wiring in `project-section-frame.ts`; the no-op in `shortcut-frame.ts`; `projectHierarchyChanged`
  and its template binding in `project-canvas`; the input on the six remaining section components;
  `design-lab-fixtures.ts`; and the stories and specs that pass it. (`live-panels.html` binds only
  `projectHierarchyRevision` and does not change.)
  `ProjectCanvas`'s **page-level** `onProjectHierarchyChange` input also loses its only call. It stays
  declared, because `project-page-contract.ts` requires it of every page and the Todos, Archive and
  Reflections pages do call it; its doc comment says the canvas no longer has a reason to. The
  decision records this rather than reshaping the page contract for one page.
  `projectHierarchyRevision` stays everywhere: `TimelineSection` reads it.
- **Re-word comments** that cite the Sub-Projects section as the reason for something still true:
  `project-page-store.ts` (the hierarchy revision now exists for Timeline), `project-workspace-store.ts`
  (`notifyHierarchyChanged` is now called by pages, not a section), `project-page-navigation.ts`,
  `primitive-panels.ts`/`.html`.

### 7. Seeds, fixtures, MCP and scripts

- **Seeds.** `sliceTenCanvas` drops the Sub-Projects line, and **every later placement** on those
  pages moves up one: Progress, Reflections and Timeline become 2–4; the explicit Recent Activity
  sections at 6 in `nested-projects` become 5; the four Renovation Home shortcuts at 7–10 become
  6–9. Busy-week's Launch canvas renumbers the same way. Regenerate all six `prototype/seeds/*.json`
  at v7 (four change only their version). `seeds.test.ts` gains a combined section-and-shortcut
  density check per page; the existing check covers sections only.
- **New frozen fixture** `packages/prototype-data/test/fixtures/history-v6-sub-projects.json`,
  produced once by the real domain at this slice's starting commit from the `nested-projects` seed,
  under a fixed clock so every action sits inside one 24-hour window. Every write goes through the
  domain; there are no JSON edits. Calls in this exact order (P = the seed's person, A = the seed's existing
  `agent-claude` connection, which already holds `projects.write` — no connection is created;
  KV = `section-project-kitchen-sub-projects`, RV = `section-project-renovation-sub-projects`):
  1. A: update RV's title (agent history on Renovation — a view action in another actor's history).
  2. A: update Renovation's brief Markdown (unrelated, same agent history).
  3. P on Kitchen: update Kitchen's brief Markdown (unrelated, below everything).
  4. P on Kitchen: collapse KV (`section.update`).
  5. P on Kitchen: move KV to the top (`section.move`).
  6. P on Kitchen: move Kitchen's Progress so its recorded neighbour is KV (neighbour-only move).
  7. P on Kitchen: add a shortcut on Kitchen's **Work** canvas to RV (S-work; Slice 65 destination).
  8. P on Renovation: add a Home shortcut to KV (S-home), then resize it (`shortcut.update`), then
     move it (`shortcut.move`).
  9. P on Renovation: add a second Home shortcut to KV, then remove it (snapshot-only placement in
     `shortcut.remove`).
  10. P on Renovation: remove RV. S-work references it, so the domain **retains** it
      (`section.remove`, `disposition: 'retained'`); then restore it through
      `SectionService.restoreSection` (`section.restore`; a view has `recovery: 'none'`, so it is
      never listed in the Archive UI); then
      remove it again, leaving an archived view still referenced by S-work.
  11. P on Kitchen: add a second view V3, then remove it (unreferenced, so `disposition: 'deleted'`:
      a snapshot-only view in `section.remove`).
  12. P on Kitchen: update Kitchen's brief again (unrelated), then add a third view V2.
  13. P on Kitchen: Undo V2's add (V2 becomes snapshot-only, undone, above the cursor), then Undo
      the brief edit from step 12 (an unrelated undone action above the cursor).

  So Kitchen's person history ends with the cursor below two undone actions, one of which retires.
  Every operation type in the *Findings* table that can name a view or its placement occurs at least
  once. Views appear live, archived and snapshot-only; placements appear live and snapshot-only;
  `section.add` occurs both applied and undone, and the other types occur applied (the retirement
  rule does not depend on an action's state, and a test asserts that on a plain-JSON copy). Provenance — seed, these calls, the commit and the
  clock — goes in `test/fixtures/README.md` and the decision entry. The generator is a scratchpad
  script and is not committed.
- **Refusal variants are plain-JSON edits in tests**, not fixtures: conflicting section types for an
  id, conflicting shortcut sources, a `sub-projects` created container.
- **MCP.** `list_sections` description drops `sub-projects` from its view list; the contract test's
  `sub-projects` exemption is removed. `create_section`'s description gains one sentence, parallel to
  its Rich Text one, saying the work-hierarchy view is retired and nested work is created with
  `create_project` and a parent. It uses prose, not the identifier, so the description test's ban on
  the identifier holds.
- **Domain tests over converted data.** `@cwm/prototype-data` cannot import `@cwm/domain`, so — as
  Slice 63 did in `markdown-conversion.test.ts` — the walk over converted history lives in a new
  `packages/domain/src/retired-work-views-conversion.test.ts`. The existing
  `markdown-conversion.test.ts` passes `upgradeMarkdownSections(...).document` straight to its harness;
  after the freeze that is an unvalidated v6 document (and its v5 fixture holds two Sub-Projects
  views), so it chains through `upgradeRetiredWorkViews` and asserts on the v7 result.
- **Scripts and journeys.**
  - `recovery-undo-acceptance.test.ts` replaces the Renovation view id with another seeded view and
    updates its CLI assertions: "schema version 6" becomes 7, and the "already at 6 but still held
    retired sections … 8 Rich Text sections" case expects the v7 message (its v5 copies also lose
    their two Sub-Projects views, which the message now reports).
  - `apps/e2e/archive.spec.ts` and `section-edit-undo.spec.ts` use Progress, Timeline or Recent
    Activity where they used the view.
  - `acceptance.mjs` and `mcp-acceptance.mjs` gain the refusal check (Acceptance 4).

## Acceptance check

1. **Every supported version converts.** `pnpm --filter @cwm/prototype-data test` runs the chain on
   copies of `nested-projects-v2.json`, `-v3.json`, `history-v4.json`, `history-v5-rich-text.json`
   and the new v6 fixture. Each reaches v7 and `validateDocumentIntegrity` accepts it. For each:
   - no section of type `sub-projects` remains, live or archived, and no shortcut whose source was one;
   - project, page, task, reflection and activity collections are deep-equal to the input's after
     the earlier steps; every other section and shortcut is deep-equal except `position`;
   - every affected page's live combined order is `0..n−1` in the same relative order as before.
2. **The v6 fixture's history.** Exactly the subject actions in the fixture are `retired`; every
   other action, including the neighbour-only move and the snapshot-only add's unrelated siblings, is
   byte-identical. Each touched history's revision rose by one; cursors and high-water marks are
   unchanged; the state-machine invariant holds for every history.
3. **Restart and repeat.** The converted file opens in a fresh `JsonFileDataStore`. In the domain
   (`retired-work-views-conversion.test.ts`, with the clock pinned inside the fixture's 24-hour window
   so no step refuses `history_expired`), Undo and Redo walk the whole of each fixture history to both ends: every step is either an
   unrelated action that executes, or is skipped because it is retired; no step recreates a view or
   a placement, and the unrelated Markdown edits apply. A second `pnpm prototype:upgrade` on the
   converted copy reports "already at schema version 7" and leaves it byte-identical. A hand-edited
   v7 file holding a Sub-Projects view fails to load with the upgrade command named; running it
   converts the file and it loads.
4. **New writes refuse the type.** `SectionService.add` with `sub-projects` throws `DomainRuleError`
   naming Work and writes nothing; `POST /api/projects/:id/sections` returns the mapped rule error;
   MCP `create_section` over HTTP and stdio returns the tool error. An agent without `projects.write`
   still gets the permission error first. `rich-text` refusal still names Markdown.
5. **The picker and canvas.** The add-section dialog lists six types, Markdown first, no
   Sub-Projects. The `nested-projects` Home and Kitchen canvases render with no gap in order.
6. **Work still works.** The e2e journeys for Add workstream, Work navigation, workstream completion,
   archive and Settings recovery pass unchanged on the converted seeds.
7. **Gates:** `pnpm test`, `pnpm lint` (with `docs:check`), `pnpm build` (initial bundle under the
   unchanged 1,050,000-byte ceiling), `pnpm storybook:build`, `pnpm e2e`, and host `acceptance`,
   `agent-acceptance`, `mcp-acceptance`, `live-acceptance`, with `pnpm docs:api` built first.
8. **Actual use.** Run `pnpm prototype:upgrade .prototype/data.json` first: the developer's file
   is at v6 and holds no view, so it only changes version, but the host refuses it until it is
   upgraded. Then upgrade a copy of an older `nested-projects` data file, start `pnpm dev:host` and
   `pnpm dev:web` separately, and confirm Home and Kitchen render without the view, the header Undo
   and Redo step over retired actions, and Add workstream creates and lists a child. Try
   `create_section` with `sub-projects` from a real MCP client. Record friction with
   `CURRENT_SLICE = 66`.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/document.ts` | modify | `SCHEMA_VERSION = 7`, version doc comment |
| `packages/contracts/src/section.ts` | modify | drop capability; `RETIRED_SECTION_TYPES` record; `retiredSectionReplacement`; display-name comment |
| `packages/contracts/src/section.test.ts`, `document.test.ts` | modify | capability table, retired record, replacement, version |
| `packages/domain/src/section-service.ts` (+ `.test.ts`) | modify | per-type refusal sentence |
| `packages/domain/src/section-ownership.test.ts`, `section-recovery-policy.test.ts`, `project-archive-service.test.ts` | modify | drop `sub-projects` from type tables and view lists |
| `packages/domain/src/retired-work-views-conversion.test.ts` | create | converted-history walk over the v6 fixture, pinned clock, after restart |
| `packages/domain/src/markdown-conversion.test.ts` | modify | chain the frozen v5→v6 output through v6→v7 before the harness |
| `packages/repositories/src/data-store.ts` (+ `.test.ts`) | modify | retired-action exemption; v7 refusal of the view |
| `packages/prototype-data/src/upgrade-retired-work-views.ts` (+ `.test.ts`) | create | v6→v7 converter |
| `packages/prototype-data/src/upgrade-markdown-sections.ts` (+ `.test.ts`) | modify | freeze: no validation, accepts 5–7 |
| `packages/prototype-data/src/upgrade-cli.ts` (+ `.test.ts`) | modify | 2–7 chain, message with removed ids |
| `packages/prototype-data/src/index.ts` | modify | export the new step |
| `packages/prototype-data/src/seeds.ts`, `seeds.test.ts` | modify | drop the view, renumber, expected type lists |
| `packages/prototype-data/test/fixtures/history-v6-sub-projects.json`, `README.md` | create / modify | frozen fixture and provenance |
| `prototype/seeds/*.json` (six) | regenerate | v7 seeds |
| `packages/mcp-tools/src/tools/sections.ts`, `contract.test.ts` | modify | description; drop exemption; refusal over the registry |
| `apps/prototype-host/api/routes.test.ts`, `recovery-undo-acceptance.test.ts` | modify | HTTP refusal; replace view id; v7 CLI messages and counts |
| `apps/prototype-host/scripts/acceptance.mjs`, `mcp-acceptance.mjs` | modify | refusal check over HTTP API and MCP |
| `apps/web/src/app/features/projects/sections/sub-projects/*` (six files) | delete | the view |
| `apps/web/src/app/features/projects/sections/registry.ts`, `registry.spec.ts` | modify | six types, doc comment |
| `apps/web/src/app/features/projects/section-create-dialog.spec.ts` | modify | picker order |
| `apps/web/src/app/features/projects/sections/section-contract.ts` | modify | drop section-level `onProjectHierarchyChange` |
| `apps/web/src/app/features/projects/sections/section-frame/project-section-frame.ts`, `.spec.ts`, `.stories.ts` | modify | drop the output/wiring; drop the Sub-Projects display-name test |
| `apps/web/src/app/features/projects/shortcuts/shortcut-frame.ts`, `.spec.ts`, `.stories.ts` | modify | drop the no-op |
| `apps/web/src/app/features/projects/project-canvas.ts`, `.html`, `.spec.ts`, `.stories.ts` | modify | drop `projectHierarchyChanged` and its binding; story comment |
| `apps/web/src/app/features/projects/sections/{markdown,progress,tasks,reflections,timeline,activity}/*-section.ts` (+ specs that pass the input) | modify | drop the input |
| `apps/web/src/app/features/projects/project-page-store.ts`, `.spec.ts`, `project-workspace-store.ts`, `project-page-navigation.ts`, `project-workspace-shell.spec.ts`, `core/shell/shell-store.spec.ts` | modify | comments only |
| `apps/web/src/app/prototype/design-lab/design-lab-fixtures.ts`, `panels/primitive-panels.ts`, `.html` | modify | drop the input; re-word the note |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 66` |
| `apps/e2e/archive.spec.ts`, `section-edit-undo.spec.ts` | modify | replace the view id |
| `.prototype/notes.json` | modify | friction from actual use |
| `.prototype/data.json` | upgrade, git-ignored | developer file converted to v7 before running the host |
| Main spec | modify | §§26, 29, 30, 31, 54 per *Spec sections*; line 576's example `schemaVersion`; line 1216's Slice 60 note ("Sub-Projects section remain unchanged") gains a Slice 66 note; line 3701's link list drops "every Sub-Projects section"; §81 line 4314's milestone section list gains a "retired in Slice 66" note (the §81 record itself is history) |
| `docs/decisions/2026-10-retiring-the-sub-projects-section.md`, `README.md` | create / modify | §78 entry and index |
| `docs/decisions/2026-10-schema-version-6-markdown-conversion.md`, `2026-09-operation-history-retired-actions.md`, `2026-09-project-workspaces-and-subproject-work-units.md` | modify | dated amendments only |
| `docs/architecture/{contracts,domain,repositories,prototype-data,mcp-tools,web/projects}/` (four files each, as changed), `docs/architecture/prototype-host/live-updates/why.md`, `docs/architecture/testing/what.md` (conversion and acceptance test rows), `docs/architecture/what.md`, `why.md` | modify | types, schema v7, converter, exemption, removed callback |
| `docs/guides/first-milestone-walkthrough.md`, `mcp-setup.md`, `README.md`, `AGENTS.md` | modify | six types, step 18, upgrade command text, schema version |
| `docs/roadmap/planned/59-markdown-and-work-navigation.md`, `goals.md` | modify | Stage E note at close |

## Test plan — tests first

Each new case is written and watched failing before the code it drives.

| Test | Proves |
|---|---|
| `section.test.ts`: `sub-projects is retired with a Work replacement` | record shape; no capability; `isRetiredSectionType` and `retiredSectionReplacement` for both types, and `undefined` for `toString` |
| `section-service.test.ts`: `refuses a new Sub-Projects section naming Work` | message, nothing written, grant-first order for agents |
| `data-store.test.ts`: `refuses a live or archived Sub-Projects section at v7` | load refusal names the upgrade command |
| `data-store.test.ts`: `accepts a retired action whose snapshot holds a retired type` / `refuses the same snapshot on an applied or undone action` | exemption is exactly `state === 'retired'` |
| `data-store.test.ts`: `still refuses a retired action with a duplicate order or beyond the high-water mark` | the exemption covers only the two retired-type checks |
| `upgrade-retired-work-views.test.ts`: `refuses an activity event targeting a removed view, naming both` | Activity guard, nothing returned |
| `…`: `retires snapshot-only placements and views` | the `shortcut.remove`-only and `section.remove`/undone-`section.add`-only records |
| `upgrade-retired-work-views.test.ts`: `removes live and archived views and their shortcuts only` | step 3 on the v6 fixture |
| `…`: `renumbers only affected pages, by position then id, keeping updatedAt` | step 4, including a page with a pre-existing gap that lost nothing |
| `…`: `retires exactly the subject actions in every state and leaves neighbour-only actions byte-identical` | step 5 |
| `…`: `bumps each touched history's revision once and keeps cursor and invariant` | step 6 |
| `…`: `refuses conflicting section types, conflicting shortcut sources and a view as a created container` | diagnostics, nothing returned |
| `…`: `counts unresolved subjects without changing them` | orphan rule |
| `…`: `is idempotent on its own output and converts a hand-edited v7 file` | versions |
| `retired-work-views-conversion.test.ts` (domain): `walks every converted history to both ends without recreating a view or placement` | clock pinned in the fixture window; after restart through `JsonFileDataStore`; unrelated edits apply |
| `markdown-conversion.test.ts` (domain): existing cases on the v7 result | the frozen v5→v6 step still feeds working history |
| `upgrade-markdown-sections.test.ts`: `no longer validates and keeps a v7 input's version` | freeze |
| `upgrade-cli.test.ts`: `chains 2–7`, `writes nothing when already at 7`, `reports removed ids`, `refusal leaves the original bytes and no backup` | CLI |
| `seeds.test.ts`: expected type lists without `sub-projects`; `every page's live sections and shortcuts are densely ordered together` | seeds, including the shifted shortcuts |
| `routes.test.ts`: `POST sections refuses sub-projects` | HTTP |
| `contract.test.ts`: `create_section refuses sub-projects`; descriptions free of the identifier | MCP registry |
| `registry.spec.ts`, `section-create-dialog.spec.ts` | six types, Markdown first |
| `project-section-frame.spec.ts`, `shortcut-frame.spec.ts`, `project-canvas.spec.ts` | content inputs no longer carry the callback; hierarchy revision still forwarded |

## Boundaries touched

- **Contracts once.** The retired record and replacement live only in `section.ts`; the domain,
  integrity and MCP read it. The converter deliberately does not, and matches its frozen literal.
- **Domain abstractions only.** The refusal is input validation in `SectionService`; no new edge.
- **MCP calls the domain.** No tool reads the store.
- **Gateways.** The web change deletes a component and a callback; no component gains a gateway or
  concrete adapter.
- **History.** The state machine and executors are unchanged; the converter writes the existing
  `retired` state without using the transition helpers, and the invariant is asserted.
- **Disposable (§71).** The converter is seed-loader-grade code: tested on fixtures, not generalised.
- **One writer.** The CLI keeps the owner lock; e2e preparation and the host keep theirs.

## Explicit non-goals

- A new hierarchy view, or showing status, due dates or completion in the Work list.
- Generalising the converter into a "retire any type" framework; Rich Text and Sub-Projects each
  keep a named step.
- Pruning or compacting retired actions; ordinary retention does that.
- Removing `projectHierarchyRevision`, the page-level `onProjectHierarchyChange`, or
  `SECTION_DISPLAY_NAMES`.
- Stage F's integrated matrix, phone/theme sweeps beyond this slice's own journeys, and any
  terminology change.

## Open questions

- **Retire or delete history actions?** Proposed: retire (Design §4). A reviewer or the user may
  prefer deletion for simpler integrity; that would change §3 and §4 but not the user-visible result.
- **Remove the dead section-level callback here?** Proposed: yes, because this slice removes its
  only caller and a required input that nothing calls is misleading. It touches about twenty web
  files mechanically; it can be split into its own commit, or into a follow-up slice if review
  prefers a smaller working set.
- **Is losing the Sub-Projects view's status and due-date line acceptable?** The Work list shows
  names and nesting only. The umbrella's request is to manage nested work through the sidebar, so
  the plan accepts the loss and records it in the decision; real use may promote a candidate.

## Revisions

- **Initial draft (2026-10-08).** Grounded in the current code: seeds, history payload union,
  existing `retired` state and its invariant, integrity's snapshot checks, the Rich Text-specific
  refusal and the single caller of the section-level hierarchy callback.
- **Review round 1 (2026-10-08).** The reviewer confirmed the core algorithm: the cursor invariant
  holds, `retireOperationAction` would be wrong mid-stack, and neighbour fallback makes renumbering
  safe for unrelated Undo. Findings verified against the code and fixed:
  - The fixture recipe asked for a Home shortcut to Renovation's view, which sits on Home itself and
    is refused. It also hand-edited an archived view on the false premise that views are always
    deleted; `removalOutcome` retains a shortcut-referenced view. The recipe is now an exact, ordered
    list of domain calls with no JSON edits. It covers a Work-canvas shortcut, a retained-then-restored
    view, snapshot-only views and placements, and a redo branch that survives.
  - The domain walk test moved to `packages/domain` (prototype-data cannot import the domain).
    `markdown-conversion.test.ts` and `recovery-undo-acceptance.test.ts`' v6 messages were added to
    the change list.
  - Seed renumbering now covers every later placement, shortcuts included, with a combined density test.
  - The integrity exemption is limited to the two `assertNotRetired` calls, with a test that other
    action checks still apply to retired actions.
  - Added an Activity guard with a named diagnostic, the domain's exact `localeCompare` comparator,
    a refusal sentence and `create_section` text that serve agents as well as people, the canvas's
    now-unused page-level callback, the pinned clock, upgrading the developer's data file, and the
    missed spec lines and `testing/what.md`.
  - The decision entry will record why the converter writes `retired` directly instead of using
    `retireOperationAction` (line 115 moves the cursor to `order − 1`). This deviates from the
    umbrella's wording "using the existing history state machine", and the entry says so.
- **Review round 2 (2026-10-08).** All fifteen round-1 findings are closed. The reviewer checked
  every fixture step against the domain: each can be performed in order, lands in the history the
  plan says, and still walks after conversion. No older fixture trips the converter. No substantive
  findings. Three wording fixes:
  - agent A is the seed's existing `agent-claude`, because the domain cannot create connections;
  - step 10 names `restoreSection`, because views never appear in Archive;
  - the coverage claim now says which states each operation type actually appears in.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

**Deliverables** — <what now exists and works, with file links>.

**Deliberate choices** — <decisions made and why; options rejected; links to decision entries>.

**Deviations from the plan** — <what changed mid-implementation and what caused it>.

**Deferred** — <what was left out and which slice owns it>.

**Open questions** — <what the next phase or the user must answer>.

**Documentation updated** — <the architecture folders, decisions and guides touched>.
