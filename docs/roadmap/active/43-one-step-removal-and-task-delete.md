<!-- plan id="43" status="active" summary="One-step cascade removal for sections and task Delete icons, with legacy reassign history preserved" -->
# Slice 43 — One-step section removal and task Delete (Slice 34 Stage D1)

## Goal

Make one remove gesture archive a section and its live owned rows, and present task archive as Delete in the browser, while keeping history and durable recovery correct.

## Spec sections

Main §§8, 11–14, 27, 31–34, 53–54, 61–63, 69, 77–79; [Slice 34](../planned/34-undo-redo-and-archive.md) Stage D and its removal, task and compatibility rules. Main §31 still describes policy-driven reassignment: amend it when this change lands, not in this planning commit. §34's task archive remains the underlying reversible operation.

## Build

- Make section removal choose the existing exact cascade for live task/reflection rows without a policy input. Keep disposable-view deletion, archived-only owner retention, shortcut safety, exact-actor repeat receipt, one Activity event and one history action.
- Remove removal-time policy/target from new HTTP, MCP and browser requests. Make the public input strict so Zod cannot silently strip old fields. Preserve version-1 `section.remove` payload parsing and execution for histories already containing `reassign`; ordinary task moves remain available.
- Replace the canvas's refusal/dialog flow with one direct remove and its existing uncertain-write Retry remove, Open Archive and Retry refresh behavior. Rename the Task List row's visible and accessible archive affordance to Delete, and add the same action to Todos' own row/store; retain soft archive and current restore/history behavior.
- Update current spec, architecture, decisions and acceptance evidence alongside implementation; record real-use friction.

## Done when

A single canvas remove or `DELETE /api/sections/:id`/`remove_section` without policy atomically archives a live task or reflection container with its live rows and returns one receipt. Undo and Redo preserve exact row IDs and independent archive markers; Archive Restore remains durable. Old reassignment input is rejected without mutation, while an existing stored reassign action still parses and transitions. Task rows offer a Delete icon with an accessible name, and Delete still yields the task's archive/Undo/Restore semantics. All listed acceptance checks pass.

## Do not

Do not implement Stage D's parent-first Archive filtering or Settings → Archived projects here; give them the next active plan. Do not remove independent task moves, hard-delete tasks, add project cascade, change history scope, add a new schema version solely for removing public request fields, or rewrite stored version-1 reassign operations. No Stage E integrated closure is claimed.

## Acceptance check

1. In isolated `nested-projects` data, remove a task container with a live task tree and an independently archived task, then a Reflections container with the same mix. Browser removal is one gesture with no policy dialog; HTTP `DELETE` and `remove_section` need only the ID. Assert returned IDs, one event/step, exact markers and no moved rows. Undo/Redo then Archive Restore recover their respective footprints; an archived-only container remains recoverable.
2. Send `policy=reassign`, `reassignToSectionId`, and MCP equivalents. Verify 400/tool input refusal, unchanged business/history/activity state and no publication. Independently move a task through `update_task` and verify it and its Undo/Redo still work.
3. Load a schema-5 fixture containing valid applied and undone legacy `section.remove` reassign actions; validate/reopen it and transition each applicable direction without data loss. Use isolated fixtures, never personal `.prototype/data.json`.
4. On Home and Reflections canvases, remove with keyboard and pointer, check focus lands on a surviving control and header Undo is available. Inject an uncertain write and a failed follow-up read separately; explicit Retry remove recovers the same receipt, while Retry refresh re-reads only. Check a narrow viewport and both themes.
5. On a Task List and root Todos, verify the trash icon says “Delete task” with the title in its accessible name, works by keyboard/pointer, remains available on finished task rows, is pending during the write, reports a descendant task's receipt to its own project history, rolls back/shows an error on failure, and leaves the row recoverable in Archive. Todos' project rows have no task Delete. Check the TaskRow story variants.
6. Run targeted tests first, then `pnpm test`, `pnpm lint`, `pnpm docs:check`, `pnpm build`, targeted e2e removal/archive/Todos journeys, host acceptance, and `mcp-acceptance` over HTTP and stdio. Run the actual app with `nested-projects` and a real MCP client; record friction in `.prototype/notes.json`.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/inputs.ts`, `inputs.test.ts` | modify | Strict no-policy removal input; reject old fields rather than strip them. |
| `packages/contracts/src/section.ts`, `section.test.ts` | modify | Retire obsolete live-row refusal details. |
| `packages/contracts/src/undo.ts`, `undo.test.ts` | modify only if required | Preserve stored reassign payload compatibility; pin legacy parsing and new cascade capture, never narrow the persisted union. |
| `packages/domain/src/section-service.ts`, `section-service.test.ts`, `section-ownership.test.ts` | modify | Direct cascade, no reassign branch; exact markers, archive/disposable rules, permission and failure tests. |
| `packages/domain/src/section-removal-undo.ts`, `operation-history-service.test.ts`, `page-ownership.test.ts`, `project-archive-service.test.ts` | modify where assertions require | Keep legacy reassign executor; test new cascade histories and Archive recovery. |
| `packages/prototype-data/src/version-3-undo-compatibility.test.ts` | modify if needed | Validate stored legacy reassign action through current document path. |
| `apps/prototype-host/api/routes.ts`, `routes.test.ts` | modify | Parse strict empty removal query; refuse old fields without writing. |
| `packages/mcp-tools/src/tools/sections.ts`, `contract.test.ts` | modify | ID-only removal tool description/schema and contract checks. |
| `apps/web/src/app/core/gateway/work-manager-gateway.ts`, `prototype-work-manager-gateway.ts`, `prototype-work-manager-gateway.spec.ts`, `gateway-error.ts`, `testing/fake-gateway.ts` | modify | ID-only gateway call/fake; remove obsolete refusal mapping. |
| `apps/web/src/app/features/projects/project-page-store.ts`, `project-page-store.spec.ts` | modify | Direct removal, failed-write retry keyed by section, no prompt state; keep receipt/refresh recovery. |
| `apps/web/src/app/features/projects/project-canvas.ts`, `project-canvas.html`, `project-canvas.spec.ts` | modify | Remove dialog wiring; retain focus and recovery behavior. |
| `apps/web/src/app/features/projects/section-recovery-notice.spec.ts` | modify | Retry-remove fixture follows the ID-only failed removal shape; verify recovery copy. |
| `apps/web/src/app/features/projects/section-removal-dialog.ts`, `section-removal-dialog.html`, `section-removal-dialog.scss`, `section-removal-dialog.spec.ts` | delete | Retire policy choice UI. |
| `apps/web/src/app/features/tasks/task-row.ts`, `task-row.html`, `task-row.scss`, `task-row.spec.ts`, `task-row.stories.ts` | modify | Trash icon, Delete wording and accessible/pending states without changing archive behavior. |
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.html` | modify if needed | Keep the TaskRow binding and surrounding copy consistent. |
| `apps/web/src/app/features/projects/pages/todos-page.ts`, `todos-page.html`, `todos-page.scss`, `todos-page.spec.ts`, `todos-page-store.ts`, `todos-page-store.spec.ts` | modify | Todos has its own row: add task-only Delete, serialized with Complete, pending/failure handling and owner-scoped receipt reporting. |
| `apps/e2e/removal-undo.spec.ts`, `archive.spec.ts`, `todos.spec.ts`, `canvas-editing.spec.ts`, `canvas-history.spec.ts`, `project-history.spec.ts`, `web.spec.ts`; `apps/prototype-host/scripts/acceptance.mjs`, `mcp-acceptance.mjs` | modify where affected | Replace policy/dialog assertions and verify browser/HTTP/both-transport journeys. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | modify | Correct §§31, 34, 54, 61 and 69 where old policy and task Archive wording are current claims. |
| `docs/decisions/2026-09-one-step-section-removal-and-task-delete.md`, `docs/decisions/README.md` | create/modify | Record the user-directed choice, retained legacy execution and revisit condition; index it. |
| `docs/decisions/2026-09-reassign-may-cross-pages.md`, `2026-09-content-oriented-archive-policy.md`, `2026-09-section-removal-undo-records.md`, `2026-09-disposable-removal-and-immediate-undo.md`, `2026-08-task-status-transitions-and-archive.md` | append dated amendment | Mark removal-time reassign/prompt retired, independent moves and historical execution retained, and task archive presented as Delete. |
| `docs/architecture/contracts/{overview,why,what,how}.md`, `docs/architecture/domain/{overview,why,what,how}.md` | modify as needed | Describe current request shape and cascade; link decision and stored payloads. |
| `docs/architecture/prototype-host/api/{overview,why,what,how}.md`, `docs/architecture/mcp-tools/{overview,why,what,how}.md` | modify as needed | Describe ID-only route/tool and strict refusal. |
| `docs/architecture/web/core/{overview,why,what,how}.md`, `docs/architecture/web/projects/{overview,why,what,how}.md`, `docs/architecture/web/tasks/{overview,why,what,how}.md`, `docs/architecture/testing/{overview,why,what,how}.md` | modify as needed | Keep gateway, canvas, task affordance and verification docs true; correct web/tasks/how.md's existing claim that Todos renders TaskRow. |
| `docs/guides/mcp-setup.md`, `docs/guides/first-milestone-walkthrough.md`, `README.md` | modify only where examples mention old input/copy | Correct commands and walkthrough if affected. |
| `docs/roadmap/active/43-one-step-removal-and-task-delete.md`, `docs/roadmap/goals.md`, `.prototype/notes.json`, `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | Review/outcome, direction, real-use notes and `CURRENT_SLICE = 43` at implementation start. |

## Test plan — tests first

| Test | Proves |
|---|---|
| `inputs.test.ts`: accepts `{}`, rejects old fields | Strict public shape before service work. |
| `section-service.test.ts` and `section-ownership.test.ts`: one-call task/reflection cascade, archived-only/disposable branches, rollback | Atomic direct behavior and exact markers. |
| `operation-history-service.test.ts`: new cascade and stored reassign Undo/Redo | History remains executable across the change. |
| `routes.test.ts` and `contract.test.ts`: ID-only success, old fields refused, minimal grant and foreign scope | HTTP/MCP parity and no partial write/leak. |
| `project-page-store.spec.ts` and `project-canvas.spec.ts`: one request, no prompt, uncertain retry, failed refresh, focus | Browser recovery without dialog state. |
| `task-row.spec.ts` and `task-row.stories.ts`: Delete label/icon/pending | UI semantics only; task archive still owns behavior. |
| `todos-page-store.spec.ts` and `todos-page.spec.ts`: task-only Delete on unfinished and finished rows, descendant receipt, pending and failure | Todos owns its own row and writes, with no TaskRow dependency. |
| `section-recovery-notice.spec.ts`: ID-only failed-removal fixture | Retry affordance still names and retries the same section. |
| `removal-undo.spec.ts`, `archive.spec.ts`, `todos.spec.ts`, `mcp-acceptance.mjs`: exact-ID journeys | One-step flow, independent move and recovery end to end. |

Write each named test before its implementation, observe the expected failure, then commit at meaningful green points with Slice 43 and the relevant § reference.

## Boundaries touched

Shared request shapes remain in contracts; stored version-1 action shapes stay readable. `SectionService` uses repositories, Clock and its existing recorder only; no new service edge. The history executor keeps its legacy reassign branch as data compatibility and does not call writing services. MCP still calls the domain service. Angular stores/components use only the gateway interface; the adapter alone knows HTTP. TaskRow stays presentation-only and its store continues to archive via its gateway. Styles use tokens; no new flag or core→prototype/feature import. No production infrastructure or new persistence collection.

## Explicit non-goals

- Stage D2: parent-first, restorable-only root Archive and Settings archived-project recovery.
- Stage E: integrated closure across the full Slice 34 acceptance matrix.
- Historical reassign request support, independent move removal, schema rewrite, global keyboard Delete, task hard purge, or automatic project cascade.

## Open questions

None blocks this plan. Use the Slice 34 interpretation that “Delete task” is the existing reversible soft archive; do not rename the transport operation in this phase. Archive filtering is Stage D2's decision, so this phase keeps the present projection while direct cascade changes what it receives.

## Revisions

- **Draft (2026-09-24):** Split Stage D after Stage C closure. This phase owns one-step removal and task Delete; parent-first Archive and Settings are reserved for D2. Preserved stored reassign payloads while retiring new requests, avoiding a schema migration solely for a public input change.
- **Review round 1 (2026-09-24):** Reviewer found Todos renders its own row rather than TaskRow, so the plan now includes its component/store, owner-scoped receipts and failure state. Added the recovery-notice spec, policy-dependent e2e journeys and two omitted decision amendments.
- **Review round 2 (2026-09-24):** Re-review found no substantive gaps. Added its two implementation notes: correct the stale Tasks architecture claim about TaskRow on Todos, and test Delete on finished Todos tasks as well as unfinished ones.

## Outcome

To be written after implementation and real-use verification.
