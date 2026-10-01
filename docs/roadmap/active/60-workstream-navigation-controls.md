<!-- plan id="60" status="active" summary="Workstream user vocabulary; a gear beside the root name opens page settings; a plus beside Work creates nested work with an explicit parent" -->
# Slice 60 — Workstream vocabulary and project-column controls (Slice 59 Stage A)

## Goal

Stage A of the [Slice 59 umbrella](../planned/59-markdown-and-work-navigation.md): call a nested unit
of work a **workstream** wherever people and agents read it; open a root's page settings from a gear
beside its name in the project column; and create a workstream at any live level from a plus beside
**Work**, so nothing needs the Sub-Projects section to create work (Stage E retires it).

## Spec sections

- §19–20: the column stays presentational; state stays in `ProjectWorkspaceShell` and its
  feature store, not in `ShellStore`.
- §21–22: token-only styling, both themes, `--size-hit-target` on coarse pointers.
- §23: the project column — this slice replaces its **Manage pages** disclosure and adds Work
  creation. It is corrected in the same change.
- §26: the two kinds of project. The user-facing name of the `subproject` kind changes; the kind,
  ids, routes and tool names do not.
- §31: creation history. A new workstream's `project.add` lives in **its own** history; the
  displayed header names that history and links to it.
- §54 and §59: agent-facing descriptions use the same noun while naming the unchanged identifier.
- §62–63: live updates refresh a second tab's tree and Todos. The create is awaited, not
  optimistic.
- §68: routes are unchanged; creating does not navigate.
- §69 and §77–79: browser evidence, real use, friction notes, decision entries and the spec
  correction.

## Build

### 1. Vocabulary — "workstream"

**Decision.** Use **Workstream** (plural *Workstreams*) for the `subproject` kind in all
user-visible and agent-visible prose. The root stays **Project**, and the column heading stays
**Work**.

The umbrella's alternatives, compared against the seeds that actually hold nested work:

| Seed | Example items |
|---|---|
| `nested-projects` | Renovation › Kitchen › Cabinets (the deepest route is `/projects/project-cabinets`); completed Garden; archived Legacy attic with a live child, Legacy shelving |
| `personal-workspace` | one root and no workstreams: the empty Work state |
| `agent-heavy` | two roots and no children: the agent-facing wording only |

| Candidate | Problem |
|---|---|
| "Work unit" | Accurate but mechanical in a sentence: "Add work unit". |
| "Work item" | Collides with tasks: a task is also an item of work. |
| "Subproject" | Describes structure rather than purpose, and is the term the user asked to replace. |

"Workstream" reads naturally nested ("a workstream inside Kitchen"), completed ("Completed
workstream") and archived ("Archived workstream").

The [decision entry](#file-level-change-list) records this comparison. Step 6 of the Acceptance
check re-validates the wording in the running app. If it fails, only the map below changes.

**Vocabulary map.** This is the complete list. Every row is a string, not an identifier.

| Where | Today | After |
|---|---|---|
| `project-page-navigation.html` empty Work | "No sub-projects yet" | "No workstreams yet" |
| `pages/todos-page.ts` kind label | "Unit of work" | "Workstream" |
| `pages/reflections-page.ts` subject kind | "Unit of work" | "Workstream" |
| `archived-region/archived-region.ts` kind label | "Sub-project" | "Workstream" |
| `sections/timeline/timeline-section.ts` kind label | "Sub-project" | "Workstream" |
| `project-page-registry.ts` unavailable reason | "This unit of work has no canvas to show." | "This workstream has no canvas to show." |
| `project-page-registry.ts` §68 redirect notice (`[data-page-notice]`) | "“X” is a unit of work with a single canvas, so it has no pages." | "“X” is a workstream with a single canvas, so it has no pages." |
| `pages/todos-page.html` empty state | "…no tasks, and no units of work." | "…no tasks, and no workstreams." |
| `project-page-navigation.html` breadcrumb `aria-label` (rendered only on a workstream) | "Parent projects" | "Path to this workstream" |
| `project-more-menu.html` archive button on a workstream (`isWorkUnit()`) | "Archive project" | "Archive workstream" (a root keeps "Archive project") |
| `packages/domain/src/project-todos-service.ts`, `project-journal-service.ts`, `project-archive-service.ts` refusals | `project "…" is a unit of work; only a root project has a … page` | `project "…" is a workstream; only a root project has a … page` |
| `packages/domain/src/project-page-service.ts` refusal | "a sub-project has one work canvas…" | "a workstream has one work canvas…" |
| `packages/domain/src/project-service.ts` refusal | "…still has active sub-projects" | "…still has active workstreams" |
| `packages/domain/src/reflection-service.ts` (two refusals) | `sub-project "…" is…` | `workstream "…" is…` |
| `packages/mcp-tools/src/tools/*.ts` descriptions | "sub-project" and "unit of work" prose | "workstream" prose |

"Unit of work" in `packages/repositories` and in domain comments about transactions
(`unitOfWork.run`, `repositories/src/errors.ts`) is the persistence pattern, not the project kind.
It is not touched.

**Agent descriptions.** `get_project` and `create_project` define the noun once:
`kind "subproject" is a workstream`.

**Not renamed:**

- the stored `kind: 'subproject'`;
- the `sub-projects` section type and its identifier in `list_sections`;
- tool, field and route names;
- `WorkTreeNode` and other code symbols;
- recorded history labels;
- seed project names;
- frozen roadmap records and decision prose.

The Sub-Projects section's own copy and display name are also left alone. Stage E deletes that
section, so renaming it now would be churn on a view that is going away.

### 2. Gear — page settings beside the root name

- `ProjectPageNavigation` replaces the `<details data-project-page-manager>` disclosure with a
  `button[data-project-settings-toggle]` placed beside the root-name link in a shared row:
  - The button contains `<app-icon name="settings" />` and has the accessible name
    `Project page settings for <root name>`.
  - It carries `aria-expanded` and `aria-controls="project-page-settings"`.
  - It is a disclosure toggle, not a link, so the Slice 58 `linkSelected` delegate ignores it
    (that delegate matches only `a[href]`).
- The panel is `div#project-page-settings[data-project-page-manager]`, labelled by its heading
  "Pages". It contains the existing controls unchanged:
  - fixed Home;
  - the three optional checkboxes, with their non-optimistic `requestPageToggle` restore;
  - pending, error and **Retry refresh**.

  It stays rendered and hidden while closed, so a failed native checkbox restore still finds its
  element.
- Open state is a component-local `settingsOpen` signal (§20).
  - Gear click toggles it.
  - Escape inside the panel closes it and focuses the gear.
  - It persists across page tabs of the same routed project (`/projects/X/pages/*`).
  - It resets on any project navigation. Every `projectId` change runs `ProjectWorkspaceStore.load`,
    whose `loading` branch removes the column, and crossing between the two route shapes
    re-creates the shell. Nothing extra is needed for that.
  - It closes when `root().id` changes while the column stays mounted. That happens only when a
    live reparent applied by `refreshContext` moves the routed project to another root.
  - A collapsed column hides the panel with the column, and the gear with it.
  - A pending write keeps the panel open.
  - An outside click does nothing (a disclosure, not a popover).
- The [optional-page decision](../../decisions/2026-09-optional-page-management-lives-in-project-navigation.md)
  rules are unchanged:
  - Home is fixed.
  - Work is never toggleable.
  - The panel is root-scoped from every descendant route.
  - No unrelated settings move in.
  - `ProjectWorkspaceStore.setPageEnabled` and its retry path are untouched.

### 3. Plus — "Add workstream" with an explicit parent

- `ProjectPageNavigation` gains `button[data-work-create]` beside the **Work** heading:
  - It contains `<app-icon name="plus" />` and has the accessible name `Add workstream`.
  - It emits a new `workCreateRequested` output. The column stays presentational.
  - A new `workCreateBlocked` input (a string or `null`) covers an archived root. §31 keeps an
    archived root's page and column rendering, but the domain refuses every create under archived
    ancestry (`assertAncestryActive`). While the input is set, the plus stays focusable with
    `aria-disabled="true"`, its click is guarded, and its name reads
    `Add workstream — unavailable while <root> is archived`. This follows the
    `ProjectHistoryControls` idiom.
- `ProjectWorkspaceShell` owns a `workCreateOpen` signal and renders a new `WorkCreateDialog` as
  `@defer (when workCreateOpen()) { @if (workCreateOpen()) { … } }`, the same shape as
  `project-canvas.html`'s create dialog. A bare `@defer` would stay rendered once loaded. The
  deferred block keeps the eager bundle under budget.
  - The dialog sits inside the `store.project()` branch, so any `load()` destroys it. `load()`
    has three callers:
    - the shell's `projectId` effect, which covers project navigation and Back/Forward;
    - the shell's creation-reconciliation effect;
    - the store's own `onLiveEvent` on `prototype.reloaded`, which the shell never sees.

    So the reset is keyed on store state, not on the shell's call sites: a shell effect sets
    `workCreateOpen` to `false` whenever `store.loading()` is true. That way a finished load never
    re-mounts an emptied dialog, whatever started it.
  - It also closes when the loaded root id changes (a live reparent).
  - After a close the person chose (Create, Cancel, Escape or the backdrop), focus returns through
    `afterNextRender`, in this order:
    - to `[data-work-create]` when it is rendered and visible;
    - otherwise to the column toggle, which is the case when the column is collapsed at narrow
      width;
    - otherwise it is left alone.

    A load-driven close moves no focus; the Slice 58 request rules own that.
- `WorkCreateDialog` (new, `features/projects/work-create-dialog.*`) is presentational. It
  follows the `SectionCreateDialog` shape: `role="dialog"`, `aria-modal`, a heading
  "Add workstream", a backdrop and Escape (both ignored while busy), and a Tab cycle.
  - **Inputs:**
    - `parents`: a flattened `{ id, name, depth, completed }[]`, root first. The shell builds it
      from `store.root()` and `store.subprojectTree()`, which is already live-only: archived
      work is excluded (§31).
    - `create`: `(parentId, name) => Promise<string | null>`, which returns an error message or
      null.
  - **Output:** `closed`.
  - **Fields:** a required **Name**, focused first after render, and a **Parent** `<select>`.
    - Parent options are indented by depth with non-breaking spaces. A completed parent is
      suffixed "(completed)", because the domain allows creating under it.
    - The default is the root, even on a descendant route: the plus sits under **Work**, which
      lists the root's whole tree.
    - The chosen parent is spelled out above the submit button: "Inside Kitchen".
    - The selection is a signal holding the parent id, and the `<option>`s bind `[selected]`.
      This is the same `@for` timing trap `how.md` records for Archive.
    - If a live refresh removes the chosen parent from `parents` (archived, reparented or
      creation-undone in another tab), the selection resets to the root. A polite note then
      says "<name> is no longer available; choose another parent." It can name the parent
      because the dialog keeps the selected option's name alongside its id. The next change
      clears the note.
    - While a submit is pending, the reset is deferred: the in-flight request's own success or
      refusal decides the outcome, and the reset applies afterwards only if the dialog is still
      open.
  - **Submit** is disabled while busy, and a busy guard makes a repeated submit a no-op.
    - Success emits `closed`.
    - Failure keeps the name, the parent and the dialog open, and shows the message in
      `role="alert"`.
    - Cancel, Escape and the backdrop write nothing.
- `ProjectWorkspaceStore.createWorkstream(parentId, name)`:
  - It trims the name and refuses an empty one locally ("A workstream name is required.").
  - It refuses when nothing is loaded, or when `parentId` is neither the root nor in the current
    tree.
  - It holds a single-flight guard keyed to the load generation it began in: a second call in
    the same generation while one is pending resolves to a refusal without a request. A new
    `load()` releases it, so a slow create on one root never blocks the next root's plus.
  - It calls `gateway.projects.create({ workspaceId: root.workspaceId, kind: 'subproject', parentProjectId, name })`
    inside `reportedWrite`, reporting the **child's** `projectId`, name and receipt, as
    `SubProjectsStore.create` does today. `ProjectHistoryStore`'s handle generation already
    drops a late commit after navigation.
  - On success it calls `refreshContext()` only if the load generation is unchanged. After a new
    load, a late answer starts no context read at all.
  - It returns `null` or the error message.
- The route does not change after a create.
  - The header's existing cross-history feedback (`crossOwnerFeedback` in `history-feedback.ts`)
    says, with a curly apostrophe, `Created "<name>" was recorded in <name>’s history.` and
    offers **Open <name>**. That is the child-history receipt and the offer to open the child;
    this slice adds no new notice.
  - The tree gains the child from the context re-read, and a second tab gains it from §62's
    `project.*` frame (`rootProjectId`).
  - Creation Undo and Redo work unchanged from the child's header (Slice 42).

## Done when

On isolated `nested-projects` data, in a browser, at desktop width and at 375 px with touch:

- The gear beside the root name opens page settings on Home, Todos and a third-level workstream
  route. It works by click, by tap, and by Enter or Space. Home is fixed and there is no Work
  toggle. A refused toggle restores the native checkbox and shows the error. Escape closes the
  panel and focuses the gear.
- The plus beside Work creates a workstream at the root and inside a live nested workstream,
  with the parent shown before submit.
  - Cancel creates nothing. A double submit creates exactly one. A domain refusal keeps the
    input.
  - Parent options exclude archived work and live work under an archived ancestor, and mark
    completed work.
  - On an archived root the plus is unavailable and says why.
  - The route does not change. The header names and links the child's history.
  - A second tab's tree and Todos show the child without a reload.
  - The child's header Undo removes it, and Redo restores the same id at the same URL. No
    Sub-Projects section is involved.
- Every row of the vocabulary map reads "workstream" in the app and in `tools/list`. Every stored
  identifier and tool name is unchanged.

## Do not

- Retire, rename or restyle the Sub-Projects section (Stage E), or change shortcuts (D),
  Markdown (C) or task interaction (B).
- Rename `kind`, ids, routes, tool or field names, code symbols, recorded labels or seed data.
- Add a Work page toggle or unrelated settings to the gear panel, or move page settings into the
  header or global Settings.
- Navigate to the child after creation, paint it optimistically, or add a creation notice beside
  the header's feedback.
- Add any create path besides `gateway.projects.create`, or any new gateway method, contract,
  domain rule or MCP tool.

## Acceptance check

1. Write the specs in the test plan first, and watch each fail for the missing behaviour: no
   gear, no plus, no dialog, no store method, or the old wording.
2. Create `apps/e2e/work-navigation.spec.ts` against Playwright's own servers on isolated
   `nested-projects` data.
   - **Desktop, both themes.** Run the gear on Renovation Home, Renovation Todos and
     `/projects/project-cabinets`:
     - keyboard open with Enter and Space;
     - fixed Home, no Work control;
     - the seed enables Reflections, so disable it, assert the tab disappears, re-enable it and
       assert the tab returns;
     - route `PATCH /api/projects/<root>/pages/reflections` to a 409 and assert the checkbox
       reverts and the alert shows;
     - press Escape and assert focus is on the gear.
   - **Plus at the root.** Cancel and assert the `GET /api/projects` count is unchanged.
     - Assert the Parent options: Renovation first, then Kitchen and Cabinets indented, and
       Garden marked "(completed)". Legacy attic (archived) and Legacy shelving (live under it)
       are absent.
     - Create "Paint samples" at the root, double-clicking Create. Assert exactly one new project
       whose `parentProjectId` is the root, and that the URL is unchanged.
     - Assert the header feedback reads `Created "Paint samples" was recorded in Paint samples’s
       history.` (curly apostrophe), and that its Open link goes to the child.
   - **Plus on a nested route.** On `/projects/project-cabinets`, choose Kitchen, assert
     "Inside Kitchen", create, and assert the parent id via the API.
   - **Stale parent, live.** Open the dialog with Garden chosen and archive Garden through the
     API. Garden is the completed leaf: Kitchen cannot be archived while Cabinets is live. Wait
     for the live refresh, then assert that the selection reset to the root and the note shows.
     This step runs after the parent-options assertion, which needs Garden present.
   - **Real domain refusal.** This runs in a fresh page whose event stream is aborted before
     `goto`, so no frame can reset the selection.
     - The stream URL carries a query string, so the route uses a predicate:
       `page.route((url) => url.pathname === '/prototype/events', (route) => route.abort())`.
     - The adapter's backoff retries are aborted too and may log `net::ERR_FAILED`. This page
       filters those console errors out of the usual collector.
     - Choose Cabinets in the dialog, archive Cabinets through the API, and submit.
     - Assert the host's refusal shows in the alert, with name and parent kept.
     - Assert through the API that no project was created.
   - **UI path for a transport failure.** Route a `POST /api/projects` 500 and assert the dialog
     keeps name, parent and the alert. This proves only the UI path; nothing reaches the host.
   - **Archived root.** Create a childless scratch root through the API and archive it (a root
     with live workstreams refuses archiving). Open it and assert the plus is `aria-disabled`, names
     its reason and opens nothing.
   - **Second tab.** Before the "Paint samples" create, open a second page on Renovation Todos
     and wait for its `/prototype/events` 200, as the existing journeys do. After the create,
     assert that the new workstream appears in its column (`[data-work-project-id="<child>"]`)
     and as a Todos row labelled "Workstream", without a reload.
3. Rewrite the two `project-creation-history.spec.ts` journeys so they never touch the
   Sub-Projects section.
   - Delete the section-creation steps: journey 1's `[data-empty-canvas-add]` →
     `sub-projects`, and journey 2's API-added Sub-Projects section on Kitchen.
   - Create through the plus. Journey 2 chooses Kitchen in Parent, because the default is the
     root.
   - Replace the `watcherFrame` and `parentWatcherFrame` assertions with column assertions on
     `[data-work-project-id="<child>"]` in the root and parent watcher tabs.
   - Keep the remaining assertions: same-id Redo at the same URL, cross-owner not-found, and
     the watcher refresh of ancestor work, Todos and Archive.
4. Update the page manager journeys in `web.spec.ts`, `page-history.spec.ts` and
   `project-history.spec.ts`: open through the gear, not `summary`, and keep their assertions.
   Add a 375 px touch case to `phone-layout.spec.ts`:
   - expand the column, tap the gear and toggle a page;
   - tap the plus and create;
   - assert no horizontal overflow on `main` or the document;
   - assert the dialog fits;
   - assert focus returns to the plus.
5. Run `pnpm test`, `pnpm lint` (includes `docs:check`), `pnpm build` (record initial bundle vs
   the 1050 kB budget), `pnpm storybook:build`, then the targeted Playwright files, then the full
   `pnpm e2e` once. Then run `pnpm --filter @cwm/prototype-host mcp-acceptance`, because the tool
   descriptions changed.
6. Real use:
   - Start `pnpm dev:host` and `pnpm dev:web` separately against isolated `nested-projects` and
     `personal-workspace` files.
   - Create, nest, complete and archive workstreams; read Todos, Archive, Reflections and
     Timeline wording.
   - Connect an MCP client and confirm the agent maps "add a workstream" to
     `create_project kind:"subproject"`.
   - Record friction, and the wording verdict, in `.prototype/notes.json` with
     `CURRENT_SLICE = 60`.
   - Report exact commands, results and limits in Outcome.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/features/projects/project-page-navigation.ts`, `.html`, `.scss` | modify | Root row with gear; settings panel replacing `<details>`; `settingsOpen` signal, Escape, close on root change; Work heading row with plus, `workCreateRequested` and `workCreateBlocked`; "No workstreams yet" and the breadcrumb label; `Icon` import; token styles and coarse-pointer hit targets. |
| `apps/web/src/app/features/projects/project-page-navigation.spec.ts`, `.stories.ts` | modify | Cases below; stories for panel open, pending and error. |
| `apps/web/src/app/features/projects/work-create-dialog.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts` | create | Presentational dialog: name, parent, busy/error and focus. |
| `apps/web/src/app/features/projects/project-workspace-shell.ts`, `.html` | modify | `workCreateOpen` (reset by an effect while `store.loading()` and on a root change), parent options, `workCreateBlocked` for an archived root, `@defer`+`@if` dialog mount, the create callback, focus return after a chosen close. |
| `apps/web/src/app/features/projects/project-workspace-shell.spec.ts` | modify | Shell cases below; existing page-manager cases open through the gear; the two §68 redirect-notice cases (around lines 480 and 1066) pin "workstream". |
| `apps/web/src/app/features/projects/project-workspace-store.ts`, `.spec.ts` | modify | `createWorkstream`, its generation-keyed single-flight guard, the reported child receipt, and the guarded refresh. |
| `apps/web/src/app/features/projects/pages/todos-page.ts`, `.html`, `pages/reflections-page.ts`, `archived-region/archived-region.ts`, `sections/timeline/timeline-section.ts`, `project-page-registry.ts`, `project-more-menu.html`, and their specs (`todos-page.spec.ts`, `reflections-page.spec.ts`, `archived-region.spec.ts`, `timeline-section.spec.ts`, `project-page-registry.spec.ts`, `project-header.spec.ts` for the More menu) | modify | Vocabulary map rows, each pinned by a spec that fails first on the old string. |
| `packages/domain/src/project-page-service.ts`, `project-service.ts`, `reflection-service.ts`, `project-todos-service.ts`, `project-journal-service.ts`, `project-archive-service.ts` and their `.test.ts`; `packages/mcp-tools/src/registry.test.ts` | modify | Refusal wording. Each changed message gets an assertion that names "workstream" and fails first; the existing `/one work canvas and no pages to configure/` regexes do not contain the old word, so they are strengthened. |
| `packages/mcp-tools/src/tools/projects.ts`, `project-pages.ts`, `reflections.ts`, `sections.ts`, `shortcuts.ts`, `tasks.ts`, `undo.ts`; `packages/mcp-tools/src/contract.test.ts` | modify | Description prose; one test pins the definition in `create_project` and `get_project`, and the absence of "sub-project" and "unit of work" prose in every description; the quoted identifiers `"subproject"` and `sub-projects` are excepted. |
| `apps/e2e/work-navigation.spec.ts` | create | Acceptance step 2. |
| `apps/e2e/project-creation-history.spec.ts`, `web.spec.ts`, `page-history.spec.ts`, `project-history.spec.ts`, `phone-layout.spec.ts` | modify | Acceptance steps 3–4. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 60` when implementation starts. |
| `apps/web/src/app/prototype/design-lab/panels/primitive-panels.html` | no change | Its note names the Sub-Projects section row, which still exists until E. |
| `.prototype/notes.json` | modify on real use | Friction and wording verdict. |
| `docs/decisions/2026-09-workstream-user-terminology.md` | create | §78: the noun, alternatives, scope of the map, what is deliberately not renamed. |
| `docs/decisions/2026-09-project-navigation-gear-and-work-create.md` | create | §78: gear placement and disclosure semantics; plus, explicit parent, root default, no navigation, the header feedback as the child receipt. |
| `docs/decisions/2026-09-optional-page-management-lives-in-project-navigation.md`, `2026-09-project-workspaces-and-subproject-work-units.md` | modify (append dated amendment) | Disclosure now behind the gear; user-facing name of the kind. |
| `docs/decisions/README.md` | modify | Index both entries. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | modify | Dated §23 correction (gear, plus); dated §26 and §54 ("Roots, work units and pages") notes that the `subproject` kind is called a workstream in people's and agents' prose. |
| `docs/architecture/web/projects/overview.md`, `what.md`, `how.md`, `why.md` | modify | Column controls, dialog, store method, vocabulary; why links both decisions. |
| `docs/architecture/mcp-tools/how.md`, `why.md` | modify | The description vocabulary rule and its contract test; link the terminology decision. |
| `docs/architecture/domain/why.md` | modify | Link terminology decision (refusal wording). |
| `docs/architecture/testing/what.md`, `how.md` | modify | E2E inventory gains `work-navigation.spec.ts`; the creation-history description (how.md around lines 94–98) says the journeys create through the plus and assert the column, not a Sub-Projects section. |
| `docs/guides/mcp-setup.md`, `docs/guides/first-milestone-walkthrough.md` | modify | Workstream prose (kind identifier kept); walkthrough step for gear and plus. |
| `docs/roadmap/planned/59-markdown-and-work-navigation.md` | modify | Stage A → Slice 60 link (as the Slice 34 umbrella recorded its children). |
| `docs/roadmap/goals.md`, generated `progress.md` | modify | Now names Slice 60 active. |

## Test plan — tests first

| Test | Proves |
|---|---|
| `project-page-navigation.spec.ts: gear sits beside the root name and discloses page settings` | Name, `aria-expanded`, `aria-controls`; the panel is hidden then shown; there is no `<details>`/"Manage pages". |
| `…: settings stay root-scoped on a workstream route` | With `currentProjectId` a descendant: fixed Home, three optional controls, no Work control. |
| `…: Escape in the panel closes it and focuses the gear` | Focus return; Escape outside the panel does nothing. |
| `…: a changed root with the same currentProjectId closes the panel; a pages change does not` | The live-reparent close; a page-toggle refresh keeps it open. |
| `…: failed toggle still restores the native checkbox` | The existing restore survives the move out of `<details>`. |
| `…: gear and plus do not report linkSelected` | The Slice 58 delegate fires only for links. |
| `…: plus requests work creation; empty Work says "No workstreams yet"` | Output and copy. |
| `…: a blocked plus is aria-disabled, names its reason and emits nothing` | Archived-root guard; the button stays focusable. |
| `…: breadcrumbs are labelled "Path to this workstream"` | Vocabulary row. |
| `work-create-dialog.spec.ts: focuses name; parent defaults to root and lists the indented live tree with completed marked` | Options and default. |
| `…: shows "Inside <parent>" for the chosen parent` | Explicit parent before submit. |
| `…: cancel, Escape and backdrop call nothing` | Zero writes. |
| `…: a repeated submit while pending calls create once` | Duplicate guard. |
| `…: failure keeps name, parent and dialog with an alert; success emits closed` | Draft retention. |
| `…: Tab cycles inside; Escape ignored while busy` | Modal focus. |
| `…: a chosen parent that leaves parents resets to the root with a note naming it; while busy the reset waits for the answer` | Stale-parent rule; kept name; `[selected]` follows the signal. |
| `project-workspace-store.spec.ts: createWorkstream creates under the chosen parent and reports the child receipt` | Fake gateway: `parentProjectId`, reporter `projectId` = child. |
| `…: refuses empty name, unknown parent and a second same-generation call while pending, without a request` | Local guards. |
| `…: a new load releases the pending guard` | A slow create cannot block the next root's plus. |
| `…: a late answer after a new load starts no context read` | Counts `projects.get`/`pages.list` calls after the answer; fails without the generation check. |
| `…: success refreshes the work tree with live updates silenced` | The explicit refresh, not a frame, adds the child. |
| `…: a domain refusal returns its message and changes nothing` | The fake gateway rejects as the domain does under archived ancestry. |
| `project-workspace-shell.spec.ts: plus opens the dialog with root-first parents; success closes and returns focus to plus` | Wiring and focus. |
| `…: navigating to another root closes an open dialog` | No stale dialog. |
| `…: a reload while open (same-root project change, prototype.reloaded) closes the dialog and does not reopen it` | The `store.loading()` reset covers store-initiated loads; the `@if` guard. The fake gateway holds `projects.get` on a deferred promise, so the spec can see the dialog gone while loading and then not return after the release. |
| `…: an archived root blocks the plus` | `workCreateBlocked` wiring. |
| `…: narrow column collapsed after close focuses the toggle` | Focus fallback. |
| Vocabulary specs (`timeline-section.spec.ts`, Todos/Reflections/Archive specs) | New wording; red first on the old string. |
| `project-page-service.test.ts`, `project-service.test.ts`, `reflection-service.test.ts`, `project-todos-service.test.ts`, `project-journal-service.test.ts`, `project-archive-service.test.ts`, `registry.test.ts` (mcp-tools) | Each changed refusal pinned on "workstream", red first. |
| `contract.test.ts: agent descriptions name workstreams and keep the subproject identifier` | Definition in `create_project`/`get_project`; no stray "sub-project" or "unit of work" prose. |
| `work-navigation.spec.ts` (Playwright) and the updated journeys | Everything jsdom cannot show: real focus, touch, overflow, two tabs, routed failures, creation Undo/Redo without the section. |

## Boundaries touched

- **Gateway only.** The UI writes through `WORK_MANAGER_GATEWAY.projects.create` and
  `pages.setEnabled`. There is no new gateway method and no concrete adapter.
- **Presentational components.** `ProjectPageNavigation` and `WorkCreateDialog` inject no store
  or gateway. State lives in the routed shell and `ProjectWorkspaceStore`. `ShellStore` and
  `core/` are untouched (§20).
- **Domain.** Only the message strings change. There is no new rule, edge or `Date`.
- **MCP.** Only the description strings change. Tools still call services.
- **Contracts.** Nothing changes, and no parallel types are introduced. The parent-option shape
  is view state local to the shell.
- **Styles.** Tokens only.
- **Flags.** There is no prototype-mode branch.

## Explicit non-goals

- The Sub-Projects section (Stage E), shortcuts (D), Markdown (C) and task rows (B).
- Moving or reparenting workstreams from the plus dialog. The header's existing project update
  owns that.
- Choosing an icon, a description or a due date at creation. These are edited afterwards in the
  header, as today.
- A remembered last parent.
- Deep-link or route state for the dialog or the panel.
- An outside-click dismissal of the panel.
- Renaming code symbols such as `subprojectTree`.

## Open questions

None blocking. These are the defaults, recorded in the decision entries and confirmed or revised
by real use:

- "Workstream" survives the wording pass.
- The parent defaults to the root, even on a descendant route.
- After a create the person stays on the current page, and the header's existing feedback is the
  way to open the child.

## Revisions

- **Initial plan (2026-09-30):** Derived from the umbrella's Stage A after reading the column,
  the shell, the workspace store, `SubProjectsStore`, `SectionCreateDialog`, history feedback,
  the domain's create rules, the MCP descriptions and the e2e journeys that use **Manage pages**
  and "Create child".
- **Review round 1 (2026-09-30):** Each finding was checked against the code before revising.
  - **Vocabulary map completed.** Added the §68 redirect notice, the Todos empty state, the
    three root-page refusals in the domain, the breadcrumb label and the workstream archive
    button. Repository and transaction "unit of work" is explicitly excluded. The contract test
    now forbids "unit of work" prose as well.
  - **Panel lifetime corrected.** Any project navigation reloads the store and removes the
    column. The panel persists only across page tabs of one routed project, and the root-change
    close covers a live reparent.
  - **Dialog mount.** `@defer` + `@if`, with `workCreateOpen` reset on every `load()`, so Back,
    a seed reload or reconciliation cannot re-mount an emptied dialog.
  - **Archived root and stale parent.** The plus is `aria-disabled` with a reason on an archived
    root. A parent that leaves the live tree resets the selection with a note. A real domain
    refusal is proved with the event stream aborted. The routed 500 is described as UI-path
    evidence only.
  - **Store guard tests.** They now fail without their guards: no context read after a late
    answer, live updates silenced for the refresh test, and the pending guard released by a new
    load.
  - **Acceptance steps fixed.**
    - Seed facts corrected; Reflections starts enabled, so the step disables then re-enables it.
    - The stale-parent case uses Garden, because Kitchen cannot be archived with Cabinets live.
    - The parent-options exclusions are asserted.
    - The creation-history journeys drop their Sub-Projects section steps and assert the column
      instead.
    - The feedback's curly apostrophe is quoted exactly.
  - **Red-first tests.** Every changed domain refusal gets one.
  - **Docs.** Added the §54 vocabulary note, named `mcp-tools/how.md`, and covered the
    creation-history description in `testing/how.md`.
- **Review round 2 (2026-09-30):** The reviewer confirmed ten round-1 findings resolved and the
  dialog-mount finding partly resolved.
  - **N1 (substantive).** `prototype.reloaded` reloads inside the store, and reconciliation calls
    `load()` from a second effect. The dialog reset is therefore keyed on `store.loading()`, not
    on the shell's project effect.
  - **Minor fixes:**
    - The aborted event stream uses a pathname predicate and filters the retry noise.
    - The second tab opens and connects before the create.
    - The dialog keeps the chosen parent's name for the note, and defers a stale-parent reset
      while a submit is pending.

  The reviewer verified the archived-root column, the Garden, Cabinets and scratch-root
  archives, and the `[selected]` binding against the code, and reported no other substantive
  findings.
- **Review round 3 (2026-09-30):** The reviewer confirmed N1–N5 resolved. It checked the
  `store.loading()` reset against the shell and the store:
  - the initial load writes an unchanged `false`, so it notifies nothing;
  - the effect cannot feed back into itself;
  - `load()` raises `loading` synchronously;
  - a quiet `refreshContext` keeps the dialog open.

  One minor note was adopted: the reload spec holds the fake gateway's read pending, so that it
  exercises the reset. No substantive findings remain, and the plan is ready for implementation.
