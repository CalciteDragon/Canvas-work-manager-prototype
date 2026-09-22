<!-- completed-record id="38" closed="2026-09-22" summary="Optional-page enable/disable, including first-enable page creation, reverses and replays in the owning root's exact-actor history without deleting content" -->
# Slice 38 — Optional-page operation history (Slice 34 Stage C2)

**Implemented and closed — 2026-09-22.** Planned on 2026-09-21 and built against that plan;
the **Outcome** at the end of this file is the record of what shipped.

[Slice 34](../planned/34-undo-redo-and-archive.md) is the parent direction.
[Slice 37](../completed/37-section-and-shortcut-history.md) completed Stage C1.
This phase implements only the optional-page row of that direction's coverage matrix.

## Goal

Make optional-page enable/disable, including the page created on first enable, reversible in
its root project's exact-actor history without deleting content or changing ordinary navigation.

## Spec sections

Main §§8–15 (boundaries, contracts, persistence and atomicity), §§19–20 (feature stores),
§§23, 26–27 (root pages, ownership and navigation), §31 (recovery/history), §45 (Clock),
§§53–54 (grants and tools), §57 (Activity), §§61–63 (API/live/reconciliation), §68 (routes),
§§69–70 (verification), §§77–79 (evaluation and decisions).
[Main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md).

With implementation amend §§26, 31, 54, 57 and 61–63 to distinguish a nondestructive ordinary
disable from safe first-enable Undo. Keep current architecture and the spec unchanged during
this planning-only request. Existing rules are in
[optional pages](../../decisions/2026-09-optional-pages-are-created-on-first-enable.md),
[disabled pages](../../decisions/2026-09-a-disabled-page-hides-navigation-not-data.md),
[history scope](../../decisions/2026-09-operation-history-scope.md) and
[family permissions](../../decisions/2026-09-operation-family-permissions.md).

## Build

1. Add strict version-1 `page.add` and `page.update` payloads and a lightweight page-write envelope.
2. Record one action inside `ProjectPageService.setEnabled`'s existing unit; no-op returns null receipt.
3. Add typed capture/revert/reapply functions, a restricted page repository removal seam and
   the `page` family with `projects.write`; retain the existing archived-history blocker.
4. Migrate HTTP/MCP and gateway consumers together, preserving context reconciliation and live refresh.
5. Prove safe first-enable Undo, stable-ID Redo, nondestructive toggle history, failures and
   isolation across domain, file-backed host, both MCP transports and the real browser.

## Done when

Every successful optional-page state change has exactly one owning-root action and receipt;
no-op/failure changes neither history nor Activity. Undo first enable removes only its unchanged,
unreferenced page; Redo recreates the same page ID. Later enable/disable steps reverse only the
boolean, preserving all content. Conflicts, stale revisions, wrong actors and missing grants
write nothing. Reload and both transports preserve the same history. Browser navigation and
Open archive still reconcile correctly. This closes only optional-page coverage, not Stage C.

## Phase boundary

This is independent of project lifecycle and gives the next implementation a small new action
family with one initiating write. The remaining Stage C obligations are project edits/archive/
reactivation and saved layout/progress, project creation Undo **together with** authorized route
recovery, and persistent controls/receipt reporting plus the deferred transition retry cache.
Those require separate candidates when selected; Stage D still waits for usable broad Undo/Redo.
Do not combine project deletion, recovery routing or header coordination with this phase.

## Repository findings and implementation rules

### Recording and public results

`ProjectPageService.setEnabled` currently returns a bare page, creates an optional page on first
enable, updates only `enabled` thereafter, and emits `project.page_enabled`/`project.page_disabled`.
It rejects disabling a never-created page, disabling Home and all subproject toggles; Home enable
is an existing no-op. Keep these rules. Ordinary toggles remain permitted on archived roots so
Open archive remains reachable. No new endpoint or tool is needed.

Return strict `ProjectPageWriteResult = { page: ProjectPage, operation: OperationReceipt | null }`.
A changed write requires a non-null receipt by service behavior; identical existing state returns
null, with no timestamp, event, history revision or Redo-branch change. Record using the existing
`OperationRecorder` inside the same unit, after normalized mutation and before returning. Supply
the recorder through the composition root and every test harness. Labels name the kind and action.
First enable is `page.add`; an existing record's changed boolean is `page.update`.

The root owns the history even when the caller clicked Open archive or a toggle from a nested
work route. A page enable needed by Open archive is a committed state change, hence one action;
merely opening an already-enabled page is navigation and creates none. Do not feed these receipts
to the section-only transient notice or invent browser history reporting ahead of its phase.

### Payload and executor contract

`page.add` captures the canonical optional `ProjectPage` after insert; it must be enabled and
kind `todos`, `archive` or `reflections`. `page.update` captures project ID, page ID, optional
kind and distinct before/after enabled booleans. Neither accepts Home/work, arbitrary fields,
unknown versions or extra keys. Shared shapes come from contracts, never parallel interfaces.
Directional results identify project/page/kind and distinguish absent page on Undo Add from a
present returned page on Redo Add or either Update direction. Receipts/summaries never expose payloads.
Extend operation kinds, family, subject/project selectors, result unions and conflict entity kinds.

Executors use repository interfaces and Clock inside the transition's existing unit. They do not
call `ProjectPageService`, open a transaction, record Activity or record another action.

- **Undo Add:** require the captured page ID, root owner/kind, createdAt and enabled state to
  match; ignore updatedAt so intervening own toggles undone in order do not obstruct it. Check
  every canonical section (including archived sections) and placement referencing the page before
  removing it. A section is sufficient to protect all its rows; no cascade or opportunistic cleanup.
  Any such dependency refuses the entire transition, even an empty retained container. Do not
  silently substitute disable for deletion. Canonical references matter; history snapshots do not
  pin the page alive, so a later section add fully undone may allow page-add Undo.
- **Redo Add:** require absence of the captured ID and absence of another page of that kind in
  the captured root. Recreate the captured page, preserving ID and createdAt, stamping updatedAt
  with Clock; do not call first enable or mint a new ID. A same-kind replacement is a conflict,
  never something to adopt, overwrite or delete. Recheck owner scope/kind.
- **Update in either direction:** require the same page ID/root/kind and the expected boolean;
  change only enabled and updatedAt. Sections, layout, rows and shortcut sources are untouched,
  including archived content. Later unrelated content does not block this nondestructive reversal.
- Scope checks reject missing/foreign owners before writing. Missing pages, replacement kinds,
  changed booleans and dependencies yield typed repairable `history_conflict` with explicit
  next steps; introduce no new permanent-retirement rule in this phase. Reuse `missing`,
  `already-exists`, `page-changed`, `field-changed`, `new-dependent` and `shortcut-reference`
  with existing next-step values; add `page` to conflict entity kinds. A dependency that must
  be removed uses `remove-reference-and-retry`, never guidance to archive it (archived references
  still block removal). Archived owners still produce
  `history_blocked` before executor dispatch, in both directions, matching Slice 34's ordinary
  history freeze. A caller can use the ordinary toggle while archived; it is not a freeze bypass
  through history. Document and test this distinction, including the summary's `blockedBy`.

`ProjectPageRepository.remove` is restricted to this preflighted first-enable inverse; ordinary
disable never uses it. `JsonCollectionRepository` already has removal machinery; expose it through
the page interface with a narrow doc comment. Existing integrity checks must continue rejecting
canonical-page deletion and dangling section/page references. Do not relax canonical ownership.

### History, permissions, Activity and compatibility

Add the `page` family to the one contracts mapping as `projects.write`; discovery and transition
checks use that mapping. Exact actor/workspace checks precede disclosure, family authorization
precedes revision/conflict details, and a projects.write-only agent can write and transition from
its receipt without projects.read. Summary still requires projects.read. One denied top action
cannot be skipped. Existing 24-hour/50-action pruning, cursor/revision and no retry-cache semantics
remain; never automatically replay a transition after an uncertain response.

Page actions and transitions target the owning **project** in Activity; no page entity kind,
historical page target exception or project-history ownership relaxation. Add `project.page_addition_undone`
/ `project.page_addition_redone` and `project.page_update_undone` / `project.page_update_redone`
verbs following `activityActionFor`'s existing noun mapping, one event
and one post-commit root-scoped live frame per successful step. Teach labels/result presentation
about the new kinds explicitly. Page removal does not remove its project-targeted audit history.

Keep schema version 5: the operation union expands additively and existing documents require no
backfill or reinterpretation. Prove an existing v5 document loads untouched and a document with
applied/undone page actions closes and reopens. Old binaries cannot read new operation members;
there is no downgrade promise. Do not create a converter or change committed seeds.

### Browser behavior

`ProjectWorkspaceStore.writePage` already awaits the write then `readContext` and handles
committed-write/read-failed separately. Keep that ordering, project/generation guards and read-only
retry. The store currently ignores the write's return, so the adapter/fake change need not cause
receipt UI or a new store. Page actions/transition frames must reach existing project-context
refresh and route resolution: disabling/removing the displayed page returns to Home with the
existing explanation; enabling or recreating restores its tab but does not force navigation.
Verify root toggles from nested routes, persona changes, pending writes and a second browser tab.

## Acceptance check

During implementation, write each test first and observe its relevant failure before code.

1. Run `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm docs:check` once the final implementation is
   ready; no claim of completion with a failing required check. Use targeted package tests while iterating.
2. Extend and run `pnpm --filter @cwm/prototype-host acceptance`: on its temp personal-workspace
   document, create a Home-only root, first-enable Reflections, Undo to absent and Redo to the same
   ID, toggle off/on, Undo/Redo the boolean sequence, and reopen the file to inspect exact state.
3. Extend and run `pnpm --filter @cwm/prototype-host mcp-acceptance`: on isolated files, repeat
   page first-enable and toggle transitions through real Streamable HTTP **and stdio**; assert
   receipt/null envelope, exact IDs, minimal grant, another actor denial and fresh-auth revocation.
4. Add `apps/e2e/page-history.spec.ts`; run
   `pnpm --filter @cwm/e2e e2e page-history.spec.ts reflections.spec.ts row-history.spec.ts`
   with dev servers stopped. Use nested-projects, create a fresh root through the existing API
   for first-enable cases, and drive the real navigation manager/Open archive controls. Transition
   through the existing same-persona HTTP history endpoints because header controls are deferred.
   A second tab observes live changes. Reload proves persistence. Use created IDs, not empty-list
   assertions alone. Add a Reflections container/row under a second actor to block first-enable
   Undo; prove the entire document business/history state remains unchanged on that refusal.
5. Manually run `pnpm dev:host` and `pnpm dev:web` in separate terminals; use the same realistic
   seed, toggle pages from root and nested routes, test disabled-route recovery, and exercise an
   agent transition. Record observed friction in `.prototype/notes.json` with CURRENT_SLICE 38.
6. Review the implementation diff for correctness/spec, boundary rules and living docs; fix and
   rerun affected checks. Write Outcome only after this evidence exists; complete with roadmap.mjs.

## File-level change list

Paths below are the implementation checklist; **this planning commit changes only this plan,
`docs/roadmap/goals.md` and generated `docs/roadmap/progress.md`**. No runtime behavior has shipped.
Where two paths share a row each is a separate concrete file, not an open-ended directory task.

| File | Change / responsibility |
|---|---|
| `packages/contracts/src/page-history.ts`, `packages/contracts/src/page-history.test.ts` | Create strict payloads/directional results and valid/malformed cases. |
| `packages/contracts/src/page-write-result.ts`, `packages/contracts/src/page-write-result.test.ts` | Create lightweight page-write envelope and tests. |
| `packages/contracts/src/operation-receipt.ts`, `packages/contracts/src/undo.ts`, `packages/contracts/src/index.ts` | Add kinds/family, assemble unions and selectors, export symbols. |
| `packages/contracts/src/undo.test.ts`, `packages/contracts/src/operation-history.test.ts` | Extend union/receipt/result/summary compatibility tests. |
| `packages/contracts/src/tool-permissions.ts`, `packages/contracts/src/tool-permissions.test.ts` | Add page grant and discovery shape. |
| `packages/domain/src/project-page-service.ts`, `packages/domain/src/project-page-service.test.ts` | Record normalized writes/no-ops; migrate existing return-value assertions. |
| `packages/domain/src/operation-recorder.ts` | Update the public recorder doc comment's participating services; no recorder behavior change. |
| `packages/domain/src/page-history.ts`, `packages/domain/src/page-history.test.ts` | Create capture/executors with reference preflight and both-direction conflict tests. |
| `packages/domain/src/operation-history-service.ts`, `packages/domain/src/operation-history-service.test.ts` | Dispatch, Activity/labels, permission/archive/cursor tests; migrate disabled-page test setup without losing its regression. |
| `packages/domain/test/test-support.ts` | Supply page recorder. |
| `packages/domain/src/page-ownership.test.ts`, `packages/domain/src/section-service.test.ts`, `packages/domain/src/section-shortcut-service.test.ts` | Unwrap setup page writes; preserve original ownership assertions. |
| `packages/repositories/src/interfaces.ts`, `packages/repositories/src/json-repositories.ts` | Restricted page removal port/implementation documentation. |
| `packages/repositories/src/repositories.test.ts`, `packages/repositories/src/data-store.test.ts` | Removal works only in a unit; canonical/dangling-reference rejection and stored-action compatibility. |
| `apps/prototype-host/api/services.ts`, `apps/prototype-host/api/routes.test.ts` | Wire recorder including route harness; test existing PATCH envelope and statuses. |
| `apps/prototype-host/page-history-acceptance.test.ts` | Create focused file-backed atomicity/restart tests, including recorder/persist failures and no frames. |
| `apps/prototype-host/scripts/acceptance.mjs`, `apps/prototype-host/scripts/mcp-acceptance.mjs` | Extend actual transport journeys. |
| `packages/mcp-tools/test/harness.ts`, `packages/mcp-tools/src/tools/project-pages.ts`, `packages/mcp-tools/src/contract.test.ts` | Wire recorder, describe receipt semantics, assert minimal permissions and payload-free results. |
| `apps/prototype-host/mcp/handler.test.ts`, `apps/prototype-host/mcp/stdio.test.ts` | Pin expanded family discovery in both transports and denial after revocation. |
| `apps/web/src/app/core/gateway/work-manager-gateway.ts`, `apps/web/src/app/core/gateway/prototype-work-manager-gateway.ts`, `apps/web/src/app/core/gateway/prototype-work-manager-gateway.spec.ts` | Return/parse page envelope and test malformed/error/no-op paths. |
| `apps/web/src/app/core/gateway/testing/fake-gateway.ts` | Matching page envelopes and null no-op receipts. |
| `apps/web/src/app/features/projects/project-workspace-store.spec.ts`, `apps/web/src/app/features/projects/project-workspace-shell.spec.ts` | Migrate fakes and prove live/context/route guards with new results. |
| `apps/web/src/app/features/projects/project-workspace-store.ts` | Only if new transition verbs need explicit context invalidation; retain existing write/read separation. |
| `apps/web/src/app/features/projects/project-page-store.ts`, `apps/web/src/app/features/projects/project-page-store.spec.ts` | Extend undoResultMessage narrowing for page results without accepting page receipts into the section notice. |
| `apps/e2e/page-history.spec.ts` | Create browser/live/reload/blocked-creation journey. |
| `apps/e2e/reflections.spec.ts`, `apps/e2e/row-history.spec.ts` | Unwrap page-write response in existing page-creation setup and run the affected browser regressions. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts`, `.prototype/notes.json` | Bump CURRENT_SLICE at implementation start; capture real-use friction. |
| `AGENTS.md` | Add ProjectPageService's OperationRecorder edge; no additional service composition. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | Amend the sections identified above with implemented behavior only. |
| `docs/decisions/2026-09-optional-page-operation-history.md`, `docs/decisions/README.md` | New §78 decision and index for safe creation inverse, toggle history and freeze distinction. |
| `docs/decisions/2026-09-optional-pages-are-created-on-first-enable.md`, `docs/decisions/2026-09-operation-family-permissions.md` | Dated amendments: restricted creation inverse and page family. |
| `docs/architecture/contracts/overview.md`, `docs/architecture/contracts/how.md`, `docs/architecture/contracts/what.md`, `docs/architecture/contracts/why.md` | Payload/envelope inventory, compatibility and decision links. |
| `docs/architecture/domain/overview.md`, `docs/architecture/domain/how.md`, `docs/architecture/domain/what.md`, `docs/architecture/domain/why.md` | Page history, recorder edge, preflight and decision. |
| `docs/architecture/repositories/overview.md`, `docs/architecture/repositories/how.md`, `docs/architecture/repositories/what.md`, `docs/architecture/repositories/why.md` | Restricted page removal and unchanged integrity boundary. |
| `docs/architecture/mcp-tools/how.md`, `docs/architecture/mcp-tools/what.md`, `docs/architecture/mcp-tools/why.md` | Envelopes/grant inventory and decision. |
| `docs/architecture/prototype-host/api/how.md`, `docs/architecture/prototype-host/api/what.md` | Wire recorder and page response shape. |
| `docs/architecture/prototype-host/mcp-transport/what.md`, `docs/architecture/prototype-host/mcp-transport/why.md`, `docs/architecture/prototype-host/mcp-transport/how.md` | Update explicit discovery family map/count to include page and link the amended grant decision. |
| `docs/architecture/web/core/how.md`, `docs/architecture/web/projects/how.md` | Parsed envelopes, ignored receipts and live route reconciliation. |
| `docs/architecture/testing/how.md`, `docs/architecture/testing/what.md` | Acceptance journey and test inventory. |
| `docs/guides/mcp-setup.md` | Page result/grant and first-enable history example. |
| `docs/roadmap/active/38-optional-page-history.md`, `docs/roadmap/goals.md`, `docs/roadmap/progress.md` | Reviews/evidence/Outcome, remaining direction, generated board and eventual completion move. |

Review the four-file set of every touched system at implementation close; update only claims
changed by this phase. No command or URL changes are planned, so README needs no speculative edit.
If type-checking finds another direct page-result consumer, name it in this plan before editing;
do not broaden runtime scope. Public symbols get doc comments and Compodoc links.

## Test plan — tests first

| Test (file from checklist) | What it proves |
|---|---|
| `page-history.test.ts` (contracts): strict optional-page payloads | Every valid kind; reject Home/work, disabled add, unchanged boolean, foreign capture identity where duplicated, unknown fields/versions; unions and absent/present results parse. |
| `project-page-service.test.ts`: one action per changed toggle | First add vs subsequent update, root scope, null no-op, no-op/failure leaves Redo and timestamps untouched; existing Home/subproject/missing/foreign refusal cases retained. |
| `page-history.test.ts` (domain): first enable round trip | All three optional kinds; same ID/createdAt after cycles; updatedAt from Clock; same-actor enable/disable Undo chain reaches Add safely. |
| Same: dependents protect creation inverse | Live and archived sections, empty retained container, Reflections row via container, source section referenced from Home; no writes on refusal; fully undone dependent Add allows page Undo. |
| Same: reapply does not adopt another page | Occupied ID, same-kind replacement, missing/wrong owner, changed page kind/boolean; repairable typed conflict and no mutation. |
| Same: boolean inverses preserve content | All optional kinds; disabled Reflections with live/archived rows and source shortcuts stays byte-identical outside enabled/updatedAt; unrelated content changes survive. |
| `operation-history-service.test.ts`: page participates in mixed cursor | Section/row/page actions unwind/replay in order; new changed toggle clears only own Redo; no-op/failure keeps it; stale revision/expired/archived/missing grant/other actor cannot advance. |
| Same: disabled-page recovery still means recovery | Move the disabling toggle in the existing section-removal Undo regression to another actor, preserving restoration onto a disabled page; separately prove the same actor's toggle is now the next action and an attempt to skip it refuses. |
| `contract.test.ts`, `handler.test.ts`, `stdio.test.ts`: page grant and disclosure | Exact five-family discovery maps in HTTP and stdio; projects.write alone succeeds from receipt, each unrelated grant alone fails before detail disclosure, projects.read summary only; another user/connection/workspace receives no action data; revoked connection rejected. |
| `page-history-acceptance.test.ts`: commit boundary and restart | First enable and existing-page toggle: inject recorder and persist failures. Each Undo/Redo direction: inject operationActions.update, operationHistories.update and persist failures after page mutation; transitions never call the recorder. Assert page/actions/history/events/file bytes unchanged and zero frames for every fault; success has one frame/event; persisted applied/undone v5 actions reopen. |
| Gateway and workspace specs: committed write is not retried | Parse valid/null/malformed envelope; failed write preserves confirmed state; successful enable plus read failure uses read-only retry; stale response after route/persona change ignored; transition refresh resolves absent/disabled active page. |
| `page-history.spec.ts` and acceptance scripts | Executable journeys above, including second-tab route fallback, nested-root ownership, Open archive action/no-op boundary and reload. |

## Boundaries touched

Only contracts define shapes. Domain knows interfaces, Clock and existing ActivityService;
ProjectPageService gains the recorder interface, while OperationHistoryService still composes
only ActivityService. HTTP/MCP call domain, never repositories. Angular uses the gateway token;
no transport in components or core-to-prototype dependency. No new styling/design literals,
flags, generic command engine, production storage or infrastructure. One caller-owned atomic unit.

## Explicit non-goals

No runtime work during this request. During implementation: no project creation/deletion,
project lifecycle/layout/progress history, persistent Undo/Redo UI, transition retry cache,
receipt coordinator, Settings, restorable-only Archive, cascade-only section removal, task Delete
restyling, new page kinds, generic page delete API, new tools, seed conversion or tombstone purge.
Keep independent task moves, current section recovery and ordinary nondestructive page disables.

## Open questions

None blocking the proposed scope. First-enable Undo is exact removal only after dependency
preflight, with conflict rather than a disable fallback, as required by Slice 34's creation rule.
The existing ordinary-toggle archive exemption does not extend the ordinary history freeze.
These are proposed implementation rules to record in the §78 entry alongside code and tests;
this planning commit does not present them as current runtime decisions.

## Revisions

- **Initial draft (2026-09-21):** Grounded in the shipped Stage C1, current setEnabled path,
  history dispatch, page integrity rules and root-context reconciliation. Selected optional-page
  history as one bounded Stage C phase; project lifecycle/recovery and controls remain explicit.
- **Review round 1 (2026-09-21):** The independent reviewer found the exact stdio permission
  map missing from the file list, a same-actor toggle that would invalidate an existing disabled-page
  Undo test, and incomplete transition fault injection. Added the stdio test, preserved the
  disabled-page case with a second actor plus a same-actor ordering case, and named action-update,
  cursor-update and persist failures in both directions. Local audit also corrected the store
  method/result-message file names and pinned Activity verbs and conflict guidance to existing
  vocabulary. Follow-up review found two existing browser suites reading the bare page response
  and transport docs pinning family maps: added their concrete files and required browser reruns.
  The reviewer found no scope or boundary objection to the first-enable inverse.
- **Review round 2 (2026-09-21):** The reviewer rechecked the revised plan and roadmap diff
  against the repository and returned **no substantive findings**. Confirmed safe first-enable
  reversal, archived-owner blocking, exact actor/grant isolation, stable-ID replay and
  project-targeted Activity; all round-1 implementation/test/documentation gaps are resolved.

- **Implementation (2026-09-22):** Built test-first against the plan. The plan's file list held;
  consumers that type-checking surfaced were added — `project-page-registry.ts` (re-exports the
  contract's optional kind), `apps/e2e/seed.ts` (the page-write helper unwraps the envelope) and the
  pinned-count tests in `contracts/src/index.test.ts`, `contracts/src/row-history.test.ts` and
  `mcp-tools/src/registry.test.ts`. `project-workspace-store.ts` needed no change: its generic
  `project.*` handler already refreshes the context for the four new verbs.
- **Closing review (2026-09-22):** Two independent reviewers read the diff — one for
  correctness/spec, one for boundaries/living docs. No boundary violation, no blocking defect.
  Findings acted on: the `undo_operation` and `get_operation_history` **tool descriptions** agents
  read still omitted pages; the domain dependency diagram lacked the page (and Slice 37's shortcut)
  recorder edge; `setEnabled`'s doc comment and `section-removal-undo.ts` still said pages have no
  `remove`; live-updates `how.md`, the system overview, three code comments, the guide and §62 did
  not name page transitions; three `why.md` files did not link the decision; the web registry and
  e2e seed restated the optional-kind rule. Test gaps closed: the shell's absent-page fallback, a
  per-verb store refresh (the old assertion passed on one frame), a read-only summary in MCP
  acceptance, an over-claiming test name and a fixture label. One remark led to a real cross-actor
  journey, pinned in the Outcome. Not acted on: a missing-owner case (no valid document can lose a
  project) and the blocked-Undo e2e using `agent-heavy` (it needs that seed's agent connection as
  the second actor; the file-level whole-document proof is in `page-history-acceptance.test.ts`).

## Planning handoff

The planning-only change passed `pnpm docs:check`, `pnpm lint`, `node scripts/roadmap.mjs check`
and `git diff --check`. Runtime tests and browser/MCP acceptance were not run for this documentation
change; they remain required implementation evidence above. No application code or product-state
files were changed. Keep this plan active for implementation; there is no implementation Outcome
and the phase must not be marked complete at this handoff.

## Outcome

**Deliverables.** Every optional-page toggle that changes something is now one action in the owning
root's exact-actor history, and both directions of both kinds reverse and replay through the
existing transition route — no new endpoint, tool, schema version or seed change.

- **Recording.** `ProjectPageService.setEnabled` answers `ProjectPageWriteResult`
  (`{ page, operation }`, [contracts](../../../packages/contracts/src/page-write-result.ts)) and
  records inside its existing unit through `OperationRecorder`
  ([service](../../../packages/domain/src/project-page-service.ts)): `page.add` for the first enable
  that created the record, `page.update` for a later boolean change, `operation: null` and nothing
  written for a no-op. The payloads are strict version-1 contracts
  ([page-history](../../../packages/contracts/src/page-history.ts)).
- **Executors** ([domain](../../../packages/domain/src/page-history.ts)). Undo Add removes exactly
  the created record after an identity check that deliberately ignores `updatedAt` and a dependency
  preflight over live and archived sections and shortcut placements; any dependent refuses the whole
  step with `remove-reference-and-retry`. Redo Add recreates the same id and `createdAt` and refuses
  a same-kind replacement. Update moves `enabled` and `updatedAt` only, so content — archived
  included — survives both directions. `ProjectPageRepository.remove`
  ([interfaces](../../../packages/repositories/src/interfaces.ts)) has exactly that one caller.
- **Permissions, Activity, live.** `page` is a fifth family on `projects.write`, published by both
  MCP transports' discovery. Transitions emit `project.page_{addition,update}_{undone,redone}`
  against the root project with one post-commit frame each; an archived root blocks both directions
  while the ordinary toggle stays allowed, so Open archive remains reachable.
- **Surfaces.** The HTTP PATCH, `set_project_page_enabled`, the gateway and the fake carry the
  envelope; the workspace store ignores the receipt and keeps its write-then-read ordering, and a
  frame for a removed or disabled tab sends its viewer back to Home.

**Evidence.** `pnpm test`, `pnpm lint` (including `docs:check`) and `pnpm build` green;
`pnpm --filter @cwm/prototype-host acceptance` and `mcp-acceptance` (Streamable HTTP and stdio)
pass; `pnpm --filter @cwm/e2e e2e page-history.spec.ts reflections.spec.ts row-history.spec.ts`
passes 6/6. The host's `page-history-acceptance.test.ts` injects recorder, action-update,
cursor-update and persist faults in every direction and asserts unchanged bytes, history, events
and zero frames. Manual use on a Home-only root inside `nested-projects` is recorded in
`.prototype/notes.json` (slice 38). The web build's initial-bundle budget warning predates this
slice.

**Deliberate choices**, all recorded in
[the decision entry](../../decisions/2026-09-optional-page-operation-history.md): Undo of a creation
is a real removal refused by any dependent, never a silent disable; `updatedAt` is outside the
identity check because the actor's own undone toggles bump it; page actions target the project in
Activity, so a removed page takes no audit history with it; and `page` is its own family, so a later
grant split is a value change.

**Deviations from the plan.** The existing disabled-page section-removal regression was split as
review round 1 foresaw. The closing review found that, because history snapshots do not pin a page,
`resolveUndoDestination`'s missing-page fallback is now reachable for the first time: another
actor's deleted section, undone after this actor's first-enable Undo removed its page, comes back on
Home as `partial` / `fallback-page`, and the page is not recreated. That is the existing recovery
rule working; it is pinned in `page-history.test.ts` and recorded in the decision. The
closing-review documentation and test corrections are listed under Revisions.

**Deferred.** Persistent Undo/Redo header controls and receipt reporting, the transition retry
cache, project edits/archive/reactivation, saved layout/progress, and project-creation Undo with
authorized recovery routing — each a separate Stage C candidate; Stage D still waits on them.

**Open questions.** A route to a page whose record an Undo removed says the page is "switched off",
while correctly offering no Enable button (friction note `note-2026-09-22-001`); a removed page
wants its own sentence, which is project-navigation copy for a later phase. And the cross-actor
fallback above is correct but surprising — a Reflections container reappearing on Home — so the
history UI may want to say where a `partial` restore landed.

**Documentation updated.** Architecture folders for contracts, domain, repositories, mcp-tools,
prototype-host/api, prototype-host/mcp-transport, prototype-host/live-updates, web/core,
web/projects, testing and the system overview; the new decision, and amendments to
[optional pages are created on first enable](../../decisions/2026-09-optional-pages-are-created-on-first-enable.md)
and [operation family permissions](../../decisions/2026-09-operation-family-permissions.md); spec
§§26, 31, 54, 57, 61–63; `AGENTS.md`'s recorder edge; and the MCP setup guide.
