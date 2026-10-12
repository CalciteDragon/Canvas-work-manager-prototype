<!-- completed-record id="65" closed="2026-10-05" summary="Workstream Work canvases take same-root shortcuts in their own history; a cross-root move refuses any placement with exactly one end inside" -->
# Slice 65 — Shortcuts on Work canvases (Slice 59 Stage D)

## Goal

A workstream's Work canvas can hold section shortcuts the way a root's Home already does. That
means same-root sources, one combined order, history recorded in the destination project, and
reparent checks on both ends of every placement.

## Spec sections

- **§27 ("Shortcuts on Home").** The destination widens from a root's Home to **a project's
  canonical page**: a root's Home or a workstream's Work canvas.
  - Unchanged: same root, same workspace, not on its own page, no shortcut to a shortcut, a
    read-only source, and a disabled source page is still a valid source.
  - The reparent rule widens. It used to refuse "a placement whose source leaves the root". It now
    refuses any placement with exactly one end inside the moving subtree.
  - Line 1460: "Section and Home shortcut creation" loses "Home".
- **§26 (lines 1160, 1165).** "Root Home's dialog also offers **Add shortcut**" becomes "a
  canonical canvas's dialog".
- **§30 (page table, line 1664; line 1680).** The Work canvas row gains shortcut placements, and
  "Home-only shortcut placement" gets a Slice 65 note.
- **§31 (lines 1776, 1800, 1900).** A placement action records in the **destination project's**
  history: the root for Home, the workstream for Work. It never records in the source's history.
  Home wording is generalized wherever it describes the rule rather than the history of Slice 25.4.
- **§32 (lines 1932, 1945, 1981–1983).** "Subproject work canvases do not offer shortcut creation"
  is reversed.
- **§54.** The descriptions of `list_section_shortcuts`, `add_section_shortcut`,
  `remove_section_shortcut` and `undo_operation` stop saying Home. There is no new tool and no
  grant change.
- **§§61–63 (§62 lines 3332–3335).** HTTP routes are unchanged. A live event in the destination's
  root tree, and a reconnect, refresh a Work canvas's shortcuts the way they refresh Home's.

## Build

- **Domain.**
  - `SectionShortcutService` accepts a destination page only if it is its owner's canonical page
    (`canonicalPageKindFor`, from contracts). An omitted `pageId` on `list` resolves to that page.
    `listSources` keeps its required `pageId`.
  - Source scope compares the **roots of both ends** instead of the source's root against the
    destination's id.
  - `shortcut-history.ts` makes the same two changes in `destinationOf` and `sourceConflicts`.
  - `shortcutsCarriedAcrossRoots` in `project-history.ts` refuses any placement with exactly one
    end in the moving subtree. One helper still serves `ProjectService.update` and a reparent's
    Undo and Redo. No new service edge.
- **Integrity.** `validateDocumentIntegrity` accepts a placement on its destination project's
  canonical page and refuses any other page. Its root check already compares both roots.
- **Web.**
  - The shell sets `shortcutsAllowed` for the rendered project's canonical page. It passes the root
    id as a new `rootProjectId` renderer input (`ProjectPageRenderer`) through to
    `ProjectPageStore.load`.
  - The store's live filter compares `event.rootProjectId` with that root, not with the canvas's
    project.
  - The dialog, picker, frame and combined order are reused unchanged.
- **MCP/HTTP.** Descriptions and comments only. Behaviour comes through the domain.

## Done when

On an isolated `nested-projects` copy:

- Kitchen's Work canvas takes a shortcut to Garden's brief at a chosen position. It renders
  read-only with its breadcrumb and Open source. It can be resized, collapsed, reordered by
  keyboard, removed, and undone or redone from Kitchen's header history. Its source is never
  written, and a source edit appears on Kitchen's canvas.
- After a new root is created, moving Cabinets to it is refused while Cabinets' Work holds a
  shortcut to Garden's brief. The refusal names that placement.
- Moving Kitchen there is allowed when Kitchen's Work places a Cabinets section and no other
  placement has exactly one end in Kitchen's subtree.
- The same create, list, remove and undo flows work over HTTP and MCP with minimal grants.
- `pnpm test`, `pnpm lint` (with `docs:check`), `pnpm build`, the targeted e2e and the two
  acceptance scripts are green.

## Do not

- Allow a shortcut on a root's optional pages (Reflections, Projects, Todos, Archive), or on
  anything other than an owner's canonical page.
- Allow cross-root or cross-workspace shortcuts, a shortcut as a source, editable embedded source
  content, or shortcut chains.
- Retire the Sub-Projects section, change its seed placements or bump the schema. Those belong to
  Stage E.
- Make `pageId` optional on `CreateSectionShortcutInput` or `ShortcutSourceQuery`, add MCP tools
  for resize, collapse or move, or widen grants.
- Change committed seeds or snapshots. Tests and real use create Work-canvas shortcuts.
- Add a reparent control to the web app. Moves stay API/MCP-only, as they are today.

<!-- ───────────── Written when the slice starts ───────────── -->

## Acceptance check

**Fixture.** Facts from `packages/prototype-data/src/seeds.ts` and `prototype/seeds/nested-projects.json`:

- **Projects.** Root `project-renovation` has workstreams `project-kitchen` and `project-garden`.
  `project-kitchen` has the child `project-cabinets`, whose Work page `page-project-cabinets` holds
  **no sections**. Archived `project-legacy` and its child are also under Renovation.
- **Home placements.** Renovation's Home already places Kitchen's tasks and reflections
  (`shortcut-renovation-kitchen-tasks`, `…-kitchen-reflections`) and Garden's brief
  (`shortcut-renovation-garden-brief`). So any move of Kitchen or Garden out of the root is refused
  **today**.
- **Second root.** `workspace-demo` has no second live root. A move test first creates root
  "Other root" in `workspace-demo`.

**Move setups**, named below:

- **S-dest:** Cabinets' Work places `section-project-garden-brief`.
- **S-src:** a section created on `page-project-cabinets` is placed on Garden's Work.
- **S-both:** a section created on `page-project-cabinets` is placed on Kitchen's Work. The two
  seeded Kitchen Home placements are removed first. The other two seeded placements, Renovation's
  reflections page and Garden's brief, have neither end in Kitchen's subtree.

Whether a "refused today" claim holds depends on how the placement is created. Through the service,
today's root-only guard throws during setup. So a test whose point is today's move behaviour
inserts its Work placement through the repository.

Every step ends green.

1. **Domain** (`pnpm --filter @cwm/domain test`):
   - **Create and list on Work.**
     - A shortcut on Kitchen's Work to Garden's brief succeeds. Its receipt names
       `project-kitchen`, and the action is in Kitchen's history: not Renovation's, not Garden's.
     - `list(project-kitchen)` with no `pageId` returns it.
     - Setup: disable `page-project-renovation-reflections` (enabled in the seed). Insert a
       section on `page-project-legacy-child` through the repository, because Legacy owns none and
       is frozen.
     - `listSources(project-kitchen, { pageId: Kitchen's Work })` offers the root's Home sections,
       the section on the disabled reflections page, Garden's sections and a created Cabinets
       section. It excludes Kitchen's own Work sections and the hidden Legacy section.
   - **Refusals.**
     - A source in another root, or another workspace, is `EntityNotFoundError`.
     - A root's Reflections page as destination is `DomainRuleError`.
     - Each refusal leaves the store, Activity and history unchanged.
   - **Forward moves.**
     - With S-dest, moving Cabinets to Other root throws `DomainRuleError`. The message names the
       Work placement and no Home placement.
     - With S-src, moving Cabinets to Other root is refused, and the message names only that Work
       placement.
     - With S-both, moving Kitchen to Other root succeeds, and the placement stays valid at
       commit.
   - **Reparent Undo.**
     - Actor A moves Cabinets to Other root.
     - Actor B creates a section on Other root's Home and places it on Cabinets' Work.
     - A's Undo of the move is refused with a `shortcut-reference` conflict naming B's placement,
       and nothing is written.
     - After B removes the placement, A's Undo succeeds.
   - **Reparent Redo.**
     - A moves Cabinets to Other root, then undoes the move.
     - B places Garden's brief on Cabinets' Work.
     - A's Redo is refused with `shortcut-reference`, and nothing is written.
2. **Integrity** (`pnpm --filter @cwm/repositories test`):
   - A document with a placement on a workstream's Work page loads.
   - A placement on a root's Reflections page fails with "must be placed on its project's
     canonical page".
   - A Work placement whose source is in another root fails with "crosses root project trees".
3. **HTTP** (`pnpm --filter @cwm/prototype-host test`):
   - `POST /api/projects/project-kitchen/shortcuts` with `{ pageId: Kitchen's Work page,
     sourceSectionId: section-project-garden-brief }` answers `{ shortcut, operation }` with the
     operation in Kitchen's history.
   - `GET /api/projects/project-kitchen/shortcuts` with no `pageId` lists it.
   - A cross-root source answers 404.
   - `POST /api/projects/project-renovation/shortcuts` with `page-project-renovation-reflections`
     answers 409 `rule_violation`.
   - With S-dest, `PATCH /api/projects/project-cabinets` to Other root answers 409 naming the Work
     placement.
4. **MCP** (`pnpm --filter @cwm/mcp-tools test`):
   - With only `projects.read` and `projects.write`, `add_section_shortcut`,
     `list_section_shortcuts`, `remove_section_shortcut` and `undo_operation` work on a
     workstream.
   - With `projects.read` alone, `add_section_shortcut` is refused.
   - The shortcut and undo tools' descriptions no longer say shortcuts are Home-only. Page tools may
     still say Home.
5. **Web** (`pnpm --filter web test`):
   - The shell passes `shortcutsAllowed: true` and `rootProjectId: project-renovation` for Kitchen's
     Work page, and `false` for a root's Reflections page.
   - On a Work canvas with a shortcut:
     - `project.section_updated` for `project-garden` with `rootProjectId: project-renovation`
       re-reads the shortcuts. The same frame with another root does not.
     - A `task.updated` in Garden bumps `projectDataRevision`.
     - A reconnect re-reads the shortcuts.
6. **Browser** (`pnpm e2e -- canvas-editing.spec.ts`), with the new Work-shortcut journey on
   Kitchen:
   - **Add shortcut** at a chosen insertion point, then confirm the picker shows the breadcrumb.
   - Resize, keyboard reorder and collapse.
   - Header Undo and Redo on Kitchen, checked step by step in the way of
     `project-history.spec.ts:139-144`. The Garden brief has no title, so it is named by its type:
     - Right after Add, the header reads `Undo: Added the Markdown shortcut`, with no cross-owner
       "recorded in … history" notice.
     - `GET /api/projects/project-kitchen/history` holds an action labelled "Added the Markdown
       shortcut", and Renovation's and Garden's histories do not.
   - Open source, edit the Garden brief, return, and see the edit.
   - Remove, then confirm by API that the source is unchanged.
7. **Acceptance:**
   - `pnpm --filter @cwm/prototype-host acceptance` (`personal-workspace`): its created `Kitchen`
     workstream takes a Work shortcut to a Home section, then Undo removes it.
   - `mcp-acceptance` (`agent-heavy`, which has no workstreams of its own):
     - The agent reads the Work page id of the script's created `Kitchen ${title}` with
       `list_project_pages`.
     - It places the ancestor source `section-project-work-manager-brief` there, lists it and
       undoes it.
     - After the existing cross-root undo and redo steps, which leave `Mover` under `second`:
       - It creates a section on `second`'s empty Home and places it on `Mover`'s Work.
       - A forward `update_project { projectId: Mover, parentProjectId: first }` returns
         `isError`, naming that placement.
       - It removes the placement and retries, and the move succeeds.
       - A forward move is used rather than Undo, because the agent's own placement add would be
         undone first.
8. **Real use** (§77): start `pnpm dev:host` and `pnpm dev:web` separately on `nested-projects`.
   Run the Done-when flow in the browser, then once through HTTP MCP. Record friction with
   `CURRENT_SLICE = 65`.
9. `pnpm lint`, `pnpm build` and `pnpm docs:check` are green.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/domain/src/section-shortcut-service.ts` | modify | `requireDestination` uses the owner's canonical page, with an omitted page resolving to it. `assertSourceScope` compares `rootOf(source)` with `rootOf(destination)`. Messages and comments say "canonical page". |
| `packages/domain/src/shortcut-history.ts` | modify | `destinationOf` checks the canonical kind for the action's project. `sourceConflicts` compares the source's root with the destination project's root. Doc comments drop "Home". |
| `packages/domain/src/project-history.ts` | modify | `shortcutsCarriedAcrossRoots` refuses when exactly one of a placement's destination owner and source owner is in the moving subtree. The `=== to` skip is dropped, since it is unreachable under integrity. Doc comment updated. |
| `packages/domain/src/project-service.ts` | modify | The refusal message covers both ends ("shortcut … would cross root trees"). The dependency comment drops "Home". |
| `packages/domain/src/operation-history-service.ts`, `section-service.ts` (lines ~75, ~619) | modify | Comments only. |
| `packages/domain/src/section-shortcut-service.test.ts` | modify | Cases in the test plan. The existing Reflections-page refusal (~134–151) is kept. |
| `packages/domain/src/shortcut-history.test.ts` | modify | Work-canvas executor cases. |
| `packages/domain/src/project-service.test.ts` | modify | S-dest and S-both forward moves. The describe at ~480 is renamed from "Home shortcut". |
| `packages/domain/src/project-history.test.ts` | modify | Reparent Undo with the destination end. A real-repository creation preflight on a Work page. The describe at ~665 is renamed. |
| `packages/repositories/src/data-store.ts`, `.test.ts` | modify | The integrity rule. The existing regex at `.test.ts:~1553` (`/must be placed on a Home page/`) changes. New Work and cross-root cases. |
| `packages/contracts/src/section-shortcut.ts`, `shortcut-history.ts`, `inputs.ts`, `undo.ts` (~244), `operation-receipt.ts` (~17) | modify | Doc comments only. No schema change. |
| `packages/mcp-tools/src/tools/shortcuts.ts`, `tools/undo.ts`, `tool.ts` | modify | Descriptions: "a root's Home or a workstream's Work canvas", "the destination project's history". |
| `packages/mcp-tools/src/contract.test.ts` | modify | Minimal and insufficient grants on Work. Wording assertion scoped to the shortcut and undo tools. |
| `apps/prototype-host/api/routes.test.ts` | modify | Work create and list, 404, 409, and the S-dest PATCH. The existing Kitchen move test (~870–887) is kept unchanged as a source-end pin. |
| `apps/prototype-host/scripts/acceptance.mjs`, `mcp-acceptance.mjs` | modify | Work steps described in Acceptance 7. |
| `apps/web/src/app/features/projects/project-page-contract.ts` | modify | `rootProjectId` in `ProjectPageRendererInputs` and `ProjectPageRenderer`. |
| `apps/web/src/app/features/projects/project-workspace-shell.ts`, `.spec.ts` | modify | `shortcutsAllowed` follows the canonical page, and `rootProjectId` comes from `store.root()`. `root()` already falls back to the project (`project-workspace-store.ts:~100`), so no new null state. The existing `subprojectShell … false` expectation (~366) inverts. |
| `apps/web/src/app/features/projects/project-canvas.ts`, `.spec.ts` | modify | `rootProjectId` input. The load effect tracks it: a root change after a cross-root move reloads the page, which is wanted. Spec covers Work page id: insertion offers shortcut, incomplete order blocks add/move, and the anchor survives refresh. |
| `apps/web/src/app/features/projects/project-page-store.ts`, `.spec.ts` | modify | `load(projectId, pageId, shortcutsAllowed, rootProjectId)` stores the root. `prototype.reloaded` reuses it. The live filter compares against the root. |
| `apps/web/src/app/features/projects/pages/todos-page.ts`, `archive-page.ts`, `reflections-page.ts`, and their `.spec.ts` and `.stories.ts` | modify | Accept the new `rootProjectId` renderer input (unused). Specs and stories pass it. `todos-page.ts:61` comment. |
| `apps/web/src/app/features/projects/project-canvas.stories.ts` | modify | Pass `rootProjectId`. |
| `apps/web/src/app/features/projects/section-create-dialog.ts`, `.html`, `.spec.ts` | modify | Comment and copy no longer say "Home shortcut". The `.spec.ts:~115` expectation changes if it names Home. |
| `apps/web/src/app/core/gateway/testing/fake-gateway.ts`, `core/history/operation-history-reporter.ts` | modify | Comments only. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 65`. |
| `apps/e2e/canvas-editing.spec.ts`, `apps/e2e/seed.ts` (~117 doc) | modify | The Work-shortcut journey, and the helper doc. |
| `.prototype/notes.json` | modify | Real-use friction. |
| `docs/decisions/2026-10-work-canvas-shortcut-destinations.md` | create | §78 entry: canonical-page destinations, same-root sources at any depth, destination-owned history, and the one-end-inside reparent rule. |
| `docs/decisions/2026-09-forward-reparent-refuses-cross-root-shortcut.md`, `2026-09-section-restore-and-shortcut-history.md`, `2026-09-home-orders-sections-and-shortcuts-together.md`, `2026-09-a-shortcut-resolves-identity-not-content.md` | modify | Dated amendments pointing to the new entry. |
| `docs/decisions/README.md` | modify | Index the new entry. |
| Main spec | modify | The lines listed under Spec sections, each with a *Slice 65* note. Historical "Landed in" notes stay as written. |
| `docs/guides/mcp-setup.md` (### Home shortcuts at ~421–437; ~184, 347, 462), `docs/guides/first-milestone-walkthrough.md` (~239 if affected) | modify | Agent-facing wording and examples. |
| `docs/architecture/domain/`, `contracts/`, `repositories/`, `mcp-tools/`, `web/projects/`, `web/tasks/overview.md` (~25), `prototype-host/api/`, `prototype-host/mcp-transport/what.md` (~30) | modify | Home-only facts, the both-end rule and the `rootProjectId` input. Each touched `why.md` links the decision. |
| `docs/roadmap/planned/59-markdown-and-work-navigation.md` | modify | A Stage D "delivered as Slice 65" note beside the A–C notes. The umbrella is still planned, not frozen. |
| `docs/roadmap/goals.md`, generated `progress.md` | modify | Close-out. |

## Test plan — tests first

"Fails first" means it fails against current code for the stated reason. "Pin" means it already
passes. Its sensitivity is shown once with a temporary, reverted targeted fault (umbrella method),
and the fault is noted in the commit.

| Test | Kind | Proves |
|---|---|---|
| `section-shortcut-service.test.ts: a workstream's Work canvas places a sibling's section` | fails first (root-only guard) | Work is a destination. The receipt and history name the workstream. |
| `…: list without a pageId resolves the workstream's Work page` | fails first | An omitted page resolves to the canonical page. |
| `…: Work sources span the root's pages, a disabled page, siblings and descendants, never the Work page itself or hidden sources` | fails first | The source rule is "same root, not own page", at any depth. Disabled pages are still sources. |
| `…: a source in another root, or another workspace, is not found from a Work canvas` | fails first (guard) | Both roots are compared, along with workspace isolation. |
| `…: an archived workstream, or one under an archived ancestor, refuses create, update and move but permits remove` | fails first (guard) | The freeze applies on the new destination. |
| `…: projects.write creates on Work; projects.read alone cannot` | fails first / pin | The grants are unchanged. |
| `…: a root's Reflections page is not a destination` (existing ~134–151) | pin | Only canonical pages qualify. |
| `shortcut-history.test.ts: Undo and Redo of add, update, move and remove on a Work canvas` | fails first (`destinationOf` is Home-only) | The executors accept Work. |
| `…: recreating a removed Work placement whose source (a created Cabinets section; Cabinets then moved roots) is refused with a section-level page-changed conflict` | fails first | `sourceConflicts` compares roots. The section-level assertion stops today's shortcut-level `destinationOf` refusal from masking a wrong implementation. |
| `…: Redo of a Work placement whose source is archived comes back as the placeholder` | fails first | Archived-source recovery works on Work. |
| `project-service.test.ts: S-dest — moving Cabinets to another root is refused, naming only the Work placement` | fails first (move allowed today) | The destination end counts. |
| `…: S-both — moving Kitchen with both ends inside its subtree succeeds` | fails first (refused today with a repository-inserted placement) | No over-refusal. |
| `…: S-src — moving Cabinets out while Garden's Work places its section is refused, naming only that placement` | fails first (setup needs a Work destination) | The source end still counts for Work destinations. |
| `…: moving within the same root is never refused for a shortcut` | pin | Same-root moves are unaffected. |
| `project-history.test.ts: reparent Undo refuses a destination-end placement made by another actor, then succeeds after its removal` | fails first (guard) | History and the forward write share one rule, without first-in-first-out interference. |
| `…: reparent Redo refuses after another actor placed a cross-root source on the moved workstream's Work` | fails first (guard) | The umbrella's "including Undo/Redo" holds in both directions. |
| `…: project.add preflight with a real placement on the created Work page refuses new-dependent` | pin (generic; stubbed at ~151) | The umbrella's creation-Undo rule holds on real data. This calls `preflightProjectAddUndo` directly, with the placement inserted through the repository. |
| `data-store.test.ts: placement valid on a workstream's Work page; invalid on an optional page (message changes); cross-root Work invalid with "crosses root project trees"` | fails first / fails first (message) / fails first (today's Home check fires first) | Commit-time integrity matches the domain. |
| `routes.test.ts: workstream shortcut create/list; 404; 409; S-dest PATCH 409` | fails first | HTTP mapping. |
| `contract.test.ts: Work shortcut add/list/remove/undo with minimal grants; read-only refused; no Home-only shortcut wording` | fails first | Agents can use it, and the descriptions are true. |
| `project-workspace-shell.spec.ts: Work page allows shortcuts and passes the root id` | fails first | The UI gate follows the canonical page. |
| `project-page-store.spec.ts: same-root project.section_updated, and project.archived of the source workstream, refresh a Work canvas's shortcuts` | fails first (filter compares the project id) | Live refresh, including the hidden placeholder after a source project archive, is keyed on the root. |
| `project-page-store.spec.ts: another root's frame does not refresh; reconnect re-reads` | pin | The existing behaviour holds with the new root input. |
| `project-canvas.spec.ts: on a Work page id, insertion offers shortcut; incomplete order blocks add/move; insertion anchor survives refresh` | pin (the canvas never sees page kind) | Canvas behaviour on Work, with the new required input. |
| `canvas-editing.spec.ts: a workstream's Work canvas takes, edits, reorders, undoes and removes a shortcut` | fails first | The browser journey (Acceptance 6). |

## Boundaries touched

- **Domain over repository interfaces only.** The changes stay inside the existing
  `SectionShortcutService`, the pure helpers in `shortcut-history.ts` and `project-history.ts`, and
  `ProjectService`'s existing `sections` and `shortcuts` repositories. No service gains an edge.
  `canonicalPageKindFor` comes from contracts.
- **MCP calls domain.** Only descriptions change.
- **Contracts once.** No new type. `rootProjectId` is a web renderer input, not a persisted or wire
  shape.
- **Components on gateway interfaces.** The canvas and store already use
  `WORK_MANAGER_GATEWAY.shortcuts`. Nothing names an adapter, and `core/` is untouched apart from
  comments.
- **No `new Date()`, no literal styles, no `prototypeMode` checks.** There are no styling changes.

## Explicit non-goals

- Everything under **Do not**.
- New Storybook stories. Existing stories only gain the `rootProjectId` input.
- Moving placements between pages, or turning a shortcut into a copy.
- 375 px touch and both-theme evidence (Stage F). The dialog and frame are unchanged components.
- A browser journey for a refused move, because the web app has no reparent control. Refusal
  evidence is domain, HTTP and MCP.

## Open questions

- **Q1 — what "shortcut section to a sub-project" means** (the umbrella's Stage D question).
  Resolved as a canonical section reference on the workstream's Work canvas. It reuses §27's
  placement model, and Stage A already made the sidebar the way to reach nested work. A
  project-link card would be a different capability and is not built.
- **Q2 — which sources a Work canvas may take.** Resolved: Home's rule, meaning any same-root
  section not on the destination page, at any depth. That includes ancestors and descendants. The
  umbrella names ancestors and siblings. Excluding descendants would be a Work-only exception
  with no stated reason, since Home already shows them.
- **Q3 — the reparent rule.** Resolved: when a move crosses roots, refuse each placement with
  exactly one end in the moving subtree. Integrity guarantees every stored placement is same-root
  beforehand, so this is complete.

## Revisions

- **Draft (2026-10-02):** Grounded in the code.
  - Four Home-only assumptions: `requireDestination`, `destinationOf`, the integrity loop and the
    shell gate.
  - Three comparisons of a source's root with the destination's **id**: `assertSourceScope`,
    `sourceConflicts`, and the `=== to` skip.
  - The reparent helper only checked sources, and the web store's live filter compares the
    canvas's project.
- **Review round 1 (2026-10-02):** The reviewer returned 15 findings. Each was checked against the
  code and all were accepted.
  - **Seed and setup.** The seed's Home placements already refuse any Kitchen or Garden move, so
    the move tests now use the explicit S-dest and S-both setups and create "Other root" first,
    because the seed's workspace has no second live root.
  - **The `rootProjectId` input.** It must be declared on every page renderer, together with its
    specs and stories, because `NgComponentOutlet` sets every key. Also defined: root-change
    reload, `prototype.reloaded`, and null before the root loads.
  - **History setup.** The reparent Undo test uses a second actor because history runs
    newest-first. The creation-Undo case calls the preflight directly, since another actor's
    history would retire the action.
  - **Test kinds.** Pins are now separated from fails-first tests. The existing tests whose
    intent changes are listed.
  - **Corrections.** The live-event name is `project.section_updated`; reconnect and Task List
    revision cases were added. `listSources` keeps its required `pageId`. The 409 case moved to a
    root's Reflections page.
  - **Coverage added.** A disabled-source-page case, workspace and grant negatives, and canvas
    cases on Work.
  - **Docs and acceptance.** The MCP guide, mcp-transport docs, a fourth decision amendment, and
    comment and spec line references were added. The browser refused-move journey was dropped
    because there is no reparent UI. Acceptance seeds and package filter names were corrected.
- **Review round 2 (2026-10-02):** The reviewer confirmed all 15 round-1 findings closed, with no
  blockers. Five new substantive findings were each checked and accepted:
  - **S-src setup.** The source-end move test had no clean setup, because every seeded workstream
    with sections is already placed on Home. It now uses S-src (Cabinets section on Garden's Work).
  - **Hidden source.** The hidden-Legacy exclusion was vacuous, since Legacy owns no sections. It
    now inserts one through the repository.
  - **Browser assertion.** The browser journey asserted a cross-owner toast that never appears on
    the owner's own canvas. It now asserts the header label and the per-project history reads.
  - **mcp-acceptance sources.** `agent-heavy` has no workstreams, so the step now uses the
    ancestor Home brief, and the cross-root case creates a section on the fresh root first.
  - **Reparent Redo.** Reparent Redo had no test; one was added.

  Minor fixes:
  - Corrected the fails-first and pin labels for the data-store, canvas and store specs.
  - Added the disabled-page setup step.
  - Reworded the Done-when move condition to the one-end-inside rule.
  - Sharpened the recreate-after-move conflict assertion to section-level, using a Cabinets
    source.
  - Added a `project.archived` live-refresh case.
- **Review round 3 (2026-10-02):** The reviewer confirmed all ten round-2 findings closed and
  raised two substantive findings, both checked against the code and accepted:
  - The Garden brief has no title, so the Undo label reads "Markdown", not "Brief". The header
    assertion now runs right after Add and also matches the history action label.
  - The `mcp-acceptance` cross-root step could not run as written, because `Mover` sits under
    `second` by then. It now places a `second`-Home source and proves a forward move to `first`
    is refused, instead of an Undo that would remove the agent's own placement first.
- **Review round 4 (2026-10-02):** The reviewer confirmed both round-3 fixes against the code. No
  substantive findings remain, and the plan is ready to implement.

## Outcome

**Deliverables** — A workstream's Work canvas now holds section shortcuts the way a root's Home does.

- **Domain.** [`SectionShortcutService`](../../../packages/domain/src/section-shortcut-service.ts)
  accepts only the owner's canonical page, resolves an omitted list `pageId` to it, and compares the
  roots of both ends.
- **History executors.** [`shortcut-history.ts`](../../../packages/domain/src/shortcut-history.ts)
  makes the same two changes, so Undo and Redo of all four placement writes run on Work. Each
  action is in the workstream's history.
- **Reparent rule.** [`shortcutsCarriedAcrossRoots`](../../../packages/domain/src/project-history.ts)
  refuses each placement with exactly one end in the moving subtree, for the forward move and for a
  reparent's Undo and Redo.
- **Integrity.** [`validateDocumentIntegrity`](../../../packages/repositories/src/data-store.ts)
  accepts a placement only on its project's canonical page.
- **Web.** The shell gates shortcuts on the canonical page and passes a new `rootProjectId`
  renderer input through `ProjectCanvas` to `ProjectPageStore.load`. The store's live filter is
  keyed on that root. The dialog, picker and frame are unchanged.
- **MCP.** The shortcut and undo tools describe the new destinations. There is no new tool, grant
  or schema change.

**Deliberate choices**

- **Destinations and sources.** Destinations are canonical pages only, and sources follow Home's
  rule at any depth, descendants included (Q2).
- **History and the reparent rule.** History belongs to the destination project. The reparent
  check is "exactly one end inside", which is complete because integrity keeps every stored
  placement same-root.
- **Reload on a root change.** A change of `rootProjectId` reloads the canvas. The correctness
  reviewer noted this shows a brief loading state when the viewed workstream moves roots, where a
  quiet filter update would not. The plan chose the reload because a cross-root move changes which
  sources are in-tree, and a full read gives one consistent answer; the move is API/MCP-only.
- **Store default.** `ProjectPageStore.load`'s root defaults to the project, which is right for
  Home and kept the existing specs unchanged.

All of these are recorded in
[Work canvas shortcut destinations](../../decisions/2026-10-work-canvas-shortcut-destinations.md).

**Deviations from the plan**

- **S-src is a pin.** The service could create Work placements before the reparent change landed,
  so the S-src forward-move test passed at once: the source end was already counted.
- **The creation-Undo preflight is a pin.** It was shown sensitive by temporarily dropping its
  shortcut conflict, then reverted.
- **Fails-first evidence.** The HTTP tests were confirmed red against the pre-slice domain by
  checking out the old files temporarily.
- **Testing docs.** `docs/architecture/testing/` was missing from the change list; the docs review
  caught it and it was updated.
- **`prototype-host/api/`.** It was listed but needed no change, since routes and statuses are
  unchanged.

**Deferred** — Retiring the Sub-Projects section, and any seed placements on Work canvases, belong
to Stage E. Evidence at 375 px and in both themes is Stage F. A web reparent control is still out
of scope.

**Open questions** — Real use recorded two friction notes for a later UX pass:

- A shortcut to an untitled source reads only "Markdown", which is ambiguous beside a canvas's own
  untitled Markdown.
- The split-move refusal names only the placement id, not its canvas or source.

**Documentation updated**

- **Decisions.** A new decision entry and dated amendments to four existing ones, indexed.
- **Spec.** §26, §27, §30, §32, §54 and §62.
- **Guides.** `mcp-setup.md` and `first-milestone-walkthrough.md`.
- **Architecture.** contracts, domain, repositories, mcp-tools, web/projects, web/tasks,
  prototype-host/mcp-transport and testing.
- **Roadmap.** The Slice 59 umbrella's Stage D note and `goals.md`.

**Verification**

- **Offline suite.** `pnpm test` passed: 3,111 offline tests.
- **Lint and build.** `pnpm lint` (with `docs:check`) and `pnpm build` passed.
- **Browser.** The targeted e2e journey passed. A full e2e run during development passed all 104
  other browser tests.
- **Acceptance.** `acceptance` and `mcp-acceptance` passed on both transports.
- **Real use.** The flow was used for real in the browser and once through HTTP MCP, on a scratch
  copy of `nested-projects`.
