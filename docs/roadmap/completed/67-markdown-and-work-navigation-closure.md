<!-- completed-record id="67" closed="2026-10-09" summary="Slice 59 evidence ledger closed: four new proofs seen to fail, 109 browser journeys, real use, nine notes triaged, docs reconciled" -->
# Slice 67 — Markdown and work navigation integrated closure (Slice 59 Stage F)

## Goal

Prove every request of the [Slice 59 umbrella](../completed/59-markdown-and-work-navigation.md) with
named, passing evidence. Add the four proofs that are missing, use the result in the real app and a
real MCP client, reconcile the living documentation, and close the umbrella.

## Spec sections

[Main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md).

- **§69, §70 (verification).** Every acceptance row of the umbrella's Stage F matrix gets named
  evidence under the ledger rule below. The Markdown, work-shortcut and reopen rows also get
  assertions over both real MCP transports.
- **§77, §79 (actual use, friction).** Real use on scratch data and a real SDK client, with notes
  in `.prototype/notes.json`. Every note from Slices 60–66 is triaged.
- **§78 (decisions).** Audit only. The decisions listed under Acceptance step 6 already exist. No
  new entry unless this phase answers a new product question.
- **§14 (disposable data).** The umbrella's "same-file conversion evidence" is **superseded**, not
  proven. It is recorded honestly as such (ledger row 0).
- **Audited for drift, not reimplemented:**
  - §23 (the gear replaces Manage pages);
  - §§26–27 and 29–32 (workstream wording, six registered types, Work-canvas shortcuts, Markdown);
  - §§33–34 (reversible checkboxes, title selection);
  - §54 (tool descriptions).

## Build

1. **Evidence ledger.** Fill the ledger under the rule in Acceptance step 1. Start from the
   [inventory below](#evidence-inventory-at-planning-time). Read each named assertion, run it, and
   record its result in the Outcome. A child slice's green claim alone is not evidence.
2. **Close the four known gaps, test first:**
   - **Gap 1: reopen over real MCP transports.** No real SDK client sends `update_task` with
     `status: 'todo'` over Streamable HTTP or stdio. Today the evidence is in-process registry and
     HTTP route tests only.
   - **Gap 2: Markdown at phone width, in narrow Grid, in both themes.** Slice 62 checked this by
     hand only (`note-2026-10-02-001`). No browser test covers it.
   - **Gap 3: MCP never reads Markdown source back.** `mcp-acceptance.mjs:203-219` writes
     `{ markdown: 'Before' }` and then `'After'`, but asserts only receipts and titles. The matrix
     requires create, update **and read** of the source.
   - **Gap 4: no browser test checks the picker's type list.** "Picker exposes Markdown and no Rich
     Text" and "Registry/picker omit Sub-Projects" are proven only in the jsdom
     `section-create-dialog.spec.ts`. No browser test checks the options.

   If a new assertion passes on its first run, prove it is sensitive. Apply the temporary,
   targeted fault named in the test plan, watch the named assertion fail, then revert the fault
   and record both runs.
3. **Gate run.** Run every required command on isolated data.
4. **Real use.** Use the app with both dev servers on a scratch file, and with a real MCP client
   (Acceptance step 5). Set `CURRENT_SLICE = 67` and write notes.
5. **Friction triage.** Put a triage table in this plan's Outcome. It covers all nine notes from
   Slices 60–66 by id, each marked one of:
   - **answered** (give the slice or decision);
   - **obsolete** (give the reason);
   - **carried**: listed under *Known friction* in `goals.md`.
6. **Documentation reconciliation.** Run the drift audit (Acceptance step 6). Fix only stale
   statements you have confirmed, and add each changed file to this plan before editing it.
7. **Close.** In this order:
   1. Retarget this plan's own links to `../completed/59-…`, then complete Slice 67. Its Outcome
      describes the umbrella move in the future tense.
   2. Start Slice 59. Add a dated final-status amendment under its banner and write its Outcome.
      Both state that same-file conversion was superseded. The Outcome describes the move in the
      future tense. Retarget the umbrella's own Stage F link to `67-…` in `completed/`. Then
      complete Slice 59.
   3. Retarget the **relative Markdown links** to the umbrella in completed records 60–66 and in
      `goals.md`. Nothing else in those records changes: inline-code path cells stay as
      they are, following the Slice 34/46 precedent and the protocol's append-only rule.
   4. Move the direction from **Now** to a **Done** milestone in `goals.md`, then regenerate the
      board.
   5. Run `pnpm docs:check`, `roadmap.mjs check` and `pnpm lint`. These are the proof that both
      records are in `completed/`. Commit the whole closure as **one** commit:
      `docs:check` is red between steps 1 and 3.

## Done when

- The Outcome ledger has a status for every row of the Stage F matrix, plus row 0. Each status is
  PASS or SUPERSEDED, and no row is GAP. SUPERSEDED is allowed only for row 0, and must cite the
  disposable-data decision.
- All four new proofs exist. Each was seen to fail, either before its implementation or under a
  reverted fault.
- All required gates pass, and real use is recorded.
- All nine notes from Slices 60–66 are triaged.
- The spec, architecture, guides, README, decisions, goals and board describe the shipped product.
- Slices 67 and 59 are both in `completed/`. `pnpm docs:check` and `roadmap.mjs check` pass after
  the final move.

If a row cannot be proven without a product change beyond the repair rule (see *Open questions*),
this slice stays active and the gap is reported.

## Do not

- Add product behaviour, endpoints, tools, schema changes or section types. Do not repair
  friction (labels, Preview wording, Work-row details, refusal wording). Triage it only.
- Fix an unproven row by asserting it in prose. Missing evidence is a GAP until a test shows it.
- Change behaviour to fit the umbrella's 2026-09-30 *proposed* rules. The stage decisions and
  child records are current; the umbrella's proposals are historical.
- Rewrite frozen records or historical decision prose. Only relative link targets change, and
  dated notes are added where needed.
- Write to the developer's `.prototype/data.json`. Do not run Playwright against the personal dev
  servers.

<!-- ───────────── Written when the slice starts ───────────── -->

## Evidence inventory at planning time

Found by reading the suites on 2026-10-09, and corrected in review round 1. A cell is a pointer,
not a PASS. Cells marked *(confirm)* name a file whose exact titles are still to be read.

**Layers.**

| Label | Meaning |
|---|---|
| **unit** | vitest or jsdom: domain, registry, web specs, host route tables called in process |
| **e2e** | Playwright |
| **SDK** | a real MCP client over Streamable HTTP **and** stdio (`mcp-acceptance.mjs`) |
| **real-HTTP** | the second-process host (`acceptance.mjs`) |

| # | Matrix row | unit | e2e | SDK / real-HTTP |
|---|---|---|---|---|
| 0 | Done-when: "same-file conversion evidence; existing prose survives" | Superseded: the [disposable-data decision](../../decisions/2026-10-prototype-data-is-disposable.md), and the Slice 66 amendment to `2026-10-schema-version-6-markdown-conversion.md`. Remaining evidence: `data-store.test.ts` "an older schema version names reset (Slice 66)", and `seeds.test.ts` "%s seeds no retired Rich Text section (Slice 63)"; `recovery-undo-acceptance.test.ts` "Archive outlives expired and pruned actions" (in-process host), which asserts the seed's brief prose survives as `{ markdown }` | — | — |
| 1 | Markdown replacement | `section-create-dialog.spec.ts` (six types, Markdown first); `markdown-renderer.spec.ts`; `section-service.test.ts` config validation and Rich Text refusal *(confirm)*; `routes.test.ts` "a markdown section round-trips its source over HTTP" (in process) | `canvas-editing.spec.ts` "markdown section saves source, renders safely and undoes"; "markdown shortcut renders read-only". **Gap 4:** picker options | SDK: `create_section`/`update_section` with `{ markdown }`, and the `rich-text` refusal loop. **Gap 3:** source read back |
| 2 | Seeded content and history | `seeds.test.ts` "%s has no retired Sub-Projects view and a dense combined live order (Slice 66)"; "%s numbers sections densely within each page"; `data-store.test.ts` retired live and history refusals; `section-recovery-policy.test.ts` "markdown source with content is recoverable config", plus its `includes`/`leaves out` tables | `canvas-editing.spec.ts` "retired hierarchy view leaves Home and Kitchen placements in dense seed order"; `web.spec.ts` "nested-projects is a coherent multi-page showcase…" | `recovery-undo-acceptance.test.ts` restart and Archive cases, which start from the `nested-projects` seed |
| 3 | Reopen task | `task-service.test.ts` and `row-history.test.ts` *(confirm)*; `contract.test.ts` "update_task reopens a done task with tasks.write…"; `routes.test.ts` "PATCH status todo reopens a done task…" | `task-interaction.spec.ts` "${theme}: task reopen persists, updates progress and reflections, and reverses exactly"; "refused reopen restores native checkboxes in Task List and Todos"; `phone-layout.spec.ts` "…a done checkbox reopens by touch" | **Gap 1** |
| 4 | Click selects | `task-row.spec.ts`, `task-list-store.spec.ts` *(confirm)* | `task-interaction.spec.ts` "title and background selection, drawer drafts, focus return and read-only shortcuts"; `phone-layout.spec.ts` "a title tap opens the stacked task drawer…" | n/a |
| 5 | Gear | `project-page-navigation.spec.ts` *(confirm)* | `work-navigation.spec.ts` "${theme}: gear settings work by keyboard on Home, Todos and third-level work" (covers the refused toggle and Escape focus); `phone-layout.spec.ts` "gear page settings and Work creation stay tappable and fit the viewport" | n/a |
| 6 | Terminology | `contract.test.ts` "agent-facing workstream vocabulary (§26, §54)"; `archived-region.spec.ts`, `reflections-page.spec.ts` *(confirm)* | `work-navigation.spec.ts`: the Todos row says `Workstream`, and the plus is named "Add workstream" | n/a: agent wording is the registry test in the unit column |
| 7 | Work plus | `project-workspace-store.spec.ts` *(confirm)* | `work-navigation.spec.ts` "Work plus creates once without navigation…"; "real archived-ancestry refusal retains…"; "a failed create keeps its draft…"; `project-creation-history.spec.ts`, both cases | real-HTTP and SDK: project-creation Undo/Redo |
| 8 | No hierarchy view | `section.test.ts` "sub-projects is retired with a workstream replacement"; `section-service.test.ts` refusal; `data-store.test.ts`; `section-create-dialog.spec.ts` | `canvas-editing.spec.ts` dense-order case. **Gap 4:** picker options | `routes.test.ts` "POST sections refuses sub-projects" (in process); real-HTTP and SDK retired-type loops |
| 9 | Work shortcut | `section-shortcut-service.test.ts`, `shortcut-history.test.ts`, `project-service.test.ts` (Slice 65) *(confirm)* | `canvas-editing.spec.ts` "a workstream Work canvas takes, resizes, reorders, collapses, undoes and removes a shortcut"; `canvas-history.spec.ts` "shortcut gestures record once…"; `removal-undo.spec.ts` "a shortcut on another browser page follows source removal…" | real-HTTP: the Slice 65 Work placement. SDK: an ancestor section on a Work canvas, and the forward split-move refusal |
| 10 | Failure and scope | Slice 65 domain refusals (same page, cross root, archived owner, invalid page, minimal grants); Slice 61 foreign id; delayed write, navigation and reconnect: `todos-page-store.spec.ts`, `project-page-store.spec.ts`, `project-workspace-store.spec.ts` *(confirm titles)* | `canvas-editing.spec.ts` "contextual insertion preserves a combined order… reports failed creates" (incomplete order); `task-interaction.spec.ts` refused reopen; `work-navigation.spec.ts` failed and refused create | SDK: split-move refusal; `agent-acceptance.mjs`: grant revocation |

## Acceptance check

1. **Ledger rule.** The Outcome holds rows 0–10, with five columns: unit, e2e, SDK/real-HTTP,
   **cross-cutting**, and status.
   - **When a row is PASS.** The row's *request* has at least one e2e assertion. Its sub-clauses
     (for example, delayed writes or Archive wording) may be proven by unit tests named by exact
     title.
   - **Rows 1, 3 and 9** must also name an SDK assertion that runs on both transports.
   - **Cross-cutting column.** For each row, either:
     - name the assertion that covers desktop keyboard, 375 px touch, both themes, and narrow Grid
       where layout applies; or
     - write a **scoped justification** that names the assertion proving the shared surface
       elsewhere.

     Example: a Work-canvas shortcut uses the same `ShortcutFrame` as Home shortcuts, whose
     keyboard and touch behaviour `canvas-editing.spec.ts` "keyboard users can insert, move
     sections and shortcuts…" and "touch users can see and tap canvas controls…" prove.

     The Outcome lists every scoped justification together, so the user can see what was accepted
     that way.
   - **Status values.** PASS, SUPERSEDED (row 0 only) or GAP. A cell backed only by a pointer or a
     prior slice's claim is a GAP.
2. **Gaps 1 and 3 — `mcp-acceptance.mjs`, both transports.**
   - **Gap 1.** A new `assertTaskReopen(client, title, dataFile)`, called from `assertClient` after
     `assertRowAndLayoutHistory` and before `assertRecoveryAndGrants`, which removes grants. Its
     steps:
     1. Create a root, a workstream under it, and a task in the workstream. No section is needed:
        the domain resolves the default container.
     2. Run `complete_task` and capture `completedAt` from disk.
     3. Run `update_task` with `{ status: 'todo' }`. It answers `task.status === 'todo'` with no
        `completedAt`, and the file agrees.
     4. Check the receipt's `historyId`. It equals the workstream's `historyId` from
        `get_operation_history` (fetched by the child's id), and differs from the root's.
     5. Undo and Redo use a local `step` that reads the revision from disk, as
        `assertRowAndLayoutHistory` does. Do **not** use `stepReceipt`/`historyOf`, which are fixed
        to `project-work-manager`. Undo restores `done` with the byte-equal captured
        `completedAt`. Redo returns `todo` with no `completedAt`.
   - **Gap 3.** In `assertUndo`, after `update_section` writes `{ markdown: 'After' }`, check two
     things:
     - `list_sections` returns that section with `config` deep-equal to `{ markdown: 'After' }`;
     - the data file holds the same config.

     After the Undo, both read `{ markdown: 'Before' }`.
   - **Comment.** The `assertClient` comment (around lines 33–40) gains a Slice 67 sentence.
   - **Run.** `pnpm --filter @cwm/prototype-host mcp-acceptance` prints the new checks for both
     transports and exits 0.
3. **Gaps 2 and 4 — browser.**
   - **Gap 2: `phone-layout.spec.ts`, one case per theme.**
     - **Setup.** On the `nested-projects` seed, create a root with `createRoot`. Add a Markdown
       section with `addSection` (`config`, plus `columnSpan: 4`; no `seed.ts` change is needed).
       Its source holds a heading, a list, an `https://` link, and a fenced code block with one
       200-character line.
     - **Phone context:** `phoneContext(browser, theme)`, 375 px with touch.
       - The heading, list and code render.
       - The link has `rel` containing `noopener`.
       - The `pre` is a scroll container: `getComputedStyle(pre).overflowX` is `auto` or
         `scroll`, and after setting `pre.scrollLeft = 40` it reads back above 0.
       - `expectNoHorizontalOverflow(page, 'Markdown')` passes.
       - Tap `[data-markdown-edit]` (the visible text is "Edit"; the accessible name is "Edit
         Markdown for …"). Change the source and tap Save.
       - Read the stored source back through `api.get('/api/projects/${root.id}/sections')`, as
         `canvas-editing.spec.ts:104-109` does. It equals the edited source exactly.
     - **Separate desktop context:** `browser.newContext({ viewport: { width: 1280, height: 900 },
       colorScheme: theme })`, with the root set to Grid by `setLayout`. Do not use
       `expectNoHorizontalOverflow`, which assumes 375 px.
       - **Apply the theme.** The persona preference, not `colorScheme`, sets `data-theme`, and
         `useTheme` taps, which fails without touch. So wait for `[data-identity-name]`, then
         *click* `[data-theme-toggle]` once if `html[data-theme]` differs from the theme, as
         `canvas-editing.spec.ts:391-394` does. Then assert the attribute.
       - **Span 4 is applied.** Read the gap `g` from `getComputedStyle(grid).columnGap` and `W`
         from the grid's `clientWidth`. Assert that the item's width is within 1 px of
         `4·(W − 11g)/12 + 3g`. This proves span 4 is applied above the 48rem breakpoint.
       - The `pre` scroll-container check passes.
       - The frame's width fits its item within 1 px. `scrollWidth - clientWidth ≤ 1` for
         the frame, the grid and `document.documentElement`. The item's intentional insertion
         overlay spans vacant Grid tracks, so its scroll extent is not a content-containment test.
     - **Cleanup.** Close both contexts in a `finally`.
     - **Sensitivity.** Remove `overflow-x: auto` from the `pre` rule in `markdown-renderer.scss`.
       The scroll-container assertion must fail; the document or grid overflow check is expected
       to fail too. Revert.
   - **Gap 4: `canvas-editing.spec.ts`, a new case.**
     - Seed `nested-projects` and open the add-section dialog on `/projects/project-renovation`
       Home.
     - The values of `[data-create-section-type] option` equal a **literal** array, not one derived
       from the imported registry: `['markdown', 'task-list', 'progress', 'reflections',
       'timeline', 'recent-activity']`.
     - **Sensitivity.** Temporarily add
       `{ type: 'rich-text', displayName: 'Rich Text', …, component: ProgressSection }` to
       `registry.ts`. Start a fresh Playwright run so its own `web start` server serves the fault. The
       test must fail. Revert.
4. **Gates, on isolated data.**
   - `pnpm docs:api`
   - `pnpm test`
   - `pnpm lint` (includes `docs:check`)
   - `pnpm build`: record the initial bundle against the 1,050,000-byte ceiling
   - `pnpm storybook:build`
   - `pnpm e2e`
   - `pnpm --filter @cwm/prototype-host` with each of `acceptance`, `agent-acceptance`,
     `mcp-acceptance` and `live-acceptance`
5. **Real use.**
   - **Scratch file.** Copy `prototype/seeds/nested-projects.json` to an **absolute** scratch path.
     A relative path would resolve under `apps/prototype-host/`, because `dev:host` is a filtered
     run. Then start `CWM_DATA_FILE=<absolute scratch path> pnpm dev:host`, and `pnpm dev:web`, in
     separate terminals.
     (`pnpm prototype:seed` always writes the personal file, so it is not used.) Load
     `personal-workspace` and `agent-heavy` from the dev panel, which writes to the host's file.
   - **At desktop width, using the keyboard:**
     - Author Markdown and Undo/Redo it from the header.
     - Complete, reopen and select tasks in a Task List and in Todos.
     - Use the gear on a nested route.
     - Create a nested workstream with the plus.
     - Place a shortcut on a Work canvas, then edit its source and watch both canvases refresh.
   - **At 375 px:** repeat with touch in both themes.
   - **Real MCP client over Streamable HTTP, against the same host:**
     - create and read a Markdown section;
     - reopen a task, and watch the open browser update;
     - place a Work shortcut;
     - try `create_section` with `sub-projects`.
   - **Afterwards.**
     - Stop both servers before Playwright runs.
     - Write at least one note with `slice: 67`, even if the finding is "nothing new".
     - Confirm by its modification time and hash that the personal `.prototype/data.json` is
       unchanged.
6. **Drift audit.**
   - Run this search over:
     - the main spec, `README.md` and `AGENTS.md`;
     - `docs/architecture`, `docs/guides`;
     - `packages/mcp-tools/src/tools`.

     ```text
     rg -n -i "rich text|rich-text|sub-projects section|manage pages|home-only|only on home|subproject canvas|details button|prototype:upgrade|schema version [2-5]\b"
     ```

   - Classify each hit:
     - **current and correct**;
     - **historical**: a dated, slice-attributed note;
     - **stale**: fix it.

     Record the stale hits and their fixes in Revisions.
   - Check that each decision below has the expected index status and is linked from its system's
     `why.md`.

     | Decision | Expected status |
     |---|---|
     | `2026-09-workstream-user-terminology` | current |
     | `2026-09-project-navigation-gear-and-work-create` | current |
     | `2026-09-task-checkbox-reopen-and-selection` | current |
     | `2026-10-markdown-source-and-rendering` | current, amended |
     | `2026-10-section-config-validated-on-write` | current |
     | `2026-10-work-canvas-shortcut-destinations` | current, amended |
     | `2026-10-retiring-the-sub-projects-section` | current |
     | `2026-10-prototype-data-is-disposable` | current, amended |
     | `2026-10-schema-version-6-markdown-conversion` | historical / amended: its converter is removed |

   - Check that the umbrella's open questions A–E are each answered by a child record or decision.
7. **Closure.**
   - `node scripts/roadmap.mjs complete` runs for 67, then `start` and `complete` run for 59.
   - This search over `docs`, `README.md` and `AGENTS.md` finds nothing:

     ```text
     rg -n "\]\([^)]*(planned/59-|active/59-|active/67-)"
     ```

   - `pnpm docs:check` and `pnpm lint` pass after the final move.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `docs/roadmap/active/67-markdown-and-work-navigation-closure.md` | modify, then complete | Plan, ledger, triage table, revisions and Outcome. Links are retargeted to `completed/59-…` before completion |
| `apps/prototype-host/scripts/mcp-acceptance.mjs` | modify | Gap 1: `assertTaskReopen`. Gap 3: source read-back in `assertUndo`. A Slice 67 sentence in the `assertClient` comment |
| `apps/e2e/phone-layout.spec.ts` | modify | Gap 2: one themed case with a phone context and a separate desktop Grid context |
| `apps/e2e/canvas-editing.spec.ts` | modify | Gap 4: picker options case. Repair an existing route race: await the delayed create's rendered section before unrouting |
| `apps/e2e/section-edit-undo.spec.ts` | modify | Repair an existing evidence race: await the rendered contextual section before reading its persisted id |
| `apps/e2e/archived-projects.spec.ts` (both narrow cases), `apps/e2e/project-history.spec.ts`, `apps/e2e/removal-undo.spec.ts` | modify | Await loaded identity before applying a test theme, preventing the persona preference from overwriting an early toggle |
| `apps/web/src/app/features/projects/sections/markdown/*`, `apps/web/src/app/shared/components/markdown-renderer/markdown-renderer.scss` | modify only under the repair rule | Only if Gap 2 exposes a real defect. The exact file is added here before editing |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 67` |
| `.prototype/notes.json` | modify | Real-use notes for Slice 67 |
| `docs/architecture/testing/what.md` | modify | The acceptance row (line 81) adds Slice 67's reopen and Markdown read-back checks. The E2E row names the new cases |
| `docs/architecture/testing/how.md` | modify | Coverage notes (around lines 79 and 101) name the new evidence |
| `docs/architecture/prototype-host/mcp-transport/why.md`, `what.md`, `how.md` | check; modify only if they enumerate journeys | Keep the transport evidence list true (`why.md:69` describes the script) |
| `docs/roadmap/planned/59-markdown-and-work-navigation.md` → `completed/` | modify, then move | A dated final-status amendment under the banner, including row 0's supersession. A Stage F note linking this slice. Outcome. The planning-era prose stays |
| `docs/roadmap/completed/60-…`, `61-…`, `62-…`, `63-…`, `64-…`, `66-…` (six records; `65-…` holds only an inline-code cell) | modify (relative link targets only) | `../planned/59-…` becomes `59-…`. Inline-code path cells are not changed |
| `docs/roadmap/goals.md` | modify | Link retargets. A **Done** milestone for the direction. A shorter **Now**. Carried friction under *Known friction* |
| `docs/roadmap/progress.md` | regenerate | `roadmap.mjs` |
| Main spec, `README.md`, `docs/guides/first-milestone-walkthrough.md`, `docs/guides/mcp-setup.md`, affected `docs/architecture/**`, `docs/decisions/README.md` | modify only for confirmed drift | From the Acceptance step 6 audit. The exact files are added here before editing |
| `docs/architecture/web/projects/overview.md`, `why.md` | modify | Remove the current conversion claim and obsolete placeholder description; identify the removed converter as historical |
| `docs/decisions/README.md` | modify | Explicitly mark the schema-v6 converter entry historical, with Slice 66's removal |

## Test plan — tests first

| Test | Proves |
|---|---|
| `mcp-acceptance.mjs`: `${title} update_task reopens a done task to todo and clears completedAt` | A real SDK client on both transports reopens through the domain, and the file holds no timestamp |
| `mcp-acceptance.mjs`: `${title} the reopen is recorded in the workstream's own history` | Owner history on a descendant, compared with `get_operation_history` for the child and unequal to the root's |
| `mcp-acceptance.mjs`: `${title} Undo reopen restores done with the captured completedAt` / `Redo reopen clears it again` | Exact timestamps survive a real transport transition |
| `mcp-acceptance.mjs`: `${title} list_sections and the file read back the updated Markdown source` / `…the restored source after Undo` | Gap 3: read-back over both transports |
| `phone-layout.spec.ts`: `${theme}: Markdown stays contained and editable on a phone and in a narrow Grid` | Gap 2: both themes, touch, phone and narrow Grid, without page overflow, with exact saved source |
| `canvas-editing.spec.ts`: `section picker offers exactly the six current types` | Gap 4: browser evidence for the picker |

**Order and sensitivity.**

- Write each case before checking whether it already passes. These are evidence tests for shipped
  behaviour, so they may pass on the first run.
- **Gap 1:** temporarily make `TaskService.update` keep `completedAt` when leaving `done`.
  `check()` throws on the first failure and the HTTP journey runs first, so record the failure on
  Streamable HTTP. The fault is transport-independent domain code, and stdio's pass is recorded on
  the reverted run. Revert.
- **Gap 3:** temporarily drop `config` from `update_section`'s forwarded input in
  `tools/sections.ts`. The read-back check must fail. Revert.
- **Gaps 2 and 4:** the faults in Acceptance step 3.
- A failure that shows a real defect stays red and goes under the repair rule.

## Boundaries touched

- **MCP calls the domain.** The new acceptance code is an external client. It reads the data file
  only to check results, as the script already does, and adds no tool or registry path. The
  temporary Gap 3 fault in the tool layer is reverted before any commit.
- **Gateway boundary and design tokens.** Untouched unless the repair rule applies. Any CSS fix
  uses existing tokens, with no literal colours or spacing.
- **One writer per data file.** stdio and HTTP keep the script's sequential ordering on their own
  temp files. Real use runs on a scratch file through `CWM_DATA_FILE`, never on the personal file
  and never next to Playwright's servers.
- **Disposable infrastructure (§71).** No new harness abstraction. The new journey reuses
  `receiptOf`, `projectIdOf` and `check`, and a local disk-revision `step`.
- **Frozen records.** Only relative link targets change, which the protocol's append-only rule
  allows.

## Explicit non-goals

- Fixing triaged friction. These are carried in `goals.md`, or become `planned/` candidates if the
  user asks:
  - a "Reopened" history label (`note-2026-10-01-002`);
  - the stacked drawer below the fold (`note-2026-10-01-002`, already in goals);
  - the Preview button label (`note-2026-10-02-001`);
  - escaped legacy prose (`note-2026-10-02-002`): expected obsolete, since converted data is
    disposable;
  - untitled-shortcut ambiguity (`note-2026-10-03-001`): promoted to
    [Slice 69](../planned/69-distinguishable-shortcut-names.md) and triaged as such;
  - a placement-naming reparent refusal (`note-2026-10-03-002`): promoted to
    [Slice 68](../active/68-cross-root-refusal-names-placements.md) and triaged as such;
  - Work-row details (`note-2026-10-09-001`).
- Re-proving Slice 34's history families. They are reached only where a Slice 59 row depends on
  them.
- An automated live-browser assertion for a reopen made over MCP. Frame propagation is
  `live-acceptance`'s job, and the real-use step observes it.
- E2e for the Archive and Reflections wording of "workstream". Under the ledger rule these
  sub-clauses cite jsdom specs by title.
- New decision entries for evidence alone.

## Open questions

- **Repair rule (default chosen).** If a gap test shows a defect:
  - **Repair inside this slice:** a CSS-only or web-presentational change, under about 20 lines,
    that changes no contract, domain rule or stored shape. Add the file row first, write the red
    test first, and record a re-review round.
  - **Anything larger:** a bounded repair slice from `roadmap.mjs new`. This slice stays active
    until that one closes, as Slice 46 did.
- **Ledger granularity (default chosen).** The rule in Acceptance step 1 lets sub-clauses cite
  unit tests by title, and lets the cross-cutting column use scoped justifications that are listed
  for the user to see. A stricter rule (e2e for every sub-clause) would add several journeys for
  behaviour already proven at its owning layer. The user can ask for that instead.
- **`CURRENT_SLICE`.** Set it to 67. Unlike Slice 46, this phase does its own real-use walkthrough,
  so notes should carry its number.

## Revisions

- **Closure browser runs (2026-10-09).** The first closure run passed 108 of 109; the
  contextual-insertion case failed with `route.continue: Route is already handled!`. Its
  `finally` unrouted while the 350 ms delayed POST handler was still sleeping, so the unroute
  released the request first. The rendered section (which appears only after the POST answers)
  is now awaited inside the `try`. The next run passed that case but failed the sibling narrow
  archived-projects case on the theme race already repaired in its neighbour; it and the one
  remaining `goto`-then-toggle setup in `removal-undo.spec.ts` now await identity first. No
  assertion was removed and no product code changed.
  An independent reviewer confirmed all three repairs against the store and shell code, with no
  substantive finding. Declined as unobserved: an identity wait in `todos.spec.ts`, whose toggle
  follows several awaited interactions; and a host-side duplicate count for the one-click case,
  which the test never had.
- **Independent diff review round 4 (2026-10-09), correctness/spec and boundaries/docs
  reviewers, over `git diff 5b9fa54`.** No substantive code, boundary or documentation finding;
  about 110 ledger titles grepped verbatim; no temporary fault remains. One closure-mechanics gap
  held and is fixed: the umbrella's own link to Slice 67 is now in Build step 7.2, and the
  retarget list names six child records (65 has only an inline-code cell). Minor fixes: the
  summary says four proofs; the two amended decisions are expected as "current, amended"; row 6's
  e2e cell names its two titles; J3 cites the Todos coarse-pointer tap and points to real use
  above; goals' drawer bullet distinguishes its two notes. Declined: moving
  `phone-layout.spec.ts`'s second context creation inside its `try` — a throw from `newContext`
  after the first succeeds is negligible, and the change would need a re-run for no behavioural
  gain. The `.gitignore` comment naming the removed `prototype:upgrade` is Slice 66 residue
  outside this slice's change list; recorded as a friction note.
- **Independent diff review round 3 (2026-10-09).** Correctness reviewer verified the final
  assertion titles and closed all earlier findings; no substantive findings remain.
- **Integrated browser evidence repair (2026-10-09).** The full suite passed 108 cases and
  exposed an existing contextual-creation test race: its immediate API GET returned before the
  create completed, while the failure snapshot already showed the created section and Undo label.
  Await the rendered section before reading its persisted id. No product behavior changed.
  The next full run passed that journey and 106 others, but exposed two existing theme setup
  races in archived-projects and project-history. Their toggle was visible before identity loaded;
  AppShell subsequently seeded the persona preference over the requested test theme. Both setup
  paths now await the rendered identity before choosing a theme, as the new Markdown case does.

- **Independent diff review round 1 (2026-10-09), correctness/spec and boundaries/docs reviewers.**
  No implementation or boundary defect found. Expanded exact assertion titles for shorthand
  evidence, corrected the false shared TaskRow/Drawer claim (Todos has its own chronology),
  separated immediate SDK creation Redo from real-HTTP creation restart, and reconciled the new
  browser titles. The manual in-app 375 px walkthrough used clicks; a separate genuine-touch
  scratch walkthrough is required before closure. An import-lint subprocess exceeded its 5-second
  timeout under concurrent builds; a clean full rerun passed without a code change.
- **Independent diff review round 2 (2026-10-09), both reviewers.** Previous claim defects closed;
  no code or boundary findings. Added the last exact creation-history, shared-shortcut and
  same-page-refusal titles before the record freezes. Boundary reviewer returns no substantive
  findings; correctness reviewer rechecks those final titles in round 3.

- **Execution evidence correction (2026-10-09).** The initial Grid assertion failed in both themes
  on the item's scroll extent (523 px), while frame, grid and document each had zero overflow and
  the code scrolled internally. Source inspection of `canvas-chrome/insertion-point.scss` confirms
  the gap overlay deliberately spans vacant tracks. Assert frame width within the item and frame,
  grid and document scroll containment instead. This corrects the evidence, with no product repair.
  The drift audit also removes the current converter implication in Projects overview, qualifies
  its decision link as historical, and marks the converter index historical. Dated spec cutovers,
  Manage pages and Home-only notes remain historical; retirement/reset guidance remains current.
  All nine audited decisions are indexed and linked from their systems' `why.md` files. Umbrella
  A–E are answered by the terminology/navigation, reversible checkbox, Markdown/config,
  Work-shortcut and retirement/disposable-data decisions respectively. The first offline run
  accidentally overlapped the deliberate registry fault: its six web failures show that fault,
  not a shipped defect. A clean full run after all faults are reverted is required for closure.

- **Initial draft (2026-10-09).** Built from:
  - the umbrella's Stage F matrix;
  - a read of the e2e, host acceptance, registry and domain suites;
  - Slices 60–66's records and friction notes.

  This found two gaps: real-transport reopen, and Markdown at phone width, in narrow Grid and in
  both themes.
- **Review round 1 (2026-10-09), independent reviewer.** Thirteen substantive findings. Each was
  checked against the code, and all held.
  - **Gaps.**
    - The umbrella's "same-file conversion evidence" was not addressed. Row 0 now records it as
      SUPERSEDED, with its remaining evidence.
    - MCP never reads Markdown source back. Added as Gap 3.
    - Picker evidence was jsdom, not browser. Added as Gap 4.
    - Terminology and failure sub-clauses, and the matrix's cross-cutting keyboard, touch, theme
      and narrow requirements, needed an explicit rule. Added the ledger rule, the cross-cutting
      column and the scoped-justification list.
  - **Mechanics.**
    - The closure search would have hit inline-code cells in frozen records. It now matches
      Markdown links only, and only link targets are retargeted. This plan's own links and
      `goals.md` are now in the retarget list.
    - `prototype:seed` cannot write a scratch file. Real use now goes through `CWM_DATA_FILE`.
    - `GET /api/sections/:id` does not exist. The read-back now uses the project sections list.
    - Gap 2's `scrollWidth` and track assertions would not fail under the planned fault. They are
      now a computed-overflow and `scrollLeft` scroll-container check, plus a span-4 width check
      in a separate desktop context.
    - Gap 1's stdio sensitivity claim could not be observed, because `check` throws first. It is
      now recorded on HTTP.
    - Gap 1 must avoid the script's helpers that are fixed to `project-work-manager`, and must run
      before grants are revoked.
  - **Change list.** Added `testing/what.md`, and the `mcp-transport/why.md` check.
  - **Minor fixes.**
    - Corrected the `seeds.test.ts` and recovery-policy titles.
    - Listed the nine decisions with their expected statuses.
    - Gave the friction triage a home (the Outcome) covering all nine notes.
    - Dropped the unneeded `seed.ts` row.
    - Located the Edit button by `[data-markdown-edit]`, and asserted the link's `rel`.
    - Labelled in-process HTTP evidence as unit evidence.
- **Review round 2 (2026-10-09), same reviewer.** All thirteen round-1 findings are closed, and
  the new factual claims hold. Two new substantive findings, both fixed:
  - The desktop Grid context never applied the theme. It now clicks the theme toggle until
    `data-theme` matches.
  - The span-4 width formula ignored grid gaps and would fail on correct code. It now uses
    `4·(W − 11g)/12 + 3g` within 1 px.

  Minor fixes:
  - The scratch path must be absolute.
  - Gap 4 compares against a literal array, and its fault is named.
  - The umbrella's Outcome states the move in the future tense; checks after the move are the
    proof.
  - The closure is one commit.
  - Gap 2 closes its contexts.
  - Two ledger cells moved to the unit column.
  - The duplicate retarget of 67 is gone.
- **Review round 3 (2026-10-09), same reviewer.** All round-2 findings are closed, and there are
  no substantive findings. Two wording nits were fixed:
  - the theme toggle is clicked once, then asserted;
  - Gap 4's fault run starts a fresh Playwright server.

  The plan is ready for implementation.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

**Verification (2026-10-09).** The clean offline run passed 2,957 tests. `pnpm lint`,
`pnpm docs:api`, `pnpm build` and the Storybook build passed. The initial bundle is 1,020,928
bytes, below the unchanged 1,050,000-byte ceiling; the advisory 850 kB warning remains.
Host acceptance passed 150 checks, agent acceptance 17, MCP acceptance 544 and live acceptance
11. The final integrated browser run, after the three test-setup repairs under Revisions, passed
all 109 journeys in 8.6 minutes on its own servers and data file; the repairs touch only e2e setup
waits, so the earlier offline, build and acceptance results stand, and `pnpm lint` and
`pnpm docs:check` are rerun after the roadmap moves.

**Real use.** Notes `note-2026-10-09-002` and `003` record desktop keyboard/browser and real
HTTP SDK use plus personal-workspace and agent-heavy panel seed inspections. Notes `004` and
`005` record separate exploratory touch use in dark and light: Markdown authoring/preview/save
and header Undo/Redo, Task List and Todos complete/reopen/select, owner navigation, nested gear,
Kitchen-parent Work plus without leaving Cabinets, and source editing that refreshed the open
Work shortcut. No new blocker was observed. Own servers and scratch artifacts were cleaned up.
The personal data retained SHA256 `CACEC93B772ED75DABA214FD59CDBFBB7A35B11ED4AC080235328F548A06CAFC`
and modification time `2026-10-09T20:35:38.1521740Z`.

**Evidence ledger.** Exact named assertions below were inspected at their owning layer. Every
named assertion passed in this slice's own gate runs above; the inventory is not a prior slice's
green claim.

| # / request | unit | e2e | SDK / real-HTTP | cross-cutting | status |
|---|---|---|---|---|---|
| 0 / same-file conversion | `data-store.test.ts`: “an older schema version names reset (Slice 66)”; `seeds.test.ts`: “%s seeds no retired Rich Text section (Slice 63)”; `recovery-undo-acceptance.test.ts`: “Archive outlives expired and pruned actions” retains seed Markdown prose | Superseded conversion requirement | Current seeded restart and recovery remain in offline host evidence | No layout or input requirement for a removed converter | SUPERSEDED by [disposable data](../../decisions/2026-10-prototype-data-is-disposable.md) |
| 1 / Markdown | `section-service.test.ts`: “accepts an empty and an exact Markdown config, and any config for a type that declares no schema”, “add refuses an extra key, a non-string source and a foreign key, writing nothing”; `routes.test.ts`: “a markdown section round-trips its source over HTTP”; renderer safety suite | “markdown section saves source, renders safely and undoes”; “markdown shortcut renders read-only”; new six-type picker and themed Markdown containment cases | Both transports: “list_sections and the file read back the updated Markdown source” and “the restored source after Undo”; retired-type create refusal loop | Direct themed phone/narrow Grid test; shared native editor/frame keyboard surface (J1) | PASS |
| 2 / seed content and history | `seeds.test.ts`: “%s has no retired Sub-Projects view and a dense combined live order (Slice 66)”, “%s numbers sections densely within each page”; recovery policy “markdown source with content is recoverable config”; unknown/blank tables; retired live/history load refusals; seeded host restart/Archive suite | “retired hierarchy view leaves Home and Kitchen placements in dense seed order”; `web.spec.ts` nested showcase | Seeded host restart evidence is in the unit column | Integrity is independent of theme/input; shared canvas J2 | PASS |
| 3 / reopen | `task-service.test.ts`: “clears completedAt when a done task moves back to todo”; `row-history.test.ts`: “a reopen refuses both ways while its section is archived, and brings completedAt back verbatim”; store optimistic/refusal/live-read cases | Themed “task reopen persists, updates progress and reflections, and reverses exactly”; “refused reopen restores native checkboxes in Task List and Todos” | Both transports: “update_task reopens a done task to todo and clears completedAt”, “the reopen is recorded in the workstream's own history”, “Undo reopen restores done with the captured completedAt”, “Redo reopen clears it again” | Task surface J3; phone title/done-checkbox touch case | PASS |
| 4 / click selects | `task-row.spec.ts`: “selects once from title or background and leaves nested controls alone”, “ignores moved mouse or pen gestures, allows touch slop and keyboard activation”, “removes Details and inline title editing”, “keeps read-only rows free of mutation and selection” | “title and background selection, drawer drafts, focus return and read-only shortcuts” asserts Enter/Space, one title PATCH and Escape focus | Not an agent interaction | Task surface J3; phone stacked-drawer title/Close case | PASS |
| 5 / gear | `project-page-navigation.spec.ts`: “gear toggles a rendered hidden panel with the right accessible name and controls; Escape closes and focuses it”, “shows Home as fixed and exposes every optional page through its manager”, “reapplies the confirmed checked state after a failed native toggle” | Both themes: “gear settings work by keyboard on Home, Todos and third-level work” | Not an agent interaction | Navigation/dialog J4 | PASS |
| 6 / terminology | `contract.test.ts`: “agent-facing workstream vocabulary (§26, §54)”; `archived-region.spec.ts`: “renders only ready owner entries and the exact cascade count”; `reflections-page.spec.ts`: “calls a completed subproject a workstream in the subject picker” | “Work plus creates once without navigation, refreshes a second tab and resets a departed parent” asserts the Todos row says Workstream; “a failed create keeps its draft and an archived root explains why the plus is unavailable” asserts the Add workstream name | Agent wording is the registry assertion in unit column | Input-independent text in shared surfaces, J5 | PASS |
| 7 / Work plus | `project-workspace-store.spec.ts`: “creates a workstream under the chosen parent and reports the child receipt, then refreshes without live frames”, “guards a same-generation pending create but a new load releases it and a late answer starts no read”, “returns a refused create message and leaves the tree unchanged” | “Work plus creates once without navigation, refreshes a second tab and resets a departed parent”; archived-ancestry and failed-create journeys; both project-creation-history journeys | Both SDK transports: same-id creation Undo/Redo; real-HTTP: same-id creation Undo/Redo across restart | Navigation/dialog J4 | PASS |
| 8 / no hierarchy view | `section.test.ts`: “sub-projects is retired with a workstream replacement”; service create refusal, data-store live/recreating-history refusal; six current seed snapshots | New literal six-type picker; dense Home/Kitchen order case | Real-HTTP and both SDK transports retired-type refusal loop | Type/order integrity uses shared canvas J2 | PASS |
| 9 / Work shortcut | `section-shortcut-service.test.ts`: “places a sibling section on the Work canvas and records it in the workstream history only”; `shortcut-history.test.ts`: “reverses and replays add, resize, collapse, move and remove in the workstream history”, “writes nothing about the source, and a source content edit is never a placement conflict” | “a workstream Work canvas takes, resizes, reorders, collapses, undoes and removes a shortcut”; shared shortcut gestures/source-removal cases | Real-HTTP Work placement; both SDK transports ancestor Work placement, owner history and forward split-move refusal | Shared ShortcutFrame and canonical canvas J6 | PASS |
| 10 / failure and scope | Shortcut same-page/root/workspace/page/archive/grant refusals; project-service S-dest/S-src/S-both cases; `todos-page-store.spec.ts`: “discards a pre-reopen read even when it answers after the write settled”, “makes a write started on one root inert once another is showing”, “refreshes after a reconnect”; `project-page-store.spec.ts`: “does not let a late shortcut response from the previous page write into the new page”, “marks the combined order incomplete on a load or refreshSections read failure and recovers”, “re-reads its shortcuts on reconnect and on a prototype reload, keeping the root”; workspace late-toggle case | “contextual insertion preserves a combined order, remembers anchors and reports failed creates”; refused reopen and failed/refused Work create journeys | Both SDK transports split-move refusal; agent-acceptance grant revocation | Failures have no separate layout; direct rollback controls and J7 | PASS |

**Exact sub-clause evidence.** The following titles expand every shorthand suite/family reference
in the ledger; SDK `${title}` means separate HTTP and stdio assertions, and seed `%s` means all six
seed names. No prior-slice outcome substitutes for these assertions.

Additional browser/history titles: row 7's `project-creation-history.spec.ts` cases are “project
creation Undo and Redo recover roots and workstreams at the same URL” and “creation under a live
workstream refreshes the ancestor work, Todos and Archive projections”. Row 9's shared cases are
“shortcut gestures record once and HTTP history reconciles both open canvases” and “a shortcut
on another browser page follows source removal and same-page Undo”. Row 10's same-page refusal
is `shortcut-history.test.ts`: “retires a recreation whose placement id is occupied, and refuses
a foreign or same-page source”.

- **Row 1:** `markdown-renderer.spec.ts`: “escapes raw HTML”, “unsafe schemes are not links”,
  “images never load”, “links open safely”, “renders lists, quotes, emphasis, code, rules, tables”.
  `section-service.test.ts`, under “SectionService.add refuses a retired type”: “writes nothing
  and records no history”, “answers an agent without projects.write with the permission refusal
  first”; config update: “update refuses a malformed config, writing nothing”. New browser titles:
  “section picker offers exactly the six current types” and each theme's “Markdown stays contained
  and editable on a phone and in a narrow Grid”. SDK retired loop: “${title} ${type} create is
  refused with replacement guidance” for `rich-text` and `sub-projects`.
- **Row 2:** `section-recovery-policy.test.ts`: “markdown with a foreign or non-string key is
  unknown”, “includes %s” (plain prose, literal markup, text around whitespace, zero-width space),
  “leaves out %s text” (empty, spaces, tabs and newlines, Unicode whitespace), “keeps %s
  conservatively, as unknown content”, “leaves out a Notes section created with no config at all
  — an empty object holds nothing”. `recovery-undo-acceptance.test.ts`: “cursor, revision and both
  entries survive a restart for the owning actor, and nothing for another”, “Archive outlives
  expired and pruned actions”. `data-store.test.ts`, under “retired section types”: “in the live
  sections”, “in a section.add snapshot”, “in a section.remove snapshot”, “in a created container
  snapshot”; the two Sub-Projects refusals named for row 8 below. Browser showcase title:
  “nested-projects is a coherent multi-page showcase across chronology, shortcuts, journal,
  archive and reload”.
- **Row 3:** `task-list-store.spec.ts`: “paints todo and deletes completedAt before the gateway
  answers, then applies server fields”, “restores the exact previous task and completedAt and
  exposes a failed reopen”, “queues a burst of live refreshes and applies one read after reopen
  settles”. `todos-page-store.spec.ts`: “paints todo without completedAt, then adopts the server
  record and reports its owner”, “restores the exact item and completion timestamp with a visible
  write error after rejection”, “discards a read already running when reopen starts, and coalesces
  frames behind the write”. Separate browser Todos proof: “Todos toggles persist, keep keyboard
  focus, and record descendant history in its owner”.
- **Row 7:** `work-navigation.spec.ts`: “real archived-ancestry refusal retains the name and parent
  without creating”, “a failed create keeps its draft and an archived root explains why the plus
  is unavailable”. SDK: “${title} create_project answers { project, operation } with project.add”,
  “${title} the creator reads project.add Redo at the absent project id”, “${title} redo_operation
  restores the same project and canonical page ids”. Real HTTP: “the creation Redo survives the
  restart”, “Redo restores the same project id”, “Redo restores the same canonical page id”.
- **Row 8:** `section-service.test.ts`: “refuses a new Sub-Projects section naming the workstream
  route (Slice 66)”. `data-store.test.ts`: “refuses a live Sub-Projects section, naming reset
  (Slice 66)”, “refuses a Sub-Projects snapshot in history, naming reset (Slice 66)”. Real HTTP:
  “retired creates leave the whole file unchanged”; SDK replacement-guidance loop named in row 1.
- **Row 9:** SDK: “${title} add_section_shortcut places an ancestor section on a workstream's Work
  canvas”, “${title} the Work placement is in the workstream's own history”, “${title}
  undo_operation removes the Work placement”. Real HTTP: “the placement is recorded in the
  workstream’s history”, “Undo on the workstream removes it”.
- **Row 10:** `section-shortcut-service.test.ts`: “hides foreign sources and refuses shortcuts
  outside the root tree”, “refuses another root, another workspace and an optional page, writing
  nothing”, “freezes a placement on an archived workstream, or one under an archived ancestor,
  except for removal”, “lets projects.write create on a Work canvas and refuses projects.read
  alone”. `project-service.test.ts`: “S-dest: refuses moving a workstream whose Work places a
  section that stays behind, naming only that placement”, “S-src: refuses moving a workstream
  whose section another Work canvas places, naming only that placement”, “S-both: moves a
  workstream whose Work places a descendant section, and the placement stays valid”. Workspace
  store: “does not apply a late toggle after the route changes”. SDK: “${title} a move that would
  split the placement is refused, naming it”. The direct refusal/browser tests in rows 3 and 7
  also prove rollback. Agent acceptance: "the same token now answers 401", "the envelope says unauthorized". SDK split refusal also checks "${title} and writes nothing".

**Scoped justifications accepted.** J1: desktop keyboard uses the same native source textarea and
buttons as the source-save journey; “keyboard users can insert, move sections and shortcuts,
resize, rename and remove” proves frame keyboard access. J2: type/order/integrity introduce no
pixel layout; shared frames are covered by “frame indicators and direct controls work in both
themes and collapse states without edit mode”, that keyboard journey, themed phone “no page
overflows horizontally at 375 px”, and the new narrow Grid Markdown case. J3: Task List uses TaskRow and Drawer; themed reopen, keyboard selection and phone "a title tap opens the stacked task drawer, Close returns focus, and a done checkbox reopens by touch" cover its input. Todos renders its own native checkbox and chronology: "Todos toggles persist, keep keyboard focus, and record descendant history in its owner" proves keyboard persistence; “Todos keeps Delete available on a finished task and accepts a touch tap” taps its toggle with a coarse pointer at 1024 px, and separate themed 375 px real-touch use is recorded above. Row status/selection owns no Grid sizing; the canvas resize journey covers the Task List frame. J4: themed
gear keyboard cases and phone “gear page settings and Work creation stay tappable and fit the
viewport” cover the shared navigation/dialog; these are not Grid content. J5: wording is
input-independent; themed phone containment includes Todos/Archive, and navigation/dialog J4
covers the controls. J6: Work and Home share ShortcutFrame/ProjectCanvas, with Work keyboard
resize/reorder, themed frame controls and the canvas coarse-pointer touch journey (1024 px,
not claimed as 375 px); the themed phone canvas contains seeded shortcuts and the new Markdown
case proves the shared renderer in narrow Grid. J7: domain and store refusal scopes are
input/theme-independent; browser refusal cases demonstrate native rollback and drafts, with
the task, gear/dialog and frame input evidence above. No claim is made that every failure was
injected at every viewport.

**Friction triage.**

| Note | Disposition | Resolution / destination |
|---|---|---|
| `note-2026-10-01-001` | answered | Slice 60 and workstream terminology/navigation decisions; sustained-use confidence remains |
| `note-2026-10-01-002` | carried | Updated versus Reopened label and below-fold drawer; Known friction in goals |
| `note-2026-10-02-001` | carried | Preview return-to-source wording; Known friction in goals |
| `note-2026-10-02-002` | obsolete | Converted legacy source is no longer maintained under disposable-data policy |
| `note-2026-10-02-003` | answered | Slice 64 exact config validation and unreadable-config presentation |
| `note-2026-10-02-004` | answered | Slice 64 records that repair; current seed/write behavior retained |
| `note-2026-10-03-001` | carried | Promoted to Slice 69, also reachable from goals |
| `note-2026-10-03-002` | carried | Promoted to Slice 68, also reachable from goals |
| `note-2026-10-09-001` | carried | Accepted Work-row detail loss; Known friction in goals |

**Deliverables** — the four missing proofs now exist in
[the SDK script](../../../apps/prototype-host/scripts/mcp-acceptance.mjs),
[phone layout](../../../apps/e2e/phone-layout.spec.ts) and
[canvas editing](../../../apps/e2e/canvas-editing.spec.ts). Both real transports passed 544
assertions and the three new browser cases passed before the integrated run. Reopen checks exact
timestamps and descendant-owned history; Markdown reads exact source from SDK and disk; the
browser proves six picker types, both themes, touch saves, code scrolling and narrow Grid geometry.

**Deliberate choices** — no product rule was changed to match the old proposal. Row 0 is honestly
superseded by [disposable local data](../../decisions/2026-10-prototype-data-is-disposable.md);
current seeds, refusal and durable recovery remain proven. The scoped layout/input justifications
are listed above rather than claiming every sub-clause was exercised at every viewport. All four
new proofs were sensitive: the HTTP reopen assertion failed when the domain kept `completedAt`;
the HTTP source-read assertion failed when the tool dropped `config`; both phone theme assertions
failed on `overflowX: visible` after removing code scrolling; the picker failed on an extra
Rich Text entry. Every fault was reverted before the final green runs.

**Deviations from the plan** — the item's scroll-extent assertion was corrected after inspecting
the intentional sparse-Grid overlay, with no production repair. New browser titles were shortened
to match repository style. Independent review separated Todos from TaskRow/Drawer and SDK creation
Redo from HTTP restart. The initial web fault overlap and later timeout are recorded under
Revisions; neither justified changing shipped code. Existing browser setup races were repaired
with completion waits, preserving all assertions. Separate exploratory touch use then repeated
the requested flows in both themes, using actual taps at 375 px (one touch point and coarse
pointer). Text entry and native parent selection used browser input APIs; the panel opened with
its keyboard chord. One exploratory script attempt lost its changing unchecked-row locator;
the completed walkthrough used a stable task id and exited successfully.

**Deferred** — the triage table routes all nine child notes. Placement naming belongs to Slice 68;
untitled shortcut naming to Slice 69. Reopen wording, below-fold details, Preview wording and Work
row detail remain Known friction in goals. No new implementation slice was needed for evidence.

**Open questions** — none about the umbrella's A–E product choices. Sustained use still needs to
evaluate the decisions' confidence and revisit triggers. Completing this record is followed by
starting and completing the Slice 59 umbrella with a dated final-status amendment, retargeting
the relative umbrella links in completed records 60–64 and 66 and in `goals.md`, and moving the
direction to a Done milestone; the post-move `docs:check`, `roadmap.mjs check` and `pnpm lint`
are the proof.

**Documentation updated** — testing evidence, the MCP transport's evidence link, Projects overview
and historical decision annotation, the converter decision index, goals' friction list and this
ledger. The drift audit found no current spec, README, guide or tool-description behavior to repair. The closure adds the umbrella amendment and Outcome, the retargeted umbrella links, the Done
milestone in goals and the regenerated board.
