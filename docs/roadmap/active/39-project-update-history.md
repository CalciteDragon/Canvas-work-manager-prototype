<!-- plan id="39" status="active" summary="Project edits, status/archive/reactivation, reparenting, saved layout and progress settings reverse and replay in the owning actor's project history" -->
# Slice 39 — Project update and lifecycle history (Slice 34 Stage C3)

<!-- The first line is the state marker; scripts/roadmap.mjs owns it. While the plan is in
     planned/ keep only the first five sections and keep them short. When it starts (roadmap.mjs
     start), write the rest per AGENTS.md step 1, then revise it through review (step 2) and
     record the rounds under Revisions. Before roadmap.mjs complete, write Outcome. -->

## Goal

Make every changed update of an existing project reversible and replayable in its exact actor's project history, including archive, reactivation, reparenting, saved layout and progress settings.

## Spec sections

Main §§26, 31, 39, 53–54, 57, 61–63 and 69–70; Slice 34 Stage C's project and saved-option coverage.

## Build

- Add typed project update history and one receipt for each changed `ProjectService.update` or `archive` call.
- Reverse and replay recorded fields under current project hierarchy and archive guards; migrate HTTP, MCP and gateway write results together.
- Verify root and subproject status, reparenting, layout and progress settings through domain, transports and browser consumers.

## Done when

Project edits, status/archive/reactivation, reparenting and saved layout/progress options each produce one exact-actor action, Undo restores the prior values and Redo reapplies the captured values. No-op, unsafe hierarchy or archive transitions, conflicts, stale revisions and missing grants leave content and history unchanged. The same receipts and results survive reload across HTTP and both MCP transports; existing browser project writes still work.

## Do not

- No project creation Undo or missing-project recovery route, persistent header controls, retry cache, removal policy/Archive redesign, or production infrastructure.

## Phase boundary and repository findings

`ProjectService.update` is the single domain path for name, description, icon, target date,
status, parent, layout mode, progress formula and manual progress. `archive` calls the same
private `commit`; `restore_project` delegates to `update`, and the browser archives through
`projects.update`. Splitting saved options from lifecycle would instrument the same write twice
and leave an exposed mutation outside Slice 34's coverage matrix. This phase covers **existing
project updates only**. `create` and its canonical page remain bare-returning and unrecorded until
the creation/recovery-route phase.

The current history executor blocks every transition when its project is archived. An archive
action needs a narrow self-archive exception to Undo; a reactivation action needs the matching
exception to Redo after its Undo. `ProjectService.update` also permits metadata and reparent
writes while the project itself is archived; a `project.update` whose captured before **and**
after status are archived must be reversible while that same project remains archived, after
the normal field and hierarchy preflight. Otherwise an archive followed by an archived-project
rename would wedge the cursor forever. These are project-family exceptions for the subject
itself, never a general bypass. Archived **ancestors** still block every transition. The public summary's
`blockedBy` remains the observed archived project, even when that one selected transition is
eligible; later header controls must account for the action-specific exception rather than infer
that every action is disabled. A project action always belongs to the subject project's own
history even when reparenting changes its root; no history migrates between roots.

The write boundary is the normalized change `commit` applies. Capture only fields that changed,
with their exact before/after values, including optional-field absence and `completedAt` derived
from status. A normalized no-op leaves timestamps, Activity, history revision and Redo branch
alone. `project.archive` and `project.reactivate` are distinct kinds; other updates (including
completion, reopening, reparenting, layout and progress) are `project.update`. One PATCH that
changes status **and** other fields is one action and one Activity event.

Reverse and replay must preflight **all** captured fields against the expected directional
state, preserving unrelated fields. For status transitions, re-run the current active-child,
ancestor and explicit-reactivation rules. For reparenting, re-run same-workspace parent,
cycle/self-parent and archived-ancestry checks against the destination at execution time.
An archive is not a cascade, and a history transition may not acquire one. A conflicting
external write, missing project/parent, or newly live child refuses before any write. A
captured `completedAt` is restored verbatim, not recalculated from the transition clock;
only `updatedAt` advances. For a cross-root reparent, the one `project.*` frame carries the
new root, so an open old-root aggregate would otherwise miss the removal. Keep the event
contract and one-frame rule: browser root aggregate stores re-read on a project-targeted
`project.*` event anywhere in the current workspace. Only open aggregate stores fetch;
this also handles the reverse move. Prove old and new root projections update from the
one committed frame.

Use one strict `ProjectWriteResult = { project, operation }` for both `update` and `archive`,
with non-null receipt on a change and `null` on a no-op. Keep `create` returning a project.
PATCH and the three existing project-update MCP tools migrate together. Browser callers
unwrap the project and retain their current reconciliation and errors; this phase does not
give them a persistent Undo/Redo control or a new receipt notice. The receipt remains
available to HTTP/MCP callers and in the server history.

## Acceptance check

1. Against isolated `nested-projects` and `personal-workspace` data, edit a root's name,
   description, icon, target date, layout mode, progress formula/manual value and a
   subproject's parent/status. For every changed call, assert one `project.*` action and
   non-null receipt, Undo exact prior values and Redo captured values with the same project
   ID. A combined PATCH is one step. Verify completion/reopening preserves the captured
   `completedAt`, including a fixed test clock advanced between transitions.
2. Archive an eligible child then root. Undo the root's own archive while it is archived,
   Redo it, and reverse/replay an explicit child reactivation with the same self-archive
   exception. Edit an archived subject's name, Undo/Redo that edit, and reverse a combined
   archive-plus-field PATCH as one action. An archived ancestor still blocks. A live child blocks Redo archive. Durable
   project restoration still takes an explicit status and remains available after expiry.
3. Reparent a subproject across two roots, then Undo/Redo it; assert the old and new root
   trees, Todos/Archive projections and live refresh agree after each transition. A newly
   archived destination, missing/foreign parent, or new cycle refuses without a partial
   move. Include an archived subject moved across roots whose former parent is later
   archived; the self-archive exception must still refuse the Undo until that ancestor
   is repaired. Unrelated field edits survive; an overlapping field edit conflicts.
4. Verify a no-op, failed validation, missing grant, wrong actor/history, stale revision,
   injected persistence failure and reload. Each refusal has the established typed error
   and no content/history/activity/live partial change. A new ordinary write clears only
   that actor/project's Redo branch.
5. Exercise PATCH and `update_project`/`archive_project`/`restore_project` through real
   HTTP, Streamable HTTP MCP and stdio; assert the same typed envelope, exact IDs,
   `projects.write` grant and no payload disclosure. Exercise existing browser project
   edit/archive, Todos completion, progress setting and layout control after migration.
6. Run the named failing tests first, then `pnpm test`, `pnpm lint`, `pnpm docs:check`,
   `pnpm build`, `pnpm --filter @cwm/e2e e2e -- web.spec.ts todos.spec.ts archive.spec.ts`
   and `pnpm --filter @cwm/prototype-host mcp-acceptance`. Start `pnpm dev:web` and
   `pnpm dev:host` separately for a seeded real-use and MCP pass; record friction in
   `.prototype/notes.json`. Do not reset personal runtime data for automated tests.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/project-history.ts`, `packages/contracts/src/project-history.test.ts` | create | Strict v1 project update/archive/reactivate payloads and write result; optional-field presence and captured status/time invariants. |
| `packages/contracts/src/operation-receipt.ts`, `packages/contracts/src/tool-permissions.ts`, `packages/contracts/src/tool-permissions.test.ts`, `packages/contracts/src/undo.ts`, `packages/contracts/src/undo.test.ts`, `packages/contracts/src/index.ts` | modify | Add project kind/family/grant, operation ownership/subject, transition result/conflict unions and exports. |
| `packages/domain/src/project-service.ts`, `packages/domain/src/project-service.test.ts` | modify | Record normalized changed fields in `commit`; return typed envelopes on update/archive; preserve create and existing hierarchy rules. |
| `packages/domain/src/project-history.ts`, `packages/domain/src/project-history.test.ts` | create | Capture, preflight and both directional executors, with status, parent and field guards and no writing-service edge. |
| `packages/domain/src/operation-history-service.ts`, `packages/domain/src/operation-history-service.test.ts`, `packages/domain/src/reflection-service.test.ts` | modify | Dispatch project actions, action-specific self-archive exceptions, summaries, activity verbs and typed refusals; migrate the test consumer of an updated project. |
| `packages/domain/test/test-support.ts`, `packages/mcp-tools/test/harness.ts`, `apps/prototype-host/api/services.ts`, `apps/prototype-host/api/routes.test.ts` | modify | Supply the existing `OperationRecorder` to `ProjectService` in domain/MCP test and host composition. |
| `apps/prototype-host/api/routes.ts` | modify | Pass project update envelope through PATCH; retain bare create result and route status. |
| `apps/prototype-host/live-updates.test.ts` | modify | Assert one post-commit project frame on forward/Undo/Redo and no frame or disk change after failed persistence, including cross-root reparent. |
| `packages/mcp-tools/src/tools/projects.ts`, `packages/mcp-tools/src/contract.test.ts`, `packages/mcp-tools/src/activity.test.ts` | modify | Pass project update/archive/reactivate envelopes and prove minimal grants. |
| `apps/web/src/app/core/gateway/work-manager-gateway.ts`, `apps/web/src/app/core/gateway/prototype-work-manager-gateway.ts`, `apps/web/src/app/core/gateway/prototype-work-manager-gateway.spec.ts`, `apps/web/src/app/core/gateway/testing/fake-gateway.ts` | modify | Parse/return the shared project write envelope while create stays bare. |
| `apps/web/src/app/features/projects/project-workspace-store.ts`, `apps/web/src/app/features/projects/project-workspace-store.spec.ts`, `apps/web/src/app/features/projects/pages/todos-page-store.ts`, `apps/web/src/app/features/projects/pages/todos-page-store.spec.ts`, `apps/web/src/app/features/projects/pages/archive-page-store.ts`, `apps/web/src/app/features/projects/pages/archive-page-store.spec.ts` | modify | Unwrap project and refresh open root projections on project-targeted events, including cross-root reparent. |
| `apps/web/src/app/features/projects/sections/progress/progress-store.ts`, `apps/web/src/app/features/projects/sections/progress/progress-store.spec.ts`, `apps/web/src/app/prototype/dev-panel/project-layout-control.ts`, `apps/web/src/app/prototype/dev-panel/dev-panel-controls.spec.ts`, `apps/web/src/app/prototype/dev-panel/state-inspector-store.ts`, `apps/web/src/app/prototype/dev-panel/state-inspector-store.spec.ts` | modify | Preserve progress and layout writes, including the inspector's local project list, with the new envelope. |
| `apps/prototype-host/scripts/mcp-acceptance.mjs`, `apps/e2e/web.spec.ts`, `apps/e2e/todos.spec.ts`, `apps/e2e/archive.spec.ts` | modify | Pin transport and browser journeys for status, archive, reparent/projection and result migration. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | modify with implementation | Amend §§26, 31, 39, 54, 57 and 61–63 for shipped project history, self-archive transitions and write results. |
| `docs/decisions/2026-09-project-update-operation-history.md`, `docs/decisions/README.md`; dated amendment to `docs/decisions/2026-08-project-create-edit-archive-surface.md` | create/modify with implementation | Record why existing-project lifecycle is one action family and the self-archive exception; index and link it. |
| `docs/architecture/contracts/overview.md`, `docs/architecture/contracts/why.md`, `docs/architecture/contracts/what.md`, `docs/architecture/contracts/how.md` | modify with implementation | Add the shipped project operation family and link the decision and schemas. |
| `docs/architecture/domain/overview.md`, `docs/architecture/domain/why.md`, `docs/architecture/domain/what.md`, `docs/architecture/domain/how.md` | modify with implementation | Describe project recording/execution, self-archive guard, hierarchy checks and dependency edge. |
| `docs/architecture/mcp-tools/overview.md`, `docs/architecture/mcp-tools/why.md`, `docs/architecture/mcp-tools/how.md` | modify with implementation | Describe new project envelopes and permission family; link the decision. |
| `docs/architecture/prototype-host/api/overview.md`, `docs/architecture/prototype-host/api/why.md`, `docs/architecture/prototype-host/api/how.md` | modify with implementation | Document response shape, composition and the new decision. |
| `docs/architecture/web/core/how.md`, `docs/architecture/web/projects/how.md`, `docs/architecture/web/projects/why.md`, `docs/architecture/web/prototype-tooling/how.md`, `docs/architecture/testing/how.md` | modify with implementation | Update gateway, consumers, cross-root refresh, layout control and verification paths. |
| `docs/guides/mcp-setup.md` | modify with implementation | Show the project update/archive/restore `{ project, operation }` receipt, project-family grant and narrow archived-subject transition rule. |
| `docs/roadmap/active/39-project-update-history.md`, `docs/roadmap/progress.md`, `docs/roadmap/goals.md`, `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts`, `.prototype/notes.json` | modify | Plan/revisions/outcome, generated board, direction, `CURRENT_SLICE` at implementation start and real-use friction. |

## Test plan — tests first

| Test | Proves |
|---|---|
| `project-history.test.ts: update captures only changed nullable and optional fields` | Strict footprint; disjoint changes survive Undo/Redo, overlapping changes refuse. |
| `project-service.test.ts: each changed update and archive returns one receipt; no-op leaves Redo` | One action in the caller's unit, including combined PATCH and both archive entry points. |
| `project-history.test.ts: completion and reopening preserve the captured completedAt` | Timestamp is business state, not regenerated by transition time. |
| `operation-history-service.test.ts: archive Undo, reactivation Redo and archived-subject edit work; archived ancestor blocks` | Narrow project-only exceptions, no general archived-owner bypass or stuck cursor. |
| `project-service.test.ts: archive plus field PATCH is one action` | The initiating call keeps every changed field in one footprint and restores them together. |
| `project-history.test.ts: archive Redo refuses a newly live child` | Rechecked noncascade rule, unchanged content/cursor on refusal. |
| `project-history.test.ts: reparent Undo and Redo recheck parent, cycle, ancestry and workspace` | No unsafe hierarchy or cross-workspace transition; old/new root refresh. |
| `project-history.test.ts: archived cross-root reparent cannot Undo into an archived former ancestor` | Self-archive eligibility never bypasses a destination ancestor blocker. |
| `operation-history-service.test.ts: wrong actor, grant, revision, overlap and persist failure` | Security, atomicity, cursor and Activity/live behavior. |
| `project-history.test.ts: same-field A/B chain and external disjoint edit` | LIFO/FIFO cycles work without overwriting unrelated state. |
| `contracts project-history.test.ts: malformed payloads and public envelope` | Version, unknown fields, impossible field pairs and snapshot secrecy. |
| `routes.test.ts and mcp-tools contract.test.ts: update/archive/reactivate envelopes` | HTTP and tool semantics with exact minimal grants; create remains bare. |
| `live-updates.test.ts: one project frame after commit, none after failed persistence` | Forward/Undo/Redo and cross-root publication remain atomic. |
| `prototype-work-manager-gateway.spec.ts`, `state-inspector-store.spec.ts` and affected feature store specs: response migration and failed refresh | Browser uses returned `project`, including the inspector's saved layout row, with no repeated write after a committed response. |
| `mcp-acceptance.mjs`, `web.spec.ts`, `todos.spec.ts`, `archive.spec.ts`: project updates across transports and browser | Reload, owner selection, both roots' derived views and current controls. |

Write each targeted failing test before its implementation and watch the intended failure.
Broaden to integration evidence once the relevant targeted suites are green.

## Boundaries touched

- Contracts are the only shared payload/result source. Domain services and executors use
  repository interfaces and injected `Clock`; `ProjectService` gains the existing
  `OperationRecorder` interface, while `OperationHistoryService` gains no service edge.
- MCP tools call `ProjectService`, never repositories. HTTP routes only parse/call/return.
  Angular components and stores use `ProjectGateway`; only `app.config.ts` names concrete
  adapters. `core/` gains no feature or prototype import.
- Project lifecycle grants come from the stored `project` action family and require
  `projects.write`; actor/workspace checks precede disclosure. The archived-subject exception
  applies only to project actions the forward service permits, never to sections, pages,
  shortcuts or rows, and never through an archived ancestor. All component styles use tokens.
- Activity remains audit information and live publication, never an inverse store. Cross-root
  reparent refresh uses one existing frame and a broader project-event read in open root
  aggregate stores, without a second event or speculative frame.

## Explicit non-goals

- Project creation history, hard deletion and its actor-scoped missing-project recovery route.
- Header Undo/Redo icons, browser receipt reporting, transition retry cache and global shortcuts.
- Stage D one-click container removal, task Delete UI and restorable-only Archive/Settings.
- Changes to independent task moves, section/page/shortcut history, production persistence or
  automatic project archive cascade.

## Open questions

- None that block implementation. If type-checking exposes a caller missed by the source
  inventory above, add its concrete path and test to this active plan before changing it.

## Revisions

- **Round 1 (2026-09-22) — return paths and publication.** Review found that
  `StateInspectorStore.setLayout` consumes a bare project and that the one-frame/rollback
  promise lacked a direct host test. Added the inspector and its spec, `live-updates.test.ts`,
  named cases, and an old/new-root refresh rule based on the existing committed frame.
- **Round 2 (2026-09-22) — archived owner and checklist.** Review found that the forward
  service permits archived-project metadata edits, which the initial history blocker would
  strand. Added a project-only archived-subject exception and tests for ancestor refusal and
  combined archive-plus-field PATCH. Replaced a nonexistent e2e path and shorthand file
  entries with concrete paths, including the MCP test harness; kept creation and persistent
  controls in later phases.
- **Round 3 (2026-09-22) — final documentation pass.** Reviewer found the MCP setup guide
  still describes the old set of write envelopes and grant families. Added its concrete
  result/receipt and archived-project guidance to the implementation checklist; README has
  no project-result example to change. Named the exact Playwright command and specs in the
  acceptance check so the gate is executable.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

**Deliverables** — <what now exists and works, with file links>.

**Deliberate choices** — <decisions made and why; options rejected; links to decision entries>.

**Deviations from the plan** — <what changed mid-implementation and what caused it>.

**Deferred** — <what was left out and which slice owns it>.

**Open questions** — <what the next phase or the user must answer>.

**Documentation updated** — <the architecture folders, decisions and guides touched>.
