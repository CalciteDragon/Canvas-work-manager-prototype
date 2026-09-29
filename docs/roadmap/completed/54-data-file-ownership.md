<!-- completed-record id="54" closed="2026-09-29" summary="Every canonical JSON writer takes turns through an advisory owner record: the host for life, stdio per call, the CLIs refuse" -->
# Slice 54 — One writer per data file

## Goal

Close [Slice 46 finding 7](../planned/46-slice-34-closeout-follow-up.md#build). No two processes may hold divergent copies of one canonical JSON file at once: a concurrent writer is refused or waits its turn, and no committed write is lost.

## Spec sections

- **§14:** one local JSON file.
- **§15:** load, keep in memory, persist atomically at operation boundaries.
- **§16 and §76:** seeds and reset.
- **§59:** HTTP and stdio register the same tools; stdio is optional and local.
- **§62:** live updates are HTTP-only.
- **§71:** persistence and the host are disposable, so keep this small.
- **§78:** decision entry.
- **§80:** no production storage, queue or coordination service.

This slice also answers [Slice 46](../planned/46-slice-34-closeout-follow-up.md) finding 7. It replaces the documented-only rule in the [stdio token decision](../../decisions/2026-08-stdio-token-and-live-auth.md) and the [HTTP-only live updates decision](../../decisions/2026-08-live-updates-are-http-only.md) with an enforced one.

## Build

### 1. Owner file primitive

`acquireDataFileOwnership(dataPath, options)` lives in `packages/repositories/src/data-file-ownership.ts`.

- **Location.** It first runs `mkdir(dirname(dataPath), { recursive: true })`, which keeps a first run into a new directory working. The owner file is then `<realpath(dir)>/<basename>.owner`, so different spellings of one path and a symlinked directory all name the same owner file.
- **Record.** The record is `{ pid, nonce, kind, acquiredAt, dataPath }`, where `kind` is one of `http-host`, `stdio`, `seed`, `upgrade` or `e2e-prepare`.
- **Atomic publish.** The record is written whole to `<owner>.<nonce>.tmp` and published with `link(tmp, owner)`. `EEXIST` means the file is occupied. The temp file is removed either way. Because a reader can never see a partial record, an unparsable owner file is foreign or corrupt, and is handled like an unrelated live owner.
- **Release.** The returned handle's `release()` and `releaseSync()` unlink the owner file only when its stored nonce is still the handle's own. `ENOENT` is tolerated, so running both releases is harmless.

### 2. Refusal and bounded wait

- **Liveness.** A recorded pid is alive when `process.kill(pid, 0)` succeeds or reports `EPERM`; `ESRCH` means dead.
- **Occupied.** `EEXIST`, `EPERM` and `EBUSY` from `link` all mean "occupied". A Windows file that is pending deletion can report the latter two.
- **Owner vanishes.** If the owner file disappears between a failed `link` and the read (`ENOENT`), the acquirer retries.
- **One deadline for every retry.** Every retry, of any cause, sleeps 50 ms and counts against the single `waitMs` deadline.
- **No owner to name.** If `link` keeps failing while no owner file exists, the acquirer throws `DataFileOwnerUnavailableError` at the deadline. Its message starts `data_file_owner_unavailable:` and carries the underlying code and path. Unexpected `link` codes (`ENOTSUP`, `EXDEV`, others) throw it at once.
- **Waiting.** While a live owner holds the file, the acquirer polls every 50 ms up to `waitMs`, calling `options.onWait(owner)` once when the wait begins. Then it throws `DataFileInUseError`.
- **Refusal message.** The message starts `data_file_in_use:` and names:
  - the data path, owner kind, pid and `acquiredAt`;
  - the remedy for that kind — for an `http-host` owner: "stop the host, or use its HTTP MCP endpoint";
  - always, the owner-file path, with "if pid N is not a Canvas Work Manager process, delete this file". Windows reuses pids quickly, so this is the manual escape the design relies on instead of stealing.
- **Live host owners are never waited on.** `options.skipWaitForKinds` lets a stdio call refuse at once when the owner is a **live** `http-host`, because a host never releases soon. Liveness is always checked first: a dead owner of any kind, including a skipped kind, goes to reclaim (§3).

### 3. Safe reclaim after abnormal exit

When the recorded pid is dead:

1. The acquirer publishes `<owner>.reclaim` the same way, by `link`.
2. Holding that file, it re-reads the owner file.
3. Only when the owner file still holds the dead record's nonce does it unlink the owner file and retry the publish. An absent owner file or a different nonce is a mismatch: it drops the reclaim file and starts over within `waitMs`.
4. It removes the reclaim file in `finally`.

**Never stolen.** A reclaim file whose own pid is dead is not stolen. The acquirer refuses with `data_file_in_use:` and names that file for manual removal. Only a reclaimer holding the reclaim file, or the owner whose nonce matches, ever unlinks an owner file.

### 4. The HTTP host owns the file for its lifetime

- **Start-up.** The `main.ts` direct-run path acquires (`kind: 'http-host'`, `waitMs: 5_000`) before `loadPersistence`, so first-run seeding also happens under ownership. The wait covers a `tsx watch` restart whose old child is still exiting. Its `onWait` prints `prototype-host waiting for data file owned by <kind> pid <pid>` to **stdout**, where the harnesses already read the listening line.
- **Shutdown.** The SIGINT/SIGTERM path calls a new exported `shutdownHost({ server, mcp, unitOfWork, ownership })`. It runs `stop(server)` and `mcp.close()`, then **drains the write queue without writing**, and only then releases.
  - **Why drain.** `closeAllConnections()` does not cancel a unit of work that is mid-persist. Releasing earlier could hand the file to a writer that reloads before the host's rename lands.
  - **How.** The drain is `unitOfWork.run(() => { throw DRAINED })` with that sentinel swallowed. `runUnitOfWork` persists unconditionally after a returning callback (`data-store.ts` 740–747), so a no-op callback would rewrite the file on every Ctrl+C. A throwing one still waits for the queue tail but skips `persist()`.
- **Exit handler.** The exported `releaseOnExit(state)` is registered on `process.on('exit')`. It reads the `drained` flag that `shutdownHost` sets, and calls `releaseSync()` only once the drain has completed. On the 2 s give-up path, where the drain has not finished and a threadpool rename may be in flight, it leaves the record for pid-based reclaim.
- **Start-up failure.** If the host fails after acquiring — for example with `EADDRINUSE` — it releases before `process.exit(1)`.
- **Hard kills.** On Windows, `child.kill('SIGTERM')` is `TerminateProcess` and runs no handlers. A host stopped that way — the acceptance scripts' `stopHost`, Playwright on Windows — leaves a stale record, which the next start reclaims through §3.
- **Unchanged.** `start()`, every in-process test, and the dev panel's seed swap and reset (inside the owning host's unit of work) are unchanged.

### 5. Stdio owns the file per call

- **Start-up does not acquire.** Tool definitions are built from `load()` when the file exists; a read of a temp-and-rename file is safe and writes nothing. A stdio child therefore starts and lists tools while a host owns the file.
- **Seeding a missing file.** Only when the file is missing does start-up acquire (`kind: 'stdio'`, `waitMs: 5_000`) around the seeding `load()`. Its `onWait` writes `canvas-work-manager stdio waiting for data file owned by <kind> pid <pid>` to **stderr**, because stdout carries the protocol. If that acquisition is refused — for example because a host starting at the same moment won it and seeded the file — start-up re-checks. When the file now exists it loads without ownership, as in the normal path. It fails only if the file is still missing.
- **Each call acquires.** Inside the existing turn, a call acquires (`kind: 'stdio'`, `waitMs: 5_000`, skipping the wait for a live `http-host` owner) after `await previous` and before `load()`. It releases in the same `release()` path after `registry.call` and `afterCall`.
- **Exit release.** `startStdio` registers **one** `process.on('exit')` listener. It calls `releaseSync()` on a module-level current handle, which is set when a turn acquires and cleared when it releases. That covers a child that exits inside `afterCall`, like Slice 52's `fault-stdio` drop mode, without adding a listener per call.
- **Refusal.** A refused acquisition throws `DataFileInUseError` out of `resolveInvocation`. The SDK's `McpServer` returns a thrown tool-handler error as an `isError` result whose text is the message, and the process stays up for later calls.
- **Two stdio processes.** Two stdio processes on one file take turns, and each call reloads under ownership.
- **Reads are refused too.** While a host runs, every stdio call is refused, reads included, because authentication may write `lastUsedAt`. This replaces the guide's "read-only clients can run together".
- **Operator latency.** A call refused because of another stdio owner waits at most 5 s. A call refused because of a host is refused at once.
- **Client close.** The SDK client closes a child by ending stdin, then SIGTERM, then SIGKILL, which on Windows is a hard kill. Because ownership is held only during a call, closing between calls leaves nothing to reclaim.

### 6. Seed, reset, upgrade and e2e-prepare writers

- **Libraries stay ownership-free.** `writeSeedFile` and `upgradeDataFile` do not acquire, because `loadPersistence` calls `writeSeedFile` inside its caller's ownership.
- **CLIs acquire.** The CLIs' `run()` functions call new exported wrappers, `seedDataFileOwned(seed, { targetPath })` and `upgradeDataFileOwned(path)`. Each acquires (`kind: 'seed'` or `'upgrade'`, `waitMs: 0`) before any read or write and releases in `finally`. `pnpm prototype:reset` is the seed CLI.
- **e2e prepare.** `apps/e2e/prepare-data.mjs` becomes `prepare-data.ts`, run with `node --import tsx` (adds `tsx` and `@cwm/repositories` to `apps/e2e` devDependencies). It acquires (`kind: 'e2e-prepare'`, `waitMs: 0`) around its copy of `empty.json`. A leftover e2e host is refused loudly, and a stale record left by Playwright's hard kill is reclaimed.

### 7. Decision and docs

- **Decision.** Record the rule in a new decision entry.
- **Amendments.** Append dated amendments to the two decisions above.
- **Wording.** Update every passage that says the processes "must not run concurrently". It becomes "is refused while another process owns the file". Keep the `#important-file-store-limitation` heading, or update its inbound link.
- **Git ignore.** Add `.prototype/*.owner*` to `.gitignore`.

## Done when

- **HTTP host plus stdio.** While an HTTP host owns a file:
  - a stdio child still starts and lists tools;
  - its `create_task` returns `data_file_in_use:` naming the host, and the file's bytes do not change;
  - `seedDataFileOwned` and `upgradeDataFileOwned` on that file are refused, with no byte, `.tmp` or backup change;
  - the host's own later write still lands.

  After the host stops, the same stdio process's next call succeeds and sees that write.
- **Normal release.** Normal host shutdown releases only after in-flight writes finish. On POSIX the test proves the owner file is removed. On Windows, real use with Ctrl+C proves it.
- **Two stdio processes.** Concurrent calls from two stdio processes on one file both land, with both tasks and both Activity events in the file and distinct history revisions.
- **Independent files.** An owner of one file never blocks another.
- **Abnormal exit.**
  - After a hard kill of an owning child, the next acquirer reclaims without manual steps.
  - A live owner — including an alive but unrelated pid — is never unlinked, and its refusal names the owner file for manual removal.
  - Two reclaimers forced into the dangerous interleaving produce exactly one owner.
- **Verification.** These all pass:
  - the focused tests, `pnpm test`, `pnpm lint` and `pnpm docs:check`;
  - all four host acceptance scripts (`acceptance`, `agent-acceptance`, `mcp-acceptance`, `live-acceptance`);
  - `pnpm e2e`.
- **Real use.** Running `pnpm dev:host` and `pnpm mcp:stdio` on isolated `agent-heavy` data shows the refusal text an operator would see.

## Do not

- **No production locking or coordination** (§71, §80): no lock service, lease renewal, heartbeat, networked or cross-machine lock, database, queue or daemon. This is one advisory file per data path on one machine.
- **No new routes between processes.** Do not make stdio publish into the host's live stream, proxy stdio calls through the host, or add a transport. Shared browser and agent work stays on HTTP MCP.
- **No stealing.** Never steal from an owner whose pid is alive, add a `--force`, or auto-remove a stale reclaim file.
- **No other scope.** Do not implement Slice 46 findings 8–14. Do not change the domain, the contracts, the unit-of-work queue or the schema. Do not reset personal `.prototype/data.json`.

## Acceptance check

1. **Baseline.** `pnpm --filter @cwm/repositories test`, `pnpm --filter @cwm/prototype-data test` and `pnpm --filter @cwm/prototype-host exec vitest run mcp/stdio.test.ts` are green before any change.
2. **Primitive.** The unit tests below pass in `mkdtemp` directories.
   - An injected `isAlive` stands in for pid liveness.
   - An injected `fs` produces the Windows error codes and gates the reclaim interleaving deterministically.
3. **Host plus stdio** (`apps/prototype-host/data-file-ownership.test.ts`, 60 s timeout). Seed a temp `agent-heavy` file, spawn `main.ts` with `CWM_DATA_FILE` and `CWM_HOST_PORT=0`, and wait for its listening line. Then:
   1. An SDK stdio client on the same file connects and lists the same tool count.
   2. Its `create_task` returns `isError` with text starting `data_file_in_use:` that names `http-host`, the host pid and the owner-file path. The file bytes are unchanged. The no-wait rule itself is proven by the unit test on `skipWaitForKinds`, not by wall-clock timing here.
   3. In the test process, `seedDataFileOwned('agent-heavy', { targetPath })` and `upgradeDataFileOwned(path)` both reject with `data_file_in_use:`. Bytes are unchanged, and the directory holds no new `.tmp` or `.backup-*` file. The owner file and its link temp files are excluded from that comparison.
   4. `POST /api/tasks` with body `{ projectId: 'project-work-manager', title }` and header `x-prototype-user: user-demo` succeeds through the host.
   5. A second host spawned on the same file exits with code 1, prints `data_file_in_use:` on stderr and leaves the owner record's nonce unchanged.
   6. Stop the first host with `child.kill('SIGTERM')`. On POSIX, assert the owner file is gone. On Windows, assert it holds a record whose pid is dead.
   7. The same stdio client's next `create_task` succeeds; on Windows it reclaims first. The file holds both tasks, the host's first.
   8. Restart the host while the stdio client is idle; it starts. The next stdio call is refused again. Stop the host.
4. **Host waits for a stdio turn.** `apps/prototype-host/test/owner-child.ts` acquires as `stdio` on a temp file, prints `owned`, and releases when it reads `release` on stdin.
   - Start a host on that file. Wait for its `prototype-host waiting for data file owned by stdio pid <pid>` line, and only then send `release`. Assert the host becomes listening. The waiting line is the assertion that a fault removing the wait breaks.
   - Without the release, a second run prints the waiting line, then exits 1 with `data_file_in_use:`.
5. **Two stdio processes.** Two SDK clients on one temp file call `create_task` concurrently through `Promise.all`. Both succeed. The file holds both task ids and two new `task.created` Activity events, and each history revision appears once.
6. **Abnormal exit.** Start `owner-child`, wait for `owned`, kill it with `SIGKILL`, and wait for `exit`. Then call `acquireDataFileOwnership(path, { kind: 'seed', waitMs: 0 })` in the test process. It succeeds, and the record names the test's pid and a new nonce.
7. **Start-up failure release.** Start a host on a fixed port already bound by the test. It exits 1 on `EADDRINUSE`, and the owner file is gone.
8. **CLIs** (`packages/prototype-data`). While the test process holds ownership in-process, the owned wrappers refuse with no side effects. After release, both succeed.
9. **Independent files.** A host on file A and a stdio call on file B both work.
10. **Full gate.** Run the focused suites, `pnpm test`, `pnpm lint`, `pnpm docs:check`, the four acceptance scripts and `pnpm e2e`.
    - `mcp-acceptance` runs two stdio children on one file with awaited calls, and restarts a host on its file after a hard stop. It must pass unchanged.
    - `mcp/stdio.test.ts` must pass unchanged, including Slice 52's drop-mode reconnect, which now depends on the stdio exit release.
11. **Real use.**
    - Copy `agent-heavy` to a temp file and point `CWM_DATA_FILE` at it.
    - Run `pnpm dev:host`. Connect a real MCP client to `pnpm mcp:stdio`, and record the refusal it shows. Try `pnpm prototype:upgrade <that file>`.
    - Stop the host with Ctrl+C, confirm the owner file is gone (normal release on Windows), and show that stdio then works.
    - Set `CURRENT_SLICE = 54` and record any real friction in `.prototype/notes.json`.
12. **Fault check.** For any new test that passes before its implementation, apply a temporary targeted fault, show the named assertion fails for the intended reason, then revert it. Candidate faults:
    - stdio skipping per-call ownership;
    - reclaim skipping the nonce re-check;
    - shutdown releasing before the drain;
    - stdio start-up dropping the re-check after a refused seeding acquire.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/repositories/src/data-file-ownership.ts` | create | `acquireDataFileOwnership`, the `DataFileOwnership` handle (`release`, `releaseSync`), `DataFileInUseError` and `DataFileOwnerUnavailableError`: mkdir, link publish, liveness-first checks, one bounded deadline with `onWait` and the kind skip, guarded reclaim, Windows error codes. `fs`, `isAlive`, `pid` and `sleep` are injectable for tests. Doc comments per protocol rule 7, including that it is disposable with the JSON store. |
| `packages/repositories/src/data-file-ownership.test.ts` | create | The unit tests below. |
| `packages/repositories/src/index.ts` | modify | Export `acquireDataFileOwnership`, the `DataFileOwnership` handle type, `DataFileInUseError` and `DataFileOwnerUnavailableError`. |
| `apps/prototype-host/main.ts` | modify | Acquire before `loadPersistence`, with the stdout waiting line. Exported `shutdownHost` drains, sets `drained`, then releases. Exported `releaseOnExit(state)` releases only after a completed drain. Release on start-up failure. |
| `apps/prototype-host/main.test.ts` | modify | The gated-rename drain test for `shutdownHost`. |
| `apps/prototype-host/mcp/stdio.ts` | modify | Start-up acquires only to seed a missing file. Each turn acquires and releases. Exit handler release. |
| `apps/prototype-host/mcp/stdio.test.ts` | modify | The listener-leak check; the existing cases stay unchanged. |
| `apps/prototype-host/test/owner-child.ts` | create | Test-only child that acquires as a given kind, prints `owned`, and on stdin commands optionally seeds the data file or releases; otherwise it dies when killed. |
| `apps/prototype-host/data-file-ownership.test.ts` | create | Acceptance steps 3–7 and 9. |
| `packages/prototype-data/src/seed-cli.ts`, `upgrade-cli.ts` | modify | Owned wrappers used by `run()`; the library functions stay ownership-free. |
| `packages/prototype-data/src/seed-cli.test.ts` (create) and `upgrade-cli.test.ts` (modify) | create / modify | The owned wrappers refuse under in-process ownership and succeed after release. |
| `apps/e2e/prepare-data.mjs` → `prepare-data.ts`, `apps/e2e/package.json` | modify | Owned copy of the e2e scratch file; `pree2e` runs it through `tsx`; devDependencies on `tsx` and `@cwm/repositories`. |
| `pnpm-lock.yaml` | modify | Importer entries for the two new e2e devDependencies. |
| `.gitignore` | modify | Ignore `.prototype/*.owner*`. |
| `docs/decisions/2026-09-one-writer-per-data-file.md` | create | Question; options (documented rule only, lifetime stdio ownership, per-call stdio ownership, OS/pipe locks, auto-steal on dead pid without a guard); decision; confidence; revisit. |
| `docs/decisions/2026-08-stdio-token-and-live-auth.md`, `2026-08-live-updates-are-http-only.md` | modify | Dated amendments: the owner file now enforces the limit. |
| `docs/decisions/README.md` | modify | Index the new entry under Repositories; mark both entries amended. |
| `docs/architecture/why.md`, `docs/architecture/what.md` | modify | Replace "two processes cannot share the file safely" and "must not mutate concurrently". |
| `docs/architecture/repositories/{overview,why,what,how}.md` | modify | The primitive and its invariants. The "Two processes cannot share the file" consequence (and its anchor link) becomes the enforced rule. |
| `docs/architecture/prototype-host/{overview,how,what}.md`, `mcp-transport/{why,how,what}.md` | modify | Host lifetime ownership and drain-before-release; stdio per-call ownership, no start-up acquisition, `data_file_in_use:`. Replace `mcp-transport/how.md`'s "stop dev:host first for mutations". |
| `docs/architecture/prototype-data/{how,what}.md` | modify | The seed, reset and upgrade CLIs take ownership; the library functions do not. |
| `docs/architecture/testing/{what,how}.md` | modify | Locate the new ownership suites and the e2e prepare change. |
| `docs/guides/mcp-setup.md` | modify | Rewrite "Important file-store limitation" (keeping the anchor), the Undo/Redo passage "never let it and the HTTP host write the same file", and the read-only sentence, so they describe what the operator now sees. |
| `README.md` | modify only if it states the old rule | Command notes. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 54`. |
| `.prototype/notes.json` | modify only for observed friction | Real-use notes. |
| `docs/roadmap/active/54-data-file-ownership.md` → `completed/` | modify; move on closure | Revisions and Outcome. |
| `docs/roadmap/planned/46-slice-34-closeout-follow-up.md`, `docs/roadmap/goals.md` | modify on closure | Link the finding 7 evidence; keep findings 8–14. |
| `docs/roadmap/progress.md` | generated | `roadmap.mjs sync`. |

## Test plan — tests first

| Test | Proves |
|---|---|
| `data-file-ownership.test.ts`: acquiring a free path in a not-yet-existing directory creates it and records pid, kind, nonce and path | A first run into a new directory still works; the record is what refusals and reclaim read. |
| …: a live owner makes a second acquirer refuse after `waitMs`; the message names kind, pid and owner-file path; the record's nonce is unchanged | Refusal never mutates the live owner and gives the manual escape. |
| …: with `skipWaitForKinds: ['http-host']`, a live `http-host` owner is refused without polling (`onWait` never called, injected `sleep` never called) | Stdio calls do not stall behind a host. |
| …: with `skipWaitForKinds: ['http-host']`, a dead `http-host` owner is reclaimed, not refused | Liveness comes before the kind skip, so Windows' stale host records recover. |
| …: `link` keeps failing with `EPERM` while the owner read returns `ENOENT`. The acquirer ends within `waitMs` with `data_file_owner_unavailable:` and the code; an `ENOTSUP` from `link` throws it at once | No unbounded spin, and an honest message when there is no owner. |
| …: a waiting acquirer succeeds when the owner releases within `waitMs` | The bounded wait serves hand-offs and watch restarts. |
| …: an owner whose pid is alive but unrelated is never unlinked, and its refusal names the file to delete | No stealing on pid reuse. |
| …: a dead owner is reclaimed with a new nonce | Abnormal exit recovers without manual steps. |
| …: with an injected `fs`, B reads the dead record, then is held while A reclaims, publishes and drops the reclaim file. B, released, finds a different nonce and neither unlinks A's record nor becomes owner | The nonce re-check is what makes reclaim safe (fault-sensitive). |
| …: a reclaim file left by a dead pid is refused with its path named, not removed | No nested stealing. |
| …: `link` failing with `EPERM` or `EBUSY` is treated as occupied; `ENOENT` on the owner read retries at once; an owner absent at the reclaim re-check is a mismatch | Windows error codes and vanishing owners are handled. |
| …: an unparsable owner file is refused and never unlinked | A foreign or corrupt file is not stolen. |
| …: `release()` and `releaseSync()` leave an owner file with another nonce in place, and tolerate `ENOENT` | Release is nonce-checked and idempotent. |
| …: different data paths do not block each other; a relative and an absolute spelling of one path do | Ownership is per canonical path. |
| `apps/prototype-host/data-file-ownership.test.ts`: while the host owns the file, stdio starts, lists tools and has `create_task` refused with no byte change | Per-call ownership keeps stdio usable, and the refusal is actionable. |
| …: `seedDataFileOwned` and `upgradeDataFileOwned` are refused under a real host, with no byte, `.tmp` or backup change | Seed, reset and upgrade are writers too. |
| …: a second host on the same file exits 1 without touching the record | Two hosts cannot share one file. |
| …: after the host stops, stdio succeeds and sees the host's write; the host restarts while stdio is idle | The reproduced lost update cannot happen, and stdio holds only per call. |
| …: a host waits for an `owner-child` stdio turn released within 5 s, and refuses without that release | Hand-off between kinds. |
| …: two stdio processes' concurrent `create_task` calls both persist, with distinct revisions and two Activity events | Cross-process calls take turns on a fresh load. |
| …: a SIGKILLed `owner-child` is reclaimed by the next acquirer | Abnormal exit, end to end. |
| …: `EADDRINUSE` after acquiring leaves no owner file | Start-up failure releases. |
| …: a host on file A and stdio on file B both work | Independent files. |
| `apps/prototype-host/main.test.ts`: `shutdownHost` over a `JsonDataStore` loaded with injected `FileOperations` whose **first** `rename` is held on a one-shot gate. Start a unit of work, call `shutdownHost`, and assert the owner file still exists while the gate is closed. Open the gate, then assert: the committed bytes are on disk before the owner file is removed, and the drain added no second write or rename | Drain-before-release without an extra write, deterministic on every platform (fault-sensitive against releasing before the drain, and against a persisting drain). |
| …: `releaseOnExit` skips `releaseSync()` while `drained` is false, and releases once it is true | The give-up path never releases under an in-flight rename. |
| `apps/prototype-host/data-file-ownership.test.ts`: stdio started (with `stderr: 'pipe'`) on a missing file while an `owner-child` holds `http-host` ownership. Only after stdio's stderr waiting line appears does the test send the child its `seed` command. Stdio then starts, lists tools, and its first call is refused | A seeding race cannot crash stdio start-up; the waiting line proves the race path ran (fault-sensitive against dropping the post-refusal re-check). |
| `mcp/stdio.test.ts`: twelve calls on one child produce no `MaxListenersExceededWarning` on stderr | One exit listener, not one per call. |
| `packages/prototype-data/src/seed-cli.test.ts`, `upgrade-cli.test.ts`: the owned wrappers refuse under in-process ownership with no side effects, and succeed after release | The CLI entrypoints take ownership; the libraries stay free. |
| Existing `mcp/stdio.test.ts` (Slices 45, 52, 53), unchanged and green | Per-call ownership plus the exit release keeps sequential restarts, fault children and in-process turn serialization working. |

## Boundaries touched

- **The domain stays free of infrastructure.** Ownership lives in `packages/repositories`, which already owns `fs`, and in the host, stdio, CLI and e2e entrypoints. No domain service, `Clock`, unit of work or repository interface changes. The host's drain uses the existing `UnitOfWork.run`. `acquiredAt` is operator metadata written outside the domain, not a domain timestamp.
- **MCP tools still call domain services.** The refusal comes from the stdio adapter's invocation resolver, before any registry call. The transport-free registry and `server.ts` are unchanged.
- **Contracts stay single-source.** The owner record is an internal file format of the repositories package, not a contract. Neither the web app nor any tool reads it.
- **The web app is untouched**, apart from the dev-panel slice number. `apps/e2e` gains a dependency on `@cwm/repositories`, a test harness consuming a package, not a web boundary.
- **§71 and §80:** one advisory file, no daemon or service.

## Explicit non-goals

- Making stdio writes appear live in the browser, or letting stdio and the host run concurrently. The rule is that they take turns; HTTP MCP remains the shared path.
- Lease timeouts, heartbeats or process-identity checks beyond the pid. A stale reclaim file, a reused pid or a foreign owner file is removed by hand, and the refusal says which file.
- An orphaned host — for example a `node` child left running after its `pnpm`/`tsx` wrapper was hard-killed — keeps holding the file, just as it already holds the port. The refusal names its pid.
- Guarding library calls (`loadPersistence`, `writeSeedFile`, `upgradeDataFile`) used by tests and in-process code. Only entrypoints enforce the rule.
- A seed or reset path through the running host. The dev panel already offers one.

## Open questions

- None blocking. Stdio holds ownership per call rather than for its process lifetime, for two reasons:
  - A long-lived client such as Claude Desktop would otherwise block `pnpm dev:host` whenever it is open.
  - `mcp-acceptance` and Slice 33's foreign-actor journey legitimately run two stdio processes on one file with sequential calls.

  The decision entry records the rejected lifetime option.

## Revisions

- **Initial plan (2026-09-28):** Scoped finding 7 to an advisory owner file, with host lifetime and stdio per-call ownership, entrypoint-only acquisition, and nonce-guarded reclaim. Checked against the SDK source: a thrown tool-handler error becomes an `isError` result, and the stdio client's close ends in a hard kill on Windows.
- **Review round 1 (2026-09-29):** Twelve findings, all confirmed against the code.
  - **Start-up.** Stdio's start-up acquisition would have killed the child before its handshake whenever a host ran. Start-up now acquires only to seed a missing file.
  - **Shutdown.** Host shutdown now drains the unit-of-work queue before releasing. The host has no persist-latency control (it lives in the client), so the drain is tested in-process through an exported `shutdownHost` over a gated `rename`.
  - **Route.** Fixed the task route to `POST /api/tasks`.
  - **e2e.** `apps/e2e/prepare-data.mjs` is now an owned writer.
  - **Owner record.**
    - It is published atomically by `link`.
    - Refusals name the owner file for manual removal on pid reuse.
    - Windows `EPERM`/`EBUSY` and vanishing-owner `ENOENT` are specified.
    - A missing directory is created before acquiring.
  - **Tests.**
    - The reclaim race is gated through an injected `fs`.
    - Host waits on an `owner-child` stdio turn.
    - Per-call wait and test timeouts are stated, and stdio skips waiting on a host.
    - CLI refusal is tested under a real host.
    - The child is moved out of `mcp/`, and prototype-data tests hold ownership in-process.
    - Added tests for a second host, start-up failure release, sync exit release, and stdio's exit release covering Slice 52's drop mode. Normal release on Windows is proven in real use with Ctrl+C.
  - **Documentation.** Added the missed passages: architecture `why.md`, the live-updates decision, the guide's Undo/Redo and read-only sentences, and the anchor. The plan now states that stdio reads are refused while a host runs.
- **Review round 2 (2026-09-29):** All twelve round-1 findings confirmed resolved, and the e2e `.ts` conversion checked against its tsconfig and Playwright's `testMatch`. Six new findings, all accepted after checking the code:
  - **Retry loop.** Every retry now counts against one `waitMs` deadline. `link` failing with no owner file ends in a distinct `data_file_owner_unavailable:` error.
  - **Kind skip.** `skipWaitForKinds` checks liveness first, so a dead `http-host` record — the normal Windows case — is reclaimed.
  - **Seeding race.** Stdio start-up that loses a seeding race loads the now-existing file instead of crashing.
  - **Drain.** `runUnitOfWork` persists unconditionally (`data-store.ts` 740–747), so the drain throws a sentinel to wait without rewriting the file. The drain test's gate is one-shot, and the give-up path leaves the record for reclaim.
  - **Wait test.** The host-waits step is driven by an `onWait` line rather than a timer.
  - **Listeners.** Stdio registers one exit listener over a current handle, not one per call.
- **Review round 3 (2026-09-29):** All six round-2 findings confirmed resolved. The reviewer also verified three points against the code: the sentinel drain waits on the same queue the host's services use; `persistence` is in scope where the signal handlers are registered; the owner-child can seed through `writeSeedFile`. Two findings, both accepted:
  - **Seeding race.** The seeding-race test is now sequenced on a stderr waiting line from stdio start-up, and the dropped re-check is added to the fault list.
  - **Consistency.**
    - `releaseOnExit` is an exported, testable helper.
    - `index.ts` exports both errors and the handle type.
    - The host's waiting line goes to stdout; stdio's goes to stderr.
- **Review round 4 (2026-09-29):** Reviewer confirmed both round-3 findings resolved and reported no substantive findings. The plan is ready to implement.
- **Implementation (2026-09-29):** Built test-first in the planned order, and each of the four planned fault checks failed for the intended reason before it was reverted: stdio without per-call ownership, reclaim without the nonce re-check, release before the drain (and a persisting drain), and stdio start-up without the post-refusal re-check. One sequencing change: the MCP SDK client probes stdio on a disposable sibling process whose stderr is discarded. The seeding-race test therefore uses a `StdioClientTransport` subclass, which probes in place, so the stdio waiting line is observable.
- **Diff review round 1 (2026-09-29):** Three independent reviewers covered correctness (with multi-process stress on Windows), spec and boundaries, and living documentation. All findings were checked against the code. Resulting changes:
  - A zero-wait acquirer whose owner vanishes at the read retries once at once, instead of reporting `data_file_owner_unavailable:`.
  - `EPERM`/`EBUSY` from *reading* a record pending deletion is treated as a vanished owner. Stress reproduced this at 1–3 of 320 contended acquisitions.
  - A record naming this process's pid with a nonce it does not hold counts as a reused pid's.
  - A failed temp-record write is reported as unavailable.
  - Exit listeners swallow release failures.
  - Twelve documentation corrections, including the host `why.md` decision link, the e2e preparation, wait-versus-refuse wording, the operator-visible waiting lines and troubleshooting rows.
- **Diff review round 2 (2026-09-29):** Stress was clean (6×320 contended increments and 96 reclaiming processes, with no errors or overlaps). One latent should-fix, reproduced: a release dropped its nonce before unlinking, so a same-process acquirer could reclaim the still-present record and then lose it to that unlink. The nonce now leaves only after the unlink.
- **Diff review round 3 (2026-09-29):** The round-2 race is confirmed fixed: a same-process acquirer now waits on the pending release, and a foreign acquirer is refused. The stress runs are clean again. No substantive findings. One vanishingly unlikely, pre-existing overlap between an exit-time `releaseSync` and an in-flight async unlink was accepted without change.

## Outcome

**Deliverables.** Every canonical JSON writer now takes turns through an advisory owner record, `<data file>.owner`.
- **Primitive.** [`acquireDataFileOwnership`](../../../packages/repositories/src/data-file-ownership.ts) publishes the record atomically by `link` and waits a bounded time for a live owner. It reclaims a dead one only under `<owner>.reclaim` with a nonce re-check, and it refuses with `data_file_in_use:`, naming the owner and the file to delete by hand.
- **Host.** [The host](../../../apps/prototype-host/main.ts) owns its file from before the load until after a drained shutdown (`shutdownHost`, `releaseOnExit`), and releases on a failed start.
- **Stdio.** [Stdio](../../../apps/prototype-host/mcp/stdio.ts) owns the file per call. It is refused at once, reads included, while a host owns the file. It starts and lists tools without ownership, and survives a seeding race.
- **Other writers.** The seed, reset and upgrade CLIs go through `seedDataFileOwned` and `upgradeDataFileOwned`. [`apps/e2e/prepare-data.ts`](../../../apps/e2e/prepare-data.ts) acquires around its copy.
- **Evidence.** [`apps/prototype-host/data-file-ownership.test.ts`](../../../apps/prototype-host/data-file-ownership.test.ts) proves the acceptance steps across real processes, and the primitive has 27 unit tests with injected liveness and filesystem faults.

**Deliberate choices.**
- **Stdio owns per call, not for its lifetime.** Lifetime ownership would block `pnpm dev:host` whenever a desktop client is open, and would contend with the SDK's sibling probe process.
- **Liveness is by pid, with a manual escape.** A reused pid needs the named file deleted by hand. Nothing is ever taken from a live pid, and there is no `--force`.
- **This process's own records.** A record naming this process's pid counts as alive only while this process holds its nonce. This is how a Windows pid reused after a crash is recovered.

The [decision entry](../../decisions/2026-09-one-writer-per-data-file.md) records the rejected options: the documented rule only, lifetime stdio ownership, OS locks, and unguarded reclaim.

**Deviations.**
- **Windows hardening.** Review stress on Windows showed that reading a record pending deletion fails with `EPERM`. That case, the zero-wait vanished-owner race, the reused-pid rule and the release ordering were all added after the plan (see the Revisions above).
- **Seeding-race test.** It needed an in-place probing transport.

**Deferred and residual.**
- **Drain window (§71).** The shutdown drain covers units already queued. A request handler still between `stop()` and its first `unitOfWork.run` can queue behind it in the last milliseconds; this is documented as a disposable-host residual.
- **Reader handle.** On Windows, a stdio child's unowned start-up read can make one host `rename` fail with `EPERM` (pre-existing).
- **Probabilistic test.** The two-stdio test is probabilistic; the deterministic guard is the refusal behind the host.
- **Normal release on Ctrl+C on Windows** was not exercised in this session. A console Ctrl+C could not be delivered from the tool runner. The drain-then-release path is proven in-process (`main.test.ts`, fault-checked), and the hard-stop path was exercised in real use. The first manual `pnpm dev:host` Ctrl+C should confirm that the owner file disappears.
- **Other findings.** Slice 46 findings 8–14 remain planned.

**Open questions.** None blocking. Two friction notes were recorded:
- The refusal is long, and pnpm's error noise buries it.
- Stopping the `pnpm` wrapper orphaned the `node` host, which kept owning the file. The refusal named its pid, which made it easy to find.

**Documentation updated.**
- Architecture: `docs/architecture/{why,what}.md`; `repositories/*`; `prototype-host/{overview,how,what,why}.md`; `prototype-host/mcp-transport/*`; `prototype-data/{overview,how,what}.md`; `testing/{how,what}.md`.
- Guides and README: `docs/guides/mcp-setup.md`, with the anchor kept; `README.md`.
- Decisions: the new decision entry, dated amendments to the stdio-token and live-updates decisions, and the decisions index.
- Other: `.gitignore`, `CURRENT_SLICE = 54`, `.prototype/notes.json`.

**Verification.**
- `pnpm test` passed: root tooling, contracts 355, repositories 191, web, prototype-data 122, domain 799, MCP tools 173, host 284.
- `pnpm lint` and `pnpm docs:check` passed.
- All four acceptance scripts passed, and `pnpm e2e` passed 69/69.
- Real use on isolated `agent-heavy` data behind `pnpm dev:host`:
  - A real SDK stdio client listed 38 tools. Its `create_task` returned `data_file_in_use: … owned by http-host pid 11848 …; stop the host, or use its HTTP MCP endpoint. …`.
  - `pnpm prototype:upgrade` printed the same refusal.
  - After the host was hard-stopped, the same client reclaimed the stale record and created its task.
