<!-- plan id="41" status="active" summary="Always-present Undo/Redo icons in the project header, driven by the server history summary, with per-step availability, subject-naming labels and write reporting from every browser surface" -->
# Slice 41 — Project header Undo/Redo controls (Slice 34 Stage C4)

<!-- The first line is the state marker; scripts/roadmap.mjs owns it. While the plan is in
     planned/ keep only the first five sections and keep them short. When it starts (roadmap.mjs
     start), write the rest per AGENTS.md step 1, then revise it through review (step 2) and
     record the rounds under Revisions. Before roadmap.mjs complete, write Outcome. -->

## Goal

Give every project page two always-present header icons that Undo and Redo the viewing actor's
next step in the displayed project's history, driven by the server summary, and retire the
canvas-local Undo notice as a competing action surface.

## Spec sections

Main §26 (the header's structure gains the two controls), §31 (the browser half of operation
history: what the person is offered, where, and for how long), §§19–21 (scoped feature store,
presentational header, tokens only), §23 (header once per project, on every page), §54 (the
`get_operation_history` summary shape), §§61–63 (summary route, live frames and pending/optimistic
state), §68 (every project route shows the header), §§69–70 and §§77–79. Slice 34's *Controls*,
*History scope* and *Granularity* rows and its *API/MCP, gateways and UI state* section.

## Build

- Answer Slice 39's open question in the contract: each summary entry says whether **that step**
  is blocked, so a control never infers availability from the project-level `blockedBy`.
- Make history labels name what changed and to what: shortcut placements name their source,
  project updates name the kind of edit (the Slice 37 and 39 real-use notes).
- Add a core reporting token that browser writers use to announce begin/end and committed
  receipts; a project-scoped `ProjectHistoryStore` at `ProjectWorkspaceShell` implements it,
  owns the summary, the pending transition and feedback.
- Add `ProjectHistoryControls` to `ProjectHeader`: two icon buttons with naming accessible labels
  and disabled reasons, and one polite feedback line including cross-owner guidance.
- Report from every browser write site, then remove the notice's Undo button and receipt
  holding from the canvas and the Reflections page, keeping its non-Undo recovery (Open Archive,
  Retry remove, Retry refresh).

## Done when

On every root page (Home, Todos, Archive, Reflections), a subproject's work page, and an empty
or read-only state, both icons render; each is enabled exactly when the server summary offers
that step and it is unblocked, and its accessible name says what it will undo or redo or why it
cannot. A write anywhere on the page updates the controls without a reload; a write that
recorded into another project's history says so with a link. Undo and Redo through the header
change content and re-render every open surface; stale, refused and failed transitions show
their reason and leave the controls consistent with the server. Navigation and reload show the
same history. Archiving a project from its header leaves the person on that project with its
Undo enabled. No surface other than the header offers Undo.

## Do not

- No project creation Undo or missing-project recovery route (next Stage C phase), no transition
  retry cache, no Stage D work (cascade-only removal, task Delete icon, Archive filtering,
  Settings → Archived projects), no keyboard shortcuts, no history list or browser, no new
  operation kinds, no schema version change, no production infrastructure.

## Phase boundary and repository findings

Read for this plan: Slice 34's direction, the Slice 35–40 outcomes, `.prototype/notes.json`
(`note-2026-09-20-001`, `note-2026-09-22-001`, `note-2026-09-22-002`), spec §§26 and 31,
`docs/architecture/web/projects/how.md`, and the code named below.

**Why this phase is next.** Stage C's remaining work is project creation Undo with its recovery
route, persistent header controls with receipt reporting, and the transition retry cache. The
Slice 37 note asks for the header controls "before any more families are recorded": a removed
section offers an Undo notice while a removed shortcut directly beneath it offers nothing. The
recovery route for creation Undo exists so that **Redo stays reachable**, which presupposes a
Redo control; building the controls first makes that phase smaller. The retry cache is an
independent robustness change and stays deferred.

**What the server already provides.** `GET /api/projects/:id/history` answers
`OperationHistorySummary` (`packages/contracts/src/operation-history-public.ts`): `historyId`
(null before the actor's first write), `revision`, the next `undo` and `redo` entries (id,
operation kind, label, expiry — an expired next action is omitted), and the project-level
`blockedBy`. `POST /api/history/:historyId/transition` takes `{ actionId, direction,
expectedRevision }` and answers `{ direction, actionId, result, summary }`; every refusal's 409
`details` carries the caller's current `summary` (`OperationHistoryRefusalDetailsSchema`). The
gateway already has `history.summary` and `history.transition`
(`apps/web/src/app/core/gateway/work-manager-gateway.ts`), and the fake has a one-history stand-in.
Nothing browser-side reads `summary` today.

**The per-step blocker gap.** `OperationHistoryService.summaryOf` reports `blockedBy` from the
project chain, while `transitionBlocker` exempts an archive's Undo, a reactivation's Redo and an
archived-throughout edit (Slice 39). A header that disabled both icons whenever `blockedBy` is set
would make an archive impossible to undo from the header of the archived project. Each entry
therefore gains `blockedBy: { projectId, title } | null`, computed by the same
`transitionBlocker` for that entry's action and direction. The top-level `blockedBy` stays — it
describes the project, and MCP clients read it — and is documented as project-level.

**Archiving no longer leaves the page.** Today `ProjectWorkspaceShell.confirmArchive` navigates to
`/app` after a successful archive (`project-workspace-shell.ts`, recorded in
`2026-08-project-create-edit-archive-surface.md`: "archive is awaited, because it navigates"). The
dashboard has no project header, the shell and its history store are destroyed, and the archived
project is out of the sidebar — so the one step the per-step blocker exists for would be reachable
only by typing a URL. This phase changes it: a successful archive **stays on the archived project's
page**, which §31 already keeps rendering, with the header showing status `archived` and an enabled
`Undo: Archived "X"`, plus the header feedback "X is archived. Undo is available here." The shell
still awaits the archive; when it returns true the shell calls `ProjectHistoryStore.announce(...)`
with that sentence (the archive's own receipt, being same-history, earns only a re-read), and it no
longer navigates. The decision
gets a dated amendment, and the shell spec's archive-navigates case is inverted. Two consequences
follow. The More menu's confirmation copy ("It leaves the sidebar and this page closes.",
`project-more-menu.html`) becomes "It leaves the sidebar; you can undo it from the header.", and
the menu stops offering Archive on a project whose status is already `archived` (that PATCH is a
no-op, which would otherwise earn the archive feedback). And `ProjectWorkspaceStore.archive()`
passes `paint: null`, so `writeProject` never applies the server record; it now applies the
returned project on success so the header reads `archived` without waiting for a frame, and its
doc comment ("the write whose result the user never sees on this page") is corrected.

**History scope in the browser.** A history is exact actor + owning project. The header shows the
**displayed project's** history: a root's pages all show the root's; a subproject's work page shows
the subproject's. Writes that record elsewhere are real and common: completing a descendant's task
from root Todos, restoring a descendant's row or section from root Archive, and any row write
whose owning project is not the displayed one. For those the store shows
"Completed "Tile" was recorded in Kitchen's history." with an **Open Kitchen** link to
`/projects/<id>`, and the header's own summary does not change.

**The store decides ownership from `historyId`, never from a writer's guess.** `OperationReceipt`
carries no `projectId`, and the owner is not always obvious at the write site: a shortcut write
records in the destination root; a task list rendered inside a Home shortcut writes a task owned by
the **source** subproject; a reactivation restored from root Archive records in the reactivated
project; Open archive from a nested work route records a `page.add` in the root
(`note-2026-09-22-001`). The rule is therefore: a report whose `receipt.historyId` equals the held
`summary.historyId` re-reads; while the held `historyId` is `null` (no write yet by this actor here)
**every** non-null report re-reads, and if the fresh summary's `historyId` still differs from the
receipt's, the report was cross-owner. The report's `projectId`/`projectName` word and link cross-owner feedback, so they come from the
write's **response**, never from the page the writer sits on: `task.projectId`,
`reflection.projectId`, the section's or page's `projectId`, the updated project's id, the
destination root for a shortcut. A wrong id would send the person to a header that does not show
the step.

**Labels.** Labels are captured at record time and stored on the action, so a change affects new
actions only; retained actions keep their older text until they expire (24 h). Two families get
new text, each built by one pure exported helper beside its capture function:

| Kind | Today | After |
|---|---|---|
| `shortcut.update` | `Updated a shortcut` | `Collapsed the Tasks shortcut` / `Expanded the Tasks shortcut` / `Resized the Tasks shortcut` / `Updated the Tasks shortcut` (both fields) |
| `shortcut.move` | `Moved a shortcut` | `Moved the Tasks shortcut` |
| `shortcut.remove` | `Removed a shortcut` | `Removed the Tasks shortcut` |
| `shortcut.add` | `Added a shortcut to Tasks` | `Added the Tasks shortcut` (aligned with the others) |
| `project.update` | `Updated "Garden"` / `Completed` / `Moved` | one-field verbs: `Renamed "Old" to "New"`, `Completed "X"`, `Reopened "X"` (status leaving `completed`), `Set "X" to On hold` / `Active` / `Planning` (any other status change), `Moved "X" under <new parent name>`, `Changed the layout of "X"`, `Changed progress for "X"`, `Changed the target date of "X"`, `Edited the description of "X"`, `Changed the icon of "X"`; more than one user-facing field → `Edited "X"`. Field groups that count as **one** field: `status`+`completedAt`; `progressFormula`+`manualProgress` (the progress section writes both together). |

The shortcut label names the **source section** (`nameOf`), read with a plain repository `find`
inside the unit — **not** through `requireSource`/`assertSourceScope`, because removal is allowed
when the source is archived or hidden and a label must never add a refusal. When the source cannot
be read the label falls back to today's text (`Removed a shortcut`). `ProjectService.update` loads
the new parent only inside `assertParentIsUsable`/`assertAncestryActive` and does not keep it, and
`commit` is shared with `archive`; the parent's name is therefore read once more inside the same
unit, only when `parentProjectId` changed, and passed to `projectWriteLabel`. Activity summaries
(`'Updated a shortcut'` in `record(...)`) are unchanged: Activity text is a separate contract with
its own readers, and changing it is not needed for the controls.

**Reporting and pending state.** Writers live in ten stores across the projects and tasks
features (inventory below; the shell store's project create is core and unrecorded). A core interface keeps `tasks → projects` and `core → feature` edges out:

```ts
// apps/web/src/app/core/history/operation-history-reporter.ts
export interface OperationWriteReport { projectId: ProjectId; projectName?: string; receipt: OperationReceipt | null }
export interface OperationHistoryReporter {
  /** Marks one write in flight; the returned function ends it and is idempotent. */
  begin(): () => void;
  /** A committed write's receipt (or null for a no-op), with the project whose history it names. */
  committed(report: OperationWriteReport): void;
}
export const OPERATION_HISTORY_REPORTER: InjectionToken<OperationHistoryReporter>; // root default: inert
```

The inert root default keeps every store usable outside a project workspace (the dashboard, specs,
Storybook) without an `if`. `ProjectWorkspaceShell` provides `ProjectHistoryStore` and
`{ provide: OPERATION_HISTORY_REPORTER, useExisting: ProjectHistoryStore }` in `providers` (not
`viewProviders`, which projected and outlet-rendered content would not see); every store inside the
shell's element injector tree gets it. Because the inert default would hide a wiring mistake, a
shell spec asserts the resolved reporter for the page store, a task-list store inside a Home
shortcut, and the Todos, Archive and Reflections page stores rendered through `NgComponentOutlet`. `begin()` captures the store's navigation generation; the ending
function decrements only the counter of that generation, so an old response cannot unblock a new
project's controls, and calling it twice is harmless. Writers call `begin()` before the request and
the end function in `finally`, and `committed(...)` once the envelope arrives, before any follow-up
read. The two dev-panel writers (`project-layout-control.ts`, `state-inspector-store.ts`) are
outside the shell: they get the inert default and the header catches up from the live frame. That is
acceptable for prototype tooling and recorded, not a gap in the product surface.

**Store behavior.** `ProjectHistoryStore` has three read states — `loading`, `ready`,
`unavailable` (the read failed; the controls say "History unavailable" and a **Retry** re-reads,
read-only); `ready` holds the summary. It loads on `load(projectId)` (called by the shell's
existing project effect; note that Home ↔ other root pages cross route shapes and re-create the
shell, so every such navigation starts in `loading`, never shows "Nothing to undo" before the read
lands). It re-reads (coalesced: at most one read in flight, one queued) on: a committed report per
the `historyId` rule above; a live frame whose `projectId` is the displayed project; any
`isProjectRecordEvent` frame (an ancestor's archive or reactivation changes `blockedBy`);
`prototype.reloaded` (seed, reset and clock changes, which carry no `projectId`, replace histories
and move expiry); reconnect. Responses carry the generation they were requested under and are
dropped if navigation moved on; within one history a summary with a lower `revision` than the one
held is dropped, so a slow read cannot roll the controls back.

**Pending covers the whole write, including its re-read.** A write is pending from `begin()` until
its end function runs **and** the re-read its `committed(...)` owed has landed. An owed read is
satisfied only by a summary **requested after** `committed(...)` — an in-flight read that started
before the commit is not enough, and for a same-history receipt the summary must also have
`revision >= receipt.revision`. Cross-owner classification is made only from such a read, so the
person's own first write (held `historyId` still `null`) is never misfiled as cross-owner. A report
that arrives while the store is `loading` is treated like a `null` held history. A report with
`receipt: null` (a no-op) owes nothing. Owed reads belong to a generation: navigation drops them
with everything else, and `prototype.reloaded` starts a new generation too, so a restored document
that happened to reuse a history id could not pin the controls through the revision guard. If the owed read fails, pending ends and the store moves to `unavailable` with
Retry, keeping the committed change's recovery reachable after a retry (Slice 34's
committed-write/read-failed rule). Without that, the window between
`finally` and the re-read would enable the controls on the pre-write entry, and a click would earn
a stale-revision refusal worded as if someone else had changed the history.

A write whose request fails at the transport level or with a 5xx may still have committed, and
its `committed(...)` never runs; its end function then also asks for a re-read, with the same owed
semantics, so the controls do not sit on the pre-write entry until a frame arrives.

Undo/Redo send the held entry's `actionId` and the held `revision`; one request at a time (a second
click while pending does nothing). The result's `summary` replaces the held one; a refusal's
`summary` does too, and its reason becomes feedback. A transport error or 5xx — where the response
may have been lost after the transition landed — re-reads the summary rather than assuming either
outcome. The controls are disabled while a transition is pending, while any write is pending, while
the store is not `ready`, while there is no entry, or while that entry's `blockedBy` is set.

**Navigation during a transition.** Undoing a `page.add` for the page being viewed sends the shell
back to Home (Slice 38), which crosses route shapes and destroys the store mid-transition. The
store's destroy hook marks its generation dead; a late result is dropped without error, and the new
shell's `load` shows the fresh summary. The transition's own feedback is lost in that case; the
changed header label is the confirmation. Recorded, not engineered around.

Content reconciliation after a transition is **not** the header's job: every open surface
already re-reads on the transition's live frame (verified by the Slice 37–39 journeys, which ran
transitions through the route), and reconnect re-reads what a dropped stream missed. The store does
not hold rows, sections or receipts beyond the latest report.

**Feedback copy.** The pure helpers that word refusals and results today
(`undoFailureNotice`, `undoResultMessage`, `NEXT_STEP_COPY`, the notice's `guidanceFor`) move out of
`project-page-store.ts` and `section-undo-notice.ts` into
`features/projects/history/history-feedback.ts`, rewritten for both directions ("Undo"/"Redo").
`history_revision_stale` and `history_not_next` adopt the carried summary and say the history
changed elsewhere; `history_retired` says which step was skipped; `history_conflict` lists each
conflict's subject and next step; `history_blocked` names the blocking project; `history_unavailable`
keeps its two sentences; `history_expired` and a 404 re-read the summary. A removal Undo whose result
is `partial`/`fallback-page` says where the section landed (the Slice 38 note).

**Retiring the notice's Undo.** With the header, the canvas notice's Undo would be a second button
for the same step. The canvas and Reflections page stop capturing receipts for Undo: remove
`undoOperation`, `newestReceipt`, `supersedesReceipt`, `captureUndoReceipt` and the Undo focus
choreography in `project-canvas.ts`. The notice keeps only what the header cannot do: after a
removal whose `archiveListed` is not `false`, "Removed the Notes section. Undo is in the header."
with **Open Archive**; the uncertain-removal **Retry remove**; and **Retry refresh** after a
committed write whose follow-up read failed. It is renamed `SectionRecoveryNotice`
(`section-recovery-notice.*`, `data-recovery-notice`) because a component named for Undo that
offers none is stale documentation. A forward write (add, move, settings) shows no notice unless
its follow-up read failed — the header's label is its confirmation. The repeat-removal refusal that
hands the exact actor its earlier receipt in `details` (the `already-removed` path) now reports that
receipt through `committed(...)` instead of holding it. The `@defer (when …)` conditions in
`project-canvas.html` and `reflections-page.html` switch to the recovery-notice state.

**Controls and accessibility.** Both buttons are always focusable: unavailability is
`aria-disabled="true"` with a guarded click, never the native `disabled` attribute, which would
drop them from the tab order and hide the disabled reason from keyboard users (Slice 34's Controls
row: labels and tooltips name the action or the reason, no hover-only recovery). The accessible
name and `title` are the same string: `Undo: <label>`, `Redo: <label>`, `Nothing to undo`,
`Nothing to redo`, `Undoing…` / `Redoing…` (on the clicked control while its transition is
pending; the other reads `Saving a change…`), `Loading history…`, `History unavailable`, `Saving a change…`,
`Undo unavailable while <title> is archived` or `Redo unavailable while <title> is archived`. Each button meets `--size-hit-target`.

**Browser write inventory** (every site reports; paths under `apps/web/src/app/`):

| Store | Writes |
|---|---|
| `features/tasks/task-list-store.ts` | create, complete, move (`update` sectionId), archive, update |
| `features/projects/pages/todos-page-store.ts` | task complete, project complete |
| `features/projects/pages/archive-page-store.ts` | project status, section, task, reflection restore |
| `features/projects/pages/reflections-page-store.ts` | container add, reflection create |
| `features/projects/sections/reflections/reflections-store.ts` | create, saveEdit |
| `features/projects/project-page-store.ts` | section create/move/update (resize, settings)/remove, including the recovered `already-removed` receipt; shortcut create/update/move/remove. (No browser surface calls `sections.duplicate`.) |
| `features/projects/project-workspace-store.ts` | page setEnabled, project update |
| `features/projects/sections/progress/progress-store.ts` | project progress update |
| `features/projects/sections/sub-projects/sub-projects-store.ts`, `core/shell/shell-store.ts` | project create — **not recorded** (creation Undo is the next phase); no report |
| `prototype/dev-panel/project-layout-control.ts`, `state-inspector-store.ts` | outside the shell; inert reporter; live frame |

## Acceptance check

Run against isolated test data (the e2e servers), seeds `nested-projects` and `personal-workspace`.
Assert returned ids, not "some row exists". The persona is the seed's default person unless a step
says otherwise; `nested-projects` roots are `project-renovation` (Home renovation) with subprojects
`project-kitchen`, `project-cabinets`, `project-garden`, and the archived `project-legacy` with its
live child `project-legacy-child`.

1. **Controls everywhere.** Open Home renovation's Home, Todos, Archive and Reflections, Kitchen's
   work page, `project-legacy` (archived) and `project-legacy-child` (live under an archived
   ancestor), a page-unavailable fallback (`/projects/project-kitchen/pages/todos`), and a root the
   test creates through the sidebar (creation is unrecorded, so its history is empty). Both
   `[data-history-undo]` and `[data-history-redo]` exist on each; with no history their accessible
   names are "Nothing to undo" / "Nothing to redo" and they carry `aria-disabled="true"`. Tab reaches
   both; each box is at least `--size-hit-target`; at 375 px the header has no horizontal scroll;
   light and dark themes (token lint green).
2. **Every family through the header** (`apps/e2e/project-history.spec.ts`), on Home renovation's
   Home: add a task, complete it, rename it, archive it; resize a section, move it, remove a Rich Text
   section with prose; add a Home shortcut, collapse it, remove it; rename the project. After each,
   the Undo name is the expected label (e.g. `Undo: Collapsed the Tasks shortcut`,
   `Undo: Renamed "Home renovation" to "…"`). Undo them all from the header in reverse, then Redo them
   all; after each click the page shows the expected state without a reload, and the transition
   response (read through Playwright's `waitForResponse`) carries `summary.revision` one higher.
   The page toggle runs on `personal-workspace`'s `project-course` (whose only page record is Home;
   confirm with `GET /api/projects/project-course/pages` in the spec's setup): enable Reflections,
   Undo removes the tab, Redo restores it.
3. **Reload and navigation.** After step 2's third Undo, reload and navigate Home → Todos → Home:
   with `GET …/history` delayed by `page.route`, the controls show `Loading history…`; once released,
   the same Undo and Redo labels as before.
4. **Cross-owner.** From Home renovation's Todos, complete a task owned by Kitchen: the header's
   labels are unchanged and the feedback names Kitchen with an Open link; following it shows
   `Undo: Completed "<title>"` in Kitchen's header, and clicking it reopens the task.
5. **Archive stays, and the step stays eligible.** From Garden's header (a leaf, `completed` in the
   seed) archive Garden: the page stays on `/projects/project-garden`, status reads archived without
   a reload, the More menu no longer offers Archive, and `Undo: Archived "Garden"` is enabled even
   though the summary's project-level `blockedBy` names Garden. The feedback reads
   `Garden is archived. Undo is available here.` Clicking Undo returns Garden to `completed` with the
   seed's `completedAt`. In setup, rename `project-legacy-child` through
   `PATCH /api/projects/project-legacy-child` while `project-legacy` stays archived (a rename checks
   no ancestry, so it records a `project.update`); its header then reads
   `Undo unavailable while Legacy attic is archived` and `Nothing to redo`.
6. **Pending and races.** With the section-update route delayed (`page.route`), both controls are
   `aria-disabled` from the click until the post-write summary read completes. Two tabs: once tab
   B shows the pre-Undo label, install a gate on its `GET /api/projects/project-renovation/history`
   (`page.route`) so its summary stays at the pre-Undo revision; Undo in tab A; click Undo in tab B → the transition is refused
   `history_revision_stale` and tab B shows the history-changed-elsewhere feedback; release the gate
   with `route.continue()` and tab B's labels match tab A's. An MCP write (agent connection) to Home renovation leaves the person's labels
   unchanged after the frame's re-read.
7. **Refusals.** After the person renames a task, a second persona renames the same task through
   the API; the person's Undo shows the conflict's subject and next step. With the dev-panel clock
   endpoint moved 25 hours forward (the `prototype.reloaded` frame re-reads), nothing is offered.
8. **Notice retired.** Removing a Rich Text section with prose shows the recovery notice with Open
   Archive and "Undo is in the header"; it has no Undo button. Removing a shortcut shows no notice;
   both are undoable from the header. No element matches `[data-undo-action]`.
9. **Transports.** `mcp-acceptance` (Streamable HTTP and stdio) reads `get_operation_history` with
   `undo.blockedBy` present, and the new label strings.

Commands: `pnpm test`, `pnpm lint` (includes `docs:check`), `pnpm build` (initial bundle under
the 1050 kB error ceiling; the controls load eagerly with the header, so measure against the
`2026-08-initial-bundle-budget` baseline), `pnpm --filter @cwm/prototype-host acceptance`,
`pnpm --filter @cwm/prototype-host mcp-acceptance`, `pnpm --filter @cwm/e2e e2e project-history.spec.ts
removal-undo.spec.ts section-edit-undo.spec.ts canvas-history.spec.ts canvas-editing.spec.ts
page-history.spec.ts row-history.spec.ts archive.spec.ts todos.spec.ts reflections.spec.ts
web.spec.ts mcp.spec.ts`, and the affected Storybook stories. Then real use: `pnpm dev:host` and
`pnpm dev:web` separately on an isolated `nested-projects` copy, work through a morning's edits using
only the header for recovery, and record friction in `.prototype/notes.json` with `CURRENT_SLICE = 41`.

## File-level change list

Paths are repository-relative. Paired `*.spec.ts`/`*.test.ts` files are listed where they change.

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/operation-history-public.ts`, `operation-history.test.ts` | modify | Entry gains `blockedBy` (nullable, strict); doc comment distinguishes step- and project-level blockers. |
| `packages/domain/src/operation-history-service.ts`, `operation-history-service.test.ts` | modify | `summaryOf` computes each entry's `blockedBy` through `transitionBlocker` for its action and direction. |
| `packages/domain/src/shortcut-history.ts`, `shortcut-history.test.ts` | modify | Pure `shortcutWriteLabel(kind, changes, sourceName)`. |
| `packages/domain/src/section-shortcut-service.ts`, `section-shortcut-service.test.ts` | modify | Record update/move/remove with the new labels; Activity summaries unchanged. |
| `packages/domain/src/project-history.ts`, `project-history.test.ts` | modify | `projectWriteLabel` names the edit; takes the new parent's name for a move. |
| `packages/domain/src/project-service.ts`, `project-service.test.ts` | modify | Read the new parent's name inside the unit when `parentProjectId` changed and pass it to the label. |
| `packages/mcp-tools/src/tools/undo.ts`, `contract.test.ts`, `registry.test.ts` | modify | `get_operation_history` description names per-step `blockedBy`; contract test asserts it and the changed project/shortcut labels (e.g. its `'Updated "Work Manager"'` assertion). |
| `apps/prototype-host/api/*.test.ts` and `mcp/handler.test.ts` touching summaries or labels, `apps/prototype-host/scripts/acceptance.mjs`, `mcp-acceptance.mjs` | modify | Summary fixtures/assertions with the entry field; new label strings where asserted. |
| `apps/web/src/app/core/history/operation-history-reporter.ts` (+ `.spec.ts`) | create | Interface, report type, token with inert root default. |
| `apps/web/src/app/core/gateway/testing/fake-gateway.ts`, `core/gateway/prototype-work-manager-gateway.spec.ts` | modify | A scripted history for store specs: settable summary per project (entries with `blockedBy`), transitions answering a queued result or refusal in either direction, and the summary's `projectId` taken from the request instead of the hard-coded `'project-fake'`; the adapter spec's summary fixtures and label strings. |
| `apps/web/src/app/features/projects/history/project-history-store.ts` (+ `.spec.ts`) | create | Summary state, generation/revision guards, coalesced refresh, live/reconnect, pending counters, transitions, feedback. Implements the reporter. |
| `apps/web/src/app/features/projects/history/history-feedback.ts` (+ `.spec.ts`) | create | Pure wording for results, refusals, conflicts, cross-owner reports, disabled reasons. Moved from store/notice. |
| `apps/web/src/app/features/projects/history/project-history-controls.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts` | create | Presentational: two icon buttons, names/titles, disabled reasons, feedback line with optional Open link. |
| `apps/web/src/app/features/projects/canvas-chrome/canvas-icon.ts` | modify | `undo` and `redo` glyphs. |
| `apps/web/src/app/features/projects/project-workspace-shell.ts`, `.html`, `.spec.ts` | modify | Provide store + reporter; load on project change; project controls into the header; `confirmArchive` stays on the page instead of navigating to `/app`. |
| `apps/web/src/app/features/projects/project-header.html`, `.scss`, `.spec.ts` | modify | Content-projection slot beside More; layout at narrow width; the archive-confirm case expects the new copy. |
| `apps/web/src/app/features/projects/project-more-menu.ts`, `.html` (+ spec if present) | modify | Confirmation copy no longer says the page closes; no Archive offer on an archived project. |
| `apps/web/src/app/features/tasks/task-list-store.ts`, `.spec.ts` | modify | Report the five writes. |
| `apps/web/src/app/features/projects/pages/todos-page-store.ts`, `archive-page-store.ts`, `reflections-page-store.ts` and specs | modify | Report writes with owning project and name; Reflections page drops receipt/Undo. |
| `apps/web/src/app/features/projects/pages/reflections-page.ts`, `.html`, `.spec.ts`, `.stories.ts` | modify | Remove the notice Undo path; `@defer` condition follows the recovery-notice state. |
| `apps/web/src/app/features/projects/sections/reflections/reflections-store.ts`, `sections/progress/progress-store.ts` and specs | modify | Report writes. |
| `apps/web/src/app/features/projects/project-workspace-store.ts`, `.spec.ts` | modify | Report page toggles and project updates; `archive()` applies the returned project and its outcome drives header feedback rather than navigation. |
| `apps/web/src/app/features/projects/project-page-store.ts`, `.spec.ts` | modify | Report section/shortcut writes; delete receipt holding, `undoOperation`, `supersedesReceipt`, `undoFailureNotice`; recovery-notice state only for removal/retry/refresh. |
| `apps/web/src/app/features/projects/project-canvas.ts`, `.html`, `.spec.ts`, `project-canvas.stories.ts` | modify | Use the renamed notice and its `@defer` condition; drop Undo focus choreography. |
| `apps/web/src/app/features/projects/section-undo-notice.*` → `section-recovery-notice.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts` | rename + modify | No Undo; Open Archive, Retry remove, Retry refresh, Dismiss. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 41`. |
| `apps/e2e/project-history.spec.ts` | create | Acceptance steps 1–8. |
| `apps/e2e/removal-undo.spec.ts`, `section-edit-undo.spec.ts`, `canvas-history.spec.ts`, `canvas-editing.spec.ts`, `page-history.spec.ts`, `row-history.spec.ts`, `archive.spec.ts`, `todos.spec.ts`, `web.spec.ts`, `mcp.spec.ts` | modify | Undo through `[data-history-undo]`; notice selectors renamed; label strings; any archive journey expects to stay on the project. |
| Main specification §§26, 31, 54, 61–63 | modify | Header structure, browser Undo/Redo surface, entry `blockedBy`, reporting/pending rule. |
| `docs/decisions/2026-09-project-header-history-controls.md`, `docs/decisions/README.md` | create / modify | New §78 entry: displayed-project scope, per-step blocker, header-only action surface, cross-owner guidance, frames reconcile content. |
| Amendments: `2026-09-disposable-removal-and-immediate-undo.md`, `2026-09-section-edit-undo-boundaries.md`, `2026-09-project-update-operation-history.md`, `2026-09-section-restore-and-shortcut-history.md`, `2026-09-operation-history-scope.md`, `2026-09-recovery-routes-name-what-is-actually-there.md`, `2026-09-optional-page-operation-history.md`, `2026-08-project-create-edit-archive-surface.md`, `2026-08-initial-bundle-budget.md` | modify | Dated amendments: notice Undo retired and Open Archive moves to the recovery notice; per-step blocker answers the summary `blockedBy` questions of Slices 38–39; new labels; browser presentation of scope; archive no longer navigates; eager header controls and the renamed deferred notice in the bundle budget. |
| `docs/architecture/web/projects/*`, `web/core/*`, `web/tasks/*`, `web/prototype-tooling/*` (dev-panel writes reach the header by frame), `domain/*`, `contracts/*`, `mcp-tools/*`, `prototype-host/api/*`, `testing/*` (four files each where behavior changed) | modify | Current truth: store, token, controls, notice, labels, entry field, e2e list. |
| `docs/guides/mcp-setup.md`, `docs/guides/first-milestone-walkthrough.md` | modify if they show summary JSON or notice Undo | Keep examples true. |
| `docs/roadmap/goals.md`, this plan | modify | Direction and Outcome at close. |

## Test plan — tests first

| Test | Proves |
|---|---|
| `contracts/operation-history.test.ts`: entry requires `blockedBy`; rejects extra keys | Shape is strict and shared. |
| `domain/operation-history-service.test.ts`: archived subject — undo entry of `project.archive` has `blockedBy: null` while summary `blockedBy` names it; archived ancestor blocks both entries; an ordinary section action under an archived subject is blocked | Per-step availability equals what `transition` would decide. |
| same: summary entry blocker matches `transition` outcome for each exemption case | No drift between summary and execution. |
| `domain/shortcut-history.test.ts`: collapse/expand/resize/both/move/remove labels name the source; fallback text when no name | Slice 37 note. |
| `domain/section-shortcut-service.test.ts`: recorded label uses the source section's name; removing a shortcut whose source is archived, or hidden under an archived subproject, still succeeds and is labelled; Activity summary unchanged | Label only on history; no new refusal. |
| `domain/project-history.test.ts`: rename, complete, reopen, planning/active/on_hold status verbs, move (parent name), layout, progress formula alone and formula+manual together (one field), date, description, icon, multi-field → `Edited`, `completedAt` not counted | Slice 39 note. |
| `domain/project-service.test.ts`: a reparent's recorded label names the new parent; archive's label unchanged | Parent name threaded without touching `commit`'s archive path. |
| `web/core/history/operation-history-reporter.spec.ts`: inert default is safe to call | Stores work outside the shell. |
| `project-history-store.spec.ts`: `loading` until the first read; read failure → `unavailable` with Retry that re-reads; stale generation dropped; lower revision dropped; report whose `historyId` matches re-reads; report with a different `historyId` sets cross-owner feedback without re-reading; with a `null` held history (or while `loading`) any report re-reads and classifies by a summary requested after it (covers a task in a shortcut-hosted list and a nested Open archive `page.add`); the person's first write here is not misclassified as cross-owner; a `null` receipt owes no read; frame for project / project-record frame / `prototype.reloaded` / reconnect re-read, coalesced to one in flight + one queued | Summary authority and freshness. |
| same: begin/end counters per generation — old end after navigation does not unblock; end twice is harmless; controls stay unavailable after `end` until the owed re-read lands; a read that was in flight before `committed` landing afterwards does not end pending; a same-history summary with `revision < receipt.revision` does not satisfy it; navigation drops owed reads; a writer whose request failed at the transport level or with a 5xx owes a re-read from its end function; a failed owed re-read moves to `unavailable` | Pending lifecycle, including the commit→re-read window. |
| same: undo/redo send held action and revision; result summary adopted; each of the seven refusal reasons adopts its summary and produces feedback; 404 and transport error re-read the summary; double-click sends one request; activating an `aria-disabled` control sends nothing; a store destroyed with a transition pending drops the late result without error | Transition behavior. |
| `history-feedback.spec.ts`: every refusal reason both directions; `partial`/`fallback-page` result wording; conflict lines deduplicated; disabled reasons (nothing, loading, unavailable, pending, Undo blocked, Redo blocked) | Copy is exhaustive (switch over the unions with `never`). |
| `project-history-controls.spec.ts`: name and title for every state (`Undo: <label>`, `Nothing to undo`, `Loading history…`, `History unavailable`, `Nothing to redo`, `Undoing…`, `Saving a change…`, `Undo unavailable while X is archived`, `Redo unavailable while X is archived`); unavailable buttons carry `aria-disabled="true"`, no `disabled` attribute, and stay in tab order; feedback `role=status`; Open link routes | Accessibility contract. |
| `project-workspace-shell.spec.ts`: controls render on Home, Todos, Archive, Reflections, subproject and unavailable page; history store receives `load` on project change; a successful archive stays on the project, does not navigate to `/app`, and announces `X is archived. Undo is available here.`; the page store, a task-list store inside a Home shortcut and the Todos/Archive/Reflections page stores resolve `ProjectHistoryStore` as their reporter | Always present; archive Undo reachable; no silent inert wiring. |
| `project-workspace-store.spec.ts`: `archive()` applies the returned archived project; reports carry the response's project id | Header status without a frame. |
| Each writer spec (task-list, todos, archive, reflections page, reflections store, progress, workspace, page store): begin before request, end in `finally` on success and failure, `committed` with the owning project and receipt (or null for no-op) | Every write site reports. |
| `project-page-store.spec.ts` / `reflections-page-store.spec.ts`: no receipt captured for Undo; removal still offers Open Archive per `archiveListed`; the recovered `already-removed` receipt is reported through `committed`; Retry remove and Retry refresh unchanged; a forward write shows no notice unless its read failed | Notice retirement without losing recovery. |
| `section-recovery-notice.spec.ts`: no Undo control in any state | No competing surface. |
| `apps/e2e/project-history.spec.ts` | Acceptance 1–8 in a real browser. |

Existing tests that assert the notice's Undo move to header clicks rather than being deleted; the
behaviors they prove (placement restore, stale receipt reconciliation) are now proved through the
header and the store.

## Boundaries touched

- **Components → gateway interfaces only.** `ProjectHistoryStore` uses `WORK_MANAGER_GATEWAY`
  and `LIVE_UPDATES`; `ProjectHistoryControls` and `ProjectHeader` stay presentational.
- **`core/` never depends on features or `prototype/`.** The reporter token and interface live in
  `core/history/` and import only contracts; the implementation lives in `features/projects/`.
  `features/tasks` imports the core token, never the projects feature.
- **Contracts once.** The entry field is added to the existing schema; the web store uses the
  contract types; no parallel summary type.
- **Domain.** Label helpers are pure; `summaryOf` reuses `transitionBlocker`; no new service edge
  and no `new Date()`.
- **MCP calls domain.** Only the tool description and tests change.
- **Tokens only** in the new `.scss`; icon strokes use `currentColor`.
- **No global store** (§20): the history store is provided by the shell, not `root`.

## Explicit non-goals

- Project creation Undo, its recovery route and the missing-project state (next Stage C phase).
- The transition retry cache (lost-response retry returning the original result).
- Stage D: cascade-only removal, task Delete icon, Archive filtering, Settings → Archived projects.
- Keyboard shortcuts (Ctrl/Cmd+Z) and any history list, menu or preview of more than one step.
- Label changes for section, task and reflection kinds, and any Activity summary text.
- Header reporting from dev-panel tooling (outside the shell; the frame re-read covers it).
- The removed-page wording of `note-2026-09-22-001` (project-navigation copy, not history).

## Open questions

Resolved by default for this plan; each is recorded in the new decision entry:

- **Which history does a root page's header show?** The displayed project's — the root's on
  every root page, the subproject's on its work page — with cross-owner feedback, as Slice 34's
  scope decision proposed. A merged root-tree view would change cursor ownership.
- **Does the header reconcile content itself?** No; transition frames plus reconnect already
  re-read every open surface. Revisit if real use shows a stale surface after a header click.
- **Keep the notice's Undo alongside the header?** No; it would be a second button for the same
  step. The notice keeps only recovery the header cannot offer.
- **Where does a successful archive leave the person?** On the archived project's page, with its
  Undo enabled — not on the dashboard, where no header could offer it.

## Revisions

- **Draft (2026-09-22):** Written from the Slice 34 direction, Slices 35–40 outcomes, the three
  real-use notes, and the code named above.
- **Round 3 (2026-09-22):** Reviewer confirmed the Round 2 fixes against the code (the legacy-child
  rename records and is blocked by its ancestor; the gated tab B refuses `history_revision_stale`
  because the revision check precedes next-ness; the owed-read rule cannot deadlock) and returned
  **no substantive findings**. Six minor notes applied: the archive feedback's owner
  (`announce`) and its assertions; gate install order and `route.continue()`; a delayed read for
  the `Loading history…` check; a lost write response owes a re-read; `Nothing to redo` and
  `Undoing…`/`Redoing…` in the copy list; "three read states".
- **Round 2 (2026-09-22):** Reviewer confirmed the Round 1 fixes against the code (archived
  projects render in place; `historyId` rule matches the contracts; label reads feasible) and found
  four substantive issues: step 5's legacy setup could not run (archiving refuses a live child) —
  now a rename of the live child under the archived ancestor, with separate Undo/Redo disabled
  wording; the two-tab race would not refuse because tab B re-reads on tab A's frame — tab B's
  summary read is now gated; a read started before `committed` could end pending and misfile a
  first write as cross-owner — owed reads must be requested after the report (and reach the
  receipt's revision), with `loading`, `null`-receipt and generation rules; the More menu's
  "this page closes" copy and its Archive offer on an archived project were missing. Minor:
  `archive()` applies its result, cross-owner ids come from responses, a reporter-wiring spec,
  `prototype.reloaded` starts a generation, fuller disabled-reason tests, `shortcut.add` label
  aligned, and Garden's archive Undo asserts `completed`.
- **Round 1 (2026-09-22):** Two blocking and nine substantive findings, all checked against the
  code. Blocking: a header archive navigated to `/app`, so the archive Undo that per-step
  `blockedBy` exists for was unreachable — the archive now stays on the project, with an amendment
  to the create/edit/archive decision; native `disabled` would drop the controls and their
  reasons from the tab order — switched to `aria-disabled` with guarded clicks. Substantive: the
  commit→re-read window left stale controls enabled (pending now lasts until the owed read lands);
  no loading/failed-read state (added `loading`/`unavailable` + Retry, noting that Home ↔ root
  pages re-create the shell); `prototype.reloaded` added as a trigger; ownership decided from
  `historyId` rather than writer guesses (shortcut-hosted task lists, nested Open archive);
  project labels gained status verbs and treat formula+manual progress as one field; shortcut
  labels reworded ("the Tasks shortcut") and read the source without adding a refusal; navigation
  mid-transition and the recovered removal receipt specified; acceptance rebased on real seed
  data (`project-legacy*`, `project-course`, a sidebar-created root); four more decision
  amendments. Minor: inventory corrected (no browser duplicate; ten stores), parent name
  threading, a scripted fake history, `row-history`/`mcp` e2e, label assertions in MCP/adapter
  tests, notice wording, `@defer` conditions, `--size-hit-target`, transport errors re-read.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

**Deliverables** — <what now exists and works, with file links>.

**Deliberate choices** — <decisions made and why; options rejected; links to decision entries>.

**Deviations from the plan** — <what changed mid-implementation and what caused it>.

**Deferred** — <what was left out and which slice owns it>.

**Open questions** — <what the next phase or the user must answer>.

**Documentation updated** — <the architecture folders, decisions and guides touched>.
