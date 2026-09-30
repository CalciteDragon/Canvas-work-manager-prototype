<!-- completed-record id="43" closed="2026-09-25" summary="One-step cascade removal and reversible task Delete" -->
# Slice 43 — One-step section removal and task Delete (Slice 34 Stage D1)

## Goal

Make one remove gesture archive a section and its live owned rows, and present task archive as Delete in the browser, while keeping history and durable recovery correct.

## Spec sections

Main §§8–9, 11–14, 27, 31–34, 53–54, 61–63, 69, 77–79; [Slice 34](../completed/34-undo-redo-and-archive.md) Stage D and its removal, task and compatibility rules. Main §§9, 27 and 31 still describe the old removal input, disabled-page reassign case and policy-driven removal: amend them when this change lands, not in this planning commit. §34's task archive remains the underlying reversible operation.

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
3. Load a schema-5 fixture containing valid applied and undone legacy `section.remove` reassign actions; validate/reopen it, Undo the applied action and Redo the undone action, and verify exact IDs without data loss. Use isolated fixtures, never personal `.prototype/data.json`.
4. On Home and Reflections canvases, remove a live-row container with keyboard, pointer and touch, check focus lands on a surviving control and header Undo is available. Inject an uncertain write and a failed follow-up read separately; explicit Retry remove recovers the same receipt, while Retry refresh re-reads only and returns keyboard focus to a surviving notice action or canvas control when the notice clears. Check a narrow viewport and both themes.
5. On a Task List and root Todos, verify the trash icon says “Delete task” with the title in its accessible name, works by keyboard, pointer and touch, remains available on finished task rows, is pending during the write, reports a descendant task's receipt to its own project history, rolls back/shows an error on failure, and leaves the row recoverable in Archive. Todos' project rows have no task Delete. Check the TaskRow story variants.
6. Run targeted tests first, then `pnpm test`, `pnpm lint`, `pnpm docs:check`, `pnpm build`, targeted e2e removal/archive/Todos journeys, host acceptance, and `mcp-acceptance` over HTTP and stdio. Run the actual app with `nested-projects` and a real MCP client; record friction in `.prototype/notes.json`.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/inputs.ts`, `inputs.test.ts` | modify | Strict no-policy removal input; reject old fields rather than strip them. |
| `packages/contracts/src/section.ts`, `section.test.ts` | modify | Retire obsolete live-row refusal details. |
| `packages/contracts/src/undo.ts`, `undo.test.ts` | modify only if required | Preserve stored reassign payload compatibility; pin legacy parsing and new cascade capture, never narrow the persisted union. |
| `packages/domain/src/section-service.ts`, `section-service.test.ts`, `section-ownership.test.ts` | modify | Direct cascade, no reassign branch; exact markers, archive/disposable rules, permission and failure tests. |
| `packages/domain/src/section-removal-undo.ts`, `operation-history-service.test.ts`, `page-ownership.test.ts`, `project-archive-service.test.ts` | modify where assertions require | Keep legacy reassign executor; test new cascade histories and Archive recovery. |
| `packages/domain/src/operation-history-service.test.ts` | modify | Validate, reopen and transition schema-5 documents with applied and undone legacy reassign actions; pin Undo and Redo compatibility. |
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
| `apps/e2e/removal-undo.spec.ts`, `archive.spec.ts`, `todos.spec.ts`, `canvas-editing.spec.ts`, `canvas-history.spec.ts`, `project-history.spec.ts`, `web.spec.ts`; `apps/prototype-host/live-updates.test.ts`, `scripts/acceptance.mjs`, `mcp-acceptance.mjs` | modify where affected | Replace policy/dialog assertions and verify browser/HTTP/both-transport journeys, including keyboard, pointer, touch, narrow width and both themes; prove rejected HTTP/MCP requests publish no frame. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | modify | Correct §§9, 27, 31, 34, 54, 61 and 69 where old request, policy and task Archive wording are current claims. |
| `docs/decisions/2026-09-one-step-section-removal-and-task-delete.md`, `docs/decisions/README.md` | create/modify | Record the user-directed choice, retained legacy execution and revisit condition; index it. |
| `docs/decisions/2026-09-reassign-may-cross-pages.md`, `2026-09-content-oriented-archive-policy.md`, `2026-09-section-removal-undo-records.md`, `2026-09-disposable-removal-and-immediate-undo.md`, `2026-09-sections-own-their-data.md`, `2026-09-what-undo-means-for-an-archived-row.md`, `2026-09-a-section-has-a-name.md`, `2026-09-a-disabled-page-hides-navigation-not-data.md`, `2026-08-task-status-transitions-and-archive.md` | append dated amendment | Mark removal-time reassign/prompt retired, independent moves and historical execution retained, and task archive presented as Delete. |
| `docs/architecture/contracts/{overview,why,what,how}.md`, `docs/architecture/domain/{overview,why,what,how}.md` | modify as needed | Describe current request shape and cascade; link decision and stored payloads. |
| `docs/architecture/prototype-host/api/{overview,why,what,how}.md`, `docs/architecture/mcp-tools/{overview,why,what,how}.md` | modify as needed | Describe ID-only route/tool and strict refusal. |
| `docs/architecture/web/core/{overview,why,what,how}.md`, `docs/architecture/web/projects/{overview,why,what,how}.md`, `docs/architecture/web/tasks/{overview,why,what,how}.md`, `docs/architecture/testing/{overview,why,what,how}.md` | modify as needed | Keep gateway, canvas, task affordance and verification docs true; correct web/tasks/how.md's existing claim that Todos renders TaskRow. |
| `docs/guides/mcp-setup.md`, `docs/guides/first-milestone-walkthrough.md`, `README.md` | modify only where examples mention old input/copy | Correct commands and walkthrough if affected; MCP setup must distinguish new cascade-only removals from legacy stored reassign actions. |
| `docs/roadmap/active/43-one-step-removal-and-task-delete.md`, `docs/roadmap/goals.md`, `.prototype/notes.json`, `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | Review/outcome, direction, real-use notes and `CURRENT_SLICE = 43` at implementation start. |

## Test plan — tests first

| Test | Proves |
|---|---|
| `inputs.test.ts`: accepts `{}`, rejects old fields | Strict public shape before service work. |
| `section-service.test.ts` and `section-ownership.test.ts`: one-call task/reflection cascade, archived-only/disposable branches, rollback | Atomic direct behavior and exact markers. |
| `operation-history-service.test.ts`: new cascade and stored reassign Undo/Redo | History remains executable across the change. |
| `routes.test.ts` and `contract.test.ts`: ID-only success, old fields refused, minimal grant and foreign scope | HTTP/MCP parity and no partial write/leak. |
| `project-page-store.spec.ts` and `project-canvas.spec.ts`: one request, no prompt, uncertain retry, failed refresh, focus | Browser recovery without dialog state; Retry refresh leaves keyboard focus on a surviving notice action or canvas control if the notice clears. |
| `task-row.spec.ts` and `task-row.stories.ts`: Delete label/icon/pending | UI semantics only; task archive still owns behavior. |
| `todos-page-store.spec.ts` and `todos-page.spec.ts`: task-only Delete on unfinished and finished rows, descendant receipt, pending and failure | Todos owns its own row and writes, with no TaskRow dependency. |
| `section-recovery-notice.spec.ts`: ID-only failed-removal fixture | Retry affordance still names and retries the same section. |
| `live-updates.test.ts`: retired HTTP/MCP removal fields | Strict refusal leaves the canonical snapshot unchanged and publishes no live frame. |
| `removal-undo.spec.ts`, `canvas-editing.spec.ts`, `archive.spec.ts`, `todos.spec.ts`, `web.spec.ts`, `mcp-acceptance.mjs`: exact-ID journeys | One-step live-container removal and task Delete, including keyboard, pointer, touch, narrow viewport and both themes on Task List/Todos, independent move and recovery end to end. |

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
- **Review round 3 (2026-09-24):** Reviewer found four append-only decision entries still described removal-time policy/reassignment as current, the MCP setup guide said removal Undo could restore moved rows, and the live-row acceptance check omitted touch. Added dated amendments for those entries, the guide correction, and touch coverage to acceptance and the e2e test plan.
- **Review round 4 (2026-09-24):** Re-review found the spec also describes the optional gateway input and disabled-page reassign case; added §§9 and 27 to the implementation scope and clarified ordinary moves remain. It also found no test target for current schema-5 reassign actions and ambiguous touch coverage, so the plan now names `operation-history-service.test.ts` for reopen/Undo/Redo and explicitly covers touch removal and Delete on Task List and Todos.
- **Review round 5 (2026-09-24):** Re-review confirmed §§9 and 27, the schema-5 reopen/Undo/Redo compatibility target, and the live-container removal and Task List/Todos Delete touch journeys are concrete and present across the acceptance, test and e2e file lists. No further substantive findings.
- **Implementation diff review round 1 (2026-09-24):** Independent reviewers found missing keyboard/focus and live-container journeys, an HTTP auth-order regression, and stale recovery documentation. Corrected the focus paths, added Home and Reflections coverage, authenticated before query validation, and aligned retry documentation and assertions.
- **Implementation diff review round 2 (2026-09-24):** Reviewers found a stale Todos write could release a newer root's serialized-write guard, the browser matrix did not exercise Retry remove/Retry refresh, and reflection removal lacked keyboard/touch proof. Guarded both completion and Delete finalizers by generation, added a race regression, browser recovery journeys, and keyboard/touch reflection coverage with focus and Undo assertions. The review also required explicit no-publication evidence for rejected HTTP/MCP fields; added a host live-update assertion and listed it in the file and test plans. Corrected two stale policy-choice descriptions.
- **Implementation diff review round 3 (2026-09-24):** A further accessibility pass found that Home's pointer cascade did not assert focus recovery or header Undo. Added both assertions for Home Task List and Reflections pointer removal; the targeted browser journeys pass.
- **Implementation diff review round 4 (2026-09-24):** Documentation review found narrow-width and two-theme checks covered other canvas actions but not removal itself. Added a focused 375px Task List cascade journey in dark and light themes, with focus, Undo and row-marker assertions.
- **Implementation diff review round 5 (2026-09-24):** A browser accessibility pass found successful Retry refresh removed its focused button without restoring focus. The canvas now focuses Open Archive when present, otherwise Dismiss, and the browser retry journey asserts the surviving action receives focus. Updated the project architecture how-to.
- **Implementation diff review round 6 (2026-09-24):** The follow-up found that a refresh-only or unlisted-removal notice disappears entirely after success, so it has no Open Archive or Dismiss target. Added the section-title/canvas fallback and an unlisted-removal keyboard journey that verifies focus after the read clears the notice.
- **Implementation diff review round 7 (2026-09-24):** The first unlisted-removal fixture used a task container with an archived row, which Archive correctly still lists because archived rows remain recoverable. Replaced it with an empty Reflections container retained only by a Home shortcut; the focused browser journey now verifies Archive omits it and that successful Retry refresh moves focus to the canvas after the notice clears.
- **Final documentation review (2026-09-24):** A reviewer read the Retry refresh focus rule as applying Dismiss to all successful reads. Clarified the architecture how-to into explicit branches: focus Open Archive/Dismiss while a notice remains, and focus the first surviving title/canvas when refresh clears it. No behavior changed.

## Outcome

**Deliverables.** Section removal now uses the shared ID-only input and archives the section with its live task/reflection rows through the existing markers and receipt in [SectionService](../../../packages/domain/src/section-service.ts), [the HTTP route](../../../apps/prototype-host/api/routes.ts) and [the MCP tool](../../../packages/mcp-tools/src/tools/sections.ts). The version-1 stored reassign action remains readable and executable. The canvas removes in one action with Retry/Open Archive/read-only refresh recovery; Retry refresh returns keyboard focus to a surviving notice action or canvas control if the notice clears. Task List and Todos expose accessible reversible Delete, with Todos owning subtree optimism, rollback and owner-scoped history receipts in [TodosPageStore](../../../apps/web/src/app/features/projects/pages/todos-page-store.ts) and [TaskRow](../../../apps/web/src/app/features/tasks/task-row.html).

**Deliberate choices and deviations.** New removals cascade live owned rows; independent task moves remain available, schema version 5 stays unchanged, and Delete continues to call task archive. These choices are recorded in the [Slice 43 decision](../../decisions/2026-09-one-step-section-removal-and-task-delete.md). Independent review added the Todos generation guard, explicit no-publication evidence, browser Retry remove/Retry refresh journeys, and focus/Undo checks across pointer, keyboard and touch. These closed acceptance gaps without changing the planned product behavior.

**Verification and real use.** `pnpm test`, `pnpm lint`, `pnpm build`, host acceptance, MCP acceptance over Streamable HTTP and stdio, and the targeted browser journeys passed. The browser work used `nested-projects`; the connected MCP client exercised the transports and the live-update path. Build reports the existing initial bundle budget warning (1.03 MB against 850 kB; 179.58 kB over), but exits successfully. Real-use friction is recorded in [.prototype/notes.json](../../../.prototype/notes.json): the row disappears optimistically, so reversible Delete may momentarily read as permanent.

**Deferred, open questions and documentation.** Stage D2 Archive filtering and Settings recovery, Stage E integrated closure, global keyboard Delete and hard purge remain deferred. Revisit whether the immediate Delete feedback needs to say “Archived” if use confirms that people mistake the reversible action for permanent removal. Updated spec §§9, 27, 31, 34, 54, 61 and 69; touched architecture folders for contracts, domain, API, MCP, testing, web projects and tasks; amended and indexed the decisions; corrected the MCP setup guide and documented Retry refresh focus behavior; and recorded real-use friction.
