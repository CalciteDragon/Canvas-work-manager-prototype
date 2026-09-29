<!-- completed-record id="52" closed="2026-09-29" summary="Both SDK transports prove atomic failed commits and one Undo after a lost response" -->
# Slice 52 — MCP transport failure and lost-response evidence

## Goal

Close [Slice 46 finding 5](../planned/46-slice-34-closeout-follow-up.md#build) with deterministic SDK evidence that failed MCP commits leave no partial state and uncertain responses cannot duplicate a history transition.

## Spec sections

Main specification §§11–15 (atomic file unit), §§50, 54, 59–60 (SDK tools over both transports), §57 (Activity), §§61–62 (stale-revision refusal and commit-before-frame), §§69–70 and 77 (verification and real use). [Slice 34's acceptance step 7](../planned/34-undo-redo-and-archive.md#acceptance-check) and [Slice 45's explicit limit](../completed/45-undo-redo-archive-integrated-closure.md) define the missing evidence.

## Build

1. Extend SDK Streamable HTTP and stdio client tests with a one-shot failed commit for a task write and Undo, on separate temporary JSON files. Use the real registry, domain services and file store. The HTTP harness wires `loadPersistence(tempPath)`, `createApi(persistence, { events })`, `LiveEventHub`, the production registry and `createAuthenticatedMcpHandler`; subscribe to the hub before the target call. Stdio has no hub, so its proof covers file and Activity.
2. Lose a successful Undo response *after* commit but before the client receives it. For HTTP, gate the selected fetch adapter until the server response body and persisted action/revision are observed, then reject delivery without returning the response. For stdio, close the child immediately after the awaited registry commit and before SDK reply serialization through a test-only bootstrap; prove the boundary with reopened bytes and a rejected SDK client call, then reconnect to the same file. Retry the captured `{ historyId, actionId, expectedRevision }`: both must refuse with `history_revision_stale:` and the advanced revision in error text; `get_operation_history` independently returns the next Redo. Neither retry creates a second event.
3. Extract a host-local `startStdio` startup function from `stdio.ts` (currently an import-time entry point) and retain direct execution with identical production behavior. It accepts test-composition hooks for the per-call `loadPersistence` result and for the point inside the serialized `ToolRegistry.call` wrapper immediately after `await registry.call`/persist but before that wrapper returns to `createWorkManagerMcpServer` for SDK reply serialization. The test child uses the first hook to fail `store.persist` once, or the second to exit after a committed Undo. Neither hook is selected by a runtime environment flag or public route. A dropped response is a committed write, whereas a failed commit changes nothing.
4. Warm authentication before capturing baselines. The authenticator can persist `AgentConnection.lastUsedAt` independently of the tool call: keep the HTTP test clock inside one controlled throttle window and pre-stamp the stdio fixture inside its 60-second window. Confirm a second authentication causes no touch, then capture bytes immediately before the target call. Assert exact business, history, Activity and byte equality. Clear each commit fault, retry once, and prove success. If a new assertion passes on unchanged code, temporarily inject a targeted fault, observe the intended failure, then revert it.
5. Reconcile the relevant architecture/testing docs and Slice 46 ledger when implementation closes. This planning commit does not describe the evidence as shipped.

## Done when

- Both SDK clients show failed task creation and failed Undo commits leaving canonical business data, history, Activity and file bytes unchanged; HTTP emits zero frames. Clearing the fault lets one retry land with one Activity entry and one post-commit HTTP frame.
- Both clients experience a response lost *after* one successful Undo. The same-revision retry returns `history_revision_stale:` with revision + 1 in its text, and a separate `get_operation_history` returns the current Redo step. The action is undone once, Activity grows by exactly one, HTTP emits exactly one frame, and a same-file reconnect preserves that result.
- Tests distinguish failed commit from unknown response. No production protocol or public contract changes.

## Do not

- Add a retry cache or resend an uncertain write with a fresh revision.
- Implement Slice 46 findings 6–14, including stdio expiry or multi-process writer ownership.
- Add production failure switches, a generic fault framework or another MCP implementation.
- Reset personal `.prototype/data.json` or share a file between live HTTP and stdio writers.

## Acceptance check

1. Baseline: `pnpm --filter @cwm/prototype-host exec vitest run mcp/handler.test.ts mcp/stdio.test.ts live-updates.test.ts`; inventory Slice 45's registry fault and stale-retry cases. Every new test owns a unique temp JSON file.
2. Warm the authenticated connection, keep the HTTP test clock within its touch throttle window, and pre-stamp the stdio fixture's connection `lastUsedAt` to current time; verify another authentication causes no touch before relying on byte equality. Per transport, capture bytes and parsed document immediately before each one-shot fault. Fail `create_task` once and `undo_operation` once. Assert SDK-visible error; unchanged tasks, sections, projects, history/action records, Activity and bytes; HTTP zero frames. Remove fault, retry with the unchanged inputs/revision, and assert exact ids, one new Activity record and one HTTP frame delivered after persisted state is readable.
3. Per transport, create a known task and capture its receipt. Let `undo_operation` commit, then suppress its response at the deterministic delivery gate described in Build: persisted action state/revision must be observed before interruption, and the original SDK call must reject without a successful result. Reopen file, reconnect, retry **the same revision**, and assert `history_revision_stale:` with revision + 1 in refusal text. A separate `get_operation_history` returns `redo.actionId` equal to the captured action. No second mutation, Activity entry or HTTP frame. A synthetic tool error delivered after the result does not qualify.
4. At each HTTP success frame, reopen the JSON file and verify the action state was already committed. Failed paths emit none. Stdio makes no frame claim because it owns no hub.
5. If any new assertion is green before implementation, use one targeted temporary fault per assertion family; record the failing test title, revert the fault and verify `git diff --exit-code` on the faulted production file.
6. Run focused tests, `pnpm test`, `pnpm lint`, `pnpm docs:check` and `pnpm --filter @cwm/prototype-host mcp-acceptance`. Use isolated `agent-heavy` data for real SDK journeys, set `CURRENT_SLICE = 52`, and note observed friction in `.prototype/notes.json`. Outcome records commands, exit codes, exact state/event counts and any limit.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `apps/prototype-host/mcp/handler.test.ts` | modify | SDK HTTP faults, lost response, stale retry, file and frame assertions. |
| `apps/prototype-host/mcp/stdio.test.ts` | modify | SDK child faults, lost response, reconnect and same-file assertions. |
| `apps/prototype-host/mcp/stdio.ts` | modify | Export narrow `startStdio` composition hooks while retaining the direct entry; invoke the post-call hook before SDK response serialization and keep the serialized turn's release in `finally`. |
| `apps/prototype-host/mcp/test/fault-stdio.ts` | create | Test child using `startStdio` with one-shot persist fault or after-commit exit, selected only by its own test arguments. |
| `apps/prototype-host/live-updates.test.ts` | modify only if needed | Reuse existing hub observation instead of duplicating it. |
| `docs/architecture/prototype-host/mcp-transport/overview.md`, `how.md`, `what.md`, `why.md` | modify as needed | Describe tested failure behavior, any new startup symbol or changed rationale. |
| `docs/architecture/prototype-host/live-updates/how.md`; `docs/architecture/testing/overview.md`, `how.md`, `what.md` | modify as needed | Document actual transport and frame evidence. |
| `docs/guides/mcp-setup.md` | modify if needed | Explain uncertain response and stale-revision retry to client users. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | Set `CURRENT_SLICE = 52` when implementation begins. |
| `.prototype/notes.json` | modify only for observed friction | Record real use. |
| `docs/roadmap/active/52-mcp-transport-failure-evidence.md` → `completed/` | modify, move | Revisions and Outcome with evidence and limits. |
| `docs/roadmap/planned/46-slice-34-closeout-follow-up.md`, `docs/roadmap/goals.md` | modify on closure | Link completed evidence and preserve remaining findings. |
| `docs/roadmap/progress.md` | generated | Roadmap lifecycle. |

No domain, repository, contract or production semantics change is planned. If tests expose one, revise this file list before a fix and update that system's architecture docs and indexed decision in the same change.

## Test plan — tests first

| Test | Proves |
|---|---|
| `mcp/handler.test.ts`: SDK HTTP create and Undo failed commit then retry | The SDK crosses the real commit boundary; rollback leaves business/history/Activity/disk/frame unchanged and retry lands once. |
| `mcp/stdio.test.ts`: SDK stdio create and Undo failed commit then retry | Per-call reload and same-file persistence preserve atomicity across a child process. |
| `mcp/handler.test.ts`: dropped Undo response then same-revision retry | One committed step/frame/Activity survives; stale refusal cannot duplicate it. |
| `mcp/stdio.test.ts`: child closes after commit; reconnect and retry | Genuine lost response across process restart cannot duplicate a transition. |
| Temporary targeted fault per assertion family | New assertions are sensitive to the intended defect, not an incidental fixture failure. |

## Boundaries touched

- MCP remains an SDK adapter over the registry; tools call domain services, never repositories. Faults attach to host/test wiring after normal registry construction. No duplicated contract.
- Domain keeps repository abstractions and injected Clock only. The JSON store's unit-of-work semantics remain unchanged.
- HTTP SSE stays host-only and post-commit. Stdio never claims to publish into that hub. Each test owns its canonical file to avoid Slice 46 finding 7's unresolved multi-process writer hazard.
- The stdio extraction is host-local testability, not a product abstraction; its direct entry keeps token authentication, per-call reload and serialized turns. No UI gateway or style boundary changes.

## Explicit non-goals

- Network retry policy, exactly-once delivery across arbitrary clients, idempotency keys and a history browser.
- Stdio clock/expiry proof (finding 6), file-path writer ownership (finding 7), and other Slice 46 work.
- Every action family: Slice 45 has lower-layer family coverage; this phase joins the missing SDK boundary with a representative row write and transition.
- A new decision entry unless observed behavior changes the accepted expected-revision policy; pure verification belongs in Outcome and architecture/testing docs.

## Open questions

- None blocking. For stdio, choose the smallest test-only interruption that proves the child closed before the reply reached the SDK client. If the SDK exposes no direct boundary, exit immediately after awaited registry commit and prove it by reopening bytes; do not substitute a fabricated tool error.

## Revisions

- **Initial plan (2026-09-28):** Scoped finding 5 from Slice 45's explicit limit; separated failed commit from lost response, HTTP frames from stdio's absent hub, and same-file reconnect from concurrent-writer work.
- **Review round 1 (2026-09-28):** Specified a JSON-backed HTTP SDK harness with hub, a post-commit/pre-delivery interruption gate, and authentication warming so `lastUsedAt` does not invalidate byte comparisons. Corrected MCP stale-error expectations: text names the advanced revision; `get_operation_history` supplies Redo.
- **Review round 2 (2026-09-28):** Made the stdio startup extraction required: the current module runs on import, so a test child cannot inject persistence or interrupt the reply without it. Named the two host-local hooks, preserved the direct entry and serialized-turn release, and kept all fault selection in the child fixture.
- **Review round 3 (2026-09-28):** Final reviewer found no substantive issue. Clarified that `SimulatedClock` runs forward, so the HTTP test controls the auth-touch window rather than freezing time.
- **Implementation and sensitivity (2026-09-28):** Both new SDK test families passed on unchanged domain/store behavior. Three temporary production faults made the named checks fail for leaked in-memory state after failed persistence, premature HTTP frame delivery, and missing stale-revision guard; each was reverted with `git diff --exit-code` on the faulted file. The stdio entry was extracted without a runtime fault flag; the fixture composes its two hooks.
- **Diff review round 1 (2026-09-28):** Independent correctness and boundaries/documentation reviewers inspected the diff. Correctness found the stdio stale-revision text and history-revision assertions too loose. Documentation found one combined API symbol link imprecise. Both were corrected; no other substantive finding remained.
- **Diff review round 2 (2026-09-28):** Both independent reviewers checked the revised diff. The correctness reviewer ran the focused SDK/live suite (75 tests passed); the boundaries reviewer ran `pnpm docs:check` (18 folders, 239 documents). Neither reported a remaining substantive finding.

## Outcome

SDK Streamable HTTP and stdio tests now use separate `agent-heavy` temporary JSON files for failed `create_task` and `undo_operation` commits, plus a committed Undo whose response is lost. The HTTP test harness uses the production registry, authenticator, JSON store and live hub; the stdio test child uses the extracted `startStdio` composition seams to fail one persist or exit after the awaited registry commit and before SDK reply serialization. Direct stdio execution keeps its token check, per-call reload and serialized turn. On each failed commit, the SDK reports an error while the complete parsed document and bytes stay unchanged, including task, history and Activity collections; HTTP emits zero frames. Clearing the fault lets exactly one retry land, with one new Activity event and, for HTTP, one frame whose listener reads the committed file.

For each lost-response case, the original SDK call rejects after the file has advanced to an undone action at revision + 1. A same-file reconnect retries the captured old revision and gets `history_revision_stale:` naming the advanced revision. A separate `get_operation_history` offers the captured action as Redo. The document and Activity stay identical after that retry; HTTP retains exactly its one post-commit frame. The HTTP gate inspects the server response body and file before withholding delivery; the stdio child exits inside the serialized registry wrapper before reply serialization. These checks distinguish a failed commit from an uncertain response without changing a tool or protocol contract.

Verification: baseline focused suite 69/69; final focused suite 75/75 (`handler.test.ts`, `stdio.test.ts`, `live-updates.test.ts`); `pnpm test` exit 0 (host 273/273, web 792/792, all other packages green); `pnpm lint` exit 0; `pnpm docs:api` exit 0; `pnpm docs:check` exit 0; `pnpm --filter @cwm/prototype-host mcp-acceptance` exit 0 across both transports. The full test's first sandboxed attempt hit an Angular file-resolution access denial; rerunning outside that filesystem sandbox passed. The acceptance journey used isolated `agent-heavy` data and showed no new product friction, so `.prototype/notes.json` was unchanged. The MCP transport, live-updates and testing architecture folders were reconciled; the existing MCP setup guide already explained uncertain Undo responses and stale-revision recovery. Slice 46 finding 5 and roadmap goals now link this evidence. Stdio expiry and multi-process writer ownership remain Slice 46 findings 6–7; no decision or specification correction was needed.
