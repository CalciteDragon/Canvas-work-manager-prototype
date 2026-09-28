# How testing works

For Slice 45's integrated closure, run every gate — `pnpm docs:api`, `pnpm test`,
`pnpm docs:check`, `pnpm lint`, `pnpm build`, `pnpm storybook:build`, `pnpm e2e` and the four host
acceptance scripts — then use `nested-projects`, `personal-workspace` and `agent-heavy` in isolated
data. Inspect exact archive markers and IDs before and after each owner Restore; a listing is only
a current read, so a race is verified against the canonical write refusal too.

## Runtime flow

1. `pnpm test` first runs `node --test scripts/roadmap.test.mjs scripts/check-docs.test.mjs` for roadmap and documentation guards,
   then `pnpm -r --if-present test`: `vitest run` in each package and the
   host, `ng test --no-watch` in the web app. No browser or external network is needed;
   transport and persistence tests use isolated localhost servers and temporary files.
   The web app's specs run non-isolated (the builder's default), so files in one worker share
   jsdom storage; `apps/web/src/test-setup.ts`, registered as `setupFiles` in `angular.json`,
   clears `sessionStorage` and `localStorage` before every test so no spec inherits another's
   §47 flags ([decision](../../decisions/2026-09-web-specs-start-with-empty-storage.md)).
   Slice 42's unavailable-route retry after a failed history-summary read is covered by
   `apps/web/src/app/features/projects/project-workspace-shell.spec.ts`.
2. `pnpm lint` runs each workspace's `lint` — `tsc --noEmit` plus the import, date and
   token lints where they apply — and then `node scripts/check-docs.mjs`.
3. `pnpm build` builds the web app (with the bundle budgets) and type-checks the rest. Slice 31
   keeps project routes eager and uses conditional Angular `@defer` boundaries for the canvas
   dialogs, recovery notice (the Undo notice until Slice 41) and Archive list; the production initial bundle measured 994.27 kB at Slice 33
   against the original 1 MB error ceiling; Slice 36's contracts moved the measured initial bundle
   to 1.01 MB, so the watched hard ceiling is 1050 kB while the 850 kB warning remains reported.
   Slice 41's eager header controls measured 1024.97 kB.
4. `pnpm --filter @cwm/prototype-host <acceptance|agent-acceptance|mcp-acceptance|live-acceptance>`
   starts a second host on a temp file and walks a slice's *done when*. Since Slice 30,
   `acceptance` removes `personal-workspace`'s first Home placement, undoes it through
   `POST /api/history/:historyId/transition` and checks it returns first, that a replay refuses
   `history_revision_stale` with a summary showing it landed, and that Redo and Undo repeat it;
   since Slice 35 it also runs Stage A's A → B → Undo → Undo → Redo → Redo chain on one title with
   `GET /api/projects/:id/history` as the observer, and branch invalidation (a no-op and a refusal
   keep Redo; a new write discards it from the file). Slice 37 adds a duplicate/Restore/placement
   chain: the copy's identity through Undo and Redo, a Restore receipt and its null-receipt retry,
   and a shortcut added, collapsed, moved and removed then stepped back and forward — with the
   no-op update and no-op move proving they record nothing. Slice 38 adds an optional-page journey
   on a root it creates so the enable is genuinely a **first** enable: `page.add` undone to an absent
   record and redone to the same id and `createdAt`, a `null`-receipt no-op, the boolean reversed and
   replayed, and a host restart that reads the exact page and the three persisted actions back off
   the file. `mcp-acceptance` grants `projects.write` to
   the token's connection **in its copied temp files** (the seed is unchanged), cascades the middle
   `agent-heavy` task list away with `remove_section`, restores it with `undo_operation` over both
   transports, and checks the file. Slice 31 extends both: HTTP and MCP acceptance delete a
   disposable Progress section, repeat the removal to recover the exact receipt, undo it, and
   inspect persisted recreation. MCP acceptance also runs add (with Redo), update (including an
   unchanged `operation: null`), the same-field chain through `get_operation_history`,
   `undo_operation` and `redo_operation` (refusing an out-of-order `history_not_next:`), and move
   over both transports, and a fresh connection after restart sees its own persisted history. Connection revocation after a receipt is
   issued is pinned in `apps/prototype-host/mcp/handler.test.ts`. Slice 33 originally exercised
    reassign and cascade with exact row and section ids; Slice 43 retires new reassign requests and
    now checks, per transport, that their refusal leaves business/history/activity state unchanged,
    an independent `update_task` remains Undoable/Redoable, and an ID-only removal cascades with
    the Archive projection. A second
    connection (`prototype-user-a-readonly`, granted `projects.write` in the temp file) refused
    as not-found, then removal of `projects.write` from the primary `agent-claude` connection and
    revocation of the second (`agent-cursor`), plus Progress, Timeline and Recent Activity removal
    absent from `get_project_archive` and a repeated Undo that adds nothing,
    each refused with the file's business collections byte-identical. HTTP changes grants through
    `PATCH /api/agent-connections/:id` and `POST …/revoke`; stdio edits its own temp file between
    completed calls, which its per-call reload sees. Slice 39 adds, per transport, an existing-project
    block on two roots it creates: `update_project`, `archive_project` and `restore_project` receipts
    and `null` no-ops, the action persisted in the sub-project's own history, a cross-root reparent
    undone and redone, the sub-project's own archive undone while archived, another connection's
    not-found, and each unrelated grant refused before `projects.write` alone reverses the
    reactivation and redoes it while archived. Slice 42 creates a root, undoes its `project.add`,
    verifies the absent project and canonical page, restarts from the same JSON document, and redoes
    the same ids. It also advances a second creation past the 24-hour receipt window, restarts again,
    and confirms the lifecycle Activity remains while Redo stays unavailable. Slice 45 adds, on
    both transports, the task add → complete → rename → Delete chain with exact fields and cascade
    markers, reflection Undo and Add Redo, layout/progress Undo/Redo with a same-value null receipt,
    two transitions at one revision (one lands, one is stale) and a Restore refused under an
    archived container; on Streamable HTTP only, Archive Restore after a removal's history expired.
5. `pnpm e2e` (dev servers stopped, Chromium installed once) first copies the current empty seed
   to its disposable scratch file, then starts both processes,
    seeds before each spec, and runs the web, canvas editing, section edit/removal Undo, row history,
   MCP, Todos, Archive and Reflections specs, including keyboard/touch geometry and receipt recovery.
   Slice 39's project history is exercised by `web.spec.ts` (header rename and archive each record a
   project action the history route reverses, with the header following the frame), `todos.spec.ts`
   (a cross-root reparent and its Undo/Redo leaving and re-entering the open chronology it left) and
   `archive.spec.ts` (an archived sub-project's move and its own archive reversed while archived,
   against the open Archive it moved from). Slice 41's `project-history.spec.ts` walks the header's
   Undo and Redo: controls on every page, every family undone and redone with each transition's
   revision checked, reload and navigation under a delayed summary read, cross-owner guidance, an
   archive that stays on its project, pending state through a held write, a gated second tab refused
   `history_revision_stale`, an agent's conflicting edit, and expiry after a clock move. The older
   journeys that clicked the notice's Undo now go through `history-controls.ts`.
   Slice 42's `project-creation-history.spec.ts` creates from the sidebar and a Sub-Projects section,
   Undoes and Redoes the same ids, reloads the creator's recovery route, and confirms another actor
   sees *Project unavailable*. A nested-project journey checks the root Work tree, Todos, Archive
   and the parent's Sub-Projects section after create, Undo and Redo, then verifies the expired
   creation route has no stale recovery offer.
6. `pnpm storybook` serves the story sets with the theme toolbar; `pnpm storybook:build`
   produces a static build the 25.x closeouts used as a check.
7. After every slice, §77: seed, use, try it through MCP, write the friction down.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `InMemoryDataStore` | class | The store every suite below the browser uses | [API](../../api/classes/InMemoryDataStore.html) |
| `PrototypeClock` | class | Frozen time for tests | [API](../../api/classes/PrototypeClock.html) |
| `PrototypeIdGenerator` | class | Deterministic ids where a test needs them | [API](../../api/classes/PrototypeIdGenerator.html) |
| `createApi` | function | A whole host in-process for route and MCP tests | [API](../../api/miscellaneous/variables.html#createApi) |
| `createToolRegistry` | function | What the contract suite iterates | [API](../../api/miscellaneous/variables.html#createToolRegistry) |

The harness and fakes are test-support files, excluded from the API reference; their
paths are in [what](what.md).

## Dependencies

**Depends on**

- Every system, by construction. Test-only dependencies: `vitest`, `@playwright/test`,
  `@modelcontextprotocol/client`, `storybook`, `@storybook/angular-vite`,
  `@storybook/addon-themes`, `jsdom`.
- [prototype-data](../prototype-data/overview.md) — seeds for every suite and script.
- [prototype-runtime](../prototype-host/prototype-runtime/overview.md) — `/prototype/seed`
  for the e2e specs.

**Depended on by**

- The development protocol in [AGENTS.md](../../../AGENTS.md): a phase is not done until
  `pnpm test` and `pnpm lint` are green and the acceptance check has been run.

## Invariants and lints

| Rule | Check |
|---|---|
| Domain imports only contracts and repository interfaces | `check-package-imports.mjs` in `@cwm/domain`'s lint; `import-lint.test.ts` |
| Tools import only contracts, domain, zod | same script, `--allow`, in `@cwm/mcp-tools`'s lint |
| No `new Date()` in domain code | `check-no-direct-date.mjs`; `time-lint.test.ts` |
| No design literals outside `_tokens.scss` | `check-design-tokens.mjs`; `expect-failure.mjs` self-test |
| Every tool has a contract case, tested under minimal grants | `contract.test.ts` |
| Every registry list is pinned | `registry.spec.ts` ×3 (sections, widgets, pages) |
| Every seed parses and matches its snapshot | `seeds.test.ts` |
| `LIVE_UPDATES` is provided | `app.spec.ts` |
| Documentation structure and links | `check-docs.mjs` |
| `pnpm test` needs no browser or external network | Host transport tests use ephemeral localhost ports; e2e and acceptance commands are separate |

## Commands

```bash
pnpm test                                             # everything offline
pnpm lint                                             # type-checks, boundary lints, token lint, docs check
pnpm build
pnpm --filter @cwm/domain test -- task-service         # one suite
pnpm --filter web test                                # ng test --no-watch
pnpm --filter @cwm/prototype-host acceptance          # and agent-acceptance, mcp-acceptance, live-acceptance
pnpm exec playwright install chromium                 # once
pnpm e2e                                              # stop dev:web and dev:host first
pnpm storybook                                        # :6006
```

## Changing it

- **A new rule:** a failing domain test first (AGENTS.md step 3), named for what it
  proves. Tests protect intentional behaviour: when intent changes, change the test
  *and* the implementation *and* the doc, never preserve a behaviour because a test
  asserts it (§77).
- **A new tool:** the contract suite tells you the case is missing.
- **A new boundary rule:** a lint with a self-test, not a comment. Copy the shape of
  `check-package-imports.mjs` + `import-lint.test.ts`.
- **A new e2e journey:** seed in `seed.ts`, spec beside the others, and an assertion that
  cannot pass vacuously — 25.5's review found one that could.
- **Archive acceptance** lives in `archive.spec.ts`: the original cascade/subproject journey,
  and Slice 29's content journey over `nested-projects` — created-id assertions that removed
  views, blank prose and independently moved empty sources are absent while prose, cascaded and
  pre-archived-only containers are present with recovery metadata; reload; append after an
  interposed Home shortcut; retry idempotency; the disabled tab reopened from a nested route;
  and the same projection and canonical restores through a real MCP client. Slice 47 adds a
  committed Restore whose re-read fails: a held quiet frame and a keyboard Retry keep the row
  paused, and only the released current read re-enables it after one write.
- **Removal Undo acceptance** lives in `removal-undo.spec.ts`: disposable views leave both
  the canvas and Archive and return with their saved config/order; live task and reflection rows
  cascade in one gesture; independently archived rows keep their markers; an independent task
  move keeps its own Undo/Redo; old HTTP reassign fields are refused without a write; reload
  preserves Archive and section state.
- **Section edit Undo acceptance** lives in `section-edit-undo.spec.ts`: explicit HTTP
  add/update/move Undo, disjoint and overlapping agent edits over MCP, canvas contextual add,
  rename, Rich Text blur save, collapse, keyboard resize and keyboard move Undo with reload, and
  the Reflections-page container add, Undo and refusal once a reflection is authored.
- **Optional-page history** lives in `page-history.spec.ts`: a first enable through the page
  manager, undone to an absent record and redone to the same page id with a second tab watching the
  live frames and a reload proving persistence; Open archive from More recording one action while
  re-opening an already-enabled page records none, a toggle from a nested work route still belonging
  to the root's history, and a viewer of the displayed Archive page returning to Home — without the
  re-enable offer — when the enable that created it is undone; and an agent's Reflections container
  and row blocking the first-enable Undo, with the root's whole business and history state read back
  unchanged after the refusal.
- **Duplication, Restore and placement history** live in `canvas-history.spec.ts`: a shortcut
  added, collapsed and removed through the real canvas controls, reversed and replayed through the
  same user's history endpoint with a second tab watching; an Archive Restore that records its own
  action, is undone back into Archive and redone, with the removal beneath it still its own step;
  and duplication, which stays an HTTP action because the frame has no Duplicate control yet.
- **Integrated recovery acceptance (Slice 33)** is a matrix, not one journey. The Refactor §26
  ledger in [the Slice 33 record](../../roadmap/completed/33-recovery-undo-integrated-acceptance.md)
  names each assertion. To rerun the failure and reopen evidence: `recovery-undo-acceptance.test.ts`
  copies the committed fixtures under `packages/prototype-data/test/fixtures/` to temp files, runs
  `upgrade-cli.ts` through `node --import tsx`, and reopens with `loadPersistence` each time;
  `live-updates.test.ts` swaps `store.persist` or `operationActions.insert` for a throwing function,
  checks the bytes on disk are unchanged and no frame was delivered, then restores the original
  and retries once. `section-edit-undo.spec.ts` sets the dev panel's failure rate to 100% only
  after reads settle and back to 0% before re-reading.
- **Integrated Undo/Redo and Archive acceptance (Slice 45)** is likewise a ledger: the
  [Slice 45 record](../../roadmap/completed/45-undo-redo-archive-integrated-closure.md) names a
  domain assertion and browser or MCP evidence for every Slice 34 coverage row. Its known limits:
  persistence and recorder faults are injected at the host commit boundary the MCP tools share
  (`live-updates.test.ts`), not inside the stdio or Streamable HTTP transports; history expiry over
  MCP runs only on Streamable HTTP, whose host exposes `/prototype/clock`; the browser has no
  reflection Delete or section Duplicate control, so those families' browser evidence is HTTP or
  MCP driven. A size check is not a reachability check: at 375 px assert that a control lies inside
  its container and the viewport, then tap it.
- **The trap:** a test that passes before the implementation, or fails on a typo. Watch
  it fail for the right reason first. When a new acceptance assertion passes against code that
  already works, inject a temporary targeted fault, watch it fail, and revert the fault.

The Compodoc fragment regression runs when generated API output exists; otherwise Node
reports it skipped. Run `pnpm docs:api` before `pnpm test` to exercise it.
