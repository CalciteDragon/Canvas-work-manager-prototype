<!-- plan id="79" status="active" summary="Redesign slice 6b-2 (TH10): first-run dashboard, archived pages read-only with restore in place, archive refusal said before, Markdown drafts kept, digest overdue line, Task List count" -->
# Slice 79 — States: empty, archived and editing

**State (2026-11-02):** first draft written (S79PLAN). Started with `roadmap.mjs start`;
`CURRENT_SLICE` is 79. The draft has not been reviewed yet, the user has not accepted it, and no
implementation has started. Next: AGENTS.md step 2, review rounds recorded under Revisions.

Redesign slice 6b-2 under the [UI/UX overhaul umbrella](70-ui-ux-overhaul.md). It follows
[Slice 78](../completed/78-failures-and-loading.md) (6b-1, failures and loading). The user split 6b
on 2026-10-29 and answered the shape questions under Build the same day. The protocol §8 comb
runs after this slice closes; it is the umbrella's next step, not part of this slice.

## Goal

Empty states offer the next step, and archived work reads as archived and does not invite edits
it will refuse. A refusal is said before the user commits, and typed prose is never lost to
Cancel or navigation (direction principles 3, 4 and 6).

## Spec sections

- **§21** adds empty and archived variants to slice 78's `.state-message` (spec line 907).
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
- **§34** adds the Task List count and the drag hint (lines 2301–2302).
- **§63, §67, §69, §77, §78** are the Lab, Storybook, verification, design-first use and the
  decision log.

## Build

These are the candidate's items, refined against the code. Items marked *user's choice* were
answered on 2026-10-29 and are not re-opened here.

- **First run** (W1-001, W4-001, L4-020).
  - **When it shows.** An empty workspace's Home shows a first-run block in the main column: one
    sentence saying what the product is for, and a **New project** button. "Empty" means the
    workspace has no projects at all, live or archived. `ShellStore` already reads the project
    list. It now also learns whether any archived project exists (next item), and the dashboard
    reads that. The block shows only after that read answers, so it is never shown while loading
    or after a failure.
  - **New project.** The button asks `ShellStore.requestCreate()`. `AppShell` watches that request:
    it opens the Menu at 375 and calls the sidebar's existing `reopenCreate()`. There is still
    exactly one creation form. The dashboard injects `ShellStore`, which `AppShell` provides above
    the router outlet, so no concrete gateway enters a component.
  - **Placement** is Open question 3.
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
    - **The write.** Restore uses the existing `ProjectWorkspaceStore.setStatus` path, extended to
      take the owner's id. It answers through the shell's receipt toast with Undo, as the More
      menu's status choice does today.
    - **Visiting.** Visiting still writes nothing
      ([Archive is always visitable](../../decisions/2026-10-archive-is-always-visitable.md)).
  - **The canvas** renders its sections read-only. The following go:
    - insertion marks, the end and empty-canvas "Add a section", drag, resize, section rename,
      section settings and remove, on section, shortcut and unknown-section frames;
    - inside sections, the existing `readOnly` content input hides quick-add, Complete, Delete,
      Markdown Edit, the Reflections composer and edit, and the Progress formula controls.
  - **Task rows** on a read-only canonical Task List show as static rows, with no drawer, because
    the drawer is a write surface. This is Open question 5. The shortcut flavour of read-only
    keeps its link to the source. An archived empty canvas says "This page has no sections." with
    no add action.
  - **Collapse** is a persisted section write, refused on archived projects
    (`section-service.ts:483`). Its read-only form is Open question 4.
  - **What stays.** Rename, Parent and the project's own status stay in the header, and so do
    Undo/Redo, More, Open archive and Page settings. Rename and reparent-away are the escape hatch
    in
    [reactivating under an archived ancestor](../../decisions/2026-09-reactivating-under-an-archived-ancestor.md).
    The own-status exception (§31) lets an archive's Undo run.
  - **Todos and the Reflections page.** Todos' Complete and Delete are absent on a read-only
    project, and so is the Reflections page's composer. The Reflections page already passes
    `readOnly` when archived; it now also covers the ancestor case.
  - **Decision entries.** A new decision entry records the rule. Amend
    [reactivating under an archived ancestor](../../decisions/2026-09-reactivating-under-an-archived-ancestor.md)
    and [nesting and archive rules](../../decisions/2026-08-project-nesting-and-archive-rules.md).
    The domain does not change: every refusal still stands behind the UI.
- **The archive refusal comes first** (L4-008). *User's choice.*
  - **The check.** `ProjectArchiveConfirm` gains a `liveChildren` input. The shell computes it from
    the current project's node in `subprojectTree()`: the direct children that are not archived,
    which is exactly what `assertNoActiveChildren` checks.
  - **The blocked confirmation.** When the list is non-empty, the confirmation reads "“Kitchen”
    can’t be archived yet" over "Archive its live workstreams first:". Each child is listed as a
    link to `/projects/<id>`, and following one closes the dialog. The only button is Close, and
    the confirmation offers no commit. The domain rule does not change, and there is no cascade.
  - **A refusal that still arrives.** This can happen on a stale tree, for example when an agent
    added a workstream. A `rule_violation` on an archive write gets its own sentence:
    "“X” still has live workstreams. Archive them first." The reason goes under Details. The
    generic "Couldn’t archive “X”. Try again." stays for other codes, such as `unreachable`, where
    retrying can succeed. `projectWriteSentence` takes the code.
  - **After a refusal**, the store re-reads its descendants, so the next confirmation shows the
    blocked form.
- **Restore works one way** (L4-012).
  - **One component.** A shared `RestoreStatusChoice` replaces the Archive row's select
    (`archived-region.html:61-75`) and Settings' select
    (`archived-projects-page.html:33-44`), and serves the banner. It has one option list in one
    casing (Planning, Active, On hold, Completed) and one label, "Restore as".
  - **The default** is Open question 2.
- **The digest's overdue line leads to the tasks** (W4-028).
  - **What exists today.** The digest is provider prose (`GeneratedContent.lines`) with no task
    ids. The overdue tasks are already in the same dashboard result (`today.overdue`), and Today
    shows them as rows that open their owner.
  - **The link** is Open question 1. Its recommendation is web-only, with no contract change.
- **Markdown keeps the draft** (L3-012, W4-031). *User's choice.*
  - **The draft store.** `MarkdownDraftStore` is an in-memory store keyed by section id, provided
    in root. A Cancel with a changed draft keeps the draft there. So does an editor destroyed by
    navigation or by removal of its host.
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
  - **How.** `SectionContentInputs` gains an optional `reportSummary(text: string | null)`. The
    canonical and shortcut frames render it, and Task List reports its count of loaded tasks, open
    and done. No count shows while loading, after a failure, or at zero: there the empty sentence
    speaks.
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
- Cascade an archive, or change any domain rule or message.
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

**Does the sheet fit one screen?** Yes. The Visual acceptance table has sixteen pairs; slice 78's
sheet had twenty-four. No split is proposed.

**Carried candidates:** both are decided under Build. Slice 78 decided and delivered the row
failure below the fold.

## Findings closed

| Finding | Sev | Closed by |
|---|---|---|
| W1-001 | S2 | The first-run block's New project in the main column opens the one creation form |
| W4-001 | S2 | The same block, both personas, both themes |
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

Twelve items (11 S2, 1 S3). The carried candidates (drag reserve, Todos `[disabled]`) close
on their pair and on the gate's archived-control check.

## Acceptance check

1. Run `pnpm test`, then `pnpm lint` (with `docs:check`), one after the other.
2. `pnpm e2e` passes in full, including the new `apps/e2e/empty-archived-editing.spec.ts`. Every
   other spec edit is listed under Behaviour vs. appearance.
3. `pnpm --filter web build` reports an initial bundle under 1150 kB. Every route is eager, and
   slice 78 closed at 1,140.75 kB, leaving about 9 kB. Each step records the bundle. A step that
   would cross the ceiling stops and reports; the ceiling is not raised.
4. **Before:** export `44e7e9e`, the slice-78 closing commit, outside `apps/e2e/`, and link
   `node_modules`. Build it with `ng build` into `apps/e2e/ux-output/slice79-baseline-web/`, served
   from its `browser/` folder as `slice78.config.ts` serves its baseline. Then run
   `UX_BEFORE=44e7e9e pnpm --filter @cwm/e2e exec playwright test --config ux/slice79.config.ts`.
   **After:** run the same config without `UX_BEFORE` on the slice's final build. Then run
   `node docs/roadmap/70-ui-ux/tooling/build-sheet.mjs <before> <after> <output> <after> --profile 79`.
   Profile 79:
   - **Keeps profile 78's general rules:**
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
     - `archive` and `settings-archived-projects` (the restore choice);
     - the dashboard cells whose `today.overdue` is non-empty, which Stage 0 lists from the data
       (the overdue link; this depends on Open question 1).
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
   must not exceed the slice-78 after counts in `apps/e2e/ux-output/7925bbe…/tasks/tasks.json`:

   | T01 | T02 | T03 | T04 | T05 | T06 | T07 | T08 | T09 | T11 | T12 |
   |---|---|---|---|---|---|---|---|---|---|---|
   | 2 / 16 | 3 / 19 | 10 / 38 | 1 / 0 | 2 / 0 | 2 / 16 | 3 / 0 | 3 / 0 | 1 / 0 | 1 / 0 | 1 / 0 |

   Each cell is clicks / keystrokes, all with zero dead ends. T09 restores Legacy attic's archived
   item from Archive; if Open question 2 is answered "Choose status", T09 rises to 2 clicks. The
   plan then records that as the accepted cost, not a failure.
6. **MCP.** No tool changes. The existing in-process contract test and the stdio test pass
   unedited. That proves the domain and the wire did not move.
7. **Real use**, on nested-projects, empty and overdue-chaos, in three modes: 1440 with mouse,
   1440 keyboard only, and 375 touch. Exercise:
   - first run on `empty`;
   - archive the only project and read the sidebar;
   - open Legacy attic, Legacy shelving and an archived root, try to edit, then restore from the
     banner and Undo it;
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

- **First run.** The `empty` seed's Home. After pressing the main-column New project: the
  creation form focused, with the Menu open at 375.
- **Archived only.** The `empty` seed with one project created and then archived: the sidebar,
  with the Menu open at 375, and Home, which is not first run.
- **Read-only pages:**
  - nested-projects Legacy attic (`/projects/project-legacy`), an archived workstream;
  - Legacy shelving (`/projects/project-legacy-child`), live under an archived ancestor;
  - Home renovation archived as a root, after the rig archives Cabinets, Kitchen and the other
    live workstreams. Its Home canvas, its Todos and its Reflections page are captured, and the
    Kitchen page under it shows the banner naming Home renovation.
  - the empty canvas of an archived page.
- **Restore from the banner.** Legacy attic after pressing Restore: the toast with Undo, and the
  banner gone. Legacy shelving after restoring Legacy attic: no banner.
- **Archive confirmation.** nested-projects Kitchen (live Cabinets) and Home renovation (live
  Kitchen and Garden) show the blocked form. A workstream with no live children, such as Cabinets,
  shows the commit form.
- **Late refusal.** The header after an archive refused with `rule_violation`, injected by route,
  with Details closed and open.
- **Restore choice.** The Archive row (nested-projects, Legacy attic's archived items) and
  Settings › Archived projects (agent-heavy), each before and after choosing.
- **Digest.** overdue-chaos and busy-week Home, and after following the overdue link.
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
- **Todos write pending.** Complete pending: `aria-disabled`, no native `disabled`.
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
| Empty Home: seven "Nothing…" cards, small sidebar + → first-run block with New project | empty, 1440 light, 375 dark | W1-001, W4-001, L4-020 |
| Main-column New project pressed → the creation form focused (Menu open at 375) | empty, 1440 dark, 375 light | W1-001 |
| Sidebar, archived only: "No projects yet" → "No active projects." + Settings link | empty + archived fixture, 1440 dark, 375 light | W4-034 |
| Legacy attic: full-weight header, accent "Add a section" → banner with Restore as, no add action | nested-projects, 1440 light, 375 dark | L1-028, L4-007 |
| Home renovation archived: live Add task, Edit, drag and delete → read-only sections under the banner | nested-projects (rig), 1440 dark | L4-007 |
| Legacy shelving under archived Legacy attic: fully editable → banner naming Legacy attic, read-only | nested-projects, 1440 light | L4-007 |
| Archived Todos: native-disabled Complete and Delete → absent | nested-projects (rig), 1440 light | carried (slice 75) |
| Archive Kitchen: commit offered → blocked form naming Cabinets as a link, Close only | nested-projects, 1440 dark, 375 light | L4-008 |
| Late archive refusal: "Couldn’t archive … Try again." → "still has live workstreams. Archive them first." + Details | nested-projects, 1440 light | L4-008 |
| Restore choice: Archive's lowercase preselected select and Settings' "Choose status" → one control | nested-projects Archive, agent-heavy Settings, 1440 light | L4-012 |
| Digest overdue line: plain text → link, and its target after following it | overdue-chaos, 1440 dark, 375 light | W4-028 |
| Markdown Cancel, then Edit: saved text → draft back with Discard draft | nested-projects Kitchen, 1440 light | L3-012 |
| Markdown navigate away and back, then Edit: saved text → draft back | nested-projects Kitchen, 1440 dark | L3-012 |
| Markdown Preview: only `aria-pressed` → "Unsaved preview" caption | nested-projects Kitchen, 1440 light, 375 dark | W4-031 |
| Task List header: no count → "N tasks" | agent-heavy dense list, 1440 light; Kitchen, 375 dark | L4-023 |
| Drag start: the list drops by the hint's height → rows hold, hint over quick-add | nested-projects Kitchen, 1440 dark | carried (note-2026-10-22-002) |

## Behaviour vs. appearance

**Behaviour changes**, so §77 applies: the tests, the implementation and the docs change together.

- **Behaviour.**
  - Read-only pages under an archived project or ancestor: controls are absent, and task rows are
    static (Open question 5).
  - The banner's restore writes a status through the existing project update.
  - Collapse on read-only pages (Open question 4).
  - The Archive confirmation's blocked form.
  - The late refusal's sentence and the descendants re-read after it.
  - One restore choice, with the default from Open question 2.
  - `ShellStore`'s unfiltered list read and `hasArchived`; the sidebar's archived-only wording.
  - The first-run block and `requestCreate`.
  - The digest's overdue link.
  - Markdown drafts kept and offered, Discard draft, and the Preview caption.
  - The Task List count.
  - Todos' pending `aria-disabled`, and Complete and Delete absent when read-only.
- **Not behaviour.**
  - The domain, contracts, host, MCP tools, persistence and seeds do not change, apart from the
    contract change Open question 1's option (b) would bring.
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
  - **Archived pages:**
    - unit: `project-canvas.spec.ts`, `project-section-frame.spec.ts`, `shortcut-frame.spec.ts`,
      `task-list-section.spec.ts`, `todos-page.spec.ts:230,282,356,406-412,503-532` and
      `reflections-page.spec.ts:234`;
    - e2e: `web.spec.ts:97` and any spec that edits Legacy attic or Legacy shelving.
  - **Markdown:** `markdown-source-editor.spec.ts` and `markdown-section-body.spec.ts`. In e2e,
    `canvas-editing.spec.ts:127-167,266,845,951` and `section-edit-undo.spec.ts:181` are re-checked
    for a Cancel that then expects the saved text on the next Edit.
  - **Drag hint:** `objects.spec.ts:108` (text unchanged; placement may be asserted).
  - **Digest:** `dashboard-page.spec.ts:54,146`.
  - **Evidence:** `apps/e2e/ux/tasks.ts` (T01's scoped locator).
- **Stay green unedited:** `phone-layout.spec.ts`, `removal-undo.spec.ts`,
  `task-interaction.spec.ts`, `mcp.spec.ts`, every domain, contracts, host and MCP test, and every
  spec the Stage 0 grep does not list. Frozen evidence scripts of completed slices are not re-run.

## File-level change list

Paths are under `apps/web/src/app/` unless stated. "(+ spec)" means the colocated spec, and
"(+ stories)" the colocated stories, change with the file.

**Shared foundations**

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/styles/_controls.scss` | modify | `.state-message--empty` (sentence plus optional action) and `.state-message--archived` (banner weight), tokens only |
| `shared/projects/restore-status-choice.{ts,html}` (+ spec, stories) | create | "Restore as" select with one option list and casing, the default from Q2, and Restore; emits `restore(status)`; `aria-disabled` while pending; takes `ProjectRestoreStatus` from contracts |
| `prototype/design-lab/panels/primitive-panels.html` (+ `design-lab-page.spec.ts`) | modify | Empty and archived specimens in `state-messages` |
| `prototype/design-lab/panels/live-panels.html` (`data-panel="section-frame"`) | modify | Header count specimen |

**Shell, sidebar and Home**

| File | Change | Responsibility |
|---|---|---|
| `core/shell/shell-store.ts` (+ spec) | modify | Unfiltered list split into tree and `hasArchived`; `workspaceEmpty`; `requestCreate()` signal |
| `core/shell/app-shell.ts` (+ spec) | modify | On `requestCreate`, open the Menu when narrow and call `sidebar().reopenCreate()` |
| `core/shell/sidebar/sidebar.{ts,html}` (+ spec, stories) | modify | Archived-only wording and link, `hasArchived` input, `.state-message--empty` |
| `features/dashboard/dashboard-page.{ts,html,scss}` (+ spec, stories) | modify | First-run block from `ShellStore.workspaceEmpty()`, New project calls `requestCreate()` |
| `features/dashboard/widgets/daily-digest/daily-digest-widget.{ts,html}` (+ spec) | modify | The overdue link (Q1) |
| `features/dashboard/widgets/today/today-widget.html` (+ `today-widget.spec.ts`, create if absent) | modify | A focus target for the overdue rows, if Q1 is answered (a) |

**Archived pages and Archive**

| File | Change | Responsibility |
|---|---|---|
| `features/projects/project-workspace-store.ts` (+ spec) | modify | `archivedOwner`, `readOnly`, `liveChildren` for the current project, `setStatus` on an owner id, `projectWriteSentence` with the code, descendants re-read after a refusal |
| `features/projects/project-page-contract.ts` | modify | `readOnly` in `ProjectPageRendererInputs` (beside `restoreBlocked`) |
| `features/projects/project-workspace-shell.{ts,html}` (+ spec) | modify | Banner placement, `rendererInputs.readOnly`, `liveChildren` to the confirmation |
| `features/projects/archived-banner.{ts,html,scss}` (+ spec, stories) | create | The banner sentence for own and ancestor cases and the `RestoreStatusChoice` |
| `features/projects/project-archive-confirm.{ts,html}` (+ spec, stories) | modify | `liveChildren`; blocked form with links and Close only |
| `features/projects/project-canvas.{ts,html}` (+ spec, stories) | modify | No insertion, add, drag or resize when read-only; archived empty canvas sentence |
| `features/projects/sections/section-frame/project-section-frame.{ts,html}` (+ spec) | modify | Read-only frame: no rename, settings, remove or drag handle; `readOnly` to content; collapse per Q4; renders `reportSummary` |
| `features/projects/shortcuts/shortcut-frame.{ts,html}` (+ spec) | modify | Read-only frame: no drag handle or remove; renders `reportSummary` |
| `features/projects/sections/section-contract.ts` | modify | Optional `reportSummary` in `SectionContentInputs` |
| `features/projects/sections/tasks/task-list-section.{ts,html,scss}` (+ spec, stories) | modify | Archived read-only rows (static, Q5) distinct from the shortcut flavour; the count; drag hint as an overlay |
| `features/projects/pages/todos-page.{ts,html}` (+ spec, stories) | modify | `readOnly` hides Complete and Delete; pending uses `aria-disabled` |
| `features/projects/pages/reflections-page.ts` (+ spec) | modify | `readOnly` from the renderer, covering the ancestor case |
| `features/projects/archived-region/archived-region.{ts,html}` (+ spec) | modify | Use `RestoreStatusChoice` |
| `features/settings/archived-projects/archived-projects-page.{ts,html}`, `archived-projects-store.ts` (+ specs, stories) | modify | Use `RestoreStatusChoice` |

**Markdown**

| File | Change | Responsibility |
|---|---|---|
| `features/projects/sections/markdown/markdown-draft-store.ts` (+ spec) | create | In-memory drafts by section id: `keep`, `take`, `forget` |
| `features/projects/sections/markdown/markdown-section-body.{ts,html}` (+ spec) | modify | Keep on Cancel and destroy when changed; offer on Edit; forget on Save |
| `features/projects/sections/markdown/markdown-source-editor.{ts,html,scss}` (+ spec, stories) | modify | "Your unsaved draft is back." with Discard draft; the "Unsaved preview" caption |

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
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | §21 variants; §23 archived-only wording; §24 first run and the overdue link; §26 the archived header, banner and empty canvas; §30 drafts and the Preview caption; §31 restore from the page's banner as well as Settings; §34 count and drag hint. Each correction is noted in its decision entry |
| `docs/decisions/2026-11-archived-pages-are-read-only.md` | create, with the banner, outermost owner, what stays, Q4, Q5 |
| `docs/decisions/2026-11-empty-workspace-offers-the-first-project.md` | create: first run, the sidebar's archived-only wording, Q3 |
| `docs/decisions/2026-11-digest-overdue-line-leads-to-the-tasks.md` | create, after Q1 |
| `docs/decisions/2026-11-task-list-shows-its-count.md` | create: the header count and the hint overlay |
| `docs/decisions/2026-09-reactivating-under-an-archived-ancestor.md`, `2026-08-project-nesting-and-archive-rules.md`, `2026-09-actionable-archive-and-archived-projects.md`, `2026-10-markdown-source-and-rendering.md`, `2026-10-feedback-stays-on-the-object.md`, `2026-10-rows-open-their-canonical-owner.md` | append dated `**Amended, 2026-11-…**` paragraphs; nesting rules gains its first amendment below its existing "Extended since" note |
| `docs/decisions/README.md` | index the four new entries, mark the amended ones |
| `docs/architecture/web/projects/{overview,why,what,how}.md` | read-only pages, banner, archive confirmation, restore choice, drafts, count, drag hint |
| `docs/architecture/web/core/{overview,how,what}.md` | `ShellStore` list split, `hasArchived`, `requestCreate`, sidebar wording |
| `docs/architecture/web/dashboard/{how,what,why}.md` | first run, overdue link |
| `docs/architecture/web/prototype-tooling/how.md` | Lab specimens |
| `docs/architecture/testing/how.md` | the new e2e spec and profile 79 |
| `docs/architecture/web/overview.md` | `shared/projects/` added to the folder map |

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
3. **Restore one way.** Archive row and Settings adopt the choice.
4. **Archived owner and banner.** Store `archivedOwner`, `readOnly`, `setStatus` on an owner, the
   banner, its shell placement, and the renderer input.
5. **Read-only canvas.** Canvas, section, shortcut and unknown frames, the Task List's static rows,
   and collapse per Q4.
6. **Read-only pages.** Todos (with `aria-disabled` for pending) and the Reflections page.
7. **Refusal first.** `liveChildren`, the blocked confirmation, the late refusal's sentence and
   the re-read.
8. **Empty workspace.** `ShellStore` split, sidebar wording, `requestCreate`, the first-run block.
9. **Digest overdue line**, per Q1.
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
| `app-shell.spec.ts`: `requestCreate()` opens the creation form with its field focused; at narrow width it opens the Menu first | W1-001 |
| `dashboard-page.spec.ts`: first-run block only when `workspaceEmpty()`; its New project calls `requestCreate()`; absent while loading, after a failure, and in an archived-only workspace | W1-001, W4-001, L4-020 |
| `daily-digest-widget.spec.ts` / `today-widget.spec.ts`: per Q1, with overdue tasks a link exists and its activation reaches the overdue rows; with none, no link | W4-028 |
| `project-workspace-store.spec.ts`: `archivedOwner` for an archived project, an archived root over a live child, and two archived levels (outermost wins); `null` for live; restore through the banner calls `projects.update(ownerId, {status})` and reports the receipt | L4-007 |
| `project-workspace-store.spec.ts`: `liveChildren` is the current project's non-archived direct children; a `rule_violation` on archive gives "“X” still has live workstreams. Archive them first." with the reason as `Failure.reason` and starts a descendants re-read; `unreachable` keeps "Couldn’t archive “X”. Try again." | L4-008 |
| `archived-banner.spec.ts`: own and ancestor sentences name the right projects; Restore emits the chosen status for the owner; `aria-disabled` while pending | L4-007, L1-028 |
| `project-workspace-shell.spec.ts`: banner on every page of a read-only project and on none of a live one; `readOnly` reaches the renderer; header rename and Parent stay; the confirmation receives `liveChildren` | Placement; escape hatch |
| `project-archive-confirm.spec.ts`: with live children, no commit button, each child a link to its page, following one closes the dialog, focus returns as today on Close; with none, the commit form unchanged | L4-008 |
| `project-canvas.spec.ts`: read-only renders no insertion points, no end or empty-canvas add, no drag or resize; the archived empty canvas says "This page has no sections."; live unchanged | L4-007, L1-028 |
| `project-section-frame.spec.ts`, `shortcut-frame.spec.ts`: read-only frames have no rename, settings, remove or drag handle and pass `readOnly: true`; collapse per Q4; `reportSummary` text renders after the name; live unchanged | L4-007 |
| `task-list-section.spec.ts`: archived read-only rows are static with no Complete, Delete, drag or drawer, and say "No tasks." when empty; the shortcut flavour still links to its source; the count reports "N tasks" after a read, `null` while loading, after a failure or at zero; the drag hint overlays quick-add without changing the first row's offset | L4-007, L4-023, carried |
| `todos-page.spec.ts`: read-only has no Complete or Delete; a pending completion gives `aria-disabled="true"` with a guarded click and no `disabled` attribute | Carried (slice 75) |
| `reflections-page.spec.ts`: the composer is absent under an archived ancestor | L4-007 |
| `restore-status-choice.spec.ts`: one option list in one casing, default per Q2, Restore emits the status, `aria-disabled` while pending | L4-012 |
| `archived-region.spec.ts`, `archived-projects-page.spec.ts`: both render `RestoreStatusChoice` with the same options and default, and restore through it as before | L4-012 |
| `markdown-draft-store.spec.ts`: keep/take/forget per section id; sections do not share drafts | L3-012 |
| `markdown-section-body.spec.ts`: Cancel with a changed draft keeps it, and the next Edit opens with it; unchanged Cancel keeps nothing; destroy while editing keeps a changed draft; Save success forgets it; a failed Save keeps the draft in the editor as today | L3-012 |
| `markdown-source-editor.spec.ts`: an offered draft shows "Your unsaved draft is back." and Discard draft, which restores the saved text and asks the store to forget; Preview shows "Unsaved preview"; Save is the only `button--primary` | L3-012, W4-031 |
| `design-lab-page.spec.ts`: the empty and archived specimens and the header count specimen | §63 |
| `apps/e2e/empty-archived-editing.spec.ts`: first run creates a project from the main column (1440 and 375); archiving the only project gives the archived-only sidebar; Legacy attic and Legacy shelving have no write controls and restore from the banner, then Undo puts the banner back; Archive Kitchen shows Cabinets as a link and no commit, and following it lands on Cabinets; a forced late refusal says what to do; Archive and Settings restore through the same control; the digest's overdue link reaches the overdue task; a Markdown draft survives Cancel and navigation and Discard draft drops it; a Task List header counts its rows; the first row holds still as a drag starts; keyboard reaches the banner's Restore and Discard draft | End to end |
| `build-sheet.test.mjs` profile 79: fails on a Capture scope context with no `ROWS` row; any write-control selector visible in a read-only row's region, from a named list pinned to exist in the web source (`data-canvas-add`, `data-empty-canvas-add`, `app-insertion-point`, `data-section-drag-handle`, `data-section-remove`, `data-section-config`, `data-section-title-edit`, `data-quick-create`, `data-task-complete`, `data-markdown-edit`, the reflection composer, the progress formula, the resize handles, `data-todo-complete` and the Todos delete), so a rename fails instead of passing silently; a read-only row without the banner or without header rename and Parent; a blocked confirmation with a commit button or a child without a link; restore choices whose option labels or default differ; a first-run row without the main-column New project; an archived-only sidebar without the link or with "No projects yet"; a draft row whose source does not equal the typed draft; a preview without the caption; a count different from the rendered rows; a drag row whose first row moved more than 1 px; any change outside the named cells and panels; Task List cells changing more than the header count; a missing pair; T01–T12 above the slice-78 after counts | Gate |

## Boundaries touched

- **Components depend on gateway interfaces.**
  - The dashboard injects `ShellStore`, a `core/` store already provided by `AppShell`, never a
    concrete gateway.
  - `RestoreStatusChoice` is presentational and imports only a contracts type.
  - `MarkdownDraftStore` holds strings and touches no gateway.
- **`shared/` imports nothing from `core/` or `features/`.** `shared/projects/` is new, and its
  one component takes inputs and emits outputs. The step 4 boundaries review pass checks it.
- **Contracts once.** The restore statuses come from `ProjectRestoreStatusSchema`. The option
  labels are view text, held once in `RestoreStatusChoice`, and the duplicates it replaces in
  `archived-region.ts` and Settings go. The other status label copies are slice 9's.
  `SectionContentInputs` is a web contract, not a wire type.
- **Domain over abstractions; MCP calls domain services.** Neither changes. Every refusal the UI
  now prevents still stands in the domain, so agents over MCP meet the same rules.
- **Tokens only** in `_controls.scss`, the banner, the editor caption and the overlay hint.
- **`core/` never depends on `prototype/`** is unaffected.
- **One central flag service.** Nothing here branches on prototype mode.

## Explicit non-goals

- Everything under Do not.
- A read-only task drawer for archived tasks, if Q5 is answered "static".
- A cross-project overdue view or route, unless Q1 chooses it.
- Persisting drafts across reloads, autosave, or a navigation guard.
- A Task List count of open versus done, grouping, or a count on other section types.
- A new core task (for example "restore from the page"). T01–T12 are the measure.
- Re-styling other empty states (the widgets' sentences, Todos, Reflections). They keep their
  text; the §8 comb judges them.

## Open questions

Each changes the shape of the work, so implementation waits for the user's answers.

1. **Where does the digest's overdue line lead?** (W4-028)
   - *Context.* The digest is provider prose with no task ids. The overdue tasks are in the same
     dashboard result (`today.overdue`), and Today lists them as rows that open their owner. No
     route or filter shows overdue tasks across projects.
   - *Options.*
     - **(a)** Web only: when there are overdue tasks, the digest shows a link, "Show overdue
       tasks", that moves focus to Today's first overdue row. If Today is hidden, it opens the
       first overdue task's section instead.
     - **(b)** Contract: digest lines carry an optional `topic: 'overdue'`, set by the domain. The
       web renders that line itself as a link. This touches contracts, the `AIProvider` interface,
       both providers, the MCP description and their tests.
     - **(c)** Link straight to the first overdue task's section.
   - *Recommendation:* **(a)**. It needs no contract change and keeps the provider's prose
     untouched. It adds one line to the digest, so the overdue dashboard cells change.
   - *Impact.* (b) adds a contract, domain and MCP step, and §50 documentation. (c) hides every
     overdue task after the first.
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
     silently. T09 and the banner stay one click.
   - *Impact.* (b) raises T09 from 1 to 2 clicks, which the plan would record as accepted. It also
     makes the banner two steps.
3. **First run: above the widgets, or instead of them?** (L4-020)
   - *Options.*
     - **(a)** The first-run block sits at the top of the main column, and the seven widgets stay
       below with their true empty sentences.
     - **(b)** The block replaces the widget grid until the first project exists.
   - *Recommendation:* **(a)**. It needs no special layout path, the persona's widget preferences
     stay meaningful, and the digest and fun fact still speak.
   - *Impact.* (b) changes `empty-dashboard` more, and needs a rule for when the grid returns.
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
   - *Impact.* (a) adds a local view state to two frames. (b) is simpler but changes what an
     archived page looks like. (c) hides content.
5. **Task rows on a read-only Task List.**
   - *Context.* Today a row on an archived project opens the drawer, whose edits are all refused.
   - *Options.*
     - **(a)** Static rows: title, status and date, with no drawer.
     - **(b)** A read-only drawer.
   - *Recommendation:* **(a)**. It matches slice 77's rule that rows link or stay static. A
     read-only drawer is a new surface.
   - *Impact.* (b) adds a drawer mode, its tests and its pairs, and is better deferred to its own
     slice.

**Defaults taken** (small and non-shape-changing; say if any is wrong):

- **Drafts** live in memory until reload, and come back with "Your unsaved draft is back." and
  Discard draft.
- **The Preview caption** says "Unsaved preview".
- **The count** says "N tasks", counting open and done, in the frame header of canonical and
  shortcut Task Lists.
- **The drag hint** overlays quick-add.
- **The first-run New project** opens the sidebar's existing form.
- **Sidebar wording:** "No active projects." plus "Archived projects are in Settings." as a link.
- **The banner** restores the outermost archived owner.
- **The late refusal** says "“X” still has live workstreams. Archive them first."
- **The empty variant** is applied only to the surfaces this slice touches.

## Revisions

- **Draft (2026-11-02, S79PLAN):** first draft, written from the candidate, the umbrella brief, the
  spec sections, the four named decisions and code surveys of the workspace, canvas, Archive,
  Settings, shell, dashboard, Markdown and evidence tooling.
