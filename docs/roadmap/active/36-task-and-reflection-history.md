<!-- plan id="36" status="active" summary="Implementation plan for reversible task and reflection writes, compound creation and durable Activity identity" -->
# Slice 36 — Task and reflection operation history (Slice 34 Stage B)

**Planning only, 2026-09-17. Implementation has not started.** This is the next phase of
[Slice 34](../planned/34-undo-redo-and-archive.md), following
[Slice 35's Stage A and coverage audit](../completed/35-operation-history-foundation.md#coverage-matrix-audit).
The active location follows AGENTS.md steps 1–2; this request stops after reviewed planning.

## Goal

Make every currently supported committed task and reflection mutation one safely reversible
action in its owner's project history, including implicit containers and exact cascade effects.

## Spec sections

Main §§8–12 (gateway, contracts, domain), §§14–15 (conversion/atomic persistence), §27
(containers and disabled pages), §31 (history and Archive), §§33–34 (task fields/completion/cascade),
§36 (reflections and subjects), §45 (Clock), §§53–55 (grants/MCP), §57 (Activity), §§61–63
(API/live/optimistic state), §§69–70 (verification/boundaries), §§77–79 (use/decisions/notes).
[Main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md).

Amend §§14, 27, 31, 34, 36, 54–55, 57, 61–63 with implementation: row Restore becomes recorded
but remains durable and receipt-free to invoke; implicit containers join the row action; grants
vary by family; Activity outlives safely removed rows. Stage C/D behavior remains proposed.

Two amendments must be explicit, because the current text reads as a flat rule. §31 says Archive
Restore is "outside every history": from Stage B **row** Restore records an action while
**section** Restore stays outside until Stage C, and a recorded restore still needs no receipt,
never expires and still appends. §36 scopes subject *assignment* to completed, visible work in the
same root tree: Undo/Redo instead restores a captured subject link on workspace-scoped identity
alone, bypassing the eligibility check — and the disclosure branch in `assertSubjectEligible` —
that ordinary assignment keeps.

## Build

1. Strict row operation payloads and typed write/transition results.
2. Durable validated Activity identity before creation Undo removes canonical rows.
3. Record TaskService create/update/complete/archive/restore and ReflectionService
   create/update/archive/restore; typed revert/reapply functions never call writing services.
4. Compound capture of implicit containers, subtree moves, archive-group normalization and markers.
5. Family-dependent history grants and truthful MCP discovery metadata.
6. Migrate existing API/gateway/browser result consumers without changing editor commit points.
7. Domain, HTTP, both MCP transports and browser/live acceptance plus living documentation.

## Done when

Slice 34 Stage B's gate: **Add → complete → edit → delete and reverse/replay each step, including
implicit container; no lost dependents/unrelated edits.** Delete here is the existing archive
operation; its icon changes in Stage D. Reflections also pass Add → edit → archive → restore
and reverse/replay. All executable acceptance checks below must pass.

## Do not

- No runtime implementation during this planning request.
- No Stage C project/page/shortcut/duplicate/section-Restore history, header controls/store,
  missing-project route, persisted retry cache, or unused generic receipt reporter.
- No Stage D task trash styling, cascade-only inputs, removal dialog deletion, Settings or Archive filtering.
- No cross-project task moves, ordering/subtask UI (Slice 20), reflection move API or new
  `update_reflection` MCP tool. Reflection edit remains an existing HTTP/gateway/domain surface.
- No arbitrary patches, event sourcing, history browser, global keyboard interception/store,
  production infrastructure, or ordinary-operation hard deletion of rows.

## Repository findings and implementation rules

### Committed actions and result contracts

`TaskService.commit` records Activity before four helpers that still change rows finish:
`moveSubtree` and `normalizeArchiveGroup` in `update`, `archiveDescendants` in `archive`, and the
`archivedWithTaskId` clearing loop in `restore`. Capture the final root and all actually changed
descendants after those helpers; do not return or capture the earlier `committed` local when
marker normalization changes it. Archive/restore
include exactly their actual effects. Inject the existing OperationRecorder interface into both
row services. No-op/failure/cancel preserves Redo and emits no action/event.

`SectionService.resolveContainer` uses `addWithin`, which emits a section Activity event.
Add an explicit internal compound-resolution result containing the section and, only when newly
created, its snapshot/placement. Suppress the implicit section event in that path. Explicit
section add remains unchanged. A row create with an implicit container commits **one row event,
one action, one frame**. Do not invent a transaction/event framework.

Version-1 types: `task.add`, `task.update`, `task.archive`, `task.restore`, `reflection.add`,
`reflection.update`, `reflection.archive`, `reflection.restore`. Completion is task.update with
a completion label/verb; PATCH-to-done and complete share capture. Move/reparent is task.update.
Use typed discriminated field changes, distinguishing absence/value and rejecting duplicate or
unknown fields. Capture status/completedAt together when either changes; edits capture only
changed fields, cascades their structural footprint, creation the complete new entity.
Preserve createdAt/business dates; transition updatedAt comes from Clock. Redo uses stable IDs
and captured values, never a new create request.

Write contracts: `{ task, operation }` / `{ reflection, operation }` on create, update, complete,
archive **and restore**, required receipt on create, null operation on normalized no-op.
`TaskService.archive` already answers a `Task` and `ReflectionGateway.archive` a `Reflection`;
only `TaskGateway.archive` discards its entity as `Promise<void>` and must stop. Extend transition
unions with subject ID, operation kind, current entity
when present, affected row IDs and optional implicit-container/placement result. Undo Add
explicitly reports absence, never a fake live entity. Public results contain no inverse snapshots.
All shapes are contracts. Put shared placement schemas in `history-placement.ts` to avoid a
row-history → undo → row-history import cycle; preserve existing exports through index.ts.

### Safety, scope and ownership

- Keep exact actor/workspace/owning-project histories, retention, revision, pruning and strict
  cursor semantics. A root aggregate write on a descendant records in that descendant.
- Preflight the entire operation before writing. Compare only changed fields (after for Undo,
  before for Redo), preserving unrelated edits. Structural checks also validate workspace/project,
  kind, owner/container, live ancestry, acyclicity, parents and archive-group consistency.
- Task moves include archived descendants; capture reparent-only marker normalization even with
  unchanged sectionId. Cross-project moves still refuse. Redo move/archive/restore refuses if its
  canonical affected set differs from capture. Undo refuses if it would orphan, archive or move
  an unrecorded row. Never absorb later dependents into an old action.
- Undo archive/Redo restore reproduce exact captured markers. Pre-archived descendants retain
  theirs. Undo Restore cannot archive newly attached work. Ordinary row Restore remains available
  after expiry without a receipt; a successful restore now records and clears its own Redo branch.
- Undo Add deletes only the created row and optional created container. Refuse if the row was
  substantively edited or acquired children, reflection-subject links, cascade-marker references
  or any other canonical dependent (archived references count). Refuse the whole compound Undo
  if its implicit section acquired rows, shortcuts, meaningful edits or outside references.
  Never partially undo by silently keeping the section. Activity is historical as described below;
  operation snapshots are not canonical references and never appear in Archive.
- Redo Add requires captured IDs absent — refuse when another actor's Redo already recreated one —
  and owner/parent/subject references valid. Restore the implicit section through the combined-
  placement neighbor helpers `section-removal-undo.ts` already exports (`resolveUndoDestination`,
  `NOTHING_SETTLED`) plus `resolveRestoreIndex` in `page-placements.ts`; both are exported today,
  so expect to reuse them unmodified. Retain sibling updatedAt and report fallback placement.
  Extract pure validation helpers when needed, not service edges.
- History returns captured content to disabled pages (Undo is never behind a toggle); missing
  pages/changed capabilities refuse. Ordinary new create/move still needs an enabled page.
  Archived project ancestry blocks transitions. Archived sections/parents block any transition
  that would produce live or misplaced rows, with typed guidance rather than integrity errors.
- Reflection subject reversal restores the historical association if its entity still exists in
  the workspace; completion/live/root eligibility need not still hold (§36). Ordinary assignment
  keeps current eligibility. Undo task completion can reopen a reflected-on task; Undo task Add
  cannot remove the referenced subject.
- Preserve existing section retirement cases. New row conflicts remain repairable unless an
  explicit permanent case is justified in the decision/test table. Missing rows may be recreated
  by another actor's Redo, so absence alone is not permanent.

### Durable Activity and conversion

Choose captured historical identity rather than canonical tombstones: Undo Add removes content
from ordinary views and Archive without erasing audit evidence. Store target kind/ID/display
label and workspace-qualified owning project/root identity at event creation. Context agrees
with event identity fields; agent-connection events omit project/root. Titleless reflections
have a stable readable fallback. No executable inverse or caller-supplied historical context.

ActivityService validates/captures canonical identity inside the caller's unit **before deletion**,
then records through that trusted context and publishes once after commit. Resolve current names
when targets exist and captured labels otherwise. Historical owning context is not rewritten
when an entity moves. The current feed has no links; preserve that rather than inventing a
navigation contract. Test readable missing-target rows in both consumers of ActivityFeed.

Integrity keeps workspace/actor checks and existing canonical target workspace checks. Only a
missing task/reflection with complete matching captured identity is allowed in this phase;
projects, sections, milestones and connections still must exist. History owners remain canonical
projects. Context survives history expiry/pruning. Capture/backfill validates target/project/root;
reject foreign/inconsistent identities. On later load validate existing references and internal
consistency; this hand-editable JSON is not a cryptographically signed audit trail.

Use **schema version 5 with a bounded v4 → v5 converter**. This revises Slice 35's suggested
optional/backfilled v4 approach, which argued Stage B could make the field required in place and
pay no conversion tax. The forcing reason is load-time integrity: once historical context is
required, an existing v4 file that has never been backfilled fails `validateDocumentIntegrity` with
no remedy named, which is exactly the failure `describeVersion` exists to prevent. The version must
move so the operator is told to run the converter rather than handed a schema mismatch.
Freeze v3 → v4 at literal version 4 with opaque output (like v2 → v3); v4 → v5 validates the final
result. CLI explicitly chains 2 → 3 → 4 → 5 or starts from 3/4; v5 validates and writes nothing.
Preserve all v4 histories/actions/IDs/orders/cursor/revision/expiry; only v3 receipts retire as
before. Validate legacy Activity scope before backfill, so invalid foreign/missing targets are
not laundered. Backup before atomic replacement; malformed input and backup/write/rename failure
leave the original intact. CLI text must stop claiming v4 history starts empty. Use temp copies,
never upgrade the user's `.prototype/data.json` during tests.

Keep this bounded, per §71. Load-time validation reuses `validateDocumentIntegrity` in
`data-store.ts` rather than adding a second validator, and the converter stays inside the existing
`upgrade-*.ts` shape — one pure function plus its CLI step, no new abstraction.

### Permissions and transport parity

Summary reads retain projects.read, and that is not a dead end for a write-only agent: every
transition result **and** every refusal already carries the refreshed `OperationHistorySummary`,
so an agent holding only tasks.write or reflections.write starts from its create receipt and
chains from the summary each transition hands back. Record that as the deliberate write-only
workflow rather than widening `summary`. A tasks.write-only or reflections.write-only agent can
use its receipt for transitions, including implicit-container effects, without extra read/project
grants. Validate actor, find exact-owned history/action without disclosure, then assert that
stored action's family grant **before revision/conflict details**. Foreign/missing histories and
action/history mismatches are not-found; missing family grant is forbidden. Caller input cannot
choose the grant. Mixed histories never skip an unauthorized top action. Transport auth still
rechecks revocation/grants per call.

Replace WorkManagerTool's always-static permission with a discriminated static-versus-family
declaration. The shared wire metadata *shape* belongs in contracts, beside the `AgentPermission`
it is built from, because two packages assert it — `mcp-tools`' contract tests and the host's
discovery tests; the `_meta` key constants stay in `apps/prototype-host/mcp/server.ts`. Static tools retain singular and
plural keys. Undo/Redo instead publish a namespaced operation-family map (section → projects.write,
task → tasks.write, reflection → reflections.write), omitting misleading singular/conjunctive keys
for those two tools. Domain enforces; tools never inspect repositories. Contract tests enumerate
each family and direction under its minimal grant. Count stays 37; no new routes/tools.

### Browser behavior

Existing commits are task title blur/Enter, drawer change, create submit, completion toggle,
archive click and reflection submit/Save. Escape, unsaved typing and navigation create nothing.
**No browser surface creates an implicit container today.** Todos has no task creation at all —
`TodosPageStore` writes only `tasks.complete` for task rows, and its subproject rows go through
`projects.update`, which is Stage C and records nothing here — and `ReflectionsPageStore` creates its container
explicitly through `sections.create`, keeping its own `section.add` receipt, and refuses a write
until one is resolved (§36's "names the container it writes into"). Compound creation is therefore
exercised through HTTP and MCP; the browser's job is only to re-resolve when a compound frame
removes or restores a container.
Pin Enter followed by blur: TaskRow.commitTitle currently lacks an editing guard, so add the
small guard only if the regression test proves a duplicate. No debounce/autosave redesign.

Stores unwrap entities; receipts remain available at the gateway for Stage C. Preserve optimistic
completion, pending-write/epoch guards and visible error rollback. Refresh never repeats a write;
uncertain ordinary responses reconcile authoritative state without automatic mutation retry.
Task/reflection transition verbs remain task.*/reflection.* for current projection routing.
Compound actions also alter section existence: ProjectPageStore must refresh sections for those
project-scoped frames and ReflectionsPageStore re-resolve its container. One frame reaches all
readers. Existing section notices still address only their held action; a subsequent row mutation
may cause not-next, but must never make that notice undo a different action.

## Acceptance check

1. Isolated empty seed, create a project without a task container. Task add → complete → edit →
   archive, Undo all, Redo all, twice. Assert exact intermediate fields/dates/markers (except
   updatedAt), one action/event/frame per step, stable IDs and implicit-container placement.
   Reopen JsonDataStore between steps; Undo Add removes row/section from normal views and Archive.
2. Reflection add → edit → archive → restore and reverse/replay via HTTP, including implicit
   container and subject reassignment. Both MCP transports cover add/archive/restore. A same-agent
   domain-created reflection edit fixture can exercise its transition through the real transport;
   a registry assertion that no tool updates a reflection makes that absence a check, not a note.
3. Nested-projects: move/reparent multilevel live and pre-archived descendants, including same-page
   and cross-page moves in one project, reparent-only group normalization and cross-project refusal.
   Named later dependents block unsafe inverses — a child task, a reflection whose subject is the
   created task, and a shortcut to the implicitly created section — with no business, history or
   event changes on the refusal.
4. Actor A title edit plus actor B priority edit: A Undo/Redo preserves priority. Overlapping edits
   refuse. Mixed section/task/reflection history follows exact order. No-op/failure retains Redo;
   new success clears only its own branch. Test both directions, stale retry and revision race.
5. Minimal-grant agents transition compound writes; deny wrong/removed grants, revoked tokens,
   another connection of same user, and foreign workspace. A tasks.write-only agent runs a whole
   add → Undo → Redo chain from its create receipt and the summaries the transitions return,
   never calling `get_operation_history`, while that read still refuses without projects.read.
   Verify real tools/list metadata.
6. Undo Add, reopen, expire/prune: historical Activity still readable with absent target. Before
   expiry Redo restores stable IDs and current-name resolution. Convert a v4 document holding
   applied/undone section actions and prove their history still works after upgrade.
7. Browser: author tasks on Home, commit a **task** completion from Todos (a subproject row there
   records nothing until Stage C), and write reflections on the
   canvas section and the Reflections page; one action per commit, none on Escape. Drive history
   through HTTP as the browser persona (no row controls exist yet) and HTTP MCP as the agent.
   Home/Todos/Archive/Reflections refresh without reload, then survive reload. Because no browser
   surface creates one, the implicit container is created by the agent: assert the open pages
   re-resolve it when a compound frame removes and restores it. Optimistic failure and late
   responses never duplicate writes or overwrite the newly navigated scope.
8. Inject action insert, Activity insert and persistence failure in forward/Undo/Redo compound
   operations: disk/content/history unchanged, no frame. Success publishes exactly one frame
   only after the canonical data and action state are readable.

Implementation verification commands:

```bash
pnpm test
pnpm lint
pnpm build
pnpm --filter @cwm/prototype-host acceptance
pnpm --filter @cwm/prototype-host agent-acceptance
pnpm --filter @cwm/prototype-host mcp-acceptance
pnpm --filter @cwm/prototype-host live-acceptance
pnpm e2e
pnpm docs:check
git diff --check
```

Use targeted package suites while driving TDD, full checks at integration. For actual use, start
dev:web and dev:host separately against an isolated realistic seed; record real friction in
`.prototype/notes.json`. Stop the host before stdio uses that same file. Do not repeat green
checks without relevant changes. Record evidence in this plan's Outcome at implementation close.

## File-level change list

Paths are repository-relative. Braces enumerate concrete files; new files are marked. Read
existing files before editing. Caller adaptations are mechanical, not permission to refactor.
Two rows are conditional (`page-placements.ts`/`owned-rows.ts` and `task-row.ts`'s editing guard);
the Outcome records which way each resolved, so neither can be quietly skipped.

| File | Responsibility |
|---|---|
| `packages/contracts/src/{undo.ts,undo.test.ts,operation-history.ts,operation-history.test.ts,index.ts,index.test.ts}` | Extend unions/receipts/results and exports. `index.test.ts` pins the union option counts (`UndoResultSchema` 4, `RedoResultSchema` 4, transition 2) and must move with them. |
| New `packages/contracts/src/{row-history.ts,row-history.test.ts,history-placement.ts}` | Typed row payloads/results; extract existing placement schemas without an import cycle. |
| `packages/contracts/src/{activity.ts,activity.test.ts,document.ts,document.test.ts}` | Required historical context and version 5. |
| New `packages/contracts/src/{tool-permissions.ts,tool-permissions.test.ts}` | Shared discriminated static/family metadata shape. |
| `packages/repositories/src/{interfaces.ts,json-repositories.ts,data-store.ts,data-store.test.ts,repositories.test.ts}` | Restricted task/reflection removal; historical identity integrity and action owner dispatch. No project/page deletion. |
| New `packages/prototype-data/src/{upgrade-activity-identity.ts,upgrade-activity-identity.test.ts}` | Bounded v4 → v5 backfill, final validation, preserved history. |
| `packages/prototype-data/src/{upgrade-operation-history.ts,upgrade-cli.ts,upgrade-cli.test.ts,version-3-undo-compatibility.test.ts,upgrade-project-pages.test.ts,index.ts,seeds.ts,seeds.test.ts}` | Frozen v4 intermediate, explicit chain, error tests and seed context. |
| New `packages/prototype-data/test/fixtures/history-v4.json` | Pre-change document with Activity and applied/undone Stage A actions. |
| `prototype/seeds/{empty,personal-workspace,busy-week,nested-projects,overdue-chaos,agent-heavy}.json` | Regenerate from builders, never hand-edit. |
| `packages/domain/src/{task-service.ts,task-service.test.ts,reflection-service.ts,reflection-service.test.ts,section-service.ts,section-service.test.ts}` | Recorder wiring, final compound capture, resolver footprint/event suppression. |
| New `packages/domain/src/{task-history.ts,task-history.test.ts,reflection-history.ts,reflection-history.test.ts}` | Capture/preflight/revert/reapply; field and structural guards. Slice 34 named these files; they hold capture *and* both executors, which is why they are not `*-undo.ts` like `section-edit-undo.ts`. |
| `packages/domain/src/{operation-history-service.ts,operation-history-service.test.ts,operation-recorder.ts,operation-recorder.test.ts,operation-execution.ts,index.ts}` | Family dispatch/grants/events, broaden section-only subject assumptions while retaining exact removal-receipt lookup. |
| `packages/domain/src/{activity-service.ts,activity-service.test.ts}` | Capture before deletion, historical/current name resolution and publication. |
| `packages/domain/src/{page-placements.ts,owned-rows.ts}` | Reuse placement/structural helpers; modify only if compound capture requires it. |
| `packages/domain/test/test-support.ts` | Recorder wiring, result unwrapping and Activity fixtures. |
| `apps/prototype-host/api/{services.ts,services.test.ts,routes.test.ts}` | Composition and transparent result assertions. routes.ts already forwards results; comments only if stale. |
| `apps/prototype-host/{live-updates.test.ts,recovery-undo-acceptance.test.ts,concurrency.test.ts}` | Compound rollback/frame proof, old conversion assertions and the concurrent-revision suite. |
| New `apps/prototype-host/row-history-acceptance.test.ts` | Stage B chains, JSON reopen, conversion preservation. |
| `apps/prototype-host/auth/prototype-agent-authenticator.test.ts`, `packages/domain/src/{section-edit-undo.test.ts,section-shortcut-service.test.ts}`, `packages/mcp-tools/src/activity.test.ts` | Activity fixtures and envelope-aware assertions after required historical context. Version/load diagnostics stay in `data-store.ts`; `persistence/store.ts` needs no change. |
| `packages/mcp-tools/src/{tool.ts,contract.test.ts,registry.test.ts}`, `packages/mcp-tools/test/harness.ts` | Permission declaration/minimal-grant harness and dependencies. |
| `packages/mcp-tools/src/tools/{tasks.ts,reflections.ts,undo.ts}` | Envelope descriptions and transition family declarations. |
| `apps/prototype-host/mcp/{server.ts,handler.test.ts,stdio.test.ts}` | Discovery metadata and both-transport grant/revocation coverage. |
| `apps/prototype-host/scripts/{acceptance,agent-acceptance,mcp-acceptance,live-acceptance}.mjs` | Result decodes plus row chain evidence in existing scripts. |
| `apps/web/src/app/core/gateway/{work-manager-gateway.ts,prototype-work-manager-gateway.ts,prototype-work-manager-gateway.spec.ts,testing/fake-gateway.ts}` | Typed envelopes, including archive; no adapter leakage. |
| `apps/web/src/app/features/tasks/{task-list-store.ts,task-list-store.spec.ts,task-row.ts,task-row.spec.ts,task-detail-drawer.spec.ts}` | Unwrap entities and pin optimistic/commit/cancel behavior; row guard only if proved needed. |
| `apps/web/src/app/features/projects/{project-page-store.ts,project-page-store.spec.ts}` | Refresh implicit-section existence; no wrong-action notice behavior. |
| `apps/web/src/app/features/projects/pages/{todos-page-store.ts,todos-page-store.spec.ts,reflections-page-store.ts,reflections-page-store.spec.ts,archive-page-store.spec.ts}` | Result consumers, container re-resolution and projection races. Archive store ignores results, needs regression only. |
| `apps/web/src/app/features/projects/sections/reflections/{reflections-store.ts,reflections-store.spec.ts,reflections-section.spec.ts}` | Unwrap entity, preserve explicit Save/subjects. |
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.spec.ts` | Deferred archive fake now returns an envelope. |
| `apps/web/src/app/features/activity/{activity-feed.ts,activity-feed.spec.ts,activity-store.ts,activity-store.spec.ts}`; both `ActivityFeed` consumers, `apps/web/src/app/features/dashboard/dashboard-page.spec.ts` and `apps/web/src/app/features/projects/sections/activity/recent-activity-section.spec.ts` | Historical-label comments/tests and refresh; missing-target rows read correctly in the widget and the canvas section. No template redesign. |
| New `apps/e2e/row-history.spec.ts`; existing `apps/e2e/{mcp,reflections,todos,archive,section-edit-undo,removal-undo}.spec.ts` | Browser/HTTP/MCP journeys, decodes and section-history ordering regressions. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts`, `.prototype/notes.json` | CURRENT_SLICE 36 at implementation start; actual use evidence. |

Documentation checklist (with implementation, not shipped claims in this planning change):

- `AGENTS.md` §1 by name: extend the domain-dependency parenthesis, which today names only
  `SectionService` recording, to name `TaskService` and `ReflectionService` recording through
  `OperationRecorder` — the paragraph explicitly does not authorize an edge it has not listed —
  and change the Stack line `schema version 4` to 5.
- Main specification, `README.md`, `docs/guides/{mcp-setup,first-milestone-walkthrough}.md`:
  version/upgrade instructions, results/grants and the walkthrough.
- Four files `overview.md`, `why.md`, `what.md`, `how.md` in each of
  `docs/architecture/{contracts,repositories,prototype-data,domain,mcp-tools,testing}/`,
  `docs/architecture/prototype-host/{api,mcp-transport,live-updates}/`,
  `docs/architecture/web/{core,projects,tasks,dashboard}/`, `docs/architecture/web/`, and the
  repository-level `docs/architecture/` itself — whose `what.md` C4 node still says "JSON document,
  schema version 4", and whose `web/dashboard` files document the `ActivityFeed` the agent-activity
  widget reuses: review all four and update changed behavior/diagrams/public-symbol links. Correct
  already-stale version/undo names in touched descriptions; no unrelated documentation sweep.
- New `docs/decisions/2026-09-row-operation-history.md`, `2026-09-historical-activity-identity.md`,
  `2026-09-operation-family-permissions.md`, `2026-09-schema-version-5-conversion.md`, indexed in
  `docs/decisions/README.md`, linked from affected why.md files. Distinguish defaults from evidence.
- Dated amendments to `docs/decisions/2026-09-history-stage-a-deferrals.md`,
  `2026-09-operation-history-scope.md`, `2026-09-operation-history-retention.md`,
  `2026-08-activity-summary-ownership.md`, `2026-08-activity-feed-composes-from-parts.md`,
  `2026-08-live-events-ride-the-activity-record.md`, `2026-08-task-status-transitions-and-archive.md`,
  `2026-09-schema-version-4-conversion.md` (v3 → v4 freezes, v5 chains after it),
  `2026-08-mcp-tool-permission-metadata.md` (two tools stop publishing singular/conjunctive keys),
  `2026-09-what-undo-means-for-an-archived-row.md` (row Restore now records and clears its branch),
  `2026-09-reflection-subjects-and-the-journal-feed.md` (historical subject restoration) and
  `2026-09-a-disabled-page-hides-navigation-not-data.md` (history returns content to a disabled
  page). Mark every amended entry in the Status column of `docs/decisions/README.md`, as that index
  requires. Amend the retired-actions decision if adding a new permanent case. Frozen Slice 35
  stays untouched.
- This plan, `docs/roadmap/goals.md`, generated `docs/roadmap/progress.md` track preparation/closure.
  Slice 34 stays the parent proposal; Stages C–E are still unimplemented.

## Test plan — tests first

Write each named test and observe its intended failure before implementation. Migrate return-type
assertions without weakening their behavior checks.

| Test / file | Proves |
|---|---|
| Contracts row-history.test.ts: strict fields/compound payloads | Every operation/direction; rejects unknown types/versions/keys, duplicate fields/rows, mismatched IDs/owners and invalid results. |
| activity.test.ts/data-store.test.ts: historical scope | Missing row allowed only with matching context; foreign targets, inconsistent project/root, bad actors, missing canonical owners rejected. |
| upgrade-activity-identity.test.ts/upgrade-cli.test.ts: preserve v4 history | Applied/undone/retired actions and counters remain; v2/v3 chain; malformed scope and failed backup/write/rename preserve source; repeated v5 no-op. |
| task-history.test.ts: add/complete/edit/archive chain | Exact dates/fields/markers, repeated cycles, no-op branch preservation, implicit container placement/stable IDs. |
| task-history.test.ts: subtree/archive-group footprints | Multilevel live/pre-archived children, reparent-only normalization, cross-page move and cross-project refusal; extra/moved/missing descendants block unsafe directions. |
| task-history.test.ts: dependent and field conflicts | Children, reflection subjects, shortcuts and archived references guard Add Undo; edited Add subject refuses; a captured ID already present again — another actor's Redo recreated it — refuses Redo Add; unrelated edit survives field Undo/Redo, overlapping edit refuses. |
| reflection-history.test.ts: fields/subject/lifecycle | Title absence/body/subject set-clear-reassign; historical reopened/archived/out-of-root subjects; missing/foreign subject refusal; archive/restore/implicit container. |
| `task-service.test.ts`, `reflection-service.test.ts`, `section-service.test.ts`: final state and one event | Result follows normalization; null no-op; implicit event suppressed, explicit section event unchanged; row-write-only actor works. |
| operation-history-service.test.ts: mixed families | Strict order, exact actor, missing grant on top action, stale race/retry, archived ancestry, disabled-page history, retained section retirement semantics. |
| operation-history-service.test.ts/task-history.test.ts: expiry versus durable Restore | An expired `task.archive` action refuses both directions; ordinary `restore` still succeeds receipt-free afterwards, and that success records a new action that clears only its own Redo branch. |
| routes.test.ts: transition transport mapping | 403 for a missing family grant, 404 for a foreign or mismatched history/action, 409 for a stale revision, and the `{ task \| reflection, operation }` envelope forwarded verbatim. |
| activity-service.test.ts: audit outlives content | Capture before deletion, name fallback/current rename, historical context, titleless reflection, expiry/pruning independence and attribution. |
| MCP contract/handler/stdio tests: stored-family grants | Minimal grant per family/direction, removed grants/revocation, foreign actors/workspaces, no read grant needed, honest discovery metadata. |
| contract.test.ts/handler.test.ts: write-tool result envelopes | Every write tool's result parses as its new envelope — a wire change for existing clients — the receipt it carries is accepted by the next `undo_operation`, and no tool updates a reflection. |
| row-history-acceptance.test.ts/live-updates.test.ts | JSON reopen each direction, single post-commit event/frame, action/Activity/persist failures roll back all changes, concurrent revision advances once. |
| `prototype-work-manager-gateway.spec.ts`, `task-list-store.spec.ts`, `project-page-store.spec.ts`, `todos-page-store.spec.ts`, `reflections-page-store.spec.ts`, `reflections-store.spec.ts`, `archive-page-store.spec.ts`: guard preservation | Archive result retained; optimistic rollback, write epochs, stale navigation/persona/seed responses, no replay; compound frames re-resolve sections. |
| `task-row.spec.ts`, `task-detail-drawer.spec.ts`, `reflections-section.spec.ts` and `apps/e2e/row-history.spec.ts`: commit boundaries | Enter then blur one write/action; Escape/unsaved input none; reflection Save one; transitions refresh projections/container existence and survive reload. |

## Implementation order

1. Contract/integrity/converter tests first, then required historical identity and upgrade with old
   section behavior green. No row deletion until Activity is safe.
2. Activity capture/fallback and permission metadata tests then code. Metadata and domain agree
   before any non-section transition ships.
3. Task capture/executors/envelopes and required callers; incrementally drive add/complete/edit/
   archive/restore and subtree failures. Do not leave unrelated red suites behind.
4. Reflection capture/executors/callers; cross-family ordering and cross-reference tests.
5. Live/browser and transport acceptance; spec/decision/architecture reconciliation. Subagent diff
   reviews cover correctness/spec, boundaries, acceptance and living docs. Fix and verify, run
   actual use, then close only with evidenced acceptance and a written Outcome.

Commit meaningful green increments referencing Slice 36 and relevant §N. Independent fixture/caller
work can be delegated after contracts stabilize; compound capture, integrity and permissions stay
with the phase owner. A material scope change requires revising and reviewing this plan first.

## Boundaries touched

TaskService/ReflectionService gain OperationRecorder interface edges only; SectionService
resolution stays acyclic. OperationHistoryService composes only ActivityService and repository
interfaces, never writing services. No HTTP/MCP/JSON in domain, repositories in MCP, or parallel
contract types. Mutations/history/Activity share a caller-owned unit and injected Clock.
Angular depends on gateway interfaces and feature signals; no concrete adapters/core-to-prototype
edges/global store. Use tokens for any necessary styles; no styling is planned. Persistence and
conversion stay bounded, disposable implementations, not a framework.

## Explicit non-goals

The Do not list is binding. Row history is exercised through existing authoring UI and history
API; persistent browser controls and owner-labelled feedback are Stage C. Project root context
can be captured now, but missing-project/history-owner integrity relaxation waits for project
creation Undo. This phase does not close all of Slice 34.

## Open questions

No user decision is needed for the scoped work after review. Defaults are captured historical
Activity with explicit v5 conversion, historical-subject restoration, current editor commits,
family metadata and no new reflection edit tool. Rationale is above; implementing decisions
must report what tests/use actually establish. Resolve any substantive review finding before
implementation; do not silently expand into Stage C.

## Revisions

- **Preparation (2026-09-17):** Read Stage A code/outcome, spec and touched architecture. Independent
  transport/browser audit found static permission metadata, void task archive, existing editor
  commits and absent MCP reflection edit. Draft also accounts for the implicit section's extra event.
- **Round 1 (2026-09-17) — spec, scope and acceptance.** A reviewer briefed on AGENTS.md, Slice 34,
  Slice 35's coverage audit and the cited spec text checked every Stage B row of the audit against
  the plan and found no missed row and no Stage C/D leakage. Its substantive findings, all applied:
  two acceptance clauses were not verifiable because **no browser surface creates an implicit
  container** — Todos has no task creation, and the Reflections page creates its container
  explicitly with its own receipt — so acceptance 7 now authors on Home, completes from Todos, and
  asserts container *re-resolution* against an agent-created compound; §31 and §36 read as flat
  rules today, so the amendment paragraph now states the row/section Restore split and the
  eligibility bypass explicitly; the archive-result claim was true only of `TaskGateway`, and
  `restore` was missing from the write contracts; `archiveDescendants` and `restore`'s marker loop
  also run after `commit`, so all four helpers are named; the v5 rationale now gives the forcing
  reason Slice 35's counter-argument lacked (an un-backfilled v4 file would fail load-time
  validation with no remedy named). One finding was **corrected rather than applied**: the reviewer
  argued a write-only agent could never discover the next action id without `projects.read`, but
  every transition result and refusal already carries the refreshed summary, so the plan records
  that receipt-then-summary chain as the deliberate workflow and acceptance 5 proves it, instead of
  widening `summary`. The reviewer's `tool-permissions.ts` YAGNI objection was resolved the other
  way, with the reason written in: two packages assert that wire shape.
- **Round 2 (2026-09-17) — boundaries, tests, files and docs.** A second reviewer, briefed on the
  boundaries, the documentation protocol and the real code, confirmed the new domain edges stay
  acyclic and found the failure/permission coverage otherwise strong. Applied: `store.test.ts` was
  listed as existing but does not exist, and version diagnostics live in `data-store.ts`, so that
  row is replaced by the four Activity-fixture suites that the required-context change actually
  breaks; `index.test.ts` pins the union option counts this plan changes; both `ActivityFeed`
  consumers, `concurrency.test.ts` and `activity-store.ts` joined the list; the architecture list
  gained the repository-level four files (whose `what.md` still says schema version 4) and
  `web/dashboard/`; five governing decisions gained amendments — version-4 conversion, tool
  permission metadata, archived-row undo, reflection subjects and disabled pages — plus the README
  Status-column rule; the AGENTS.md bullet now names §1's dependency parenthesis and Stack line
  rather than saying "dependency edges"; three test-plan rows that named no file now do; and new
  rows cover row-action expiry versus durable Restore, the transition route's 403/404/409 mapping
  and the write-tool envelope as a wire change. One finding did **not** hold: the placement helpers
  `resolveUndoDestination`, `NOTHING_SETTLED` and `resolveRestoreIndex` are already exported, so no
  extraction from `section-removal-undo.ts` is needed; the plan now names them as reuse-unmodified.
  The naming objection (`task-history.ts` versus `task-undo.ts`) was declined with its reason
  recorded — Slice 34 chose the names and these modules hold capture as well as both executors.
- **Round 3 (2026-09-17) — confirming pass.** A third reviewer re-verified every claim the revisions
  added — the two browser stores, the summary carried by transition results and refusals, the three
  exported placement helpers, `validateDocumentIntegrity`, the stale version-4 C4 node, the five
  named decision files and the pinned union counts — and resolved all ~70 paths in the change list,
  checklist and verification commands. It found no new error, no blocker and no Stage C/D leakage,
  and one nit, applied: Todos also completes *subproject* rows through `projects.update`, a Stage C
  write that records nothing, so acceptance 7 now names a task completion specifically. The plan
  carries no open review findings.

## Outcome

<Written only after implementation and acceptance. This session delivers a reviewed plan.>
