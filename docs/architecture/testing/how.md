# How testing works

For Slice 45's integrated closure, run every gate — `pnpm docs:api`, `pnpm test`,
`pnpm docs:check`, `pnpm lint`, `pnpm build`, `pnpm storybook:build`, `pnpm e2e` and the four host
acceptance scripts — then use `nested-projects`, `personal-workspace` and `agent-heavy` in isolated
data. Inspect exact archive markers and IDs before and after each owner Restore; a listing is only
a current read, so a race is verified against the canonical write refusal too.

## Runtime flow

Slice 76 uses `apps/e2e/ux/slice76.config.ts` for before/after capture and
`slice76-behavior.config.ts` for browser journeys, on web 4253, host 4353 and
`.prototype/ux-slice76.json`. Its `e4ec0cb` baseline is exported to
`apps/e2e/ux-output/slice76-baseline-web/browser`. `ux/chrome-verification.ts` records plus
hit maps, per-section Tab walks, names, effective opacity/contrast, header/content alignment,
resize midlines and delayed collapse timings. `section-chrome.spec.ts` asserts those paths;
WebKit remains unverified.

Sheet profile 76 runs the control census (including `[role=slider]`) without insertion/title
exceptions, keeps the remaining slice-72 exceptions, gates content left edge/width within
1 px and new canvas axe nodes matched by stable anchors, reports contrast, and requires
complete `chrome-verification.json`. Earlier slices' runtime scripts remain frozen.

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
   to 1.01 MB, so the watched hard ceiling became 1050 kB while the 850 kB warning remains reported.
   Slice 41's eager header controls measured 1024.97 kB.
   After Slice 73 closed at 1,049,943 bytes, the user raised the hard ceiling to 1100 kB.
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
    archived container; the acceptance script's clock-driven Archive Restore after a removal's
    history expired runs on Streamable HTTP. `mcp/stdio.test.ts` independently proves the stdio
    expiry, Restore and same-file restart through an SDK client with an injected test clock.
    Slice 65 adds a shortcut on a created workstream's Work canvas, recorded and undone in that
    workstream's history, to `acceptance`; `mcp-acceptance` places an ancestor section on a
    workstream's Work canvas (page id read with `list_project_pages`), lists and undoes it, and
    proves a forward cross-root `update_project` is refused naming a placement it would split, then
    succeeds once the placement is removed — on both transports. Slice 67 reads updated and Undone
    Markdown source back through `list_sections` and disk, and reopens a descendant task with
    owner-history isolation and exact `completedAt` Undo/Redo on both transports. Slice 68 checks
    that the forward refusal describes the placement's Work page and source, removes it by the id
    parsed from that text, and has the second connection place a new-root section on the mover's
    Work canvas so the agent's Undo of the move is refused with the same description, writes
    nothing, and succeeds once the placement is gone — on both transports.
5. `pnpm e2e` (dev servers stopped, Chromium installed once) first takes the scratch file's owner
   record and copies the current empty seed over it — refused with `data_file_in_use:` if a
   leftover e2e host still owns `.prototype/e2e-data.json`, reclaimed if a hard-killed one left a
   record — then starts both processes,
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
   `work-navigation.spec.ts` checks gear and plus behavior in both themes, live parent loss,
   create refusal, archived-root blocking and a second tab's Work/Todos refresh. The touch
   path and dialog containment are in `phone-layout.spec.ts`. Slice 67 adds the literal six-type
   picker in `canvas-editing.spec.ts` and Markdown rendering, exact touch source save, code scrolling
   and containment at 375 px and desktop span-4 Grid in both themes.
   Slice 42's `project-creation-history.spec.ts` creates from the sidebar and Work plus,
   Undoes and Redoes the same ids, reloads the creator's recovery route, and confirms another actor
   sees *Project unavailable*. A nested-project journey checks the root Work tree, Todos, Archive
   and the parent's Work column after create, Undo and Redo, then verifies the expired
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
  `@storybook/addon-themes` and `jsdom`.
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
- **Descendant history discovery** lives in `todos.spec.ts`: the `nested-projects` journey
  follows owner links from root Todos and Archive, checks focus after click, reload and Enter,
  takes a child Undo/Redo without advancing the root revision, and checks another browser
  persona's unavailable route and a same-workspace MCP agent's separate summary. The component
  specs cover task and unit-of-work rows, all four Archive item kinds and root-owned omission.
- **Task Delete recovery feedback** lives in `row-history.spec.ts` and `todos.spec.ts`:
  a Task List and the root chronology raise the shared toast after the row leaves; the
  journeys check its local Undo and the "Undone:" morph, Open archive and Restore,
  keyboard/touch activation, failure and 375 px themes. The focused web component specs drive pending, refusal, final-row
  and route-generation boundaries before those browser journeys.
- **Task interaction** lives in `task-interaction.spec.ts`: isolated `nested-projects` scratch
  roots exercise both task checkbox surfaces, reload, progress and reflection projections, exact
  owner Undo/Redo timestamps, routed/injected refusals, repeated Space with retained focus,
  title/background selection and drawer title validation/commit/Escape. Shortcut rows remain
  read-only. `canvas-editing.spec.ts` proves a title drag opens no drawer, sends no task PATCH
  and does not move a section. HTTP and MCP reopen cases in `api/routes.test.ts` and
  `contract.test.ts` were proved sensitive by temporarily preserving `completedAt`, then
  immediately restoring the domain line and rerunning green.
- **Phone layout** lives in `phone-layout.spec.ts`. Isolated `nested-projects` data, 375 × 812
  with `hasTouch`/`isMobile` in both `colorScheme` values (the browser theme follows the device
  until explicitly chosen with the toggle), plus a separate non-mobile context for resize, because `isMobile` emulation does
  not resize faithfully. Overflow is asserted on the document, on `main.workspace` and on the
  project main track: the shell's `100vh` `<main>` scrolls internally, so a document check alone
  misses content that overflows inside it. Every journey waits for the persona before creating
  workspace data; identity loading does not change the theme. `row-history.spec.ts` taps Delete with the details drawer open. Title taps open
  the stacked Task List drawer, Close returns focus to that title, and a done task reopens by
  touch with API and reload evidence. Tap slop is proved in TaskRow's unit test, because
  Playwright's `tap()` has no movement. Opening intentionally does not scroll the drawer into view.
- **Removal Undo acceptance** lives in `removal-undo.spec.ts`: disposable views leave both
  the canvas and Archive and return with their saved config/order; live task and reflection rows
  cascade in one gesture; independently archived rows keep their markers; an independent task
  move keeps its own Undo/Redo; old HTTP reassign fields are refused without a write; reload
  preserves Archive and section state.
- **Section edit Undo acceptance** lives in `section-edit-undo.spec.ts`: explicit HTTP
  add/update/move Undo, disjoint and overlapping agent edits over MCP, canvas contextual add,
  rename, a Markdown Edit → Save, collapse, keyboard resize and keyboard move Undo with reload, and
  the Reflections-page container add, Undo and refusal once a reflection is authored.
- **Markdown acceptance** lives in `canvas-editing.spec.ts`: `markdown section saves source,
  renders safely and undoes` creates from the picker, previews a heading and list, saves exact
  source, then reloads to check links, fenced code and escaped script text without a script
  element. Cancel after typing and unchanged Save send no PATCH; an awaited changed Save
  settles both gestures before the recorded PATCH list is asserted to contain only that write.
  Header Undo/Redo are checked against exact API source. `markdown shortcut renders read-only`
  projects a child canvas's source onto Home with no Edit control. The HTTP round-trip case in
  `api/routes.test.ts` and the `create_section` / `update_section` cases in `contract.test.ts`
  preserve source and replace config whole; `get_project_archive` checks non-blank Markdown's
  `config` recovery. Temporary source-dropping faults in tool and PATCH forwarding were
  reverted after those source assertions failed.
- **Optional-page history** lives in `page-history.spec.ts`: a first enable through the page
  manager, undone to an absent record and redone to the same page id with a second tab watching the
  live frames and a reload proving persistence; Open archive from More navigating without a write,
  a toggle from a nested work route still belonging to the root's history, and a viewer of the
  displayed Archive page staying there when Undo removes its first-enable record; and an agent's Reflections container
  and row blocking the first-enable Undo, with the root's whole business and history state read back
  unchanged after the refusal.
- **Duplication, Restore and placement history** live in `canvas-history.spec.ts`: a shortcut
  added, collapsed and removed through the real canvas controls, reversed and replayed through the
  same user's history endpoint with a second tab watching; an Archive Restore that records its own
  action, is undone back into Archive and redone, with the removal beneath it still its own step;
  and duplication, which stays an HTTP action because the frame has no Duplicate control yet.
- **Untitled shortcut names (Slice 69)** are checked in `canvas-editing.spec.ts` with
  `toHaveAccessibleName` on `[data-shortcut-frame]`: Kitchen's local `Rename Markdown` tool
  sits beside `Markdown (Garden)`, and the seeded Home distinguishes `Reflections (Kitchen)`
  from `Reflections (Home renovation)`. `project-history.spec.ts` checks the qualified Progress
  shortcut's captured labels. Both MCP transports check the untitled Work Manager source's
  receipt and following history label. The `ShortcutFrame` story's play function finds
  `Remove shortcut to Markdown (Website launch)`; `pnpm test` does not execute that play function,
  so run its Interactions in Storybook separately.
- **Integrated recovery acceptance (Slice 33)** is a matrix, not one journey. The Refactor §26
  ledger in [the Slice 33 record](../../roadmap/completed/33-recovery-undo-integrated-acceptance.md)
  names each assertion. To rerun the failure and reopen evidence: `recovery-undo-acceptance.test.ts`
  writes current seeds to temp files through `writeSeedFile` and reopens with `loadPersistence`
  each time; old-file conversion cases were removed in Slice 66;
  `live-updates.test.ts` swaps `store.persist` or `operationActions.insert` for a throwing function,
  checks the bytes on disk are unchanged and no frame was delivered, then restores the original
  and retries once. `section-edit-undo.spec.ts` sets the dev panel's failure rate to 100% only
  after reads settle and back to 0% before re-reading.
- **Integrated Undo/Redo and Archive acceptance (Slice 45)** is likewise a ledger: the
  [Slice 45 record](../../roadmap/completed/45-undo-redo-archive-integrated-closure.md) names a
  domain assertion and browser or MCP evidence for every Slice 34 coverage row. Its known limits:
  persistence and recorder faults were originally injected at the host commit boundary the MCP
  tools share (`live-updates.test.ts`); Slice 52 adds SDK transport faults in both HTTP and stdio.
  The Slice 45 acceptance script's expiry check runs on Streamable HTTP, whose host exposes
  `/prototype/clock`; Slice 53 covers the same boundary over SDK stdio with a test-child clock.
  The browser has no
  reflection Delete or section Duplicate control, so those families' browser evidence is HTTP or
  MCP driven. A size check is not a reachability check: at 375 px assert that a control lies inside
  its container and the viewport, then tap it.
- **Stdio timeouts grow with child processes (Slice 72.1).** Each `stdio.test.ts` case passes
  `budget(children)`, `CASE_BASE + children × CHILD_BUDGET` (15 s each), for the `tsx` children it
  starts. A timeout there guards against a hang; a new case counts its children, never a flat
  number. `packages/domain/src/import-lint.test.ts`, which starts a Node scanner per check, allows
  15 s for the same reason: one case exceeded vitest's 5 s default under a full `pnpm test`.
- **MCP transport failure evidence (Slice 52)** lives in `mcp/handler.test.ts` and
  `mcp/stdio.test.ts`. Each SDK case owns a temporary `agent-heavy` JSON file. Warm the
  authenticated connection, prove a second authentication leaves bytes unchanged, then fail one
  persist for task Add or Undo and compare the whole document and bytes. HTTP watches the hub at
  delivery and reopens the file; stdio has no hub. For a lost Undo response, the HTTP fetch gate
  withholds an already-produced response and the stdio child exits after registry commit but
  before serialization. Reconnect to the same file, retry the original expected revision, and
  read `get_operation_history` separately to see the next Redo action. The client must not retry
  with a fresh revision just because delivery was uncertain.
- **Stdio expiry and durable recovery (Slice 53)** lives in `mcp/stdio.test.ts` with
  `mcp/test/clock-stdio.ts`. The SDK client writes the exact removal receipt expiry to a
  sidecar, reads Undo before the child advances, then reads no Undo and a typed expiry
  refusal without a business or byte change after auth settles. It checks retained prose
  in Archive, reads the old removal through `ActivityService` after closing each child,
  restarts sequentially on the same file, restores once and reopens again to check the
  section, new action and events. The test never exposes clock control as a public tool.
- **One writer per data file (Slice 54)** has two layers. `packages/repositories/src/
  data-file-ownership.test.ts` drives the primitive in `mkdtemp` directories with an injected
  `isAlive`, a counting `sleep` (the deadline is the sum of the sleeps, so no timers) and an
  injected `fs` that produces Windows codes and holds one reclaimer at a gate while another
  reclaims. `apps/prototype-host/data-file-ownership.test.ts` spawns the real host, SDK stdio
  clients and `test/owner-child.ts` — a child that holds a given kind, optionally writing a seed
  under it on `seed`, until told to `release` or killed. Sequence on printed lines (`owned`, the waiting lines, `listening`),
  never on sleeps. On Windows `child.kill()` runs no handler, so assert a dead-pid record there
  and a removed file on POSIX. The SDK probes stdio on a sibling whose stderr is discarded; a test
  that must read start-up stderr uses a `StdioClientTransport` subclass, which probes in place.
- **The trap:** a test that passes before the implementation, or fails on a typo. Watch
  it fail for the right reason first. When a new acceptance assertion passes against code that
  already works, inject a temporary targeted fault, watch it fail, and revert the fault.

The Compodoc fragment regression runs when generated API output exists; otherwise Node
reports it skipped. Run `pnpm docs:api` before `pnpm test` to exercise it.

## Opt-in UI evidence (Slice 70)

Slice 71's standalone `node apps/e2e/ux/spike/blur-spike.mjs` measures injected glass
variants against the static production build on 4201 and one scratch-data host on 4321.
Build with `pnpm --filter web build` first. Never run the spike alongside `ux:capture`.
It owns its servers and runs one Chromium browser at a time; no developer data is read.
Results are written to `docs/roadmap/70-ui-ux/blur-spike.json`; traces and paired captures
stay in git-ignored `apps/e2e/ux-output/spike/`. This is a measurement outside every test
command, with a baseline sanity gate and explicit emulation limits.

`pnpm --filter @cwm/e2e ux:capture` runs the selected matrix and ten scripted core-task
paths outside `pnpm test` and `pnpm e2e`. It reuses the e2e server definitions and
ownership-guarded `prepare-data.ts`, with a static production web build at 4201 and a scratch host at 4321. Build with `pnpm --filter web build` first. Browser routing
preserves the app's original origin for CORS while forwarding every request to those
servers; it never reuses the developer's host. `seed.ts` accepts `CWM_E2E_HOST` only for
this test process; normal e2e retains 4310.

Outputs live in git-ignored `apps/e2e/ux-output/<HEAD>/`: index/contact sheet, PNGs, axe
JSON, console errors, ARIA snapshots and layout measurements. Plane-container boxes carry selector/index keys alongside controls and scroll regions, so paint-only slices can compare geometry. The index discloses the
working-tree capture and coverage gaps. `SEED_NOW` fixes host/browser time; animation is
disabled. A held loading read is explicitly exempt from network-idle waiting. Partial
artifact failures remain incomplete and fail the capture assertion. Task completion and
blocked outcomes are recorded separately from novice discoverability, which requires
independent walkthroughs. Run `node --test apps/e2e/ux/harness.test.mjs` and
`pnpm --filter @cwm/e2e exec node --import tsx --test ux/tasks.test.ts ux/matrix.test.ts ux/coverage.test.ts` for the helper checks.

This harness is an evidence collector, not an accessibility or performance certification.
Its selected matrix and unresolved coverage are recorded in the
[umbrella](../../roadmap/active/70-ui-ux-overhaul.md).

### Interactive audit rig (Slice 70 Phase 1)

Independent walkthrough and lens auditors need a browser that persists between their single
narrated steps, and each needs its own host. `apps/e2e/ux/walk/` provides that, outside every
test command:

- `static.mjs <dist> 4201` serves a production web build.
- `env.sh <name> <hostPort> <ctlPort> [--touch] [--theme light]` starts a host on its own port with
  its own data file, copied from the empty seed. It also starts `walkd.mjs`, a headless Chromium
  page that forwards `localhost:4200` to 4201 and `:4310` to that host.
- `walk.mjs <ctlPort> seed|goto|run|shot|aria|axe|console|quit` drives the page.

Data, logs and screenshots go to git-ignored `apps/e2e/ux-output/walk*`. Use ports 4320 and
up, so no auditor shares a host with another or touches the developer's 4200/4310.

The trap: a `page.route` handler must call `route.fallback()`, never `route.continue()`.
`continue()` bypasses the forwarding route, and a handler that delays and then falls back
loses the host override, so delayed writes fail. Observe pending states during the delay
only. `repro/r1–r10.js` are the orchestrator's reproduction scripts. Run them with
`walk.mjs <ctl> run -f`.

After a capture, run the report generator with node --import tsx ux/report.ts ux-output/<HEAD> from apps/e2e. It creates the contact sheet, a raw axe summary and the explicit inventory denominator. UX_MATCH selects a subset for recapture and merges its cells into an existing index. Scroll frames expose nested scroll regions on long canvases; their presence is recorded per cell.

Slice 71 capture preparation uses its own ownership-guarded `.prototype/ux-data.json` (`prepare-data.ts --capture`), independent of an existing e2e host. The opt-in `UX_DEPTH=1` verification collects forced-color, reduced-transparency and simulated unsupported-filter captures, built CSS fallback equality, keyboard focus rings, live Lab controls and device-theme reload evidence. `docs/roadmap/70-ui-ux/tooling/build-sheet.mjs` compares commit-keyed boxes and reports axe violations and incomplete counts plus composite contrast.

Slice 72 moves the control collector into `ux/layout.mjs` as `collectControls`, where `harness.test.mjs` exercises it (`node --test apps/e2e/ux/harness.test.mjs`; `pnpm test` does not run it). Each control record carries tag, type, role, class, computed border and a `scope`: `prototype` on a `/prototype/` route or inside the dev panel, `prose` inside rendered Markdown, otherwise `product`, the only scope the census gates. A checkbox or radio also records `target`, the larger of its own box and its label's, as WCAG 2.5.8 measures it. The capture enables axe's `target-size` rule, which axe-core 4.13 ships disabled. The opt-in `UX_PRIMITIVES=1` run (`ux/primitives-verification.ts`) captures Kitchen and Settings in both themes under forced colours and writes `primitives-verification.json`, keyed by surface and theme. The same run captures the Design Lab's Controls panel at 1440 in both themes and at 375 on touch (`primitives-lab.json`), releasing the shell's scroll region so the whole panel paints and, at 375 only, stacking the Lab's fixed rail, which has no phone layout. `-g "Lab Controls checkpoint"` runs just those. Build the web app first: the capture serves `apps/web/dist/web/browser`.

### Lifts and focus (Slice 73)

`lifts.spec.ts` drives the native top layer with keyboard and touch, including route landings,
focus return, dirty dialog dismissal, one-lift ownership and the phone task sheet. The component
specs stub `showPopover`, `hidePopover`, `showModal` and `close`; they prove application state and
permission/failure rules rather than browser inertness, light dismiss or native restoration.

The matrix includes Project details, archive confirmation and a task opened after scrolling the
overdue list. `UX_BEFORE=<commit>` labels baseline output. Only Slice 73's baseline,
`e56c7d7`, maps the details/confirmation states to their former inline More surface; later
baselines already have the native lifts and open them normally. The baseline web build must match that commit;
the environment variable does not check out or build it. `UX_MATCH` still selects and merges cells.

`UX_LIFTS=1` enables `ux/lifts-verification.ts`: six lift kinds in both themes, closed/open
persistent blur counts, at most one transient blur, forced-colour and reduced-transparency
fallback captures, focus logs and a reported muted-text composite ratio over sheet/text backings.
Run it with the capture config after building the web app. `ux/slice73.config.ts` provides separate
ports 4241/4341 and `.prototype/ux-slice73.json` when the usual capture file is owned. Initialize
that new scratch file from `prototype/seeds/empty.json` before its first run. Its baseline mode
serves the preserved `ux-output/slice73-baseline-web` build; normal mode serves the current dist.
`UX_STATIC_ORIGIN` is the browser forwarding override, defaulting to the ordinary 4201 server.
After the ordinary capture run releases those ports, run
`UX_BEFORE=<commit> pnpm --filter @cwm/e2e exec playwright test --config ux/slice73.config.ts -g 'Genuine before lift layer budget'`
against the preserved baseline build. This supplemental collector writes `lift-baseline.json`
without overwriting the matrix; profile 73 compares both after counts with that genuine-before
budget and requires matching baseline provenance. In PowerShell, set the environment variable
with `$env:UX_BEFORE='<commit>'` before the command and remove it for after runs.

`node docs/roadmap/70-ui-ux/tooling/build-sheet.mjs <before> <after> <sheet> --profile 73`
gates closed-state boxes at 1 px, required lift roles/names and nested-interactive axe rules,
phone document overflow and product scroll-region overflow, complete lift/focus/fallback evidence
and the T03/T04/T08 baseline budgets. Only the known Design Lab `main.workspace` phone overflow
is listed as an exception, with the baseline client width (375 px) and a scroll width no wider
than the baseline's (625 px); new or increased overflow, including on `/prototype/state`, fails.
Open-lift and Lab geometry is listed as intended movement. Contrast stays reported-only. Run
`node --test docs/roadmap/70-ui-ux/tooling/build-sheet.test.mjs` for its fixture-based gates.

### Feedback toast (Slice 74)

`feedback.spec.ts` drives the shared toast at 1440 with the keyboard and at 375 on touch:
removal Undo first, the "Undone:" morph and restored-heading focus, the paused timer,
replacement by a newer write, closing on navigation, an Open archive visit that writes
nothing, hidden-Archive direct routes for Alex and Sam, a stale cross-owner receipt refused
without replacing the displayed history, and a long task title that keeps Undo and Dismiss
inside the phone toast. It runs in the ordinary suite, and against the production build with
`--config ux/slice74-behavior.config.ts`. The ordinary config ignores `ux-output/`, which
can hold an archived baseline checkout with its own test files.

`UX_PLACEMENT=1` enables `ux/placement-verification.ts` (Slice 75), which writes
`placement-verification.json`. It records the keydown-to-pending time over five held POSTs, the
drawer's Saving… and row times, focus and rect after a section or shortcut create, the long-list
row and field, the held list's top across two completions, and the failure and refusal
placements, each with a screenshot. It runs unchanged on the before build and records what it
observed instead of asserting. `ux/slice75.config.ts` owns ports 4252/4352 and
`.prototype/ux-slice75.json`. `UX_BEFORE` serves `ux-output/slice75-baseline-web`, and `UX_PRE73`
serves `ux-output/slice73-baseline-web` for the slice-73 pair. Labels come from `UX_BEFORE` or HEAD.
`build-sheet.mjs --profile 75 [--pre73 <dir>]` gates those facts and T03 (≤10 clicks, ≤38
keystrokes). It reports, without gating, the task drawer, creation dialog and Lab cells, gates every
other cell at 1 px, and lists each visual pair's status. Its one listed closed-state change is an
exact 24 px rise below the canvas live region, which now leaves the grid. `ux/slice75-behavior.config.ts` runs
`placement.spec.ts` on the same rig.

`UX_FEEDBACK=1` enables `ux/feedback-verification.ts`, which writes
`feedback-verification.json`: content-track clearance, focus logs for each starred row,
whether the toast covers the acted region (reported), blur counts with the toast alone and with
the task drawer, More or a dialog open (at most one transient layer), forced-colour and
reduced-transparency fallbacks, phone drawer suppression and a reported muted-text contrast
ratio, in both themes at 1440 and 375. `ux/slice74.config.ts` owns ports
4242/4342 and `.prototype/ux-slice74.json`; with `UX_BEFORE` it serves the archived
`ux-output/slice74-baseline-source` build. Build the web app first.
`build-sheet.mjs --profile 74` gates that file, closed-state geometry, phone overflow and the
T05/T09 task costs, and fails when the verification is missing or incomplete.
The profile-74 HTML includes the runtime screenshot gallery, an explicit mapping of all twenty
findings and a visual-pair inventory separate from its mechanical gates. Supplemental baseline
screenshots use `feedback-verification.json` in the before directory with `visualFocus` entries keyed
by `row`, `theme` and `width`, matching the runtime collector. The sheet copies each supplied image
and labels after-only evidence; missing visual pairs remain visible even when all gates pass.
Run `node apps/e2e/ux/feedback-visual-pairs.mjs` from the repository root against the isolated
Slice 74 servers to supplement the after evidence, then serve the preserved baseline build on
the same web port and run it with `--before`. This opt-in script reseeds the scratch host for each
case; run it only after other captures release that host. `--host`, `--web-origin`, `--build-dir`
and `--output` override the server and evidence paths. It records the served build's index hash
and prepares the same Kitchen task for both Restore captures. Rebuild the profile-74 sheet after
both runs; these screenshots supplement rather than replace the runtime measurement gates.
The supplemental records and `feedback-visual-*` images remain separate from the original
runtime `focus` records and images; the gallery identifies each source and pairs only matching
supplemental fixtures when both sources exist. Earlier baseline visual-only `focus` records
are also supported.
