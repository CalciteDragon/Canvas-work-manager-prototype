<!-- plan id="34" status="planned" summary="Development plan for persistent project history, recoverable deletion and restorable-only archives" -->
# Slice 34 — Project Undo/Redo and simpler Archive

**Development proposal — 2026-09-16. No runtime implementation.**

The user requested a detailed development plan, so this candidate deliberately includes more
detail than the usual five-section template. This direction spans several implementation phases.
Before implementation, create separate numbered candidates for the stages below using
`scripts/roadmap.mjs`, activate one at a time, and refresh its concrete file/test list.
Do not execute the whole direction as one oversized phase.

## Goal

Make project content and layout changes reversible through always-present Undo/Redo controls,
simplify removal to recoverable deletion, and show only actionable recovery entries in Archive.

## Spec sections

Main §§8–14 (boundaries, gateway, contracts, domain and persistence), §§19–23 (UI state,
tokens, shell), §§26–34 (projects, pages, sections and tasks), §36 (reflections), §§53–54
(permissions/MCP), §57 (activity), §§61–63 (API/live/optimistic UI), §68 (routes), §§69–70
(verification/boundaries), §§77–79 (design loop and decisions).
[Main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md).
The [earlier refactor proposal](../../specifications/archive-removal-undo-refactor-spec.md)
is historical input; its optional Redo/reassignment choices do not override this request.

Current §§27 and 31 explicitly describe page-local, single-use Undo and blocked Archive rows.
Implementation must deliberately amend those rules and §§32–34, 54, 57, 61–63 and 68,
alongside code and tests. This plan does not claim those amendments have already landed.

## Build

1. Establish a typed server-owned operation history with Undo and Redo.
2. Capture all committed project content/layout actions, including their compound effects.
3. Put compact, always-present Undo/Redo icons in the shared project header.
4. Use task delete icons and immediate cascade removal for containers.
5. Add Settings → Archived projects and parent-first, restorable-only Archive projection.
6. Verify each action family in the browser and through HTTP/MCP; update living documentation.

## Done when

All six user requests are demonstrable. Every included action in the coverage matrix reverses
and reapplies correctly; unsafe transitions change nothing. Navigation/reload preserve the
correct actor's available history. Archive remains usable after history expires.
The acceptance matrix below defines completion; displaying icons alone does not.

## Do not

Implement application code during this planning request. Build no event sourcing, arbitrary
JSON patch executor, global UI store, independent ArchiveItem database, permanent task purge,
history browser, automatic project archive cascade, or production infrastructure.
Independent task moves **remain supported**: the user confirmed only removal-time reassignment
is to be removed. Do not rewrite frozen roadmap records or current architecture as if this
proposal had shipped.

## Current behavior and required changes

| Current system | Change and consequence |
|---|---|
| `UndoService` executes four section-only inverse types once, then sets `consumedAt` | Introduce bidirectional action state/cursor. Redo needs its own expected-state checks; clearing `consumedAt` is insufficient. |
| `RepositoryUndoRecorder` retains 50 records/workspace for 24 h and prunes by section supersession | Change ordering/pruning to support sequential Undo/Redo. Undoing B must let the actor undo earlier A, even on the same field. |
| `ProjectPageStore` and `ReflectionsPageStore` hold just the latest receipt; `SectionUndoNotice` disappears on navigation | Header controls read server history through a scoped store; transient feedback no longer owns history availability. |
| Task, reflection, project, page and shortcut writes mostly return entities without receipts | Instrument owning domain mutations and migrate contract results, API/MCP, gateway, stores and test fakes together. |
| Nonempty section removal raises `section_not_empty`, opening cascade/reassign dialog | One request archives the section and its live owned rows. Remove public policy/target fields and the dialog. |
| Archive contains blocked rows and live content hidden by ancestors | Filter in domain; list the restorable ancestor first, recompute after restore. Preserve recovery of containers holding only previously archived rows. |
| Settings links only to AI & Agents | Add a workspace-scoped archived-project page reachable without opening any project. |

Sources: [domain Undo](../../../packages/domain/src/undo-service.ts),
[recorder](../../../packages/domain/src/undo-recorder.ts),
[section lifecycle](../../../packages/domain/src/section-service.ts),
[task lifecycle](../../../packages/domain/src/task-service.ts),
[project lifecycle](../../../packages/domain/src/project-service.ts),
[Archive projection](../../../packages/domain/src/project-archive-service.ts),
[projects UI](../../architecture/web/projects/how.md),
[gateway](../../architecture/web/core/how.md).

## Decisions, defaults and consequences

“Required” means the user's direction. “Recommended” marks a proposed answer to an unspecified
detail; adopt these through §78 entries during implementation, after the relevant review.

| Decision | Rule | Consequence |
|---|---|---|
| Controls — required | Two small Undo/Redo icons always rendered in `ProjectHeader`: Home, Todos, Archive, Reflections, subproject work, empty and read-only states | Enabled only when their server-selected action is usable. Accessible labels/tooltips name the action or disabled reason. No hover-only recovery or extra menu click. |
| Task Delete — recommended interpretation | Trash icon, “Delete task” accessible label; preserve soft archive and exact descendant cascade underneath | Undo and Archive can recover it; no hard deletion or task-status reinterpretation. Existing `archive_task` API name may remain with clear description. |
| Container removal — required | Archive the section and its live owned contents atomically, immediately | Pre-archived rows keep their markers. Views own no source data. Existing safe disposable-section deletion remains possible. |
| Task moving — confirmed by user | Remove only reassignment during section removal, for task and reflection containers | Ordinary task moves through update/MCP stay supported and must also be undoable. |
| History scope — recommended | Exact actor + workspace + owning project, shared across its pages | A root Todos/Archive action on a descendant records in the descendant's history. Show owner-labelled feedback with a project link. Agents do not enter a person's stack. |
| Retention — recommended | Keep 24 h, change cap to 50 actions per actor/project history, applied and undone combined | Task edits otherwise evict unrelated work rapidly. JSON storage grows relative to 50/workspace, but remains bounded per history. Undo/Redo never extend expiry. |
| Granularity — required | One committed user action, not one activity event, keystroke or pointer movement | Add, complete, inline save, committed drag/resize or settings submit each form one step. Compound effects join their initiating action. |
| Redo — required | Undo makes that action redoable; Redo reapplies its captured intended change | A new successful ordinary write clears only its own history's redo branch. No-op, failure, cancel, reads and navigation do not. Never replay old create requests with new IDs. |
| Archive — required | Return structurally restorable items only | Hide blocked children and merely hidden live rows; never delete their stored records. Preserve the parent/container recovery entry. |
| Archived projects — recommended | `/settings/archived-projects` lists archived roots and independently restorable archived subprojects in the current workspace | Hide descendants under archived ancestors until those ancestors return. Subprojects remain available in root Archive too; use the same eligibility policy. |
| Project Restore — recommended | Keep the existing explicit non-archived status choice | Historical archives have no captured prior status. New archive Undo restores its captured prior status. Existing live-child archive refusal remains; no new project cascade. |

Archive Restore, operation history and Activity stay separate. Restore recovers retained
content without receipt/expiry and can append a section. Undo/Redo reverse/reapply an action,
preferring its recorded placement. Activity remains attributed audit information; no inverse
is reconstructed from log summaries. History expiry never erases Activity or archived content.

## Coverage matrix and gesture boundaries

“Any visual modifying behavior” means committed mutations of project content or saved
presentation in the current product. Exclude transient navigation, focus, hover, drawer opening,
scroll, search queries, unsaved text and drag previews. Keep native text undo in focused editors;
global keyboard interception is outside this scope. Included mutations produce history through
HTTP and MCP alike, scoped to their own actor.

| Action family | Required footprint and boundary |
|---|---|
| Task add | Created task plus an implicitly created container if applicable: one action, stable IDs for Redo. Undo Add removes the created content from both normal views and Archive; it is not a separate Delete action. Guard later references/dependents. |
| Task complete/edit/move | Changed fields including paired `status`/`completedAt`, title, description, priority, estimate, dates and supported relationship/position fields. Undo completion restores previous status/time exactly. A move includes affected subtree/container/project fields. |
| Task Delete/Restore | Exactly the rows/markers changed by canonical cascade/restore. Independently archived descendants remain archived; Undo Restore reverses only that restore's effects. |
| Section add/duplicate | Created section, actual copied content, placement and implicit effects. Single action; dependencies block unsafe creation Undo. |
| Section edit | Title, whole config (including prose), collapse and width. One committed blur/submit/resize gesture. Transient auto-expansion for canonical navigation is not a write. |
| Section move/remove/restore | Subject, combined section/shortcut neighbors, exact rows/markers changed. Cascade removal is one step regardless of row count. Durable Restore still appends; Undo Restore returns its prior archive state. |
| Shortcut add/remove/move/settings | Placement record/presentation only. Recreate the same placement ID; never modify the source content. |
| Reflection add/edit/delete/restore | Body, subject and other changed fields, markers and implicit container. Same compound rule as tasks, on canvas and Reflections page. |
| Project add/edit/archive/reactivate | Project fields, old status, parent relationship, pages automatically created with it. Creation history belongs to the created project; lifecycle handling below keeps Redo reachable after creation Undo. |
| Optional page enable/disable | Enabled value and page created on first enable. One action; never delete that page once another action has added content/references. |
| Saved layout/progress options | Project layout mode, progress formula/manual settings. The current layout control is in prototype tooling but modifies real project state, so its domain write participates. Derived progress itself is not a second action. |

Stage A audits every gateway/domain write against this matrix: map each exposed mutation or
record why it is transient/tooling-only. Global theme, dashboard configuration, persona, seed,
clock, network simulation and agent permissions are outside project history. Seed replacement
invalidates the old document's history and UI generation. Future Slice 20 ordering/subtask UI
must adopt history when it ships; this direction does not build those features.

## Architecture

### Domain recording and execution

Extend `UndoRecorder` and typed executor modules, not a generic command framework.
An owning service validates, captures actual before/after effects, mutates and records inside
one caller-owned `UnitOfWork`. Automatic container/page creation joins the initiating action,
not an independent history entry. Share pure validation/capture/application helpers where needed.

New recorder dependencies from `TaskService`, `ReflectionService`, `ProjectService`,
`ProjectPageService` and `SectionShortcutService` are deliberate architectural changes.
They depend on an interface, not `UndoService`. The executor continues to compose only
`ActivityService`, repository abstractions and `Clock`; it must never call writing services
and recursively record its own inverse. Amend AGENTS.md's named dependency graph when this lands.

Use explicit versioned operation unions with entity/field and placement footprints.
Replace section-only subject matching with typed affected-entity checks. A history has a stable
ID, monotonically increasing revision/order counter independent of retained records, and an
applied/undone cursor. Do not derive a new revision from the maximum of prunable records.
Undo moves backward; Redo forward. Only the next action is executable; never silently skip a
conflicted top action to undo something older. Refusal leaves the cursor unchanged.

Current “a newer record exists” checks must become applied-state/conflict-aware: A → B →
Undo B → Undo A is valid. Compare fields being changed, entity existence, ownership, archive
markers, page constraints and new references/dependents; preserve unrelated later edits.
Redo must not absorb rows created after Undo: refuse if replaying the captured removal would
affect extra content. Neighbor-aware placement retains deterministic fallback and reports
partial placement when exact original location is no longer possible.

Content, history transition and one attributed activity/live publication commit atomically.
On failure all roll back. Keep identity `createdAt` stable, restore captured business dates
such as `completedAt`, and stamp mutation `updatedAt` through `Clock`. No-op/cancelled/failed
writes add no history and do not clear Redo. Expiry/pruning must not resurrect invalidated
branches or previously superseded capabilities.

### Creation Undo, archived owners and permissions

Creation Undo requires restricted repository removal for tasks/reflections/projects/pages,
beyond today's section/shortcut deletion. Only typed executors use it, after checking outside
references, descendants and later substantive edits. History snapshots are not canonical
content and never appear in Archive. Compound project creation captures its automatically
created pages; compound row creation captures any automatically created container.

A project removed by Undo Add must still have an actor-scoped history. Permit its history to
outlive the canonical project, secured by workspace/actor identity rather than an always-live
project foreign key. Provide a minimal recovery state at that project URL for the exact actor
with the retained creation history, so Redo remains reachable; foreign/missing projects without
that capability remain 404. After Undo, keep this recovery state instead of navigating to a dead
page. Recreating uses the same IDs. This is an explicit integrity/route change, not a hidden
exception or a generic deleted-entity browser.

**Activity must survive creation Undo too.** Current `data-store.ts` requires every activity
target and its project to exist. Relaxing only history ownership cannot make task/reflection/
project creation Undo commit. Stage A must adopt durable, workspace-qualified historical
activity identity: capture target kind/ID/display name and owning project/root identity at event
creation, independently of inverse snapshots. Preserve actor/workspace integrity, verify the
target's workspace while it exists, and permit a historical target/project to be absent after
safe creation Undo. Historical project context remains the event's context even if the entity
later moves; it must not be rewritten from the entity's current parent. This changes Activity's
reference contract, not its role: it is still an audit log, never the source of Undo data.

Backfill historical identity from existing canonical targets in the v4 converter. Keep historical
events readable after history expiry/pruning, so no exemption may depend on a retained Undo
record. Validate captured identity against canonical target/project/actor workspace inside the
same unit before deletion; reject forged cross-workspace snapshot or backfill data. Feed reads
prefer live names when available and historical labels otherwise; missing
targets have no active navigation link. Capture the affected root before removing a project
and pass that scoped publication context to `ActivityService`: its current `rootOf` cannot
resolve a deleted project. One post-commit frame still reaches the former root's derived views.
Undo/Redo event context comes from validated action identity before deletion, not caller-provided
transport data. Tests must cover audit readability, integrity and refresh after creation Undo,
reload, Redo and eventual history expiry. Creation tombstones are the alternative if this
historical-reference decision is rejected; do not silently remove Activity to make tests pass.

Check canonical write permissions at execution time: tasks require `tasks.write`, reflections
`reflections.write`, project/section/page/shortcut operations `projects.write`.
Compound effects use the initiating public operation's grants (section cascade already needs
only `projects.write`; implicit container creation retains row-write-only permission).
Do not retain today's blanket `projects.write` guard for task history. Exact actor/workspace
matching precedes disclosure; revoked connections/grants fail through current auth/actor state.

Ordinary Undo/Redo remains blocked under archived ancestry. Undo of project archive can
reactivate its own project if its ancestors are live; otherwise archiving could never be undone.
Redo rechecks the live-child restriction. Project recovery never implicitly unarchives children.

### Contracts, persistence and compatibility

All scopes, summaries, footprints, write results, transition inputs/results and errors are Zod
contracts in `packages/contracts`. Public summaries/receipts expose IDs, labels, revision,
availability and disabled reasons, never snapshots. Execute with selected action ID and expected
history revision. Two tabs cannot both advance one cursor. A bounded transition request ID and
cached result make an uncertain Undo/Redo retry return the original result, not execute another
step. Ordinary uncertain create/edit responses trigger history/content reconciliation, never
blind replay; a general HTTP idempotency platform is not part of this prototype change.

Recommend explicit v4 conversion because history lifecycle and owner integrity change.
Preserve every business collection. Retire old v1 one-shot receipts with a clear history-reset
notice; never reinterpret old reassignment snapshots as cascade. Archive Restore remains usable.
If continuity of old receipts is required, add a legacy executor stage instead (decision gate).
Strictly reject removed `policy`/`reassignToSectionId` request fields: a stale client asking
for a move must not silently receive a cascade. Legacy parsing belongs only in the converter.
Use the existing upgrade CLI: backup, atomic output, idempotent repeat and startup version
validation; never run an old application against an upgraded file.

Preserve supported v2 input with two explicit pure conversions, not a migration registry:
freeze `upgradeProjectPages`' intermediate result as v3, then feed it into v3→v4 conversion.
That existing converter currently imports the current `SCHEMA_VERSION` and integrity validator;
decouple those from its historical intermediate shape so a v4 bump cannot silently change it.
The CLI accepts v2 or v3 and writes v4 once, backing up the original input; v4 is a no-op.
Test the existing v2 corpus through the complete path as well as direct v3 inputs, including
v3 files without `undoRecords`, legacy reassignment records and already-consumed receipts.

### API/MCP, gateways and UI state

Add history summary and Redo routes/tools alongside Undo, backed by the same domain service
for HTTP, Streamable HTTP MCP and stdio. Update `undo_operation` semantics/descriptions and
permission metadata for operation-dependent grants. A summary may expose only action families
the caller can read; test every minimal grant and prevent snapshot disclosure. Registry remains
transport-free. Migrate raw write returns to per-family result envelopes through contracts,
routes/tools, adapter, fakes, stores and acceptance scripts together. No inverse data on SSE.

Provide a feature-scoped history store at `ProjectWorkspaceShell`. It owns current summary,
pending transition and feedback, not copied task/section data. Task/reflection features report
committed receipts through a small shared interface/token in core, implemented/provided by the
project shell. No tasks→projects or core→feature/prototype dependency. Server summary is the
authority, so correctness does not rely on browser-local stacks.

The reporting interface includes begin/end write lifecycle as well as committed receipts.
Use balanced completion in `finally` and owner/generation-scoped counters, so pending task,
reflection, shortcut and section writes all disable the matching header controls without
allowing an old response to unblock a newly navigated project's writes.

Refresh history after writes/transitions, relevant live events, reconnect and navigation/reload.
Discard stale actor/project/generation/revision results. Disable controls during local writes
and transitions; server checks arbitrate other tabs/agents. Committed write followed by failed
refresh retains recovery and offers read-only Retry refresh. Remove page-local Undo ownership;
retain concise status/conflict/uncertain-request feedback without a competing action surface.

### Archive and Settings

Factor pure restore-eligibility rules shared by the existing Archive query, a new workspace
archived-projects query, and canonical restore validation where practical. Separate “meaningful
content exists” from “restore can run now.” Domain filtering, not UI filtering, keeps MCP and
browser consistent. Read grants and write grants remain distinct: read-only agents may see
structurally restorable entries with required-permission metadata; writes still enforce grants.

Archived project hides child entries; archived section hides tasks/reflections; archived task
hides descendant tasks. Show the highest restorable owner. Keep containers whose only contents
are independently archived rows: Restore container exposes those rows as subsequent entries.
Cascade-restored rows disappear from Archive. Disabled pages do not block restoration; preserve
origin and a valid enable/open route. Preserve unknown-content retention and shortcut safety.

Settings is a new route/feature store, not a new project page kind. After Restore, refresh
Settings, shell tree and affected projections; remove the restored entry and offer Open project.
Keep the existing optional root Archive and More-menu recovery entry for content. A concurrent
ancestor archive can invalidate an entry after listing: the write fails safely, displays the
reason and refreshes. Listing is eligibility at read time, not a promise that races cannot happen.

## Delivery stages

| Stage | Deliverable | Gate before proceeding |
|---|---|---|
| A — history foundation | Versioned state/converter, summary, grants, atomic Undo/Redo for existing section actions | A → B → Undo B → Undo A → Redo A → Redo B; branch invalidation, expiry/pruning, concurrent revision and reload tests through domain/API/MCP. |
| B — task/reflection actions | CRUD/completion/moves and exact compound footprints; typed write results | Add → complete → edit → delete and reverse/replay each step, including implicit container; no lost dependents/unrelated edits. |
| C — remaining project/layout actions and controls | Project/page/shortcut/duplicate/restore/layout/progress history; persistent header icons | Entire coverage matrix implemented; navigation, missing-project recovery, all pages and cross-owner feedback verified. |
| D — removal and Archive | Cascade-only input, task Delete UI, actionable Archive and Settings archived projects | No policy prompt, old reassignment rejected without mutation, parent-first recovery and whole-project restore demonstrated. |
| E — integrated closure | Browser/HTTP/both MCP transports, real use, docs/spec/decision reconciliation | Acceptance matrix and verification commands pass, all known limitations recorded. |

Each stage gets an active file-level plan, iterative subagent plan review, TDD and diff review
under AGENTS.md. Commit meaningful green increments. One-click removal ships after broad
Undo/Redo is usable. Stages A–C are the largest part of the work; this is not a cosmetic change.

## File-level change map

Paths are repository-relative. Existing anchors were located/read; new paths are proposed.
Before each stage, enumerate all paired tests/stories/fixture callers in its active plan and
read them. This map identifies ownership; it does not substitute for that stage's exact checklist.

| Stage | Files | Responsibility |
|---|---|---|
| A–C | `packages/contracts/src/undo.ts`, `ids.ts`, `document.ts`, `inputs.ts`, `activity.ts`, `index.ts` and paired tests | Versioned histories, footprints/results, validation and exports. |
| A/C | `packages/repositories/src/interfaces.ts`, `json-repositories.ts`, `data-store.ts`, `data-store.test.ts`, `repositories.test.ts` | Counters/storage, history scope surviving creation Undo, restricted entity removal and atomicity. |
| A | New `packages/prototype-data/src/upgrade-operation-history.ts` and test; existing `upgrade-cli.ts`, `seeds.ts`, `seeds.test.ts`; `apps/prototype-host/persistence/store.ts` | v3→v4 conversion, fixtures/seeds, reset notice/startup validation. |
| A | `packages/domain/src/undo-recorder.ts`, `undo-service.ts`, `section-edit-undo.ts`, `section-removal-undo.ts` and tests; new `operation-history.ts` and test | Summary/cursor, ordering, pruning, both directions and repeat transition handling. |
| A/C | `packages/domain/src/activity-service.ts`, `activity-service.test.ts`, `packages/contracts/src/activity.ts`, `activity.test.ts`, `live.ts`, `live.test.ts`; `apps/web/src/app/features/activity/activity-feed.ts`, `.html`, `.spec.ts`, `activity-store.ts`, `.spec.ts` | Historical identity/read fallback, safe missing-target links and pre-deletion root publication context; existing-target workspace integrity retained. |
| A | `packages/prototype-data/src/upgrade-project-pages.ts`, `upgrade-project-pages.test.ts`, `version-3-undo-compatibility.test.ts`; proposed new `upgrade-cli.test.ts` in that source folder only if CLI cases are split from `upgrade-project-pages.test.ts`; `prototype/seeds/*.json` and `packages/prototype-data/test/fixtures/` | Preserve v2 conversion through fixed v3 intermediate, validate full upgrade path and regenerate versioned seed snapshots from builders. |
| B | `packages/domain/src/task-service.ts`, `reflection-service.ts`, `owned-rows.ts`; new `task-history.ts`, `reflection-history.ts` and tests | Compound row operations and references, exact status/marker reversal, implicit containers. |
| C | `packages/domain/src/project-service.ts`, `project-page-service.ts`, `section-shortcut-service.ts`, `section-service.ts`, `page-placements.ts` and tests; new `project-history.ts`, `shortcut-history.ts` and tests | Remaining mutation coverage, ownership, project lifecycle and placements. |
| D | `packages/contracts/src/inputs.ts`, `section.ts`, `project-archive.ts` and tests; new `archived-projects.ts` and test | Strict cascade-only requests and archive query metadata. |
| D | `packages/domain/src/section-service.ts`, `section-recovery-policy.ts`, `project-archive-service.ts` and tests; new `restore-eligibility.ts`, `archived-projects-service.ts` and tests; `index.ts` | Remove reassignment branch; domain-owned eligibility/projection. |
| A–D | `apps/prototype-host/api/services.ts`, `routes.ts`, `errors.ts` and tests; `packages/mcp-tools/src/tool.ts`, `registry.ts`, `tools/undo.ts`, `tools/tasks.ts`, `tools/reflections.ts`, `tools/projects.ts`, `tools/project-pages.ts`, `tools/shortcuts.ts`, `tools/sections.ts`, `contract.test.ts`, `registry.test.ts` | Service wiring, query/transition routes/tools, operation-dependent grants and result migration. |
| A–D | `apps/web/src/app/core/gateway/work-manager-gateway.ts`, `prototype-work-manager-gateway.ts`, paired spec, `testing/fake-gateway.ts`; new `core/history/operation-reporter.ts` under `apps/web/src/app/` | Shared interfaces, HTTP adapter/fakes, feature-neutral receipt reporting. |
| C | New `apps/web/src/app/features/projects/project-history-store.ts` and spec; `project-workspace-shell.ts`, `project-header.ts`, `.html`, `.scss`, `.spec.ts`; new `project-history-controls.ts`, `.spec.ts`, `.stories.ts` in that feature | Scoped summary state, always-present controls, accessibility/disabled states. |
| B–D | Under `apps/web/src/app/features/projects/`: `project-page-store.ts`, `project-workspace-store.ts`, `pages/todos-page-store.ts`, `pages/reflections-page-store.ts`, `pages/archive-page-store.ts`, `sections/reflections/reflections-store.ts`, `sections/sub-projects/sub-projects-store.ts`, `shortcuts/shortcut-store.ts`; `apps/web/src/app/features/tasks/task-list-store.ts` and paired specs | Receipt reporting and authoritative refresh; retire private one-receipt history. |
| C/D | `apps/web/src/app/features/projects/section-undo-notice.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts`; `project-canvas.ts`, `.html`, `.spec.ts`; `pages/reflections-page.ts`, `.html`, `.spec.ts` under same feature | Retain necessary feedback/retry behavior without competing Undo controls. |
| D | Delete `apps/web/src/app/features/projects/section-removal-dialog.ts`, `.html`, `.scss`, `.spec.ts`; update `apps/web/src/app/features/tasks/task-row.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts`, `task-detail-drawer.ts` and paired UI/tests | Remove policy prompt; consistent task delete affordance. |
| D | `apps/web/src/app/features/projects/archived-region/archived-region.ts`, `.html`, `.spec.ts`, `.stories.ts`; `apps/web/src/app/features/settings/settings-page.ts`, `app.routes.ts`, `app.routes.spec.ts` (routes under `apps/web/src/app/`); new `features/settings/archived-projects/archived-projects-page.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts`, `archived-projects-store.ts`, `.spec.ts` under app | Simplified archive, Settings route/page/store, restore/navigation/error states. |
| C/E | `apps/web/src/app/prototype/dev-panel/project-layout-control.ts`, `dev-panel-store.ts`; `apps/e2e/section-edit-undo.spec.ts`, `removal-undo.spec.ts`, `archive.spec.ts`, `todos.spec.ts`, `reflections.spec.ts`, `mcp.spec.ts`; new `project-history.spec.ts`, `archived-projects.spec.ts` in e2e | Saved layout action; CURRENT_SLICE only at implementation; integrated journeys. |
| A–E | `apps/prototype-host/scripts/acceptance.mjs`, `mcp-acceptance.mjs`; `apps/prototype-host/mcp/handler.test.ts`; test-support builders in domain/MCP/host | Replace old raw-result/consumed-receipt assertions; both transports, live publication and revocation. |
| A–E | Main specification, `AGENTS.md`, `README.md`, `docs/guides/mcp-setup.md`, `docs/guides/first-milestone-walkthrough.md` | New graph edges, upgrade/tool/route instructions and current walkthrough. |
| A–E | Four files (`overview/why/what/how.md`) in `docs/architecture/`: contracts, repositories, prototype-data, domain, mcp-tools, prototype-host/api, web/core, web/projects, web/tasks, web, web/prototype-tooling, testing | Update behavior as it lands, public symbols/Compodoc and links. Settings stays under web unless it earns its own four-file subsystem. |
| A–E | `docs/decisions/README.md`, new decisions and dated amendments; `docs/roadmap/goals.md`, `progress.md`, stage plans; `.prototype/notes.json` during use | Decision/evidence trail, generated board, honest closure. |

## Decision and documentation migration

Adopt small §78 entries for history scope/ownership; bidirectional granularity/retention;
one-click cascade/task Delete; actionable Archive/Settings; history conversion.
Each needs Question / Options tested / What we learned / Current decision / Confidence /
Revisit when. Distinguish user direction from measured product evidence. Index and link from
the affected systems' `why.md`. Proposed defaults in this plan are not shipped decisions.

Append dated amendments (do not rewrite) to:

- `2026-09-section-removal-undo-records.md`: single-use lifecycle, retention cap, grants/version.
- `2026-09-section-edit-undo-boundaries.md`: broader coverage, sequential conflict semantics.
- `2026-09-disposable-removal-and-immediate-undo.md`: persistent controls replace local notice.
- `2026-09-reassign-may-cross-pages.md`: removal reassignment retired; independent moves retained.
- `2026-09-root-archive-recovery-guidance.md` and `2026-09-content-oriented-archive-policy.md`: blocked rows hidden, owner recovery preserved.
- `2026-09-recovery-routes-name-what-is-actually-there.md`: filtered recovery and Settings.
- `2026-08-task-status-transitions-and-archive.md` and `2026-08-project-create-edit-archive-surface.md`: Delete wording and project history/recovery affordances.
- `2026-08-activity-summary-ownership.md`, `2026-08-activity-feed-composes-from-parts.md` and `2026-08-live-events-ride-the-activity-record.md`: durable historical target context, missing-target fallback and pre-deletion root routing. Add a dedicated historical-activity-identity decision; update domain, repositories, web and prototype-host/live-updates four-file docs when adopted.

## Test plan — tests first

| Test family | Required cases |
|---|---|
| Contract/converter | Every operation valid/malformed; removed reassign rejected; v3 business records preserved; old receipts retired; repeat upgrade safe; malformed/failed conversion preserves original bytes. |
| Legacy conversion/activity | v2 corpus → fixed v3 → v4, old v3 without history, legacy reassign and consumed records; historical identity backfill and old events preserved; forged cross-workspace snapshot/backfill rejected. Creation → Undo commits valid integrity with audit readable/no false links, correct former-root live frame, reload/Redo and all history expired/pruned. |
| History state machine | Mixed LIFO/FIFO, repeated cycles, same-field A/B chain, new-write branch clearing, no-op/cancel/failure preserve Redo, expiry/cap/restart/counter reuse, no resurrection after pruning. |
| Identity/grants | Actor/project/workspace isolation, summary disclosure, each minimal grant, revoked grant/connection, foreign IDs, no snapshot leak. |
| Atomicity/retry | Inject record/transition/persist failure: content/history/live frames unchanged. Two transitions at one revision: one advances. Lost transition response retry returns original result with no second event. |
| Row/section operations | Implicit container single step, stable IDs, status/time restoration, cascade/pre-archived children, exact Restore inverse, independent move subtree, new dependents block destructive reversal, no-op normalization. |
| Project/page/shortcut | Created project/pages/history lifecycle, own-archive Undo vs ancestor freeze, live-child Redo refusal, first-enabled page with later content, source reference protection, combined neighbors/partial fallback. |
| Conflicts | Sequential own edits undo in order; another actor's overlapping edit refuses; unrelated edits survive; later restore/reparent/subject reference/new dependent blocks unsafe inverse or Redo. |
| Archive queries | Exact IDs: parent-first visibility, pre-archived-only container recovery, independent child emerges after parent restore, unknown content, disabled page, workspace isolation and restoration race. |
| UI/store | Two icons on all project pages; disabled/pending labels, stale/out-of-order results, actor/navigation isolation, reload/reconnect, committed-write/read-failed, cross-owner guidance, no removal dialog; keyboard/touch/narrow viewport. |
| HTTP/MCP | Same semantics and strict inputs, each operation family, dynamic grants, separate connections, real HTTP/stdio transport errors and fresh stdio auth. |

## Acceptance check

Use `personal-workspace`, `nested-projects`, `agent-heavy` in isolated test data. Create
records with known returned IDs; assert those IDs, not “some row exists.”

1. Open every root page and a subproject, empty and populated. Both header icons remain
   present, with correct enabled/disabled reasons, keyboard access, touch targets and narrow-screen
   layout in both themes. Archive being disabled never gates Undo/Redo.
2. Add task → complete → rename → delete; undo all four, redo all four. Confirm stable IDs,
   previous completion status/time, absence from Archive after Undo Add. Repeat a descendant
   action from root Todos and verify its owner-labelled history navigation.
3. Save prose, resize, move between mixed placements, collapse, change layout mode, add/remove
   shortcut and change page settings; undo/redo each across navigation/reload. One record per
   committed gesture; none for Escape/preview/same-value writes.
4. Remove a nonempty task container with live and independently archived task subtrees.
   One request and no dialog; no rows move. Archive lists its container only. Restore:
   cascaded rows return, independently archived tasks become entries. Repeat for reflections,
   empty containers, meaningful/blank prose and referenced disposable views.
5. Archive children then root (existing prerequisite), open Settings → Archived projects.
   Restore root with explicit status, then a child. Verify parent-first listing, no independently
   archived content resurrected, root/subproject entries, persona isolation, empty/error/reload
   states and a concurrent restoration blocker.
6. Every coverage row has a named domain test plus browser or MCP evidence in the stage ledger.
   Include project creation Undo/Redo at its recovery route, reflection CRUD, duplicate and
   optional-page first enable; do not infer these from section edit tests.
7. Test overlapping agent edit, grant revocation, two-tab race, lost transition response,
   persistence failure and expired history. Verify no partial changes and actionable feedback.
   Restore retained content through Archive after history expires.

Run `pnpm test`, `pnpm lint`, `pnpm docs:check`, `pnpm build`; targeted E2E via
`pnpm --filter @cwm/e2e e2e -- project-history archived-projects archive section-edit-undo removal-undo`,
adding Todos/reflections suites when their surfaces change; and
`pnpm --filter @cwm/prototype-host mcp-acceptance` covering HTTP and stdio. Build affected
Storybook stories. Preserve the 1 MB initial bundle ceiling; measure new permanent header
dependencies and use focused lazy boundaries if needed.

Start `pnpm dev:web` and `pnpm dev:host` separately for real-use evaluation; record friction
in `.prototype/notes.json`. Do not reset personal runtime data for automated tests.
For this planning-only request, run roadmap/docs checks and `git diff --check`; product tests,
runtime use and implementation commits are not claimed.

## Boundaries touched

Contracts stay the sole source of shared shapes. Domain uses repository interfaces and injected
time only. Recording joins the caller's unit; executors never call mutation services. MCP calls
domain, not repositories. UI uses gateway interfaces, never HTTP/concrete adapters; only
`app.config.ts` names implementations. The reporting token adds no core→feature/prototype
edge. Stores remain scoped, styles token-based and flags centralized. Creation Undo's restricted
deletion and history surviving project removal are explicit integrity changes requiring tests.

## Explicit non-goals

No cross-user Undo, arbitrary selective Undo, unbounded history, whole-document snapshots,
activity rollback, navigation Undo, global shortcuts, permanent task purge, new move UI,
automatic project cascade, production migrations or separate archive storage.
Independent moves remain. Future ordering/subtask rendering still belongs to Slice 20.

## Open questions and activation gates

No clarification blocks this planning deliverable. These proposed defaults must become explicit
decisions before dependent implementation:

- **Scope:** exact actor + owning project, with owner guidance for descendant actions in root
  Todos/Archive. A root-tree history would materially change cursor ownership; decide before A.
- **Retention/conversion:** proposed 24 h / 50 per history and v4 reset of legacy receipts.
  If continuity is required, plan a legacy executor before migration, not silent data reinterpretation.
- **Project-create recovery UX:** prototype the minimal actor-scoped missing-project recovery
  state before finalizing its route/integrity contract. Redo must remain reachable.
- **Historical Activity identity:** adopt the explicit scoped historical-reference design above
  before implementing hard deletion for creation Undo. If creation tombstones are chosen instead,
  revise contracts, all normal/archive projections and tests first; do not weaken integrity ad hoc.
- **Text granularity:** one save/blur is the default; do not silently turn autosave keystrokes
  into history entries. Confirm actual editor commit boundaries in each active plan.

## Revisions

- **Initial draft (2026-09-16):** Grounded in current inverse types, recorder retention, source
  lifecycles, gateway/store boundaries and Archive policy; includes grants, exact cascades,
  reference-safe creation Undo, persistence and migration consequences.
- **User clarification (2026-09-16):** Only reassignment during section removal is removed;
  independent inter-container task moves remain and are included in history coverage.
- **Review round 1 (2026-09-16):** Independent source review found that Activity's live-target
  integrity blocks creation Undo and root publication loses context after project deletion.
  Added historical audit identity, read/link fallback, pre-deletion root routing, affected files,
  decisions and tests. It also found that the v2 converter imports the current schema version:
  specified fixed v3 intermediate plus explicit v4 conversion and full corpus tests. Clarified
  begin/end write reporting so all pending feature mutations disable history controls.
- **Review round 2 (2026-09-16):** Reviewer checked the revised document against source and
  returned no substantive findings. Marked the optional extracted CLI test as new and made
  cross-workspace historical identity validation explicit. Independent task moves and
  parent-first Archive recovery remain covered.

## Planning delivery

This document describes proposed work and acceptance obligations. Runtime spec, architecture and
decision amendments happen with the implementing stages. No implementation phase has started;
the roadmap must continue to show this as planned until explicitly activated.

Planning validation: `node scripts/roadmap.mjs check`, `pnpm docs:check` and `git diff --check`
passed. Documentation-only changes: this plan, the direction link in `goals.md`, and the
script-generated `progress.md` entry. No application tests or runtime walkthrough were run
because no application behavior changed.
