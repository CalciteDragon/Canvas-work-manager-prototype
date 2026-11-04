<!-- plan id="79" status="active" summary="Redesign slice 6b-2 (TH10): first-run dashboard, archived pages read-only with restore in place, archive refusal said before, Markdown drafts kept, digest overdue line, Task List count" -->
# Slice 79 — States: empty, archived and editing

**State (2026-11-04):** plan written (S79PLAN), reviewed in six rounds and **accepted by the user
on 2026-11-04** with answers to Open questions 1–7 (S79ACCEPT; Q7 as hidden counts, step 6a).
`CURRENT_SLICE` is 79. **Step 0 is done (S79S0). Step 1 is done (S79S1, finished in a cloud
continuation)**: profile 79 in `build-sheet.mjs`, driven by 23 fixture tests in
`build-sheet.test.mjs` (all tooling tests green; profiles 71–78 unchanged). Commits 3fdab1e (the
gate), f142b00 and 418c86f (fixes from the first cold review) and the closing commit (fixes from the
second). **Step 2 (foundations) is done (S79S2, cloud session)**; see the Step 2 bullet below.
Commits 83f6e13 (code and docs) and the handoff commit. **Step 3 (restore one way) is done
(S79S3)**; see the Step 3 bullet below. **Step 4 is complete**: part a (the store, S79S4A) and
part b (the banner, its placement and the renderer input, S79S4B); see the Step 4a and 4b bullets
below. **Step 5 (read-only canvas) is done (S79S5, cloud session)**; see the Step 5 bullet below.
**Steps 6a (hidden count, Q7) and 6 (read-only pages) are done (S79S6, cloud session)**; see the
Step 6a/6 bullet below. **Step 7 (refusal first) is done (S79S7, cloud session)**; see the Step 7
bullet below. **Step 8 (empty workspace) is done (S79S8 wrote it, S79S8B landed it)** after the user answered
Open question 8 with (a): Calendar and Settings › Agents lazy, ceiling kept; see the Step 8 bullet
below. **Step 9 (digest overdue line, Q1 (a)) is done (S79S9)**; see the Step 9 bullet below.
**Step 10 (Markdown keeps the draft) is done (S79S10)**; see the Step 10 bullet below.
**Step 11 (count and drag hint) is done (S79S11)**; see the Step 11 bullet below.
**Next: step 12 (end to end: `empty-archived-editing.spec.ts`, then full `pnpm e2e`, the
Storybook build and the bundle).**
- **Step 11 (count and drag hint):** `SectionDefinition.summary?: true`, set only on Task List;
  `SectionContentInputs.reportSummary?`. Both frames hold a `summary` signal and add the stable
  class-property `reportSummary` to the content inputs only for a marked definition (NG0303 is a
  throw from `setInput`, so the registry spec pins marker and declared input together). The text
  renders in `[data-section-summary]` / `[data-shortcut-summary]` after the heading, not inside it
  (the section's accessible name is unchanged), and is hidden while collapsed (and, for a shortcut,
  unavailable). Task List's `summary` is "N tasks" / "1 task", open and done, `null` while loading,
  under `error()` or at zero, and destroy reports `null`; a pending quick-add is not counted until
  it lands. Headers are `flex-wrap: nowrap`: a long name truncates (the shortcut name gained its
  own `.shortcut-frame__name` span for the ellipsis); with a count the canonical heading stops
  growing (`section-frame__title--fit`), so empty header space beside a Task List's count no longer
  starts a rename. The drag hint is inside the quick-add form, absolutely positioned over it on
  `--plane-sheet-solid` with the field radius. Lab: two counted frames in the `section-frame` panel
  (the stub reports its config's `summary` under `stubSectionDefinition({ summary: true })`);
  stories `HeaderCount`, `HeaderCountLongName`, the shortcut `ReadOnlyTaskList` play, and
  `task-list-section.stories.ts` created (Live, ArchivedReadOnly, Empty). Decision
  `2026-11-task-list-shows-its-count.md`, the rows decision amended, §29 and §34 notes.
  **Initial bundle 1,146.15 kB, 3.85 kB under the ceiling** (+2.01 kB). Commits `bef50ad` (code,
  docs) and `7f77797` (review fixes). Unit: web 1,536 green; `pnpm test` and `pnpm lint` green;
  `objects.spec.ts` (the drag e2e) passed alone. One cold review: no substantive findings; minors
  taken (shortcut ellipsis, collapsed-shortcut test, hint radius, two doc notes). **Left for later
  steps:** the geometry (first row holds still, controls' offsets at 375) is unit-tested only as
  computed styles, since jsdom has no layout; step 12's e2e and step 13's rig measure it. The hint's
  opaque plate against a translucent sheet is to be looked at in step 13's after capture.
- **Step 10 (Markdown keeps the draft):** `MarkdownDraftStore` (`markdown-draft-store.ts`, root,
  `keep`/`take`/`forget` of `{ draft, base }` by section id, cleared on `prototype.reloaded`).
  `take` removes, so the store holds a draft only while no editor has it open. "Changed" means
  unlike both `base` and the current source; a kept draft that now equals the source is dropped on
  Edit rather than offered. The body keeps on Cancel (`cancelRequested` carries the draft) and on
  destroy (a `viewChild` read in its `DestroyRef`), offers through the editor's `initialDraft` with
  the stored `base`, forgets on Save success (also when destroyed mid-save, from the review), and
  re-keys the editor on Discard draft with `@for (key of [editorKey()]; track 'editor-' + key)` (a
  derived track expression: `track key` fires Angular's NG0956 dev warning on every Discard).
  "Your unsaved draft is back." is a `role="status"` line with a ghost **Discard draft**; Preview
  has the "Unsaved preview" caption above the rendered draft; Save stays the only
  `button--primary` (pinned). `markdown-source-editor.stories.ts` created (Fresh, DraftBack,
  UnsavedPreview). `canvas-editing.spec.ts`'s Cancel-then-Edit now expects the draft back and
  Discards it (run alone: passed). **Initial bundle 1,144.14 kB, 5.86 kB under the ceiling**
  (+0.04 kB: the Markdown body is already deferred). Commits `72f075d` (code, docs, the decision
  amendment, §30 note, walkthrough) and `c829506` (review fix). Unit: web 1,526 green; `pnpm test`
  and `pnpm lint` green. One cold review: one substantive finding (a Save succeeding after destroy
  left the kept draft behind), fixed test first; a section shown twice shares one slot (noted in
  how.md). Not looked at in a browser beyond the e2e run: the note's and caption's spacing are
  checked at step 13's after capture.
- **Step 9 (digest overdue line):** `DailyDigestWidget` lists up to five of `today.overdue` under
  its prose, in slice 77's row anatomy (title link, `taskMeta`, project context), each row
  `data-digest-overdue` (never `data-widget-task`) in a `ul` labelled "Overdue tasks", then a muted
  `data-digest-overdue-more` "and N more overdue" with no link. The owner link is
  `widgets/task-origin-link.ts` (`taskOriginRoute`, `taskOriginFragment`), now used by Today and the
  digest; Upcoming and Recent Progress still build it inline (unchanged, outside this step's list).
  A `null` digest still never mounts the widget. **Initial bundle 1,144.10 kB, 5.90 kB under the
  ceiling** (+2.13 kB). Commits `88ce48b` (code, docs, the decision
  `2026-11-digest-overdue-line-leads-to-the-tasks.md`, §24 note) and `fcbff67` (review fixes).
  Unit: web 1,511 green; `pnpm test` and `pnpm lint` green. One cold review: no substantive
  findings; its minor ones were taken (spacing, list label, `task.overdue` passed, a test renamed).
  Not looked at in a browser: the spacing is checked at step 13's after capture (the 18 changing
  overdue cells). **Trap:** `widget-content.scss` is compiled into all seven widgets, so a rule
  added there costs about seven times its size; one widget's rule goes in its own folder.
- **Step 8 (empty workspace):** S79S8 wrote it test first and green but measured **1,151.23 kB**
  initial, so it was parked as a local patch (Open question 8). S79S8B applied the patch unchanged
  at `e3aa69c` and made `calendar` and `settings/agents` `loadComponent` routes, test first
  (`app.routes.spec.ts` pins the lazy and eager lists; the `resolves` cases still land on
  `CalendarPage` and `AgentConnectionsPage`). **Initial bundle 1,141.97 kB, 8.03 kB under the
  ceiling** (lazy chunks: Agents 9.35 kB, Calendar 0.43 kB). What landed:
  - `ShellStore`: one unfiltered `projects.list({})`, `projects()` live only, `answered()`,
    `hasArchived()`, `workspaceEmpty()` (never while loading or after a failure);
  - `core/shell/shell-commands.ts`: the `ShellCommands` interface and `SHELL_COMMANDS` token, which
    `AppShell` provides as itself (`requestCreate()` opens the Menu first when narrow, then reopens
    the sidebar's form after the drawer's focus move);
  - the sidebar's `hasArchived` input, with "No active projects." and its link "Archived projects
    are in Settings." to `/settings/archived-projects`;
  - `features/dashboard/first-run-block.ts` behind `@defer (when shell?.workspaceEmpty())` above
    the widgets; it hides itself when the first project arrives;
  - stories `Shell/Sidebar` (`Projects`, `Empty`, `ArchivedOnly`) and `Dashboard/Home`
    (`FirstRun`); Storybook builds;
  - docs: web/core and web/dashboard overview/why/what/how, web what/why (the route table and the
    lazy-route paragraph), §23 and §24 *Slice 79* notes, the new decision
    `2026-11-empty-workspace-offers-the-first-project.md` and the budget decision's 2026-11-04
    amendment, both indexed.

  Commits `b9e0e48` (code, docs, stories) and the closing docs commit (review fixes, this State).
  Unit: web 1,503 green (six files timed out on the first cold run and passed on re-run). E2E: 259
  passed in 24 of 25 specs, including `web`, `placement`, `archived-projects`, `archive`, `states`,
  `phone-layout`, `work-navigation` and `mcp`, against the production build through a throwaway,
  uncommitted config: host on 4357, static build on 4257, and a forwarding proxy on 4258 that maps
  the browser's `localhost:4200`/`:4310` (Chromium `--host-resolver-rules` cannot remap loopback
  ports; set `UX_STATIC_ORIGIN` too, or `ux/isolation.ts` reroutes to 4201). Not run:
  `project-creation-history.spec.ts`, which fetches `127.0.0.1:4310` from Node directly. One cold
  review: no code findings; it found this State and the stale `shell-commands.spec.ts` rows (fixed),
  an overstated Confidence line in the decision (fixed) and an untested drawer-already-open
  `requestCreate()` (case added). Left minor: no `@error` block on the first-run `@defer` (as the
  banner's); Escape from a form opened by first run on a phone returns focus to Menu, per the
  drawer rule.
- **Step 7 (refusal first):** `ProjectArchiveConfirm` over live workstreams is the blocked form:
  "“X” can’t be archived yet" / "These workstreams aren’t archived. Archive them first:", each child
  an `a[data-project-archive-child]` to `/projects/<id>` then " · <Status>" (completed still
  blocks), a click closing the dialog, Close (`data-project-archive-cancel`, focused) the only
  button; with none, the commit form unchanged. **Placement changed for the bundle (Revisions):**
  the list is `liveChildrenOf(tree)` (`live-children.ts`: a root's are the top level of
  `subprojectTree()`, a workstream's its node's children, archived left out, empty when unread),
  computed inside the deferred confirmation from the shell's `WORKSPACE_TREE` token
  (`workspace-tree.ts`, `useExisting: ProjectWorkspaceStore`; a `liveChildren` input overrides it
  for stories and tests). No store signal and no header input. The late refusal:
  `projectWriteSentence(input, name, code)` gives an archive's `rule_violation` "“X” still has live
  workstreams. Archive them first." (reason under Details); other codes keep "Couldn’t archive “X”.
  Try again."; any `rule_violation` on a project write queues `refreshContext` (the descendants
  re-read). Stories `ProjectArchiveConfirm/Commit` and `/Blocked`. `lifts.spec.ts`'s archive test
  now asserts the blocked form on Home renovation (Kitchen, Garden; Close returns to More, no write
  error). Docs: §31 *Slice 79* note; nesting-rules decision's first amendment and the failures
  decision's amendment (both indexed); web/projects overview/why/what/how. Unit (projects) 871
  green; e2e `lifts`, `task-lifts`, `feedback`, `project-history`, `web` 84 passed in this cloud
  container via a throwaway config with `launchOptions.executablePath: '/opt/pw-browsers/chromium'`
  (not committed). No captures (cloud). Review (one cold pass): the confirm spec's link click
  navigated to an unmatched route after teardown and turned `pnpm test` red with every test green
  (fixed: a wildcard route and a navigation assertion); the re-read is now proven by the next read
  finding an agent's new workstream; focus moves to the dismiss button if a live frame swaps the
  form while open (`afterRenderEffect`). Left minor: Ctrl/Cmd-click on a child link also closes
  the dialog; the failed-quiet-refresh row (L1173) for `liveChildren` follows from
  `descendantsState` being kept and has no own test; the status label map is duplicated locally
  (importing the shared one costs bytes there is no room for).
  **Bundle 1,149.996 kB initial: 4 bytes left under 1,150.**
  Measured costs: a store `computed` plus a header input and two bindings was +0.66 kB (over);
  importing the store class (or `RESTORE_STATUS_LABELS`) into the deferred chunk re-split shared
  initial chunks for about +0.5 kB; the token keeps the main-bundle cost to the sentence, the
  refresh and the provider. **Trap for steps 8–11: there is no headroom at all.** Every byte added
  to initial code must be paid for, by `@defer` or by removing something; a lazy chunk must not
  import a value from a module the initial bundle shares (it re-splits chunks); measure with a
  throwaway budget (`maximumError` lowered to 1149kB shows the exact total as "not met by N
  bytes"), and never commit it. If step 8's first-run block and `ShellStore` split cannot fit
  behind `@defer`, stop and raise it.
- **Steps 6a and 6 (hidden count; read-only Todos and Reflections):** 6a: optional
  `hiddenItemCount` (non-negative int) on `ProjectTodosResultSchema` and
  `ProjectJournalResultSchema`; `ProjectTodosService.derive` and `ProjectJournalService.journal`
  answer an archived root with `items: []` and the count their own derivation gives over
  `asRestored(projects, rootId)` (`project-visibility.ts`: the root read as live, in memory,
  nothing written), so work archived in its own right is not counted; a live root has no field;
  grants still asserted first; `completedWork` unchanged. The two MCP descriptions say so (new
  `contract.test.ts` case). 6: `TodosPage` renders no `data-todo-toggle`, `data-todo-complete` or
  `data-todo-delete` when `readOnly` (links stay; `writesBlocked` includes `readOnly`); Complete and
  Delete are now `aria-disabled` with a guarded click while a write is pending or the shell blocks,
  never `disabled` (`nextControl` matches). `ReflectionsPage.pageWritesBlocked` adds `readOnly`
  (no composer, no Add container). Stores expose `hiddenCount()` (0 when absent; 0 after a loud
  failed read; a quiet failure keeps rows and count together). Both empty elements
  (`.state-message--empty` added) show `hiddenCountSentence(...)` from `pages/hidden-count.ts`: one
  string helper, not template branches, which saved ~0.23 kB. Stories `TodosPage/ArchivedRoot` and
  `ReflectionsPage/ArchivedRoot`. Docs: spec §26/§31/§34/§36 notes; decision amendments (archived
  pages ×2, actionable archive, todos chronology, reflection subjects); contracts, domain, mcp-tools,
  web/projects docs; the MCP guide. Commits c525f06 (6a), 20b5fa3 (6) and the review/handoff commit
  after them. `pnpm test` (web unit 1,473) and `pnpm lint` green. No e2e or captures (cloud).
  Review: nothing substantive; a pending-workstream case added. Not done: the journal's archived-root
  refusal test does not count reads the way Todos' does (the code checks grants first).
  `70-ui-ux-overhaul.md:413`'s "pre-existing `[disabled]`" on Todos' Complete is now historical.
  **Bundle 1,149.74 kB initial (0.26 kB left under 1,150)**: 6a's contracts cost ~0.10 kB and step 6's
  web code ~0.69 kB. **Trap for steps 7–11:** there is almost no headroom left. Every Angular `@if`
  branch compiles to its own template function (~0.1–0.2 kB), so prefer string helpers and
  `@defer` for anything on demand (step 7's blocked confirmation is a candidate). Measure before
  committing; a measuring copy of the build that lifts the budget must never be committed. If an
  item cannot fit, stop and raise it (never raise the ceiling).
- **Step 5 (read-only canvas):** `ProjectCanvas.layoutEditable()` (`orderComplete() &&
  !readOnly()`) gates insertion marks, the end and empty-canvas add, drag/drop, `openCreate`,
  `moveWithKeyboard` and the grid gaps; resize handles and the unknown frame's toolbar are absent
  when read-only; an archived empty canvas says "This page has no sections." `ProjectSectionFrame`
  and `ShortcutFrame` declare `readOnly` (`input(false)`): no Rename (nor title-click rename),
  Move, Settings or Remove on sections; no Move or Remove on shortcuts (Open source stays);
  collapse is the toolbar's one tab stop and toggles a local `linkedSignal` view (reset by a fresh
  record or by `readOnly` changing; it overrides `transientlyExpanded`), never emitting
  `collapseToggled` (Q4 (a)). The section frame passes `readOnly` to its content (config writes
  answer `READ_ONLY_CONFIG`) and closes an open settings panel and a rename on going read-only (a
  rename already saving closes when its answer arrives). The Task List's archived rows were
  already static `TaskRow`s (`link` null: plain title, status when not To do, due/completed date,
  no drawer, drag or drop list), now pinned by tests; its empty sentence is "No tasks." when
  `sourceLink` is null, and the shortcut flavour keeps "The source has no tasks yet." and its link
  (Q5 (a)). Stories `ProjectCanvas` `ReadOnly` and `ReadOnlyEmpty`. Docs: the new decision
  `2026-11-archived-pages-are-read-only.md` (indexed; step 6/6a append dated amendments for Todos,
  Reflections and Q7, not rewrites), §26's *Since Slice 79* paragraph, web/projects why/what/how.
  Commits e10d6b0 (code and docs) and the review-fix commit after it. Web unit 1,466 green;
  `pnpm test`, `pnpm lint` green. No e2e or captures run (cloud session; captures stay local).
  Bundle **1,148.95 kB** initial (+2.05 kB over step 4). **Trap: only 1.05 kB is left under the
  1,150 ceiling for steps 6–11**: step 6 (Todos/Reflections) must be near-zero, and steps 8 (first
  run) and 10 (draft store) must defer what they can and measure early; if one cannot fit, stop and
  raise it (never raise the ceiling). Review: nothing substantive; minors fixed (shortcut collapse
  tab stop after roving, a saving rename closing when it settles, local collapse reset on a
  `readOnly` round trip, test gaps). **Left as is (domain refuses each):** a section creation
  dialog, a resize preview or the removal toast's Retry remove already open when the page turns
  read-only are not closed by the canvas; a candidate for real use if it is felt. **Branch note:**
  this cloud session's harness named `claude/step-5-read-only-canvas-d221jy`; work was pushed to
  `codex/ui-ux-overhaul` as the brief requires.
- **Step 4b (banner, placement, renderer input):** `features/projects/archived-banner.{ts,html,scss}`
  (+ spec, 8 tests; stories `Own`, `Ancestor`, `ArchivedTwice`, `Pending`, `Failure`, `Refused`):
  host `app-archived-banner.state-message.state-message--archived`, `aria-busy` while pending;
  `[data-archived-sentence]` holds the own / ancestor / "archived, and so is" sentence;
  `RestoreStatusChoice` on the owner, its status a `linkedSignal` on a `computed` owner id (Active
  per owner, kept through a refreshed record); the owner's `restoreFailure()` inline inside it
  (`[data-archived-restore-error]`, `live="alert"`, Details, Try again only when `retryable`,
  repeating the last pressed status). The shell mounts it in `.project-workspace__main` right after
  `app-project-header`, `@defer (when store.readOnly())` with no placeholder content;
  `restoreFromBanner` focuses `h1[data-project-name]` or `app-archived-banner
  select[data-restore-status]` after resolve, and nothing if the route moved to another project
  meanwhile; `bannerRestoreDisabled` = `projectWritePending() && !restorePending()`.
  `ProjectPageRendererInputs.readOnly` / `ProjectPageRenderer.readOnly` are set from
  `store.readOnly()` and declared (`input(false)`) by `ProjectCanvas`, `TodosPage`, `ArchivePage` and
  `ReflectionsPage`; **no page changes with it yet** (steps 5 and 6). `TaskDrawerCoordinator.close()`
  is new; a shell effect calls it when `readOnly()` turns true. **Pulled in from the archive-page
  row:** the archived root's Archive note is now "Restore “X” above to bring its archived work
  back." while `readOnly` holds (`ArchivePage.rootArchived` removed), with the §31 *Slice 79*
  sentence and the root-archive-recovery decision's amendment (index row updated). **Rename and
  Parent:** both live in More › Edit details…, which the header keeps (asserted). **Left for step 5
  on purpose:** the new `2026-11-archived-pages-are-read-only.md` decision entry and §26's archived
  notes, since pages are not yet read-only (no aspirational docs). Commits 914207f (code and docs)
  and 8251427 (review fixes). Web unit 1,446 green; `pnpm test`, `pnpm lint` green; e2e `web`,
  `project-history`, `archive`, `archived-projects`, `feedback` 63 passed (**one worker**: the
  config's `workers: 1` is required, `--workers=2` races the shared host and fails 9 tests falsely).
  Bundle **1,146.90 kB** initial (+2.16 kB; the banner chunk is 2.75 kB lazy). **Trap: only
  3.10 kB is left under the 1,150 ceiling for steps 5–11**; steps 8 (first run) and 10 (draft
  store) should defer what they can and measure early. Review: nothing substantive; four minors,
  all fixed (status reset on a refreshed owner record, focus after navigating away, the Archive
  note outliving the banner, Try again's status asserted).
- **Step 4a (store only):** `ProjectWorkspaceStore` (`project-workspace-store.ts`) now exposes:
  `archivedOwner()` (`Project | null`, outermost archived of breadcrumbs + project; ancestors are
  root first), `readOnly()`, `restorePending()`, `restoreFailure()` (`OwnerRestoreFailure | null`:
  `{ ownerId, sentence, reason, retryable }`; `retryable` is false for `rule_violation` and
  `not_found`, which also queue a context refresh; cleared by a new restore and by `load`), and
  `restoreOwner(ownerId, status: ProjectRestoreStatus): Promise<boolean>`. It refuses (no request,
  `false`) a stale owner id, a load in progress and any project write in flight (header writes
  included: a rename's rollback would repaint the pre-restore record; review finding). On success
  the owner's record replaces its breadcrumb or `project()`, the context epoch moves, the tree
  (`projects.list`) is re-read, and the promise resolves only then, so part b can move focus on
  resolve. It reports `{ projectId: owner.id, projectName: owner.name, receipt }` with no
  `feedback`, so an ancestor gets the existing cross-owner toast and the own project gets none
  (the history store only announces when history ids differ; not re-tested here).
  **Part b must wire:** the banner (`app-archived-banner`, behind `@defer`, Q6 (a)) reading
  `archivedOwner()` and `project()` for its three sentences (own, ancestor, "archived, and so
  is"); `RestoreStatusChoice` with `pending` = `restorePending()` and `disabled` while
  `projectWritePending()` and not `restorePending()`; `restoreFailure()` rendered in the banner
  (`FailureMessage`, Try again only when `retryable`, re-calling `restoreOwner` with the same
  status); focus after resolve (heading `h1[data-project-name]`, or the banner's choice when
  `archivedOwner()` is still set); `readOnly` as a renderer input on every typed renderer
  (`project-page-contract.ts`) from `store.readOnly()`; closing an open drawer when `readOnly`
  turns on. `restoreBlocked` is unchanged. Commits ee60b33 and the review-fix commit. 1,428 web
  unit tests green; bundle **1,144.74 kB** initial (+1.86 kB: the store is in the initial bundle; 5.26 kB left
  under the 1,150 ceiling for the deferred banner's shell hook, first run and later steps). Review: nothing
  substantive; minors fixed (guard, tree assertion, neutral doc comments); not fixed: a page
  toggle in flight loses its context re-read when a restore moves the epoch (the plan's rule;
  its own frame heals it).
- **Step 3:** Archive's workstream rows (`archived-region`) and Settings › Archived projects render
  `RestoreStatusChoice`; the duplicate option lists, Settings' "Choose status" and its "stays
  disabled" rule are gone (`ArchivedProjectsStore.statusFor` is Active until chosen). **Hooks
  decided:** the choice keeps its own `data-restore-status` / `data-restore-action`; Archive's other
  rows keep `data-archived-restore`, and `archive-page.ts` (`RESTORE_CONTROLS`) and
  `feedback.spec.ts:187` look for either; the e2e project-row locators moved (`archive.spec.ts`,
  `archived-projects.spec.ts`, `web.spec.ts:220`). **Pending decided:** the choice's Restore reads
  "Restoring…" while `pending` (same accessible name, `aria-disabled`, keeps focus); the restoring
  row is pending, the others disabled, on both pages. Settings' focus after a restore, and on
  dismissing its toast, lands on the next row's status select; Archive's dismissal still finds the
  next Restore (only Settings' target is specified). §23 and §31 notes and the actionable-archive
  decision's amendment landed with the code (44990eb). Unit and the four touched e2e specs green
  (`archive`, `archived-projects`, `web`, `feedback`: 53 passed); `archived-projects.spec.ts`'s
  focus test now reads the sibling's index, since dismissal lands on a row when one took its place.
  **T09** run through `ux/tasks.ts` on nested-projects (rig servers 4257/4357, a throwaway
  one-task spec, not committed): completed, 1 click, "Restored Legacy attic as Active.", the exact
  label gone from Archive. Bundle **1,142.88 kB** initial. The step's cold review found no
  substantive defect; two minors fixed (the feedback row and a `projects/how.md` sentence).
- **Step 2:** `.state-message--empty` and `.state-message--archived` in `_controls.scss` (tokens
  only, no danger colour); `shared/projects/restore-status-choice.{ts,html,scss}` (+ spec, 6
  tests; stories `Default`, `Pending`, `Disabled`, `InArchivedBanner`), and
  `shared/feedback/state-message.stories.ts` (`Empty`, `Archived`); the Lab's `state-messages` panel replaces `.lab-state` with two empty
  specimens (alone, and with New project) and the archived specimen holding the real choice
  (`design-lab-page.spec.ts`); §21's *Slice 79* paragraph and the failures decision's amendment
  (the variants). Bundle **1,141.59 kB** initial (baseline re-measured here at 1,140.75; the
  choice's own layout is in its component stylesheet, so only the two variants and a shared-chunk
  shift reach the initial bundle).
- **Left for later steps on purpose:** the `section-frame` header count specimen goes with the
  count (step 11), as the Lab renders the real frame; Q2's §23/§31 amendment and the
  actionable-archive decision's amendment go with step 3, when Archive and Settings adopt the
  choice and Settings starts on Active (the spec must not say that before it is true).
- **Trap for step 3 (hooks):** `RestoreStatusChoice` renders `select[data-restore-status]` and
  `button[data-restore-action]` with the accessible name `Restore <subjectLabel>`. The e2e and unit
  specs still select the old row hooks (`data-archived-project-status` on Archive,
  `data-archived-status` on Settings, `data-archived-restore` on both), so step 3 either moves those
  locators to the row plus the new hooks or gives the choice a way to carry them; decide there.
  `disabled` is native (blocked or paused), `pending` is `aria-disabled` on both controls and
  refuses a change; Settings' "Restoring…" text has no place in the choice, so step 3 decides
  whether pending alone carries it. The `status` is a `model`, so a store can bind it.
- **Profile 79:** the gate holds the plan's tables (context rows with each row's region, views per
  context, the 25 write controls with their source tokens plus the rule hooks, the 31 visual pairs,
  the digest's Stage 0 overdue counts, Q7's hidden counts 6/3/0/0, each blocked form's child routes,
  each read-only context's banner sentence, the restore choice's one option list, the T01–T12 cost
  limits) and fails when the rig's differ. Both evidence files must carry the matrix's commits.
  Profile 78's census and axe rule is now the shared `runtimeGate`, unchanged for 78; profile 79
  reads a rig-made project's id anywhere in the route. The only matrix allowance outside the seven
  changing cells is a control inside a section or shortcut frame whose text gains one "N tasks".
- **What the review rounds closed** ("can this gate pass falsely?"): a no-op restore (restored rows
  need no banner and focus on `h1[data-project-name]`; an own restore adds no toast, Legacy
  shelving's ancestor restore shows Undo and "Open Legacy attic"); the Undo refusal must be the
  `history_conflict` sentence naming Legacy shelving; blocked forms offer Close only; banners sit
  inside `main` on x; Edit details must be usable; the banner's own restore choice (the rig now
  records the banner's `selects`) defaults to Active in the shared list; the root Archive note and
  the archived empty canvas sentences are pinned.
- **Left as minor, not gated** (from the second review; a later step may tighten them): digest
  links are checked for shape and count, not matched to the overdue tasks' sections; Discard is
  checked by the editor showing the saved text, not by a later Cancel then Edit; the late refusal
  needs the sentence, not its “Cabinets” subject; the axe known-node set is per route, as in profile
  78; the source pins match a token anywhere in `apps/web/src`; `UX_STATES_MATCH` merges entries
  under one commit label, so a final after run must be a full run.
- **Before against before** (re-run 2026-11-04 in the cloud session after every rule change;
  `build-sheet.mjs 44e7e9e 44e7e9e <out> 44e7e9e --profile 79`, out in
  `apps/e2e/ux-output/slice79-sheet-before-before/`): 194 pairs; **zero** context-table,
  provenance, matrix geometry, axe, Lab or core-task failures; 227 row-rule failures, every one an
  after-only rule the before lacks (no banner, write controls on read-only pages, no first-run
  block, no reworded Archive note or empty-canvas sentence, lowercase and placeholder restore
  choices, no overdue links, no draft kept, no count, no cross-owner toast, the commit form where
  the blocked form belongs, the drag drop, native `disabled` on pending Todos, no
  `hiddenItemCount`). 0 of 31 pairs incomplete.
- **Trap: capture in one environment.** The cloud container's capture of 44e7e9e has 2 census
  failures the local one did not (`target under 24 px`: overdue-chaos dashboard at 1024, the
  "Export legacy records" title link wrapped to a 22 px column, both themes), most likely fonts.
  Capture before and after on the same machine; a before from elsewhere is a false failure source.
  Also in the cloud: the repo pins a Playwright whose headless shell is not installed, so a
  throwaway config adding `launchOptions.executablePath: '/opt/pw-browsers/chromium'` was used (not
  committed); a full half runs longer than 10 minutes there, so split with `UX_MATCH` /
  `UX_STATES_MATCH` (`^NONE$` runs only the tasks), and kill a timed-out run's leftover host,
  static server and Playwright worker before the next.
- **Inventory:** under Behaviour vs. appearance, "Stage 0 inventory" and "Stage 0 checks". What
  it changes for later steps: `lifts.spec.ts:158-163` archives Home renovation (live children), so
  step 7 changes it; `canvas-editing.spec.ts:150-157` and `markdown-section-body.spec.ts:63-67`
  assert the saved text after Cancel, so step 10 changes them; the nested-projects `dev-panel`,
  `new-project` and `phone-menu` cells do not change (that dashboard has no overdue task); the
  changing overdue cells are busy-week's, overdue-chaos's and agent-heavy's dashboards (18 cells).
- **Before:** built from `44e7e9e` in a detached worktree (since removed) with linked
  `node_modules`, `ng build` into `apps/e2e/ux-output/slice79-baseline-web/` (served from
  `browser/`). Captured with `UX_BEFORE=44e7e9e` into `apps/e2e/ux-output/44e7e9e/` (git-ignored):
  `index.json`, 194 matrix cells, all captured; `empty-archived-verification.json`,
  `complete: true`, 40 contexts (39 plus `lab`), 42 `ROWS`, 149 entries, no errors; `tasks/`, T01–T09,
  T11, T12 at exactly the slice-78 after counts, no dead ends. After-only checks are recorded
  absent: `bannerPresent: false`, `overdueLinkPresent: false`, `discardPresent: false`,
  `hiddenItemCount: null`, `pressed: 'sidebar'`.
- **Rig:** `apps/e2e/ux/slice79.config.ts` (ports 4257/4357, `.prototype/ux-slice79.json`) and
  `ux/empty-archived-verification.ts` (`ROWS`, `CONTEXTS`, `WRITE_CONTROLS`, the probe); T01's
  scoped locator in `ux/tasks.ts`. Subsets: `UX_MATCH` (matrix) and `UX_STATES_MATCH` (contexts)
  merge into the existing JSON; `UX_STATES_SKIP_TASKS=1` skips the tasks. Each full half ran
  under 4 minutes.
- **Hooks the rig expects from later steps** (the after run reads them; keep or update the rig):
  the banner as `app-archived-banner` with a `button` named `Restore …` and its one restore `select`; `data-first-run-create`
  inside `app-dashboard-page`; `[data-digest-overdue] a` inside the digest tile; a "Discard draft"
  button in the Markdown frame; the Archive row `[data-archived-item][data-archived-id]` and the
  Settings row `[data-archived-project][data-project-id]`, each with a `select` taking the enum
  values (`on_hold`); `[data-history-undo]`; `[data-markdown-edit|source|cancel|preview]`;
  `[data-project-archive-confirm]` on both confirmation forms and `[data-project-archive-confirm-yes]`
  on the commit form, opened from the menu item `/^Archive (project|workstream)…$/`;
  `[data-todo-row]`, `[data-todo-link]` and `[data-todo-complete]`; `[data-create-project-name]`.
  The banner counts as shown when its host or any of its content has a box.
- **Bundle:** 1,149.996 kB initial after step 7 (4 bytes left); 1,149.74 kB after step 6; 1,148.95 kB after step 5; 1,146.90 kB initial after step 4b; 1,144.74 kB after step 4a; 1,142.88 kB after step 3 (1,141.59 after step 2, 1,140.75 before; ceiling
  1,150 kB, not raised). Steps 4 and 8 put the banner and first-run block behind `@defer` (Q6 (a)).

Redesign slice 6b-2 under the [UI/UX overhaul umbrella](70-ui-ux-overhaul.md). It follows
[Slice 78](../completed/78-failures-and-loading.md) (6b-1, failures and loading). The user split 6b
on 2026-10-29 and answered the shape questions under Build the same day. The protocol §8 comb
runs after this slice closes; it is the umbrella's next step, not part of this slice.

## Goal

Empty states offer the next step, and archived work reads as archived and does not invite edits
it will refuse. A refusal is said before the user commits, and typed prose is never lost to
Cancel or navigation (direction principles 3, 4 and 6).

## Spec sections

- **§21** adds empty and archived variants to slice 78's `.state-message` (spec line 906).
- **§23** gives the sidebar archived-only wording (line 1075) and keeps Settings › Archived
  projects as the recovery route (lines 1046–1049).
- **§24** adds Home's first-run content and the digest's overdue line (lines 1107, 1126).
- **§26** covers the project header and canvas on an archived project. The empty canvas's primary
  add action (line 1201) goes on archived pages. Undo stays enabled after an archive
  (lines 1217–1219). Page toggles stay allowed while archived (lines 1404–1408).
- **§27** is the existing read-only rendering of shortcut content (lines 1612–1617). It is reused,
  not changed.
- **§30** covers the Markdown editor: Edit, Preview, Save and Cancel (lines 1772–1776). The
  candidate cited §27 for this; the editor lives in §30.
- **§31** covers archived projects and their pages:
  - restore needs an explicit status, and root recovery goes through Settings (lines 1880–1883);
  - there is no cascade (lines 1885–1888);
  - the own-status freeze exception (lines 1975–1977);
  - an archived project's page keeps rendering (lines 2021–2022).
- **§29** covers `SectionDefinition`, given verbatim at spec line 1701. It gains `summary`.
- **§34** adds the Task List count and the drag hint (lines 2301–2302).
- **§63, §67, §69, §77, §78** are the Lab, Storybook, verification, design-first use and the
  decision log.

## Build

These are the candidate's items, refined against the code. Items marked *user's choice* were
answered on 2026-10-29 and are not re-opened here.

- **First run** (W1-001, W4-001, L4-020).
  - **When it shows.** An empty workspace's Home shows a first-run block in the main column: one
    sentence saying what the product is for, and a **New project** button
    (`data-first-run-create`, never `data-new-project`, which `web.spec.ts:30` means as the
    sidebar's). "Empty" means the workspace has no projects at all, live or archived.
    `ShellStore` already reads the project list. It now also records whether that read has
    answered (`projectsState` starts as `[]`, so emptiness alone proves nothing) and whether any
    archived project exists (next item). The block shows only after a successful answer with
    nothing in it, so it is never shown while loading or after a failure.
  - **New project.** `ShellStore`'s doc says the dashboard and the project page "bring their
    own", and `AppShell` keeps drawer state as its own UI state (§20, `app-shell.ts:51-53`). So
    the request goes through neither. A small `ShellCommands` service in `core/shell/`, provided
    by `AppShell`, carries two things:
    - `workspaceEmpty`, a read-only signal `AppShell` feeds from `ShellStore`;
    - `requestCreate()`, which `AppShell` answers by opening the Menu at 375 and calling the
      sidebar's existing `reopenCreate()`. Focus lands on the name field after the drawer's own
      focus move, not before it.

    There is still exactly one creation form. The dashboard injects `ShellCommands`, never
    `ShellStore` or a gateway. Core's `why.md` records why the service exists.
  - **Placement:** above the widgets, which stay below with their true empty sentences (Open
    question 3, answered (a)).
  - **Not here.** The seed instructions in empty states stay; they are scaffolding by
    [decision](../../decisions/2026-10-prototype-scaffolding-stays-for-now.md).
- **Sidebar after archiving** (W4-034).
  - **The read.** `ShellStore`'s read drops its status filter and splits the list on the client.
    `projects.list` with no filter returns live projects and projects archived in their own
    right; the domain already hides live work under an archived ancestor. Archived projects
    never reach the tree, and `hasArchived` comes from the same read. It is one request, as today.
  - **The wording.** With an empty tree and `hasArchived`, the sidebar says "No active projects."
    and links to Settings › Archived projects ("Archived projects are in Settings."). It says "No
    projects yet" only when nothing exists at all, never while loading or after a failure, as
    slice 78 left it.
- **Archived pages are read-only, with a banner** (L4-007, L1-028). *User's choice.*
  - **Which project.** `ProjectWorkspaceStore` derives `archivedOwner`: the outermost archived
    project among the breadcrumbs (`ancestorsState`, which already carries each ancestor's status)
    and the project itself. A project is read-only when `archivedOwner` is not `null`. This
    covers three cases:
    - an archived workstream, Legacy attic;
    - an archived root;
    - live work under an archived ancestor. Legacy shelving, live under Legacy attic, is seeded
      exactly this way. Today the web never computes this case, so that page is fully editable,
      and every write on it is refused.
  - **The banner** sits at the top of the workspace track, under the project header, on every page
    of a read-only project. It is the archived variant of `.state-message`. It says either
    "“Legacy attic” is archived." or "“Legacy shelving” is inside “Legacy attic”, which is
    archived." Then it offers **Restore as [status] · Restore** on the archived owner, through the
    shared restore choice (L4-012).
    - **Why the outermost owner.** Reactivating under an archived ancestor is refused, so restoring
      anything below the outermost archived project cannot succeed. Once the outermost is
      restored, the banner moves to the next archived owner, if there is one.
    - **The write.** `writeProject` cannot carry it. It paints and re-applies `projectState`, and
      words a failure with the page's own name (`project-workspace-store.ts:648-690`). Restoring
      Legacy attic from Legacy shelving would put Legacy attic into Legacy shelving's header.
      - **A separate `restoreOwner(owner, status)`.** It is not optimistic, and it paints nothing.
        It holds the project-write count, so `restoreBlocked` and the header hold still. On
        success it replaces the owner's record:
        - in `ancestorsState` for an ancestor;
        - in `projectState` when the owner is the page's project.

        Then it re-reads the descendants, so `archivedOwner` and the tree follow.
      - **Failure.** A failure is a `writeFailure` naming the owner ("Couldn’t restore “Legacy
        attic”. Try again."), shown in the banner, not the header. A `rule_violation`, for example
        when an ancestor was archived meanwhile, says "Couldn’t restore “Legacy attic”. Something
        above it may have been archived." with the reason under Details. It then queues a context
        refresh, which moves the banner to the new outermost owner. A `not_found` (the owner was
        removed or its archive undone elsewhere) says "Couldn’t restore “Legacy attic”. It may
        have changed elsewhere." with no Try again, and queues the same refresh. `refreshContext()`
        returns `void`, so neither sentence waits on it.
      - **Success** bumps `contextWriteEpoch`, as the page writes do (`:426`), so an older
        in-flight read cannot repaint the ancestor as archived.
      - **Feedback.** The write is reported to history with the owner's id and name, and it must
        run inside `whileWriting`, so `refreshContext` waits for it
        (`project-workspace-store.ts:186-190, 699`).
        - **For an ancestor**, it is a cross-owner write. The existing cross-owner toast offers
          Undo and Open owner (§26, spec lines 1213–1215; `history/project-history-store.ts:393-405`).
        - **For the page's own project**, no toast is added. A write on the page's own history is
          never announced: `announceCrossOwner` runs only when the history ids differ, and the
          More menu's status choice has no toast either. The banner disappears, focus moves to the
          project name heading (`h1[data-project-name][data-recovery-focus]`,
          `project-header.html:7`), and the header's Undo is the way back.
        - **Focus in every case.** When the banner goes, after an own or an ancestor restore,
          focus moves to that heading; an ancestor's toast is announced politely. When the banner
          stays (archived twice: it moves on to Kitchen), focus moves to its restore choice.
    - **Undo after a banner restore.**
      - **Why it can refuse.** Undoing a reactivation refuses while any child is live (§31, spec
        lines 1972–1973; `project-history.ts:51`). `blockedBy` names only archived projects
        (`operation-history-public.ts:16-25`), so the header's Undo looks enabled after Legacy
        attic's restore. Pressing it returns the existing transition refusal
        (`transitionRefusalFeedback`). That is captured as it is; changing `blockedBy` would be a
        contract change, which is a non-goal.
      - **Where Undo works.** The working Undo journey is Home renovation archived as a root,
        after the rig has archived every descendant. Nothing under it is live, so the header's
        Undo puts the banner back. The decision entry records both.
    - **Visiting.** Visiting still writes nothing
      ([Archive is always visitable](../../decisions/2026-10-archive-is-always-visitable.md)).
  - **The canvas** renders its sections read-only. The following go:
    - insertion marks, the end and empty-canvas "Add a section", drag, resize, section rename,
      section settings and remove, on section, shortcut and unknown-section frames;
    - inside sections, the existing `readOnly` content input hides quick-add, Complete, Delete,
      Markdown Edit, the Reflections composer and edit, and the Progress formula controls.
  - **Task rows** on a read-only canonical Task List show as static rows, with no drawer, because
    the drawer is a write surface (Open question 5, answered (a)). The shortcut flavour of read-only
    keeps its link to the source. An archived empty canvas says "This page has no sections." with
    no add action.
  - **Collapse** is a persisted section write, refused on archived projects
    (`section-service.ts:483`). On a read-only page it stays and toggles locally, unsaved: it
    starts from the stored state and resets on reload (Open question 4, answered (a)).
  - **Which pages.** A workstream has only its work page: `resolveProjectPage` uses `ownPages`
    (`project-workspace-shell.ts:204-208`). Archive, Todos and the Reflections page therefore
    render only for a root, and a root has no ancestors. On those pages `readOnly` is the root's
    own status, which `restoreBlocked` already covers. The ancestor case lives only in the canvas
    of a work page. Every typed renderer (`ProjectPageRenderer`, `project-page-contract.ts:39-49`)
    declares the new `readOnly` input, and `restoreBlocked` does not change.
  - **Root Archive's note.** On an archived root, the Archive page says "The root is archived.
    Open Settings → Archived projects…" (`archive-page.html:10-14`), right under a banner that now
    restores it. The note becomes "Restore “X” above to bring its archived work back." Settings
    stays a recovery route, as §23 and §31 have it; the banner is a second, in-place one. §31
    (spec lines 1880–1881, "not from their own root Archive") and
    [root archive recovery guidance](../../decisions/2026-09-root-archive-recovery-guidance.md)
    are amended to say so.
  - **Live changes.** A live frame that archives or restores the project or an ancestor re-reads
    the ancestors and descendants, as the store's context re-read does today.
    - When the project becomes read-only, the banner appears and the controls go. An open drawer
      closes.
    - An open Markdown editor stays open, as it does today. It shows "This section is read-only.
      Your draft is kept; you can copy it or Cancel." (`markdown-section-body.html:8-10`; pinned
      by `markdown-section-body.spec.ts:179`). Save stays blocked, and Cancel now keeps the draft
      in the draft store.
    - A live restore removes the banner.
    - `readContext` is all-or-nothing (`project-workspace-store.ts:348-357`). A failed first
      load clears the page into slice 78's failure form; a failed quiet refresh keeps the previous
      context (`:216-227`). A failed refresh therefore keeps the last `archivedOwner` and
      `liveChildren`. A stale tree ends in the late refusal, and a stale banner ends in the
      banner's own refusal.
  - **Archived twice.** When the project is itself archived and also under an archived ancestor
    (Kitchen under an archived Home renovation, in the rig), the banner says "“Kitchen” is
    archived, and so is “Home renovation”, which holds it." It offers Home renovation's restore
    first; after that, Kitchen's.
  - **What stays.** Rename, Parent and the project's own status stay in the header, and so do
    Undo/Redo, More, Open archive and Page settings. Rename and reparent-away are the escape hatch
    in
    [reactivating under an archived ancestor](../../decisions/2026-09-reactivating-under-an-archived-ancestor.md).
    The own-status exception (§31) lets an archive's Undo run.
  - **Todos and the Reflections page.** Todos' task checkbox (`data-todo-toggle`), Complete and
    Delete are absent on a read-only project, and so is the Reflections page's composer. The Reflections page already passes
    `readOnly` when archived (`reflections-page.ts:40`). These are root-only pages, so no
    ancestor case arises.
    - **Reachability.** An archived root's Todos and Reflections reads return no items
      (`project-todos-service.ts:70`, `project-journal-service.ts:64`; §31 hides live contents).
      So the absent controls are proved by component tests with rows supplied, and by the gate's
      selectors; no capture shows an archived Todos row.
    - **What they say** (Open question 7, the user's answer). Today an archived root's pages show
      their ordinary empty sentences, which are false when work is hidden.
      - **Work is hidden.** The pages say "Restore to view 6 hidden todos." and "Restore to view
        3 hidden reflections.", singular for one ("1 hidden todo", "1 hidden reflection"). The
        sentence uses the page's existing empty element (`data-todos-empty`,
        `data-reflections-empty`), styled `.state-message--empty`.
      - **Nothing is hidden.** The ordinary sentence stays, because it is true: "There is no work
        under this project yet — no tasks, and no workstreams." and "No reflections yet."
      - **What a todo is.** The count is the number of rows the page would list once the root is
        restored. For Todos that is the tasks and workstreams in the root's tree, open, done and
        cancelled. For Reflections it is the reflections the journal would show. Work archived in
        its own right, or under a workstream archived separately, does not count. A restore does
        not bring it back; it is reached through Archive.
      - **Where the count comes from.** Today the domain answers an archived root with no items
        and nothing else, so the web has nothing to count. Both results gain an optional
        `hiddenItemCount`, defined once in contracts and set by the domain only for an archived
        root (step 6a). The items stay empty: the count says how much is hidden, never what. It
        reveals no more than §31 already shows, since an archived project's own page keeps
        rendering its sections (spec lines 2021–2022). The HTTP route and the two MCP tools
        return the same result, so an agent reads the same count the web shows.
  - **Decision entries.** A new decision entry records the rule. Amend
    [reactivating under an archived ancestor](../../decisions/2026-09-reactivating-under-an-archived-ancestor.md)
    and [nesting and archive rules](../../decisions/2026-08-project-nesting-and-archive-rules.md).
    No domain rule changes: every refusal still stands behind the UI. The domain's one addition
    is Q7's `hiddenItemCount` on two reads (step 6a).
- **The archive refusal comes first** (L4-008). *User's choice.*
  - **The check.** `ProjectArchiveConfirm` gains a `liveChildren` input, and `ProjectHeader`,
    which renders it (`project-header.html:104-108`), passes it through. The store computes it as
    the direct children that are not archived, which is exactly what `assertNoActiveChildren`
    checks:
    - for a root, the top level of `subprojectTree()`;
    - for a workstream, its node's children. `toWorkTree` holds only the root's descendants, never
      the root itself (`project-workspace-store.ts:732-745`).
  - **The blocked confirmation.** When the list is non-empty, the confirmation reads "“Kitchen”
    can’t be archived yet" over "These workstreams aren’t archived. Archive them first:". Each
    child is listed as a link to `/projects/<id>` with its status, so a completed Garden reads
    "Garden · Completed": completed still blocks. Following a link closes the dialog. The only
    button is Close, and the confirmation offers no commit. The domain rule does not change, and
    there is no cascade.
  - **When the tree can't say.** The tree may be stale: a quiet refresh failed, or an agent added a
    workstream since the last read. Under an archived ancestor, the list hides live children
    (`project-service.ts:94-110`). In each case the confirmation shows its commit form and the
    domain decides, ending in the late refusal below.
  - **A refusal that still arrives.** This can happen on a stale tree, for example when an agent
    added a workstream. A `rule_violation` on an archive write gets its own sentence:
    "“X” still has live workstreams. Archive them first." The reason goes under Details. The
    generic "Couldn’t archive “X”. Try again." stays for other codes, such as `unreachable`, where
    retrying can succeed. `projectWriteSentence` takes the code.
  - **After a refusal**, the store re-reads its descendants, so the next confirmation shows the
    blocked form.
- **Restore works one way** (L4-012).
  - **The header's status choice** in More still reactivates an archived project, with lowercase
    options. It is a status control, not a restore control. Its casing is slice 9's, which this
    plan leaves deliberately.
  - **One component.** A shared `RestoreStatusChoice` replaces the Archive row's select
    (`archived-region.html:61-75`) and Settings' select
    (`archived-projects-page.html:33-44`), and serves the banner. It has one option list in one
    casing (Planning, Active, On hold, Completed) and one label, "Restore as". The Lab shows it
    inside the banner specimen (protocol §7.1).
  - **Settings' focus after a restore** moves to the next row's status choice. The rule that a
    later row's Restore "stays disabled until a status is chosen"
    (`2026-09-actionable-archive-and-archived-projects.md:51-56`) is amended: every row preselects
    Active, so a later row's Restore is enabled too.
  - **The default** is **Active**, preselected and visible, as "Restore as Active", everywhere:
    Archive, Settings and the banner (Open question 2, answered (a)).
- **The digest's overdue line leads to the tasks** (W4-028).
  - **What exists today.** The digest is provider prose (`GeneratedContent.lines`) with no task
    ids. The overdue tasks are already in the same dashboard result (`today.overdue`), and Today
    shows them as rows that open their owner.
  - **The persona the finding is about.** W4-028 is Sam, whose only visible widget is the Daily
    Digest (`personas.ts`, Sam's widgets). Any answer that sends Sam to Today fails. The link is
    Open question 1, answered (a): web-only, with no contract change. The digest lists up to five
    overdue tasks under its prose, from the `dashboard` input it already takes
    (`daily-digest-widget.ts:24-25`), each linking to its owner section, then a muted "and N more
    overdue" with no link. No widget learns about another.
- **Markdown keeps the draft** (L3-012, W4-031). *User's choice.*
  - **The draft store.** `MarkdownDraftStore` is an in-memory store keyed by section id, provided
    in root.
    - **What it keeps.** It holds `{ draft, base }`. `base` is the saved source the draft started
      from, which `changedElsewhere` compares with the current `source()`
      (`markdown-section-body.html:10-12`). The unchanged-Save check compares the draft with
      `source()` (`markdown-section-body.ts:51`). A draft reopened after an agent changed the
      source keeps its old `base`, so the existing "changed elsewhere" note shows, as §30's
      live-update rule requires.
    - **Opening the editor.** Today it seeds from `initialSource = base()`
      (`markdown-section-body.html:11`, `markdown-source-editor.ts:41`). It gains an
      `initialDraft` input; with a kept draft, `base` is restored from the store.
    - **Discard draft.** The editor seeds `draft` once, in `ngOnInit`
      (`markdown-source-editor.ts:41`), so it cannot reset itself to a newer source. The editor
      emits `discardRequested`, and the body does the rest:
      - it forgets the stored draft;
      - it sets `base` to the current `source()`;
      - it re-creates the editor by re-keying it with a counter, so the fresh editor seeds from
        the current text.

      The editor stays presentational and never injects the store.
    - **When it keeps.** A Cancel with a changed draft keeps it; `cancelRequested` now carries the
      draft, since the draft lives in `MarkdownSourceEditor.draft`
      (`markdown-source-editor.ts:31`). An editor destroyed by navigation or by removal of its
      host keeps its draft too (a live archive leaves it open, above): the body reads the editor's draft through a
      `viewChild` before it goes.
    - **When it forgets.** The store clears on the live event `prototype.reloaded` from
      `LIVE_UPDATES`, which the shell and workspace stores already handle
      (`shell-store.ts:138`, `project-workspace-store.ts:160`). Seed section ids are fixed, so a
      draft would otherwise reappear on fresh data. A persona switch or seed load calls
      `location.reload()` (`dev-panel-store.ts:95-139`), which empties an in-memory store anyway.
  - **Getting it back.** The next Edit on that section opens with the draft. A polite note says
    "Your unsaved draft is back." and offers **Discard draft**, which returns the editor to the
    saved text and forgets the draft. A successful Save forgets the draft. A reload forgets every
    draft: "for the session" means the app session, with no `sessionStorage`. This is a default,
    noted under Open questions.
  - **Save** is already the only `button--primary`; slice 72 made it so (`499bab3`). Stage 0
    confirms that at L3-012's evidence size and records it as closed.
  - **Preview** shows a visible "Unsaved preview" caption above the rendered draft, in addition to
    `aria-pressed`.
  - **Amend** [Markdown source and rendering](../../decisions/2026-10-markdown-source-and-rendering.md),
    whose "navigation, reload, frame collapse and removal destroy an unsaved session" this changes,
    except for reload.
- **The Task List shows its count** (L4-023's count half).
  - **Where.** The section frame's header shows "12 tasks" after the name, as muted text with no
    block size of its own.
  - **How.** `NgComponentOutlet` calls `setInput` for every key, and an undeclared input raises
    NG0303 (`section-contract.ts:10-21`). So `reportSummary(text: string | null)` is not a key
    every section receives:
    - the section registry (`sections/registry.ts`) marks Task List with `summary: true`;
    - the canonical and shortcut frames add the stable class-property callback to the inputs only
      for such a type, and render the text;
    - Task List reports its count of loaded tasks, open and done.

    No count shows while loading, after a failure, or at zero: there the empty sentence speaks.
    At 375 the name truncates before the header wraps, so the frame's controls hold their place.
  - **Why not inside the section.** A count line inside the section would push every Task List
    down, moving every populated cell that holds one.
- **Carried candidates, decided:**
  - **The drag explanation's space** (`note-2026-10-22-002`). Decided here. The hint no longer
    takes flow space; it overlays the quick-add row while a drag is in progress. Quick-add cannot
    be used mid-drag, and the list does not move. Reserving a permanent line instead would add
    height to every Task List and move every populated cell that holds one. Amend
    [rows open their canonical owner](../../decisions/2026-10-rows-open-their-canonical-owner.md),
    whose layout amendment placed the hint.
  - **Todos' workstream Complete `[disabled]`** (slice 75 deferral). Decided here, from the two
    rules this slice applies:
    - on a read-only project, Complete and Delete are **absent**, not disabled (the archived rule);
    - while a completion or delete is pending, they use `aria-disabled` with a guarded click, never
      native `disabled`
      ([feedback stays on the object](../../decisions/2026-10-feedback-stays-on-the-object.md),
      [header history controls](../../decisions/2026-09-project-header-history-controls.md)).
    `writesBlocked` splits into `readOnly` and `writePending`.

## Done when

- Every finding under Findings closed closes on its before/after pair, or on its machine check in
  profile 79's gate.
- T01–T09, T11 and T12 cost no more than their slice-78 after counts.
- `pnpm test`, `pnpm lint`, `pnpm e2e` and `pnpm --filter web storybook:build` pass.
- The production build stays under the 1150 kB initial ceiling.
- The user accepts the sheet at Gate 2.

## Do not

- Re-plan slice 78's failure, loading or not-found work. That includes the stale and failure forms
  of Archive and Settings, which the restore choice sits inside unchanged.
- Cascade an archive, or change any domain rule or message. Q7's `hiddenItemCount` is a read
  result addition, not a rule (step 6a).
- Add task reordering or completed-task grouping (Slice 20).
- Change navigation, breadcrumbs or document titles (slice 7), the agent card (slice 8), or
  default names and vocabulary beyond the strings named here (slice 9). Status casing elsewhere
  (the More menu, Todos, history receipts) is slice 9's; only the restore choice is unified here.
- Run the §8 comb inside this slice; it is the umbrella's next step.

<!-- ───────────── Written when the slice starts ───────────── -->

## Scope check

TH10 has twenty-two findings. Slice 77 closed three, and slice 78 closed ten. The nine left are
all this slice's. Each was re-read from
[reproduction.json](../70-ui-ux/reproduction.json):

- **TH10 (9):** W1-001, W4-001, L4-020, W4-034, L4-007, L1-028, L4-008 and W4-028 are S2, and
  L4-012 is S3.
- **Assigned by earlier records (3):** L3-012 and W4-031 are S2 (slice 74's split, then slice 77's
  scope check). The count half of L4-023 is S2; slice 77 kept its long-list half for Slice 20.

That is twelve items: eleven S2 and one S3. TH10 then has no open findings.

**Does the sheet fit one screen?** Yes. The Visual acceptance table has seventeen pairs; slice 78's
sheet had twenty-four. No split is proposed.

**Carried candidates:** both are decided under Build. Slice 78 decided and delivered the row
failure below the fold.

## Findings closed

| Finding | Sev | Closed by |
|---|---|---|
| W1-001 | S2 | The first-run block's New project in the main column opens the one creation form |
| W4-001 | S2 | The same block for Demo (both themes), Alex (light) and Sam (dark), as captured |
| L4-020 | S2 | The block says what the product is for; seven "Nothing…" cards are no longer the only content (Open question 3) |
| W4-034 | S2 | "No active projects." with the Settings › Archived projects link when only archived projects exist |
| L4-007 | S2 | The archived banner with Restore in place; read-only sections and pages; no add, edit, drag or delete controls under an archived project or ancestor |
| L1-028 | S2 | The same banner at the top of an archived workstream; its empty canvas offers no add action |
| L4-008 | S2 | The blocked Archive confirmation names live workstreams as links and offers no commit; a late refusal says what to do, not "Try again" |
| L4-012 | S3 | One `RestoreStatusChoice` on Archive, Settings and the banner |
| W4-028 | S2 | The digest's overdue link (Open question 1) |
| L3-012 | S2 | Drafts survive Cancel and navigation and come back on Edit with Discard draft; Save is the one primary button (since slice 72) |
| W4-031 | S2 | The "Unsaved preview" caption |
| L4-023 (count) | S2 | "N tasks" in the Task List frame header |

Twelve items (11 S2, 1 S3). The drag reserve closes on its pair. Todos `[disabled]` closes on
the gate's pending-Todos rule and the "Todos write pending" pair (live Home renovation, Cabinets' completion pending:
Shift+Tab from Kitchen's title link lands on Kitchen's Complete, which native `disabled` skips), and, for its
read-only half, on component
tests and the gate's selectors, since an archived root's Todos has no rows to capture.

## Acceptance check

1. Run `pnpm test`, then `pnpm lint` (with `docs:check`), one after the other.
2. `pnpm e2e` passes in full, including the new `apps/e2e/empty-archived-editing.spec.ts`. Every
   other spec edit is listed under Behaviour vs. appearance.
3. `pnpm --filter web build` reports an initial bundle under 1150 kB. Every feature route but
   Calendar and Settings › Agents is eager (those two went lazy at step 8, Q8 (a)), and
   slice 78 closed at 1,140.75 kB, leaving about 9 kB. Per Open question 6 (a), the banner (with
   `RestoreStatusChoice`) and the first-run block are behind `@defer`. Each step records the
   bundle. A step that would still cross the ceiling stops and asks; the ceiling is not raised.
4. **Before:** export `44e7e9e`, the slice-78 closing commit, outside `apps/e2e/`, and link
   `node_modules`. Build it with `ng build` into `apps/e2e/ux-output/slice79-baseline-web/`, served
   from its `browser/` folder as `slice78.config.ts` serves its baseline. Then run
   `UX_BEFORE=44e7e9e pnpm --filter @cwm/e2e exec playwright test --config ux/slice79.config.ts`.
   **After:** run the same config without `UX_BEFORE` on the slice's final build. Then run
   `node docs/roadmap/70-ui-ux/tooling/build-sheet.mjs <before> <after> <output> <after> --profile 79`.
   Profile 79:
   - **Joins the general checks keyed to profiles 77 and 78** in `build-sheet.mjs`. Stage 0 lists
     each line; the survey found lines 11, 60, 168, 177, 304, 345, 348 and 365. It also wires the
     panel-relative Lab gate's panel selection at lines 84–91, without which profile 79's
     `labAfter` would be `null`. It carries profile 78's sidebar re-anchor (line 70), because the
     archived-only context changes the sidebar's text. Line 124 is a profile-specific branch
     (`objectCell` / `stateExempt`), so profile 79 adds its own exempt-cell set there, and an
     equivalent of line 271's geometry branch for those cells. It also needs the usage text
     (line 16), its report fields (line 876), and its own sheet writer like lines 1051–1083.
     Without that writer it would fall through to the generic `index.html` (line 986). That keeps
     profile 78's general rules:
     - the full control census with only slice 72's breadcrumb exception;
     - any axe node absent from the same cell before fails (`color-contrast` is reported only);
     - a must-not-change cell whose controls move more than 1 px fails;
     - every Visual acceptance pair must be present;
     - the panel-relative Lab gate.
   - **Does not carry** profile 78's slice-specific state table, pin rules or T12 rule.
   - **Reads `empty-archived-verification.json`'s context table** (Test plan) and fails on any
     rule there.
   - **Changing matrix cells.** Only these may change, and each is named in
     `build-sheet.test.mjs`:
     - `empty-dashboard` (first run);
     - `kitchen-archived` (Legacy attic is read-only with the banner);
     - `kitchen-archive-confirm` (Kitchen has a live Cabinets, so its confirmation becomes the
       blocked form);
     - `archive` (the restore choice on Legacy attic's row). `settings-archived-projects` is an
       agent-heavy cell with an empty list, so it must **not** change. Settings' restore choice is
       captured on nested-projects, whose Legacy attic is the only archived project in any seed
       (`seeds.ts:457`);
     - every `/app` cell whose Demo dashboard has a non-empty `today.overdue`, which Stage 0 lists
       from the data. That covers `<seed>-dashboard`, and the nested-projects `dev-panel`,
       `new-project` and `phone-menu` cells if that dashboard has overdue tasks
       (`matrix.ts:9,15`). This is the overdue list (Open question 1, answered (a)).
   - **Task List cells.** Every cell holding a Task List is gated with one allowance: the count's
     text node in the frame header. A control that moves or resizes more than 1 px still fails.
   - **Lab panels** named as changing by id: `state-messages` (empty and archived specimens) and
     `section-frame` (the header count). No other cell or panel is exempt.
   - **Result:** zero gate failures. Capture ports are never 4200 or 4310 (use 4257 and 4357). At
     most two browser jobs run at once.
5. `ux/empty-archived-verification.ts`, in the same config, records two things before and after:
   - T01–T09, T11 and T12, through `ux/tasks.ts`;
   - the contexts listed under Capture scope, plus a Lab row with every panel's box.

   T01's after run presses the main column's New project; its before run presses the sidebar's.
   Each locator is scoped, so two "New project" buttons never trip strict mode. The after costs
   must not exceed the slice-78 after counts below, measured in `apps/e2e/ux-output/7925bbe…/tasks/tasks.json`.
   That folder is git-ignored and absent from a fresh clone, so profile 79 holds the table as
   constants in `build-sheet.mjs`, pinned by `build-sheet.test.mjs`, rather than reading it:

   | T01 | T02 | T03 | T04 | T05 | T06 | T07 | T08 | T09 | T11 | T12 |
   |---|---|---|---|---|---|---|---|---|---|---|
   | 2 / 16 | 3 / 19 | 10 / 38 | 1 / 0 | 2 / 0 | 2 / 16 | 3 / 0 | 3 / 0 | 1 / 0 | 1 / 0 | 1 / 0 |

   Each cell is clicks / keystrokes, all with zero dead ends. T10 is excluded, as in profile 78.
   Stage 0 confirms that T09's `button(/^Restore /).first()` (`tasks.ts:124`) still meets
   Legacy attic's row, since the seed also archives a section and a task (`seeds.ts:512-547`). T09 restores Legacy attic's archived
   item from Archive. Active is preselected (Open question 2 (a)), so T09 stays at 1 click.
6. **MCP.** One additive output change, from Q7: for an **archived root**, `get_project_todos`
   and `get_project_journal` answer `items: []` plus `hiddenItemCount`, and their descriptions
   say so. A live root's answer is unchanged, with no `hiddenItemCount`. No tool is added or
   removed, and no input schema or permission changes. The existing `contract.test.ts` cases,
   `handler.test.ts` and `stdio.test.ts` read live roots and pass unedited. One new
   `contract.test.ts` case proves the count crosses the tool boundary on an archived root.
7. **Real use**, on nested-projects, empty and overdue-chaos, in three modes: 1440 with mouse,
   1440 keyboard only, and 375 touch. Exercise:
   - first run on `empty`;
   - archive the only project and read the sidebar;
   - open Legacy attic, Legacy shelving and an archived root, try to edit, then restore from the
     banner; Undo it on the archived root, and see Legacy attic's Undo refused;
   - Archive Kitchen and follow the Cabinets link;
   - restore from Archive and from Settings;
   - follow the digest's overdue line;
   - type a Markdown draft, then Cancel, navigate away and Edit again; Discard it; Preview;
   - read a Task List's count and start a drag.

   Record friction in `.prototype/notes.json` (`CURRENT_SLICE` = 79).
8. The user accepts the sheet at Gate 2.

## Capture scope

**Must change.** Both themes, 1440 and 375, unless a row says otherwise. Fixtures are set up
through the host API in the rig, never by editing seeds.

- **First run.** The `empty` seed's Home, as Demo, Alex (light) and Sam (dark), the personas
  W4-001 names; Stage 0 confirms that `empty` carries all three. After pressing the main-column
  New project: the creation form focused, with the Menu open at 375.
- **Archived only.** The `empty` seed with one project created and then archived: the sidebar,
  with the Menu open at 375, and Home, which is not first run. Before archiving, the rig turns on
  that project's Todos and Reflections pages through the host API. Its Todos and Reflections
  pages are then captured too, at 1440 light only. This is the one archived root with nothing
  hidden, so it proves Q7's ordinary-sentence branch (`hiddenItemCount` 0). A Reflections page
  turned on through the toggle has no container section, so the page may also show its existing
  "This page has no Reflections container yet." That is true and unchanged; the Q7 rule reads only
  `data-reflections-empty`.
- **Read-only pages:**
  - nested-projects Legacy attic (`/projects/project-legacy`), an archived workstream;
  - Legacy shelving (`/projects/project-legacy-child`), live under an archived ancestor;
  - Home renovation archived as a root, after the rig archives Cabinets, Kitchen, Garden and
    Legacy shelving. Its Home canvas, its Todos and its Reflections page are captured, with their
    hidden-count sentences. Its own six live tasks and three reflections are hidden; Kitchen's,
    Garden's and the rest stay archived after a restore and do not count (`seeds.ts:521-545`,
    `:564-581`). Stage 0 confirms both numbers from the data. So is its
    Archive page, with the reworded note. The Kitchen page under it shows the "archived, and so is"
    banner.
  - the empty canvas of an archived page.
- **Restore from the banner.**
  - Legacy attic after pressing Restore: the banner is gone, focus is on the project name, and
    pressing the header's Undo gives the existing transition refusal, because Legacy shelving is
    live.
  - Legacy shelving after restoring Legacy attic: no banner. Its toast offers Undo and Open owner.
  - Home renovation, archived as a root with nothing live under it: Restore, then the header's
    Undo, and the banner is back.
  - A banner restore failing (500), with Details closed and open.
- **Archive confirmation.** nested-projects Kitchen (live Cabinets) and Home renovation (live
  Kitchen and Garden) show the blocked form. A workstream with no live children, such as Cabinets,
  shows the commit form.
- **Late refusal.** Cabinets' header (no live children in the tree, so the commit form shows)
  after an archive refused with `rule_violation`, injected by `route.fulfill`; anything that
  passes through uses `route.fallback()`, never `route.continue()`. With Details closed and
  open.
- **Restore choice.** The Archive row (nested-projects, Legacy attic's row) and Settings ›
  Archived projects (nested-projects, Legacy attic), each before and after choosing.
- **Digest.**
  - overdue-chaos Home as Demo, and busy-week Home.
  - Sam (digest only) after the rig creates, as Sam through the host API, the finding's own
    repro, on overdue-chaos: a project with a task due 2026-08-20. Sam has no project in any
    seed (Alex has one, "Alex private plan" on nested-projects, `seeds.ts:465-466`), so Sam
    otherwise sees first run.
  - The owner section reached from a listed overdue task.

  First run is also what Alex and Sam see in almost every seed. That is true, and intended.
- **Markdown.** All on nested-projects Kitchen:
  - the editor with a draft;
  - after Cancel then Edit (the draft is back, with Discard draft);
  - after navigating to Cabinets and back, then Edit;
  - after Discard draft;
  - Preview with its caption.
- **Task List count.** nested-projects Kitchen and agent-heavy's dense list: the frame header with
  the count; a shortcut Task List's header.
- **Drag.** A Task List row just after `cdkDragStarted`, at 1440 only (touch drag is not
  captured). The rig records the first row's top before and after drag start.
- **Todos write pending.** Live Home renovation's Todos with a completion held pending by a
  delayed route (`route.fallback()` after the delay): `aria-disabled`, no native `disabled`
  (before: `[disabled]="writesBlocked()"`, `todos-page.html:60,107`). Both look alike at rest,
  since `_controls.scss:409-411` styles `:disabled` and `[aria-disabled='true']` with one rule, so
  the rig holds Cabinets' completion (the PATCH for `project-cabinets`) pending, focuses
  **Kitchen's** title link (`data-todo-link`) and presses Shift+Tab. The pending row itself has no
  Complete: completion is optimistic (`todos-page-store.ts:206`), and a completed workstream is
  finished (`:18-22`), so Complete no longer renders (`todos-page.html:55`). But `writesBlocked()`
  disables every row's Complete and Delete while any write is pending, and Kitchen is still
  unfinished (Garden is completed, `seeds.ts:447-452`). Before, focus skips Kitchen's disabled
  Complete; after, it rests on Kitchen's `aria-disabled` Complete with its focus ring. 1440 light
  only.
- **Lab.** The `state-messages` and `section-frame` panels, and the new stories.

**Gated within the change:**

- Every banner Restore control, Discard draft, the overdue link, the first-run New project and
  each blocked-confirmation link pass the target census: 24 px, or 44 px on touch.
- The banner sits inside the workspace track, under the header, never over the canvas's first
  section.

**Must not change** beyond 1 px of control geometry, outside the cells and panels named in
Acceptance item 4:

- every populated page and section of a live project;
- the project header's layout;
- the sidebar tree;
- the task drawer, the toast and the creation dialogs' chrome;
- Archive's and Settings' failure and stale forms.

Task List frames may change only their header's count text. On live projects, the canvas keeps
every control it had.

## Visual acceptance

| Pair (before → after) | Seed, size, theme | Findings |
|---|---|---|
| Empty Home: seven "Nothing…" cards, small sidebar + → first-run block with New project | empty: Demo 1440 light and 375 dark; Alex 1440 light; Sam 375 dark | W1-001, W4-001, L4-020 |
| Main-column New project pressed → the creation form focused (Menu open at 375) | empty, 1440 dark, 375 light | W1-001 |
| Sidebar, archived only: "No projects yet" → "No active projects." + Settings link | empty + archived fixture, 1440 dark, 375 light | W4-034 |
| Legacy attic: full-weight header, accent "Add a section" → banner with Restore as, no add action | nested-projects, 1440 light, 375 dark | L1-028, L4-007 |
| Home renovation archived: live Add task, Edit, drag and delete → read-only sections under the banner; its Todos and Reflections pages: "There is no work under this project yet…" and "No reflections yet." → "Restore to view 6 hidden todos." and "Restore to view 3 hidden reflections." | nested-projects (rig), 1440 dark | L4-007 (Q7) |
| Legacy shelving under archived Legacy attic: fully editable → banner naming Legacy attic, read-only | nested-projects, 1440 light | L4-007 |
| Banner restore and Undo: Home renovation archived → restored, then header Undo → banner back; Legacy attic's Undo pressed → the transition refusal | nested-projects (rig), 1440 dark | L4-007 |
| Todos write pending (Cabinets' completion held), after Shift+Tab from Kitchen's title link: focus skips Kitchen's native-`disabled` Complete → focus ring on its `aria-disabled` Complete | nested-projects Home renovation (live, delayed completion), 1440 light | carried (slice 75) |
| Archive Kitchen: commit offered → blocked form naming Cabinets as a link, Close only | nested-projects, 1440 dark, 375 light | L4-008 |
| Late archive refusal: "Couldn’t archive … Try again." → "still has live workstreams. Archive them first." + Details | nested-projects, 1440 light | L4-008 |
| Restore choice: Archive's lowercase preselected select and Settings' "Choose status" → one control | nested-projects Archive and Settings, 1440 light | L4-012 |
| Digest overdue line with nothing to follow → the overdue tasks listed as links under it, at most five, then "and N more overdue" (Q1 (a)) | overdue-chaos with the rig's Sam fixture, as Sam, 1440 dark, 375 light | W4-028 |
| Markdown Cancel, then Edit: saved text → draft back with Discard draft | nested-projects Kitchen, 1440 light | L3-012 |
| Markdown navigate away and back, then Edit: saved text → draft back | nested-projects Kitchen, 1440 dark | L3-012 |
| Markdown Preview: only `aria-pressed` → "Unsaved preview" caption | nested-projects Kitchen, 1440 light, 375 dark | W4-031 |
| Task List header: no count → "N tasks" | agent-heavy dense list, 1440 light; Kitchen, 375 dark | L4-023 |
| Drag start: the list drops by the hint's height → rows hold, hint over quick-add | nested-projects Kitchen, 1440 dark | carried (note-2026-10-22-002) |

## Behaviour vs. appearance

**Behaviour changes**, so §77 applies: the tests, the implementation and the docs change together.

- **Behaviour.**
  - Read-only pages under an archived project or ancestor: controls are absent, and task rows are
    static (Open question 5 (a)).
  - The banner's restore writes a status through the existing project update.
  - Collapse on read-only pages toggles locally, unsaved (Open question 4 (a)).
  - The Archive confirmation's blocked form.
  - The late refusal's sentence and the descendants re-read after it.
  - One restore choice, preselecting Active (Open question 2 (a)).
  - `ShellStore`'s unfiltered list read and `hasArchived`; the sidebar's archived-only wording.
  - The first-run block and `requestCreate`.
  - The digest's overdue link.
  - Markdown drafts kept and offered, Discard draft, and the Preview caption.
  - The Task List count.
  - Todos' pending `aria-disabled`; the task checkbox, Complete and Delete are absent when
    read-only.
  - The archived root's Archive note points at the banner.
  - An archived root's Todos and Reflections pages say "Restore to view N hidden todos." (or
    reflections) when work is hidden, and keep the ordinary empty sentence when none is (Q7).
  - The Todos and journal results carry `hiddenItemCount` for an archived root, over HTTP and MCP
    (Q7, step 6a).
  - The banner's owner write (`restoreOwner`) and its failure in the banner.
- **Not behaviour.**
  - The host, persistence and seeds do not change. The domain, contracts and MCP tools change
    only by Q7's `hiddenItemCount`, an optional field present only for an archived root. No
    rule, refusal, write, input or permission changes.
  - No write path's commit, history, Undo or toast changes.
- **Appearance.** The empty and archived `.state-message` variants, the banner, the first-run
  block, the restore choice's casing, the drag hint as an overlay, the header count and the
  Preview caption.
- **Specs that change with it.** Stage 0 greps every selector and string below across unit and e2e
  specs, and lists each hit here before editing it. Known now:
  - **Sidebar and first run.**
    - unit: `sidebar.spec.ts:117,121-125,149`, `app-shell.spec.ts:60,81`,
      `shell-store.spec.ts` (the list call's arguments), `design-lab-page.spec.ts:108-130`, and
      `dashboard-page.spec.ts:164,176,193`;
    - e2e: `web.spec.ts:30`, `project-creation-history.spec.ts:69` and `states.spec.ts:170`, if
      they now meet the first-run block or the new wording.
  - **Archive confirmation and refusal:** `project-archive-confirm.spec.ts`,
    `project-header.spec.ts:100,134,238-250`, `project-workspace-shell.spec.ts:1201-1235` and
    `project-workspace-store.spec.ts:971`. In e2e: `lifts.spec.ts:91,158-162`,
    `feedback.spec.ts:165`, `web.spec.ts:403-405` and `project-history.spec.ts:288-294`, each
    re-checked for whether it archives a project that has live children.
  - **Restore:**
    - unit: `archived-region.spec.ts:164-210,313`, `archive-page.spec.ts:198,248` and
      `archived-projects-page.spec.ts:52,65,85,125,139,161,192-208`;
    - e2e: `archive.spec.ts:125-128,597` and `archived-projects.spec.ts:51,66,112,138`.
  - **Hidden count (Q7):** `project-todos-service.test.ts:342` ("answers an archived root with
    no content at all", `toEqual({ projectId, items: [] })`) and
    `project-journal-service.test.ts:143` (its archived-root `items` assertion) are amended, since
    the intent changed (§77). `reflections-page.stories.ts:91`'s `archivedJournal` (a live root
    whose one entry has an archived subject) is left alone; new archived-root stories are added.
  - **Archived pages:**
    - unit: `project-canvas.spec.ts`, `project-section-frame.spec.ts`, `shortcut-frame.spec.ts`,
      `archive-page.spec.ts` (the archived-root note), `archived-region.spec.ts`,
      `task-list-section.spec.ts`, `todos-page.spec.ts:230,282,356,406-412,503-532` and
      `reflections-page.spec.ts:234`;
    - e2e: `web.spec.ts:97` and any spec that edits Legacy attic or Legacy shelving.
  - **Markdown:** `markdown-source-editor.spec.ts` and `markdown-section-body.spec.ts`. In e2e,
    `canvas-editing.spec.ts:127-167,266,845,951` and `section-edit-undo.spec.ts:181` are re-checked
    for a Cancel that then expects the saved text on the next Edit.
  - **Drag hint:** `objects.spec.ts:108` (text unchanged; placement may be asserted).
  - **Digest:** `dashboard-page.spec.ts:54,146`. The digest's rows carry `data-digest-overdue`,
    never `data-widget-task`, so `objects.spec.ts:41`'s title-filtered `[data-widget-task]`
    locator stays unique and the spec stays unedited. Stage 0 re-checks it.
  - **Evidence:** `apps/e2e/ux/tasks.ts` (T01's scoped locator).
  - **Guides:** `docs/guides/first-milestone-walkthrough.md` (see the change list).
- **Stay green unedited:** `phone-layout.spec.ts`, `removal-undo.spec.ts`,
  `task-interaction.spec.ts`, `mcp.spec.ts`, `todos.spec.ts`, `reflections.spec.ts`, every host
  and MCP test (`handler.test.ts`, `stdio.test.ts` and the existing `contract.test.ts` cases
  included), every domain and contracts test other than the two named under Hidden count, and
  every spec the Stage 0 grep does not list. Frozen evidence scripts of completed slices are not re-run.

**Stage 0 inventory (2026-11-04, S79S0).** The grep above, run against `032cf84`, with every hit.
"Known" lines that still hold are marked ✓; the rest are new or moved.

- **Sidebar and first run.**
  - unit: `sidebar.spec.ts:117,121,125,149` ✓, and `:309` (New project focuses the name field) and
    `:337` (New project with the group collapsed), which stay; `app-shell.spec.ts:60,81` ✓ and
    `:316` (the drawer stays open for New project); `shell-store.spec.ts:101-108` ("asks for every
    project status except archived"), the list call step 8 replaces; `design-lab-page.spec.ts:109-130`
    ✓ ("No projects yet" at `:113`); `dashboard-page.spec.ts:176,193` ✓ (`data-dashboard-empty`).
    `dashboard-page.spec.ts:164` is `[data-widget-empty]` counting four, not the dashboard hook;
    step 8 re-checks it, since the first-run block sits above the widgets.
  - e2e: `web.spec.ts:30` ✓ (and its comment at `:23-24`), `project-creation-history.spec.ts:69` ✓
    and `:78`, `states.spec.ts:170` ✓ and `:181`, and `primitives.spec.ts:20` (375 touch: the
    sidebar's New project focuses a labelled name field), which stays.
- **Archive confirmation and refusal.**
  - unit: `project-archive-confirm.spec.ts:34,43` ✓, `project-header.spec.ts:100,134,238-250` ✓,
    `project-workspace-shell.spec.ts:1201-1235` ✓ (the domain's refusal text at `:1203`), and
    `project-workspace-store.spec.ts:971` ✓ ("Couldn’t archive “Home renovation”. Try again.").
  - e2e, by what each archives: `lifts.spec.ts:91,158-163` archives **Home renovation, which has
    live Kitchen and Garden**, so step 7's blocked form removes its commit and this spec changes;
    `feedback.spec.ts:164-165` and `project-history.spec.ts:288-294` archive Garden (no children)
    and `web.spec.ts:403-405` a fresh root, so all three stay. No e2e spec asserts
    "Couldn’t archive".
- **Restore.**
  - unit: `archived-region.spec.ts:164-200,209,313`, `archive-page.spec.ts:198,248` ✓,
    `archived-projects-page.spec.ts:52,65,85,125,139,161,192-208` ✓ (and `:203`).
  - e2e: `archive.spec.ts:126-128,597` ✓, `archived-projects.spec.ts:51,66,112-115,138` ✓ and
    `:167,175,181,210`. Every `selectOption` passes a lowercase enum value, so those stay green if
    `RestoreStatusChoice` keeps the values and the row hooks (`data-archived-project-status`,
    `data-archived-status`, `data-archived-restore`); only the labels and Settings' empty default
    change. No spec says "Restore as" or "Choose status".
- **Hidden count (Q7).** `project-todos-service.test.ts:342` ✓, `project-journal-service.test.ts:143`
  ✓ (its neighbours `:108` and `:139`, on a live root's hidden-by-ancestor entries, stay), and
  `reflections-page.stories.ts:91` ✓ (used at `:126`).
- **Archived pages.**
  - unit: `project-canvas.spec.ts:318,1243-1248`, `project-section-frame.spec.ts:48,73` (a
    `readOnly` stub), `shortcut-frame.spec.ts:57,108-110,130,136,183-190`, `archive-page.spec.ts:198`
    (the only archived-root note hit), `task-list-section.spec.ts:73,85,405,910`,
    `todos-page.spec.ts:230,281-285,356,406-413,425-426,503,532`, `reflections-page.spec.ts:232-236`.
  - e2e: `web.spec.ts:97` ✓, `:114-115` and the Legacy restore at `:211-224`;
    `project-history.spec.ts:45-46` (visits both Legacy pages) and `:305-307` (renames Legacy
    shelving through the API, then the page's Undo is refused). Steps 4–5 re-check these two; the
    header and its history stay on read-only pages.
- **Markdown.** Two specs assert the behaviour step 10 changes, so they change with it (§77):
  `canvas-editing.spec.ts:150-157` (Cancel a draft, then Edit expects the saved source) and
  `markdown-section-body.spec.ts:63-67` ("a reopened editor starts from stored source"). Also read:
  `markdown-section-body.spec.ts:56-61,92-96,114-117,169-185` and `markdown-source-editor.spec.ts:15-51`.
  `canvas-editing.spec.ts:266,845,951` and `section-edit-undo.spec.ts:181` only Save, and stay.
- **Drag hint.** `objects.spec.ts:108` ✓, `:109` and `:114`.
- **Digest.** `dashboard-page.spec.ts:54,144-148`; `objects.spec.ts:41` ✓ is title-filtered
  `[data-widget-task]`. `data-digest-overdue` does not exist yet, as expected.
- **Todos.** `todos-page.html:60,107` ✓ (`[disabled]="writesBlocked()"`); the toggle at `:51` is
  already `aria-disabled`. `todos-page.spec.ts:407,412,425` assert `.disabled` and change in step 6.
  No e2e spec asserts it.
- **Write-control selectors.** All 25 in the gate's list exist in `apps/web/src`.

**Stage 0 checks.**

- **Save is primary** at L3-012's size (1440×900, both themes): in the before capture's
  `markdown-draft` rows, Save alone has `button--primary` and the accent fill (`rgb(31, 79, 208)`
  light, `rgb(255, 173, 127)` dark); Preview is ghost and Cancel secondary. Recorded as closed.
- **Overdue cells (Q1 (a)).** The Demo dashboard's `today.overdue` at `SEED_NOW`: busy-week 1
  ("Verify analytics events"), overdue-chaos 4, agent-heavy 1 ("Triage the overnight agent
  errors"); empty, personal-workspace and nested-projects 0. So the changing cells are
  `busy-week-dashboard`, `overdue-chaos-dashboard` and `agent-heavy-dashboard`, each at both themes
  and 1440, 1024 and 375 (18 cells). The nested-projects `dev-panel`, `new-project` and
  `phone-menu` cells do **not** change. No seed has more than five, so "and N more overdue" is
  proved by `daily-digest-widget.spec.ts` only.
- **Personas.** `empty` carries Demo, Alex and Sam, each with no project.
- **Hidden numbers.** With Cabinets, Kitchen, Garden and Legacy shelving archived, live Home
  renovation's Todos answer 6 items and its journal 3; archived, both answer `items: []`.
- **T09.** `button(/^Restore /).first()` still restores Legacy attic ("Restored Legacy attic as
  Active."), at 1 click.
- **T01.** Scoped in `ux/tasks.ts`: `app-dashboard-page [data-first-run-create]` where the build has
  it, else `app-sidebar`'s New project; the surface is recorded as Home or Sidebar.
- **Bundle.** 1,140.75 kB initial (1.14 MB, budget warning 290.75 kB over 850 kB) for both
  `44e7e9e` and the working tree.

## File-level change list

Paths are under `apps/web/src/app/` unless stated. "(+ spec)" means the colocated spec, and
"(+ stories)" the colocated stories, change with the file.

**Shared foundations**

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/styles/_controls.scss` | modify | `.state-message--empty` (sentence plus optional action) and `.state-message--archived` (banner weight), tokens only |
| `shared/projects/restore-status-choice.{ts,html}` (+ spec, stories) | create | "Restore as" select with one option list and casing, Active preselected and visible (Q2 (a)), and Restore; emits `restore(status)`; `aria-disabled` while pending; takes `ProjectRestoreStatus` from contracts; a `subjectLabel` input gives Restore the accessible name `Restore <label>`, as `restoreActionAriaLabel` does today (`archived-region.ts:196-200`), so T09's `button(/^Restore /)` and its exact-label check (`tasks.ts:119-121`) still hold |
| `prototype/design-lab/panels/primitive-panels.html` (+ `design-lab-page.spec.ts`) | modify | Empty and archived specimens in `state-messages` |
| `prototype/design-lab/panels/live-panels.html` (`data-panel="section-frame"`) | modify | Header count specimen |

**Shell, sidebar and Home**

| File | Change | Responsibility |
|---|---|---|
| `core/shell/shell-store.ts` (+ spec) | modify | Unfiltered list split into tree and `hasArchived`; an `answered` flag; `workspaceEmpty` |
| `core/shell/shell-commands.ts` | create | The `ShellCommands` interface and `SHELL_COMMANDS` token: `workspaceEmpty` and `requestCreate()`, provided by `AppShell` as itself, so pages never inject `ShellStore` (its cases are in `app-shell.spec.ts`; Revisions, step 8) |
| `core/shell/app-shell.ts` (+ spec) | modify | Provide `ShellCommands`, feed `workspaceEmpty`; on `requestCreate`, open the Menu when narrow and call `sidebar().reopenCreate()` after the drawer's focus move |
| `core/shell/sidebar/sidebar.{ts,html}` (+ spec; `sidebar.stories.ts` create) | modify | Archived-only wording and link, `hasArchived` input, `.state-message--empty` |
| `features/dashboard/dashboard-page.{ts,html,scss}` (+ spec; `dashboard-page.stories.ts` create) | modify | First-run block from `ShellCommands.workspaceEmpty()`; its New project (`data-first-run-create`) calls `requestCreate()`; above the widgets (Q3 (a)); mounted behind `@defer (when workspaceEmpty())` (Q6 (a)) |
| `app.routes.ts` (+ spec) | modify | `calendar` and `settings/agents` load with `loadComponent` (Q8 (a)); the "eager on purpose" comment names them |
| `features/dashboard/widgets/daily-digest/daily-digest-widget.{ts,html}` (+ spec), `widgets/widget-content.scss` | modify | Up to five overdue tasks listed under the prose, each linking to its owner section, then a muted "and N more overdue" (Q1 (a)) |
| `features/dashboard/widgets/task-origin-link.ts` (+ spec) | create | The owner-section link Today's rows build inline (`today-widget.html:9-18`), extracted so the digest uses the same rule |
| `features/dashboard/widgets/today/today-widget.{ts,html}` | modify | Use `task-origin-link.ts`; no visible change |

**Archived pages and Archive**

| File | Change | Responsibility |
|---|---|---|
| `features/projects/project-workspace-store.ts` (+ spec) | modify | `archivedOwner`, `readOnly`, `liveChildren` for the current project, `restoreOwner` (inside `whileWriting`, its own `restoreFailure` for the banner), `projectWriteSentence` with the code, descendants re-read after a refusal |
| `features/projects/project-page-contract.ts` | modify | `readOnly` in `ProjectPageRendererInputs` (`:14`, beside `restoreBlocked`) and in the `ProjectPageRenderer` interface every typed renderer implements (`:39-49`) |
| `features/projects/project-workspace-shell.{ts,html}` (+ spec) | modify | Banner placement, `rendererInputs.readOnly`, `liveChildren` to the confirmation |
| `features/projects/archived-banner.{ts,html,scss}` (+ spec, stories) | create | The banner sentence for own, ancestor and archived-twice cases, its failure, and the `RestoreStatusChoice`; mounted behind `@defer (when readOnly())` (Q6 (a)) |
| `features/projects/project-archive-confirm.{ts,html}` (+ spec; `project-archive-confirm.stories.ts` create) | modify | `liveChildren`; blocked form with links, statuses and Close only |
| `features/projects/project-header.{ts,html}` (+ spec) | modify | Pass `liveChildren` to the confirmation it renders |
| `features/projects/pages/archive-page.{ts,html}` (+ spec, stories) | modify | Declare `readOnly`; the archived-root note points at the banner |
| `features/projects/project-canvas.{ts,html}` (+ spec, stories) | modify | No insertion, add, drag or resize when read-only; the inline unknown-section frame (`project-canvas.html:145-161`) drops `data-unknown-section-drag-handle` and `data-unknown-section-remove`; archived empty canvas sentence |
| `features/projects/sections/section-frame/project-section-frame.{ts,html}` (+ spec) | modify | Read-only frame: no rename, settings, remove or drag handle; `readOnly` to content; collapse stays and toggles a local, unsaved state from the stored one (Q4 (a)); renders `reportSummary` |
| `features/projects/shortcuts/shortcut-frame.{ts,html}` (+ spec) | modify | Read-only frame: no drag handle or remove; collapse toggles locally, unsaved (Q4 (a)); renders `reportSummary` |
| `features/projects/sections/section-contract.ts`, `sections/registry.ts` (+ spec) | modify | `reportSummary` passed only to types marked `summary: true` (Task List) |
| `features/projects/sections/tasks/task-list-section.{ts,html,scss}` (+ spec; `task-list-section.stories.ts` create) | modify | Archived read-only rows (static, Q5) distinct from the shortcut flavour; the count; drag hint as an overlay |
| `features/projects/pages/todos-page.{ts,html}` (+ spec, stories) | modify | `readOnly` hides the task checkbox, Complete and Delete; pending uses `aria-disabled`; in `data-todos-empty`, "Restore to view N hidden todo(s)." when the store's `hiddenCount()` is above 0, else the ordinary sentence (Q7); a new archived-root story (`items: []`, `hiddenItemCount: 6`) |
| `features/projects/pages/todos-page-store.ts` (+ spec) | modify | `hiddenCount`, read from the result's `hiddenItemCount` (0 when absent) beside `itemsState` (`:416`) |
| `features/projects/pages/reflections-page.{ts,html}` (+ spec, stories) | modify | Declares the renderer's `readOnly` (root-only page; equal to its existing archived check); in `data-reflections-empty`, "Restore to view N hidden reflection(s)." when `hiddenCount()` is above 0, else "No reflections yet." (Q7); a new `ArchivedRoot` story (`items: []`, `hiddenItemCount: 3`), leaving `archivedJournal` (a live root's archived subject) as it is |
| `features/projects/pages/reflections-page-store.ts` (+ spec) | modify | `hiddenCount`, from the journal result's `hiddenItemCount` (0 when absent), beside `items` (`:71`) |
| `features/projects/archived-region/archived-region.{ts,html}` (+ spec) | modify | Use `RestoreStatusChoice` |
| `features/settings/archived-projects/archived-projects-page.{ts,html}`, `archived-projects-store.ts` (+ specs, stories) | modify | Use `RestoreStatusChoice` |

**Hidden count (Q7, step 6a).** Paths from the repository root.

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/project-todos.ts`, `project-journal.ts` (+ `index.test.ts`) | modify | Optional `hiddenItemCount` (non-negative integer) on `ProjectTodosResultSchema` and `ProjectJournalResultSchema`, documented as present only for an archived root: how many items the read would list once the root is restored, never the items |
| `packages/domain/src/project-todos-service.ts` (+ test) | modify | For an archived root, run the same derivation with the root counted as live in an in-memory view of the project list (nothing written), and answer `{ projectId, items: [], hiddenItemCount }`; a live root's answer is unchanged; both grants still asserted before any read |
| `packages/domain/src/project-journal-service.ts` (+ test) | modify | The same for `journal`; `completedWork` is unchanged |
| `apps/web/src/app/core/gateway/prototype-work-manager-gateway.spec.ts` | modify | One parse case for each result carrying `hiddenItemCount`; the gateway itself is unchanged |
| `packages/mcp-tools/src/tools/project-pages.ts` (+ `contract.test.ts`) | modify | `get_project_todos` and `get_project_journal` descriptions: an archived root answers no rows, only `hiddenItemCount`, the rows restoring it would bring back |

**Markdown**

| File | Change | Responsibility |
|---|---|---|
| `features/projects/sections/markdown/markdown-draft-store.ts` (+ spec) | create | In-memory `{ draft, base }` by section id: `keep`, `take`, `forget`; cleared on reload/reseed and persona switch |
| `features/projects/sections/markdown/markdown-section-body.{ts,html}` (+ spec) | modify | Keep on Cancel (from the emitted draft) and on destroy (through `viewChild`) when changed; offer on Edit with its base; forget on Save |
| `features/projects/sections/markdown/markdown-source-editor.{ts,html,scss}` (+ spec; `markdown-source-editor.stories.ts` create) | modify | `initialDraft` input; `cancelRequested` carries the draft; "Your unsaved draft is back." with Discard draft; the "Unsaved preview" caption |

**Evidence**

| File | Change | Responsibility |
|---|---|---|
| `apps/e2e/empty-archived-editing.spec.ts` | create | End-to-end journeys (Test plan) |
| `apps/e2e/ux/slice79.config.ts` | create | Before/after config, ports 4257/4357, data file `.prototype/ux-slice79.json` |
| `apps/e2e/ux/empty-archived-verification.ts` | create | `ROWS` context table, contexts, fixtures through the host API, T01–T12 through `tasks.ts` |
| `apps/e2e/ux/tasks.ts` | modify | T01's scoped New project locator, before and after |
| `docs/roadmap/70-ui-ux/tooling/build-sheet.mjs`, `build-sheet.test.mjs` | modify | Profile 79, its gate, exempt cells and panels, pairs and costs table |

**Documentation**

| File | Change |
|---|---|
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | §29 `SectionDefinition.summary`; §21 variants; §23 archived-only wording; §24 first run and the overdue link; §26 the archived header, banner and empty canvas; §30 drafts and the Preview caption; §31 restore from the page's banner as well as Settings, and the hidden count (an archived root's Todos and journal reads answer how much is hidden, never what); §34 count and drag hint, and the hidden count in its *Landed* note on `ProjectTodosService.derive`; §36 the journal's hidden count. Each correction is noted in its decision entry |
| `docs/decisions/2026-11-archived-pages-are-read-only.md` | create, with the banner, outermost owner and what stays, and the user's answers: collapse stays and toggles locally, unsaved (Q4 (a)); static Task List rows with no drawer (Q5 (a)); the archived root's Todos and Reflections pages say "Restore to view N hidden todos/reflections" when work is hidden and keep the ordinary empty sentence when none is, from the domain's `hiddenItemCount` (Q7, not the recommendation); records that agents see the same count through `get_project_todos` and `get_project_journal`, as the plan's own choice, and why (the archived page already renders its sections, §31) |
| `docs/decisions/2026-11-empty-workspace-offers-the-first-project.md` | create: first run, the sidebar's archived-only wording, and the block above the widgets, which stay below (Q3 (a)) |
| `docs/decisions/2026-11-digest-overdue-line-leads-to-the-tasks.md` | create: up to five overdue tasks under the prose, each linking to its owner section, then a muted "and N more overdue" (Q1 (a)) |
| `docs/decisions/2026-11-task-list-shows-its-count.md` | create: the header count and the hint overlay |
| `docs/decisions/2026-09-reactivating-under-an-archived-ancestor.md`, `2026-08-project-nesting-and-archive-rules.md`, `2026-09-actionable-archive-and-archived-projects.md` (Active preselected everywhere, Q2 (a); and the §31 hidden count, Q7), `2026-09-root-archive-recovery-guidance.md`, `2026-09-todos-chronology-and-canonical-navigation.md` and `2026-09-reflection-subjects-and-the-journal-feed.md` (the archived root's `hiddenItemCount`, Q7), `2026-08-initial-bundle-budget.md` (the ceiling held by `@defer`, Q6 (a); Calendar and Settings › Agents lazy, Q8 (a)), `2026-10-failures-speak-product-words.md` (the variants, the late refusal's code-based sentence), `2026-10-markdown-source-and-rendering.md`, `2026-10-feedback-stays-on-the-object.md`, `2026-10-rows-open-their-canonical-owner.md` | append dated `**Amended, 2026-11-…**` paragraphs; nesting rules gains its first amendment below its existing "Extended since" note |
| `docs/decisions/README.md` | index the four new entries, mark the amended ones |
| `docs/architecture/web/projects/{overview,why,what,how}.md` | read-only pages, banner, archive confirmation, restore choice, drafts, count, drag hint, the hidden-count sentences |
| `docs/architecture/contracts/what.md` | the derived read models row: Todos and journal carry `hiddenItemCount` for an archived root |
| `docs/architecture/domain/{what,how}.md` | `ProjectTodosService` and `ProjectJournalService`: an archived root answers no items and its hidden count |
| `docs/architecture/mcp-tools/what.md` | the Pages row: the two derived reads answer `hiddenItemCount` for an archived root |
| `docs/architecture/web/core/{overview,why,how,what}.md` | `ShellStore` list split, `hasArchived`, `requestCreate`, sidebar wording |
| `docs/architecture/web/dashboard/{overview,how,what,why}.md` | first run as a new responsibility, the digest's overdue list, `task-origin-link.ts` |
| `docs/architecture/web/tasks/{overview,how}.md` | the static `TaskRow` variant on archived canonical lists (`task-row.html:11`), the count and the drag hint |
| `docs/architecture/web/prototype-tooling/how.md` | Lab specimens |
| `docs/architecture/testing/how.md` | the new e2e spec and profile 79 |
| `docs/architecture/web/{overview,how,what}.md` | `shared/projects/` in the folder map; the Settings archived-projects page (`web/how.md:3`) uses the shared choice |
| `docs/guides/mcp-setup.md` | Lines 287–295 (`get_project_todos`) and 414–421 (`get_project_journal`): an archived root answers no rows and its `hiddenItemCount` (step 6a) |
| `docs/guides/first-milestone-walkthrough.md` | Lines 261–262 (the two tools) checked for the archived-root answer, and lines 82–87, 125–128 and 168–171: line 128's "a second draft's Cancel keeps the saved source" is reversed; the archived and restore steps follow the banner |

## Implementation sequence

Each step is sized for one fresh session and ends green with its docs in the same commit.

0. **Inventory and before.**
   - Run the Stage 0 grep under Behaviour vs. appearance and list every hit.
   - Confirm Save is primary at L3-012's size.
   - List the dashboard cells with overdue tasks.
   - Record the bundle.
   - Build the before from `44e7e9e`.
   - Write `slice79.config.ts` and `empty-archived-verification.ts`: fixtures, contexts, `ROWS`, and
     T01's scoped locator.
   - Capture the before. The after-only checks are recorded as absent.
1. **Profile 79, tests first.** Write the `build-sheet.test.mjs` fixtures that fail, then the
   profile's gate in `build-sheet.mjs`. Run it against before-against-before to prove the
   wiring.
2. **Foundations.** `.state-message` variants, `RestoreStatusChoice`, Lab specimens and stories.
3. **Restore one way.** Archive row and Settings adopt the choice. The step ends by running T09
   through `ux/tasks.ts` on nested-projects to show its locator and exact-label check still hold.
4. **Archived owner and banner.** Store `archivedOwner`, `readOnly`, `restoreOwner`, live and
   degraded cases, the banner, its shell placement, and the renderer input on every
   page.
5. **Read-only canvas.** Canvas, section, shortcut and unknown frames, the Task List's static rows,
   and collapse toggling locally, unsaved (Q4 (a)).

**6a. Hidden count (Q7), tests first.** Contracts' optional `hiddenItemCount`, the two domain
   services, the two MCP descriptions and the new `contract.test.ts` case, with the contracts,
   domain and mcp-tools docs, the §31, §34 and §36 notes and the three decision amendments for
   Q7. No web code, so no bundle change. Small enough to share a session with step 6 if it goes
   quickly; otherwise it is its own.

6. **Read-only pages.** Todos (with `aria-disabled` for pending) and the Reflections page, each
   with `hiddenCount` in its store and the hidden-count sentence or the ordinary one (Q7).
7. **Refusal first.** `liveChildren`, the blocked confirmation, the late refusal's sentence and
   the re-read.
8. **Empty workspace.** `ShellStore` split and `answered`, `ShellCommands`, sidebar wording, the
   first-run block.
9. **Digest overdue line**: up to five overdue tasks, then "and N more overdue" (Q1 (a)).
10. **Markdown.** The draft store, the body and editor, Discard draft, and the Preview caption.
11. **Count and drag hint.** `reportSummary`, both frames, the count, and the hint overlay.
12. **End to end.** `empty-archived-editing.spec.ts`, then full `pnpm e2e`, the Storybook build
    and the bundle.
13. **After and Gate 2.** After capture, sheet, AGENTS.md step 4 reviews, Gate 2, then real use
    (Acceptance item 7).

## Test plan — tests first

| Test | Proves |
|---|---|
| `shell-store.spec.ts`: one unfiltered list read; archived projects never reach the tree; `hasArchived` true with only archived projects; `workspaceEmpty` false while loading or failed, true only after an empty answer | W4-034, W1-001 inputs |
| `sidebar.spec.ts`: empty tree with `hasArchived` says "No active projects." with a link to `/settings/archived-projects` and never "No projects yet"; no archived and empty says "No projects yet"; loading and failure unchanged | W4-034; slice 78 kept |
| `app-shell.spec.ts`: `requestCreate()` opens the creation form with its field focused; at narrow width it opens the Menu first, and the name field still holds focus after the drawer's own focus move | W1-001 |
| `app-shell.spec.ts` (*AppShell — ShellCommands*): each `requestCreate()` reopens the one form; `workspaceEmpty` follows the shell's read (was `shell-commands.spec.ts`; Revisions, step 8) | W1-001 |
| `dashboard-page.spec.ts`: first-run block only when `workspaceEmpty()`; its New project calls `requestCreate()`; absent while loading, after a failure, and in an archived-only workspace | W1-001, W4-001, L4-020 |
| `task-origin-link.spec.ts`: the owner link Today and the digest share (route and fragment) | One link rule |
| `daily-digest-widget.spec.ts`: with overdue tasks, each is listed under the prose and links to its owner section, at most five plus "and N more overdue", each `data-digest-overdue`; with none, nothing is listed; a `null` digest keeps slice 78's failure and shows no overdue list, because the failure replaces the widget body | W4-028 |
| `project-workspace-store.spec.ts`: `archivedOwner` for an archived project, an archived root over a live child, and two archived levels (outermost wins); `null` for live; restore through the banner calls `projects.update(ownerId, {status})` and reports the receipt | L4-007 |
| `project-workspace-store.spec.ts`: `liveChildren` is the current project's non-archived direct children; a `rule_violation` on archive gives "“X” still has live workstreams. Archive them first." with the reason as `Failure.reason` and starts a descendants re-read; `unreachable` keeps "Couldn’t archive “X”. Try again." | L4-008 |
| `archived-banner.spec.ts`: own, ancestor and "archived, and so is" sentences name the right projects; Restore emits the chosen status for the owner; `aria-disabled` and `aria-busy` while pending; a failure renders in the banner with Details | L4-007, L1-028 |
| `project-workspace-store.spec.ts` (`restoreOwner`): restoring an ancestor never paints or replaces `projectState`, updates `ancestorsState`, re-reads descendants and reports a cross-owner receipt; restoring the page's own project updates `projectState`; `unreachable` gives "Couldn’t restore “Legacy attic”. Try again." in the banner, not the header; a `rule_violation` gives "Couldn’t restore “Legacy attic”. Something above it may have been archived." with Details and queues a refresh; a `not_found` gives "Couldn’t restore “Legacy attic”. It may have changed elsewhere." with no Try again and queues a refresh; the write count holds `restoreBlocked` while pending | Owner write |
| `project-workspace-store.spec.ts` (live and degraded): `restoreOwner` runs inside `whileWriting`, so a live frame during it defers `refreshContext`; on success it bumps `contextWriteEpoch`, so an older in-flight read cannot repaint the archived ancestor; a live frame archiving the project or an ancestor makes it read-only; a live restore clears it; a failed quiet refresh keeps the last `archivedOwner` and `liveChildren`; Kitchen archived under an archived Home renovation yields Home renovation first, then Kitchen after it is restored | Live changes; archived twice |
| `project-workspace-shell.spec.ts`: going read-only while the drawer is open closes it; an own-project banner restore moves focus to the project name heading and adds no toast; an ancestor restore moves focus to the heading and shows the cross-owner toast; in the archived-twice case focus lands on the banner's restore choice for the next owner | Live changes; feedback; focus |
| `markdown-section-body.spec.ts:179` (kept): read-only arriving mid-draft still blocks Save and permits Cancel, and Cancel now keeps the draft | §30 unchanged |
| `project-workspace-shell.spec.ts`: banner on every page of a read-only project and on none of a live one; `readOnly` reaches the renderer; header rename and Parent stay; the confirmation receives `liveChildren` | Placement; escape hatch |
| `project-archive-confirm.spec.ts`, `project-header.spec.ts`: with live children, no commit button, each child a link to its page with its status, following one closes the dialog, focus returns as today on Close; with none, the commit form unchanged; the header passes `liveChildren` through | L4-008 |
| `project-workspace-store.spec.ts` (`liveChildren`): a root's are the top level of `subprojectTree()` (Home renovation: Kitchen and Garden, not Legacy attic); a workstream's are its node's children (Kitchen: Cabinets); a stale tree with no live children shows the commit form, and the domain's refusal takes the late-refusal path | Root and workstream |
| `project-canvas.spec.ts`: read-only renders no insertion points, no end or empty-canvas add, no drag or resize; the archived empty canvas says "This page has no sections."; live unchanged | L4-007, L1-028 |
| `project-section-frame.spec.ts`, `shortcut-frame.spec.ts`: read-only frames have no rename, settings, remove or drag handle and pass `readOnly: true`; collapse stays, toggles the view without a section write, starts from the stored state and resets on re-render from a fresh read (Q4 (a)); `reportSummary` text renders after the name; live unchanged | L4-007 |
| `section registry spec`, `project-section-frame.spec.ts`: only a `summary: true` type receives `reportSummary`, and no section logs NG0303; at 375 a long name truncates and the controls keep their offsets | L4-023 |
| `task-list-section.spec.ts`: archived read-only rows are static with no Complete, Delete, drag or drawer, and say "No tasks." when empty; the shortcut flavour still links to its source; the count reports "N tasks" after a read, `null` while loading, after a failure or at zero; the drag hint overlays quick-add without changing the first row's offset | L4-007, L4-023, carried |
| `todos-page.spec.ts`: read-only, with rows supplied by the test (the domain returns none for an archived root), has no task checkbox, Complete or Delete; with no items and `hiddenCount` 6, `data-todos-empty` says "Restore to view 6 hidden todos.", with 1 "Restore to view 1 hidden todo.", and neither says "There is no work under this project yet"; with `hiddenCount` 0 (or absent) it keeps the ordinary sentence; while one workstream's completion is pending, another row's Complete and a task row's Delete carry `aria-disabled="true"` with a guarded click and no `disabled` attribute (the pending row's own Complete is gone, being optimistically completed) | Carried (slice 75) |
| `reflections-page.spec.ts:234` (kept): the composer is absent on an archived root; with no items and `hiddenCount` 3, `data-reflections-empty` says "Restore to view 3 hidden reflections.", with 1 "Restore to view 1 hidden reflection.", never "No reflections yet."; with 0 (or absent) it says "No reflections yet." | L4-007, Q7 |
| `todos-page-store.spec.ts`, `reflections-page-store.spec.ts`: `hiddenCount` follows the result's `hiddenItemCount`, and is 0 when the field is absent (a live root); after a banner restore, the refreshed live result drops it to 0; a failed read shows the failure, never a stale count sentence | Q7 |
| `prototype-work-manager-gateway.spec.ts` (`:984` area): a Todos and a journal result carrying `hiddenItemCount` parse and reach the caller unchanged | Q7; §11 |
| `project-todos-service.test.ts` (written first, step 6a): an archived root answers `items: []` and a `hiddenItemCount` equal to the item count the same tree answers once the root is restored; work archived in its own right, or under a separately archived workstream, is not counted; an archived root with nothing live answers `hiddenItemCount: 0`; a live root's answer has no `hiddenItemCount`; a missing grant is refused before any read, archived root included. The case at `:342` is amended to match (§77) | Q7; §31, §54 |
| `project-journal-service.test.ts` (step 6a): the same for `journal`: archived root, `items: []` and the count a restore would show; reflections under a separately archived workstream not counted; zero when none; absent on a live root; a missing `reflections.read` (or either other grant) refused before any read, archived root included; `completedWork` still `[]` for an archived root. The case at `:143` gains the count assertion | Q7; §31 |
| `contracts` `index.test.ts` (step 6a): both results parse without `hiddenItemCount` and with a non-negative integer, and refuse a negative or fractional count | Q7; §11 |
| `contract.test.ts` (step 6a, new case): on an archived root, `get_project_todos` and `get_project_journal` answer `items: []` with a `hiddenItemCount` above 0; both descriptions mention `hiddenItemCount` | Q7; MCP |
| `restore-status-choice.spec.ts`: one option list in one casing, default per Active preselected and shown before the press ("Restore as Active"), Restore emits the status, `aria-disabled` while pending | L4-012 |
| `archived-region.spec.ts`, `archived-projects-page.spec.ts`: both render `RestoreStatusChoice` with the same options and default, and restore through it as before; Settings' focus after a restore lands on the next row's choice | L4-012 |
| `archive-page.spec.ts`: on an archived root the note points at the banner, not Settings; `readOnly` is declared | §31 amended |
| `markdown-draft-store.spec.ts`: keep/take/forget `{ draft, base }` per section id; sections do not share drafts; `prototype.reloaded` clears every draft | L3-012; no stale drafts |
| `markdown-section-body.spec.ts`: Cancel with a changed draft keeps it, and the next Edit opens with it; unchanged Cancel keeps nothing; destroy while editing keeps a changed draft; Save success forgets it; a failed Save keeps the draft in the editor as today; a draft reopened after the saved source changed opens through `initialDraft` with its old `base`, so the "changed elsewhere" note shows; Discard draft returns to the current `source()` | L3-012; §30 live updates |
| `markdown-source-editor.spec.ts`: an offered draft shows "Your unsaved draft is back." and Discard draft, which restores the saved text and asks the store to forget; Preview shows "Unsaved preview"; Save is the only `button--primary` | L3-012, W4-031 |
| `design-lab-page.spec.ts`: the empty and archived specimens and the header count specimen | §63 |
| `apps/e2e/empty-archived-editing.spec.ts`: first run creates a project from the main column (1440 and 375); archiving the only project gives the archived-only sidebar; Legacy attic and Legacy shelving have no write controls; Legacy attic restores from the banner and its Undo, pressed, gives the transition refusal; Home renovation archived with nothing live restores from the banner, then the header's Undo puts the banner back; a banner restore failure shows in the banner; Archive Kitchen shows Cabinets as a link and no commit, and following it lands on Cabinets; a forced late refusal says what to do; Archive and Settings restore through the same control; the digest's overdue link reaches the overdue task; a Markdown draft survives Cancel and navigation and Discard draft drops it; a Task List header counts its rows; the first row holds still as a drag starts; keyboard reaches the banner's Restore and Discard draft, and after each restore focus is on the heading or on the next owner's restore choice | End to end |
| `build-sheet.test.mjs` profile 79: fails on a Capture scope context with no `ROWS` row; any write-control selector visible in a read-only row's region, from a named list pinned to exist in the web source (`data-canvas-add`, `data-empty-canvas-add`, `app-insertion-point`, `data-insertion-point-button`, `app-section-resize-handle`, `data-section-drag-handle`, `data-section-remove`, `data-section-config`, `data-section-title-edit`, `data-shortcut-drag-handle`, `data-shortcut-remove`, `data-unknown-section-drag-handle`, `data-unknown-section-remove`, `data-quick-create`, `data-task-complete`, `data-task-delete`, `data-markdown-edit`, `data-reflection-create`, `data-reflection-edit`, `.progress-section__controls`, `data-todo-toggle`, `data-todo-complete`, `data-todo-delete`, `app-task-row.cdk-drag` (the row's bare `cdkDrag`, `task-list-section.html:86`) and the row's details button (name ending ", open details", as `capture.ts:41` finds it); collapse is not in the list, since it stays (Q4 (a))), so a rename fails instead of passing silently; a read-only row without the banner or without header rename and Parent; a blocked confirmation with a commit button or a child without a link; restore choices whose option labels differ or whose default is not a visible Active; a first-run row without the main-column New project; an archived-only sidebar without the link or with "No projects yet"; a draft row whose source does not equal the typed draft; a preview without the caption; a count different from the rendered rows; a drag row whose first row moved more than 1 px; any change outside the named cells and panels; Task List cells changing more than the header count; while a Todos write is pending, any row's `data-todo-complete` or `data-todo-delete` that has `disabled` or lacks `aria-disabled="true"` (the pending row itself has neither, so the rule reads the other rows); on **after** rows only (the `44e7e9e` host has no such field), a read-only Todos or Reflections row with no recorded `hiddenItemCount` (a missing value fails; it is never read as 0), or one whose `hiddenItemCount` (read by the rig from the host API at capture time and stored in the row) is above 0 and whose `data-todos-empty` or `data-reflections-empty` text is not exactly "Restore to view N hidden todos." / "…reflections." with that N, in the singular for 1, or which shows the ordinary sentence ("There is no work…", "No reflections yet."); a read-only row whose count is 0 and which shows anything but the ordinary sentence (the archived-only fixture proves this branch); a missing pair; T01–T09, T11 or T12 above the slice-78 after counts (T10 is excluded, as in profile 78) | Gate |

## Boundaries touched

- **Components depend on gateway interfaces.**
  - The dashboard injects `ShellCommands`, a `core/shell/` service provided by `AppShell`, never
    `ShellStore` or a concrete gateway.
  - `RestoreStatusChoice` is presentational and imports only from contracts: the
    `ProjectRestoreStatus` type and `ProjectRestoreStatusSchema` (its options and parse).
  - `MarkdownDraftStore` holds strings and touches no gateway.
- **`shared/` imports nothing from `core/` or `features/`.** `shared/projects/` is new, and its
  one component takes inputs and emits outputs. The step 4 boundaries review pass checks it.
- **Contracts once.** The restore statuses come from `ProjectRestoreStatusSchema`. The option
  labels are view text, held once in `RestoreStatusChoice`, and the duplicates it replaces in
  `archived-region.ts` and Settings go. The other status label copies are slice 9's.
  `SectionContentInputs` is a web contract, not a wire type.
- **Contracts once (Q7).** `hiddenItemCount` is defined once, on the two result schemas in
  `packages/contracts`. The web stores read it from the parsed result; there is no web-side type
  or second count.
- **Domain over abstractions; MCP calls domain services.** Q7's count is computed inside
  `ProjectTodosService` and `ProjectJournalService` from the repositories they already read, with
  no new dependency, no `Clock` and no write: the root is counted as live in an in-memory view
  only. The MCP tools still call `services.todos.derive` and `services.journal.journal`
  unchanged; only their descriptions change. Every refusal the UI now prevents still stands in the
  domain, so agents over MCP meet the same rules and read the same count.
- **Tokens only** in `_controls.scss`, the banner, the editor caption and the overlay hint.
- **`core/` never depends on `prototype/`** is unaffected.
- **One central flag service.** Nothing here branches on prototype mode.

## Explicit non-goals

- Everything under Do not.
- A read-only task drawer (Q5 (a)).
- A cross-project overdue view or route (Q1 (a)).
- Listing or previewing hidden work on an archived root's Todos or Reflections page, or a hidden
  count on any other read (dashboard, search, Archive, Settings, a workstream's canvas). Q7 is
  the count on those two pages, and nothing more.
- Persisting drafts across reloads, autosave, or a navigation guard.
- A Task List count of open versus done, grouping, or a count on other section types.
- A new core task (for example "restore from the page"). T01–T12 are the measure.
- Re-styling other empty states (the widgets' sentences, Todos, Reflections). They keep their
  text, except the archived roots' hidden-count sentences (Q7); the §8 comb judges the rest.

## Open questions

Each changed the shape of the work, so implementation waited for the user's answers. **All seven
were answered by the user on 2026-11-04** (user decision). Question 8, raised during step 8, was answered by the user the same
day: option (a). Each entry keeps its options as
written, with the answer added under it. The Defaults taken were accepted as written.

1. **Where does the digest's overdue line lead?** (W4-028)
   - *Context.* The digest is provider prose with no task ids. The overdue tasks are in the same
     dashboard result (`today.overdue`), and Today lists them as rows that open their owner. No
     route or filter shows overdue tasks across projects. The finding's persona, Sam, sees only
     the digest.
   - *Options.*
     - **(a)** Web only: under its prose, the digest lists the overdue tasks from
       `dashboard.today.overdue`, each in slice 77's row anatomy, linking to its owner section as
       Today's rows do. It shows at most five; beyond that, a muted "and N more overdue" with no
       link.
     - **(b)** Web only: a "Show overdue tasks" link that focuses Today's first overdue row. This
       fails Sam, whose Today is hidden, and couples two widgets.
     - **(c)** Contract: digest lines carry an optional `topic: 'overdue'`, set by the domain, and
       the web makes that line a link. It still needs a target, so it is (a) or (b) plus contracts,
       the `AIProvider` interface, both providers, MCP and §50 documentation.
   - *Recommendation:* **(a)**. It works for Sam, needs no contract change, leaves the provider's
     prose untouched and couples no widgets. It adds rows to the digest, so the overdue dashboard
     cells change.
   - *Impact.* The cap of five is a default. Under (a), Demo on overdue-chaos sees the same
     overdue tasks in Today and in the digest. Both lists link through one extracted
     `task-origin-link.ts`. (c) is a cross-system step that is better left to its own slice.
   - **Resolved (user decision, 2026-11-04): (a)**, as recommended. The digest lists up to five
     overdue tasks under its prose, each linking to its owner section, then a muted "and N more
     overdue".
2. **What does the restore choice start on?** (L4-012)
   - *Context.* Archive preselects `active`. Settings starts on "Choose status" and keeps Restore
     disabled until a status is chosen. Both follow
     [the actionable-archive decision](../../decisions/2026-09-actionable-archive-and-archived-projects.md),
     and §31 says the prototype "does not guess a prior status".
   - *Options.*
     - **(a)** Everywhere preselects **Active**, visibly, as "Restore as Active".
     - **(b)** Everywhere starts on "Choose status", with Restore disabled until a status is
       chosen.
   - *Recommendation:* **(a)**. The status is shown before the press, so nothing is guessed
     silently. T09 and the banner stay one click. §23 (spec line 1048) asks that "Restore requires
     a deliberate non-archived status". (a) reads that as a visible, changeable status; (b) reads
     it as an explicit choice. The spec and the decision are amended either way.
   - *Impact.* (b) raises T09 from 1 to 2 clicks, which the plan would record as accepted. It also
     makes the banner two steps.
   - **Resolved (user decision, 2026-11-04): (a)**, as recommended. Restore preselects Active
     everywhere, visibly, as "Restore as Active". T09 stays at 1 click.
3. **First run: above the widgets, or instead of them?** (L4-020)
   - *Options.*
     - **(a)** The first-run block sits at the top of the main column, and the seven widgets stay
       below with their true empty sentences.
     - **(b)** The block replaces the widget grid until the first project exists.
   - *Recommendation:* **(a)**. It needs no special layout path, the persona's widget preferences
     stay meaningful, and the digest and fun fact still speak.
   - *Impact.* (b) changes `empty-dashboard` more, and needs a rule for when the grid returns.
   - **Resolved (user decision, 2026-11-04): (a)**, as recommended. The first-run block sits
     above the widgets, and the widgets stay below.
4. **Collapse on read-only pages.**
   - *Context.* Collapse is a persisted section write, refused on an archived project. A section
     stored collapsed would stay unreadable if the control simply went.
   - *Options.*
     - **(a)** Collapse stays and toggles locally, unsaved. It starts from the stored state and
       resets on reload.
     - **(b)** Collapse is hidden, and read-only sections render expanded whatever their stored
       state.
     - **(c)** Collapse is hidden, and collapsed sections stay collapsed.
   - *Recommendation:* **(a)**. Reading stays possible and nothing writes.
   - *Impact.* (a) adds a local view state to both frames. `transientlyExpanded` is an input the
     canvas sets (`project-section-frame.ts:57`), not local state; `effectiveCollapsed` (line 74)
     would combine the two. (b) is simpler but changes what an
     archived page looks like. (c) hides content.
   - **Resolved (user decision, 2026-11-04): (a)**, as recommended. Collapse stays on read-only
     pages and toggles locally, unsaved.
5. **Task rows on a read-only Task List.**
   - *Context.* Today a row on an archived project opens the drawer, whose edits are all refused.
   - *Options.*
     - **(a)** Static rows: title, status and date, with no drawer.
     - **(b)** A read-only drawer.
   - *Recommendation:* **(a)**. It matches slice 77's rule that rows link or stay static. A
     read-only drawer is a new surface.
   - *Impact.* Under (a), a task's description and other drawer-only details are unreadable on an
     archived page until it is restored. (b) would be built in this slice: a read-only drawer
     mode, its tests, a pair and a gate row (no editable field inside it on a read-only page).
     That adds about one implementation step. If (b) is wanted later rather than now, (a) ships
     here and a candidate is filed.
   - **Resolved (user decision, 2026-11-04): (a)**, as recommended. Archived Task Lists show
     static rows with no drawer.

6. **The initial bundle.**
   - *Context.* Slice 78 closed at 1,140.75 kB, leaving about 9 kB under the 1150 kB ceiling.
     Slice 78 itself added about 39 kB. Every route is eager. This slice adds:
     - the banner and `RestoreStatusChoice`;
     - the draft store and its editor UI;
     - `ShellCommands`, the first-run block and the digest list.

     The blocked confirmation costs nothing initially: `ProjectArchiveConfirm` is already behind
     `@defer` (`project-header.html:104`).
   - *Options.*
     - **(a)** Plan for the ceiling. The banner (with `RestoreStatusChoice`) goes behind
       `@defer (when readOnly())`, and the first-run block behind `@defer (when workspaceEmpty())`,
       each with an empty placeholder. The banner cannot reserve its space ahead of time, since
       `readOnly()` is known only once the context read lands, so the canvas moves down once,
       when the chunk arrives; the gate measures after settling. Each step records the bundle. If it would
       still cross, stop and ask.
     - **(b)** Raise the ceiling now, for example to 1,200 kB, recorded as an amendment to
       [the budget decision](../../decisions/2026-08-initial-bundle-budget.md).
     - **(c)** Name now what would be cut first if the ceiling binds. The candidate is the
       digest list (W4-028), which would then go to the §8 comb.
   - *Recommendation:* **(a)**. It keeps the user's ceiling and costs two `@defer` blocks, a
     pattern the header already uses. A deferred banner renders on the first frame its trigger is
     true, so the capture waits for it like any network-idle state.
   - *Impact.* (a) makes the banner's first paint follow its chunk. The gate's banner row asserts
     presence after settling, not on the first frame. (b) needs the user's explicit approval;
     the ceiling has been theirs to move twice.
   - **Resolved (user decision, 2026-11-04): (a)**, as recommended. The banner and the first-run
     block are lazy-loaded with `@defer` to stay under the 1,150 kB ceiling. If the ceiling still
     binds, stop and ask. The ceiling is not raised.

7. **What an archived root's Todos and Reflections pages say.** (TH10, false empty states)
   - *Context.* An archived root's Todos and Reflections reads return no items, on purpose: §31
     hides an archived project's live contents (`project-todos-service.ts:68-70`,
     `project-journal-service.ts:64`). The pages then show their ordinary empty sentences, "There
     is no work under this project yet — no tasks, and no workstreams." (`todos-page.html:26-28`)
     and "No reflections yet." (`reflections-page.html:98`). Under the new banner these are
     false: the work exists and comes back on restore. No finding names these two pages, but they
     are TH10's root cause, and this slice captures both pages on archived Home renovation.
   - *Options.*
     - **(a)** Web only, here: with `readOnly` true, each page shows the `.state-message--empty`
       sentence "Its todos come back when “X” is restored." / "Its reflections come back when “X”
       is restored." in place of the ordinary one. Two strings, two spec cases, no new pair (the
       archived Home renovation captures already show them).
     - **(b)** Leave the sentences, and file the false empties for the §8 comb.
   - *Recommendation:* **(a)**. It is two strings on pages this slice already changes and
     captures, and leaving a false sentence directly under the banner contradicts the banner.
   - *Impact.* (a) adds the two strings to `todos-page.html` and `reflections-page.html`, a case
     each to their specs and a gate rule (no ordinary empty sentence in a read-only row). No
     domain or contract change. (b) leaves the slice as planned and records the deferral.
   - **Resolved (user decision, 2026-11-04): neither option as written; not the
     recommendation.** The user's words: "i would rather it was worded more like 'Restore to view
     _ hidden todos', or keep the 'no work yet' in the case it is actually accurate". So:
     - when work is hidden, the pages say "Restore to view N hidden todos." and "Restore to view
       N hidden reflections.", singular for one;
     - when nothing is hidden, they keep the ordinary empty sentence.

     The plan settles the copy, what counts, and where the count comes from: an optional
     `hiddenItemCount` on the Todos and journal results, set by the domain for an archived root
     (Build, step 6a). This touches contracts, the domain and two MCP tool descriptions, so (a)'s
     "no domain or contract change" no longer holds. Agents reading those two tools see the same
     count. That is the plan's choice, recorded in the decision entry: the count reveals no
     more than an archived project's own page already renders (§31).

8. **Step 8 crosses the bundle ceiling. What pays for it?** (raised by S79S8, 2026-11-04;
   blocked steps 8–11; **resolved 2026-11-04, see below**)
   - *Context.* Step 7 left 4 bytes under 1,150 kB. Step 8, written test first and green, measures **1,151.23 kB initial, 1.23 kB over**. The first-run block itself is already
     behind `@defer (when workspaceEmpty())` (its lazy chunk is 1.01 kB). What stays initial, measured
     one part at a time:
     - the `ShellStore` split (one unfiltered read, `projects`, `answered`, `hasArchived`,
       `workspaceEmpty`): +0.27 kB;
     - `SHELL_COMMANDS` (a token `AppShell` provides as itself) with `requestCreate()`: +0.25 kB (the
       planned `ShellCommands` class with a `Subject` was +0.49 kB);
     - the sidebar's "No active projects." and its Settings link: +0.29 kB;
     - Home's `@defer` trigger and its optional injection: +0.28 kB.

     Nothing more can be deferred: what is left is the shell's state and the trigger. Steps 9 to 11
     add web code too (the digest list, the draft store, the count and the hint), so the shortfall
     only grows. The work is kept, uncommitted, as `.prototype/s79s8-step8-over-ceiling.patch`
     (git-ignored and local; `git apply` it at `409d674` or later).
   - *Options.*
     - **(a)** Lazy-load two routes that are rarely opened, Calendar and Settings › Agents, with
       `loadComponent`, as the two `prototype/*` routes already are. Measured with step 8 applied:
       **1,141.97 kB**, which leaves about 8 kB for steps 9 to 11. This amends `app.routes.ts`'s
       "eager on purpose" comment and
       [the budget decision](../../decisions/2026-08-initial-bundle-budget.md). Calendar alone frees
       only 0.27 kB, because the shared chunks re-split.
     - **(b)** Raise the ceiling, to 1,160 or 1,200 kB for example, as an amendment to the budget
       decision. The ceiling is the user's to move.
     - **(c)** Cut scope: move the sidebar wording (W4-034) or first run (W1-001) to the §8 comb.
       Either cut saves under 0.3 kB, and both need the store split, so (c) does not fit on its own.
   - *Recommendation:* **(a)**. It keeps the ceiling, follows a lazy-route pattern the app already
     uses, and makes room for steps 9 to 11 without another stop. Which routes go lazy is the
     user's choice; Calendar and Agents are the ones measured.
   - *Impact.* Until this is answered, step 8 cannot land and steps 9 to 11 cannot start.
     With (a) or (b), the next session applies the patch, adds the change the user chose and
     measures. It then adds what the patch does not have: the docs (web/core and web/dashboard
     folders, §23/§24 notes, the `2026-11-empty-workspace-offers-the-first-project.md` decision),
     `sidebar.stories.ts` and `dashboard-page.stories.ts`. Then it commits.
   - **Resolved (user decision, 2026-11-04): (a), the recommendation.** Calendar and
     Settings › Agents load lazily with `loadComponent`, as the two `prototype/*` routes do; every
     other feature route stays eager, and **the 1,150 kB ceiling is kept** (never raised). The
     budget decision and `app.routes.ts`'s comment are amended to name the two exceptions.

**Defaults taken** (small and non-shape-changing; say if any is wrong):

- **Drafts** live in memory until reload, reseed or a persona switch, and come back with "Your
  unsaved draft is back." and Discard draft.
- **The Preview caption** says "Unsaved preview".
- **The count** says "N tasks", counting open and done, in the frame header of canonical and
  shortcut Task Lists.
- **The drag hint** overlays quick-add.
- **The first-run New project** opens the sidebar's existing form.
- **Sidebar wording:** "No active projects." plus "Archived projects are in Settings." as a link.
- **The banner** restores the outermost archived owner, and a failure shows in the banner.
- **The blocked confirmation** lists each child with its status.
- **The digest** lists at most five overdue tasks (Q1 (a)).
- **A restore that finds its owner gone** (`not_found`) says "Couldn’t restore “X”. It may have
  changed elsewhere." with no Try again.
- **The late refusal** says "“X” still has live workstreams. Archive them first."
- **The empty variant** is applied only to the surfaces this slice touches.

## Revisions

- **Draft (2026-11-02, S79PLAN):** first draft, written from the candidate, the umbrella brief, the
  spec sections, the four named decisions and code surveys of the workspace, canvas, Archive,
  Settings, shell, dashboard, Markdown and evidence tooling.
- **Round 1 (2026-11-02):** nine substantive and seven minor findings, each checked against the
  code; all held. Changes:
  - **Banner restore.** It is now its own `restoreOwner`, because `writeProject` paints the page's
    own project and names it on failure (`project-workspace-store.ts:648-690`). Its failure shows
    in the banner, and an ancestor's restore is a cross-owner receipt with Open owner.
  - **Undo.** Undoing a reactivation refuses while a child is live (§31). Legacy attic's Undo is
    therefore shown as unavailable, and the Undo journey moved to Home renovation archived with
    nothing live.
  - **`liveChildren`** covers a root (the top level of `subprojectTree()`, which never holds the
    root) and passes through `ProjectHeader`, which renders the confirmation. Statuses are
    listed, because a completed child still blocks. A pending or failed tree, and an archived
    ancestor, fall to the late refusal.
  - **Settings capture** moved to nested-projects. Agent-heavy has no archived project, so its
    cell must not change.
  - **Markdown drafts** keep their base, so §30's "changed elsewhere" note still guards an agent's
    edit. Cancel carries the draft. Drafts clear on reload, reseed and persona switch.
  - **Q1** was rewritten for Sam, who sees only the digest. The recommendation is now an overdue
    list inside the digest, with no widget coupling.
  - **Read-only coverage:** `restoreBlocked` covers the ancestor case; the Todos checkbox;
    shortcut and unknown-section selectors in the gate; `readOnly` on the Archive page; live
    archive and restore while on the page; a failed ancestors read; the archived-twice case.
  - **Minor:**
    - `reportSummary` goes only to registry-marked types (NG0303); the 375 header truncates
      rather than wraps.
    - §31, root-archive guidance and failures-speak decisions amended; the archived-root Archive
      note points at the banner; the first-milestone guide and `web/{how,what}.md` added.
    - `ShellCommands` replaces store coupling, with an `answered` flag and `data-first-run-create`.
    - Alex and Sam first-run contexts added.
    - Missing stories marked create.
    - Profile 79 joins the `['77','78']` checks and the sidebar re-anchor.
    - Q2 cites §23; Q4 and Q5 impacts corrected.
- **Round 2 (2026-11-02):** five substantive and eight minor findings, each checked against the
  code; all held. Changes:
  - **Own-project restore** adds no toast. The page's own history is never announced
    (`history/project-history-store.ts:393`), and the More menu's status choice has none either. Focus
    goes to the project name heading, and the header's Undo is the way back. An ancestor restore
    keeps the existing cross-owner toast.
  - **Legacy attic's Undo** is not explained by `blockedBy`, which names only archived projects.
    Pressing it gives the existing transition refusal, and that is what is captured.
  - **Sam's digest context** is created by the rig as Sam, following the finding's own repro,
    because no seed gives Sam a project. First run for Alex and Sam in most seeds is noted as
    intended.
  - **Markdown under a live read-only** keeps today's open editor and note
    (`markdown-section-body.spec.ts:179`), rather than closing it. The seed path gains
    `initialDraft`. The unchanged-Save check and Discard draft are stated against `source()`.
  - **Pages are root-only** (`resolveProjectPage` uses `ownPages`). The ancestor case is the
    canvas's alone, and the `restoreBlocked` change and ancestor-case page tests were dropped.
  - **Minor:**
    - Drafts clear on `prototype.reloaded`; a persona switch reloads the page anyway.
    - The boundaries section says `ShellCommands`.
    - The store row names `restoreOwner`, inside `whileWriting`.
    - Q4 corrected (`transientlyExpanded` is an input).
    - Q1 notes the Today duplication; `task-origin-link.ts` is extracted.
    - Overdue `/app` cells include `dev-panel`, `new-project` and `phone-menu` when overdue.
    - The gate states T10's exclusion and Q2(b)'s T09 exception.
    - The profile-79 line list was corrected, with Lab wiring at lines 84–91.
    - §29 added.
    - `route.fallback()` for the late refusal.
    - The header's status choice left to slice 9, deliberately.
- **Round 3 (2026-11-02):** four substantive and ten minor findings, each checked against the
  code; all held. Changes:
  - **Discard draft** is the body's job. The editor emits `discardRequested`; the body forgets the
    draft, sets `base` to `source()` and re-keys the editor, which seeds only in `ngOnInit`.
  - **Impossible states dropped.** `readContext` is all-or-nothing, so there is no failed-ancestors
    state. A failed quiet refresh keeps the last `archivedOwner` and `liveChildren`, and staleness
    ends in the late or banner refusal.
  - **Focus** is defined after every banner restore: the heading when the banner goes (own and
    ancestor), the next owner's restore choice when it stays.
  - **Bundle** is now Open question 6. The recommendation is to `@defer` the banner and the
    first-run block, since the blocked confirmation is already deferred.
  - **Minor:**
    - `restoreOwner` bumps `contextWriteEpoch`, and its refusal sentence no longer waits on a void
      refresh.
    - The Reflections page row and Q1's option letter were corrected.
    - Core `why.md`, `web/tasks/` and `web/dashboard/overview.md` were added.
    - The pair count is seventeen.
    - The gate's selectors are now the real attributes, collapse included per Q4.
    - The `build-sheet.mjs` survey adds lines 16, 271, 876 and the sheet writer.
    - Digest rows use `data-digest-overdue`, so `objects.spec.ts:41` stays unique.
    - Under a `null` digest no overdue list shows.
    - Q5(b) is stated as built here if chosen.
- **Round 4 (2026-11-02, cloud session):** three substantive and seven minor findings, each
  checked against the code; all held. Changes:
  - **The archived Todos pair could not exist.** An archived root's Todos and Reflections reads
    return no items (`project-todos-service.ts:70`, `project-journal-service.ts:64`), so the pair
    showed nothing either side. It is replaced by "Todos write pending" on live Home renovation
    (before: native `disabled`, `todos-page.html:60,107`). The read-only half is proved by
    component tests with rows supplied and by the gate's selectors. What those pages say instead
    of their false empty sentence is new Open question 7.
  - **Done when** now carries Q2(b)'s T09 exception, as the gate already did.
  - **Personas in the pairs.** The first-run pair names Demo, Alex (light) and Sam (dark), and
    W4-001's closure says what is captured. The digest pair names the rig's Sam fixture on
    overdue-chaos, since no seed gives Sam a project.
  - **Minor:**
    - The "destroyed by a live archive" clause left from round 2 was dropped.
    - Seed ownership corrected: Alex has "Alex private plan" on nested-projects.
    - Q6(a) states that the banner moves the canvas once, when its chunk lands; the dashboard
      row names the first-run `@defer`.
    - `RestoreStatusChoice` takes a `subjectLabel` for `Restore <label>`, and step 3 re-runs
      T09.
    - The canvas row drops the inline unknown-section controls.
    - `restoreOwner` gives `not_found` its own sentence, with no Try again.
    - Citations: `whileWriting` at `:699`, the archive `@defer` at `project-header.html:104`,
      §21 at spec line 906, §23 at 1048.
- **Round 5 (2026-11-02, cloud session):** one substantive and five minor findings, each checked
  against the code; all held. Changes:
  - **The Todos pending pair showed no difference at rest.** `_controls.scss:409-411` styles
    native `:disabled` and `[aria-disabled='true']` with one rule. The pair now captures focus:
    Shift+Tab from the pending workstream row's title link skips a native-disabled Complete
    before and rests on the `aria-disabled` one after. A gate rule now fails a pending row whose
    Complete or Delete is natively `disabled`. (The reviewer's Tab-from-checkbox wording was
    corrected: the checkbox and Complete are exclusive branches, `todos-page.html:44-66`.)
  - **Minor:**
    - Q7 is carried through Do not's non-goal, Behaviour vs. appearance, step 6, the decision
      row, the Reflections spec row, the gate, and the Home renovation archived pair.
    - The gate's read-only list adds the task row's bare `cdkDrag` and its details button.
    - The slice-78 after counts are held as constants in profile 79, since `ux-output/` is
      git-ignored and absent from a fresh clone.
    - Citations: `draft` at `markdown-source-editor.ts:31` and `ngOnInit` at `:41`;
      `history/project-history-store.ts`; the contract row names the `ProjectPageRenderer`
      interface too.
    - The Todos pending row says 1440 light only.
- **Round 6 (2026-11-02, cloud session):** one substantive and two minor findings, each checked
  against the code; all held. Changes:
  - **The pending row has no Complete.** Completion is optimistic (`todos-page-store.ts:206`), so
    the pending workstream is finished and its Complete stops rendering (`todos-page.html:55`).
    The pair and the gate rule now read another row: with Cabinets' completion held pending,
    Shift+Tab from Kitchen's title link skips Kitchen's native-disabled Complete before and rests
    on it after. The gate rule checks every other row while a Todos write is pending, and the
    `todos-page.spec.ts` case asserts on a row that is not the pending one.
  - **Minor:** a stray cell divider in the `markdown-source-editor` row; real use (Acceptance 7)
    no longer implies Legacy attic's Undo works.
  - The reviewer found nothing else substantive. The round cap the brief set (about six) is
    reached; see the State header.
- **Acceptance (2026-11-04, user decision, S79ACCEPT):** the user accepted the plan and answered
  its Open questions. The Defaults taken were accepted as written. The answers:
  - **Q1 (a).** The digest lists up to five overdue tasks under its prose, each linking to its
    owner section, then a muted "and N more overdue".
  - **Q2 (a).** Restore preselects Active everywhere, visibly, as "Restore as Active".
  - **Q3 (a).** The first-run block sits above the widgets, which stay below.
  - **Q4 (a).** Collapse stays on read-only pages and toggles locally, unsaved.
  - **Q5 (a).** Archived Task Lists show static rows with no drawer.
  - **Q6 (a).** The banner and the first-run block go behind `@defer`. If the ceiling still
    binds, stop and ask. The ceiling is not raised.
  - **Q7, not the recommendation.** When work is hidden: "Restore to view N hidden todos." /
    "…reflections.", singular for one. When none is: the ordinary empty sentence.

  Places changed:
  - **State header.**
  - **Open questions.** Each entry is marked resolved, with its options kept.
  - **Q1.** Build's digest bullet; Acceptance item 4's overdue cells; the Visual acceptance digest
    row; the widget row; step 9; Defaults taken; the non-goal.
  - **Q2.** Build's restore bullets, with Settings' "stays disabled" rule amended; Done when and
    Acceptance item 5 lose T09's 2-click allowance; the `RestoreStatusChoice` row; the
    restore-choice spec; the gate's default rule; the actionable-archive amendment.
  - **Q3.** Build's placement; the dashboard row; the first-run decision row.
  - **Q4.** Build's collapse bullet; both frame rows; step 5; the frame spec; the gate's selector
    list loses the (b)/(c) collapse selectors.
  - **Q5.** Build's task-row bullet; Behaviour; the non-goal; the read-only decision row.
  - **Q6.** Acceptance item 3; the dashboard and banner rows drop "if Q6 is (a)"; the bundle
    decision amendment is added to the amendments row.
  - **Q7** replaces "Its todos/reflections come back when “X” is restored." in:
    - Build (a new *What they say* bullet; "the domain does not change" becomes "no domain rule
      changes") and Do not;
    - Capture scope (Home renovation's hidden counts, six and three, and a new zero-hidden
      context on the archived-only fixture, 1440 light), Visual acceptance and Behaviour vs.
      appearance (the domain test amendments; the stay-green list);
    - Acceptance item 6, now one additive MCP output change on archived roots;
    - the File-level change list (both stores; a new *Hidden count* table for contracts, the
      domain, MCP and tests; the contracts, domain and mcp-tools docs; §31, §34 and §36; two
      more decision amendments);
    - step 6 and a new step 6a, without renumbering 0–13;
    - the Test plan (domain, contracts and MCP cases first, the stores, both pages, the gate
      rule that reads the API's count), Boundaries touched and Explicit non-goals.
- **Acceptance review round 1 (2026-11-04, S79ACCEPT):** one cold reviewer checked the
  acceptance and the Q7 amendment against the code. It found nothing substantive. It confirmed:
  - the counting route: archiving never cascades and needs every direct child archived first,
    `project-service.ts:269,325-333`, and `taskOrigin` ignores status;
  - the seed counts, six and three;
  - that the host and MCP tests read live roots;
  - that no conditional is left.

  Eight minor points, each checked against the code; seven held as stated and one in part:
  - **The `archivedJournal` story** is a live root with an archived subject, so it stays.
    New archived-root stories are added for both pages.
  - **The State header** claimed a review before one was recorded; it now names this round.
  - **The gate rule** applies to after rows only, and a missing count fails.
  - **The Test plan** adds the stores' reset after a restore and on failure, the journal's
    `reflections.read` refusal, and a gateway parse case.
  - **`docs/guides/mcp-setup.md`** (both tools) and the walkthrough's tool lines join the change
    list.
  - **The zero-hidden Reflections capture** may also show "no Reflections container yet". Held in
    part: that branch exists (`reflections-page.html:51-53`), and whether it renders on an archived
    root is left to the capture. The Q7 rule reads only `data-reflections-empty`.
  - **Formatting.** Step 6a was set as its own paragraph, and Q7's resolution sentence was fixed.
  - **Agents see the count.** This is recorded as the plan's choice in the decision row and in
    Q7's resolution, for the user to see. It does not block: it discloses no more than §31's
    archived page already renders.
- **Stage 0 (2026-11-04, S79S0):** step 0 ran. Added the Stage 0 inventory and checks under
  Behaviour vs. appearance. Three findings change later steps without changing their shape:
  `lifts.spec.ts:158-163` joins step 7's edits, `canvas-editing.spec.ts:150-157` and
  `markdown-section-body.spec.ts:63-67` join step 10's, and the nested-projects `dev-panel`,
  `new-project` and `phone-menu` cells leave Acceptance item 4's overdue list, since that dashboard
  has no overdue task.
  One review pass over the step's diff (`385df19`) found no blocker. Its evidence gaps were all
  confirmed against the code and closed: the probe now records the banner's placement (the header
  and first frame boxes), the digest's `data-digest-overdue` rows with their links, the landed
  `hashTarget`, and input labels; `Row` gained `snapshot` (the restore contexts' `restored` rows)
  and `links` (each blocked confirmation's live children); the Undo refusal and the banner's return
  are recorded positively; the hook list in the State header is complete. The before contexts
  were re-captured with the final rig.
- **2026-11-04, step 2 (S79S2).** Boundaries touched: `RestoreStatusChoice` imports
  `ProjectRestoreStatusSchema` as well as its type (the options and the parse come from the one
  schema), so the row says "imports only from contracts". The step's cold review also had the
  component, stories, §21 paragraph and decision amendment say only what is true now: no product
  page renders the choice or the variants until steps 3 and 4.
- **2026-11-04, step 3 (S79S3).** Stage 0's note that the e2e specs stay green "if
  `RestoreStatusChoice` keeps … the row hooks" no longer holds as written: the choice keeps its own
  hooks, so the project-row locators in `archive.spec.ts`, `archived-projects.spec.ts`, `web.spec.ts`
  and `feedback.spec.ts` moved, and `archived-projects.spec.ts`'s dismissal-to-heading assertion
  became index-based (§77: the next row's choice is now a valid target). The choice gained
  "Restoring…" text while pending, as Archive and Settings already said.
- **2026-11-04, step 4b (S79S4B).** The archived root's Archive note (the `archive-page` row) landed
  with the banner rather than in a later step, since the note sits right under it and no later
  step names it; it follows `readOnly`. The new archived-pages decision entry and §26's notes wait
  for step 5, when the pages actually become read-only. "Rename and Parent" in this step is More ›
  Edit details…, as profile 79's gate reads it.
- **2026-11-04, step 7 (S79S7).** `liveChildren` is not a `ProjectWorkspaceStore` signal passed
  through `ProjectHeader` as the Build bullet, File-level change list and Test plan say: with
  0.26 kB left under the ceiling, that cost +0.66 kB. It is `liveChildrenOf` in `live-children.ts`,
  computed by the deferred `ProjectArchiveConfirm` from the shell's `WORKSPACE_TREE` token, with
  the same set and the same tests (written against `liveChildrenOf(store)` in
  `project-workspace-store.spec.ts`); the shell spec proves the confirmation receives it, and
  `project-header.{ts,html}` and its spec do not change. The descendants re-read after a refusal is
  `refreshContext`, queued for any `rule_violation` on a project write, not only an archive.
- **2026-11-04, step 8 (S79S8), not landed.** Open question 8 added. In the parked patch,
  `ShellCommands` is an interface plus the `SHELL_COMMANDS` token, which `AppShell` provides as
  itself (`useExisting`) and answers (`workspaceEmpty`, `requestCreate()`). It is not the planned
  class with an emitter, which cost twice the bytes. So `shell-commands.spec.ts` is gone, and its
  cases (each request reopens the one form, `workspaceEmpty` follows the read, focus ends in the
  name after the drawer's own move) are in `app-shell.spec.ts`. The first-run markup is
  `features/dashboard/first-run-block.ts`, mounted behind the `@defer`. Only a component's
  dependencies load lazily, so markup left in `dashboard-page.html` would stay initial. The block
  hides itself when the workspace stops being empty, because a `when` trigger loads once. Its
  sentence is a default: "Projects hold your tasks, notes and reflections, for you and the agents
  you connect. Start with your first."
- **2026-11-04, Q8 answered (S79S8B).** The user chose Open question 8's option (a): Calendar and
  Settings › Agents become lazy routes and the ceiling stays at 1,150 kB. The File-level change list
  gains `app.routes.ts`, `app.routes.spec.ts` and an amendment to
  `docs/decisions/2026-08-initial-bundle-budget.md`; step 8 lands with them. Acceptance check
  item 3 no longer says every route is eager.
- **2026-11-04, step 8 landed (S79S8B).** The cold review's findings changed the plan's rows, not
  its content: the Shell table's `shell-commands.ts` row and the Test plan's `shell-commands.spec.ts`
  row now name `app-shell.spec.ts`, which holds those cases since the parked patch.
- **2026-11-04, step 9 (S79S9).** The digest's spacing is its own `daily-digest-widget.scss`, not
  `widget-content.scss` as the File-level change list says: the shared sheet is compiled into every
  widget, and the same rule there cost 0.73 kB more. The list is labelled "Overdue tasks", from the
  step's review.
