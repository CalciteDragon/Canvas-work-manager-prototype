<!-- plan id="75" status="active" summary="Redesign slice 4b (TH07, TH15 task-add): pending within 100 ms, a saved cue, failures on the row, new items scrolled into view and focused, a canvas that holds still" -->
# Slice 75 — Feedback: pending, saved and new items in view

**State (2026-10-18):** plan revised through review rounds 1–3; awaiting
the user's answers to the Open questions. No product code has changed.

Redesign slice 4b under the [UI/UX overhaul umbrella](../active/70-ui-ux-overhaul.md). Theme
**TH07**, "Feedback is detached from the action", in [themes.json](../70-ui-ux/themes.json): this
slice takes the half that [slice 74](../completed/74-feedback-toast-and-undo.md) left, by the
user's split of 2026-10-17. It also closes the four TH15 quick-add findings that
[slice 73](../completed/73-lifts-and-focus.md) implemented without claiming them.

## Goal

Every write in the Task List, the task drawer and the canvas's create dialog shows it is pending
within 100 ms, edits without a Save button say they saved, a failure names the row it belongs to,
and what the user just made is on screen and focused while the rest of the canvas holds still
(principles 6 and 7 of [direction.md](../70-ui-ux/direction.md)).

## Spec sections

- **§21** visual design system, motion. Every new value is a token; motion is transform and
  opacity only, and under `prefers-reduced-motion: reduce` it is capped by the existing
  `--motion-duration-cap` (an 80 ms crossfade), as principle 7 says.
- **§26** project page design. A created section or shortcut lands in view with focus on its
  heading.
- **§27** Section Canvas. The canvas holds a working section still when content above it grows.
- **§30** Recent Activity. Its growth no longer moves the section being worked in.
- **§34** task interactions. The quick-add paragraph (Slice 61 amendment, "Quick-add preserves any
  existing selection …") gains the pending row, the field-level refusal, row-level failures and
  the new row in view. The drawer gains its saved cue.
- **§63** optimistic UI. Drawer field edits become optimistic with revert to the last confirmed
  value, so the row and the drawer never disagree while a write is pending (L3-008). §63's rule
  that a failed write "may still have committed, so it also owes a read" governs the failed add.
- **§67** Design Lab: pending and failed task-row specimens; the drawer specimen shows the cue.
- **§69** verification, **§77** design-first loop, **§78** decision log.
- [Overhaul protocol](../../guides/ui-ux-overhaul-protocol.md) §6–§7.

## Build

- **New items in view.** A created section or shortcut is scrolled to its top and its heading
  takes focus, through a `revealTarget` generalised to both placement kinds, instead of focus
  returning to the insertion point. A quick-added task's row is brought into view in a long list
  and announced, with focus kept in the add field.
- **Pending within 100 ms.** Quick-add paints a pending row synchronously and refuses a second
  submit while one is pending. One pending vocabulary with completion's: `aria-busy` on the busy
  object, `aria-disabled` (never `disabled`) on its control so focus stays, and "<Verb>ing…" copy.
- **Saved cue.** The task drawer says its edits save automatically and shows Saving…, Saved or a
  failure beside the field that changed.
- **Failures on the row.** A failed add, complete, reopen, delete or field edit names its row or
  field, next to it, with what to do. A failed agent permission change names the connection and
  the permission in that connection's card. An empty name or title says why instead of ignoring
  the click.
- **A canvas that holds still.** When content above the section being worked in grows (Recent
  Activity in Kitchen is the reproduced case), the working section stays where it was.
- **Evidence for slice 73's quick-add change.** Closed on the sheet with captures.

## Done when

- The 13 TH07 findings and four TH15 findings under Findings closed are closed on the
  before/after sheet.
- Core task T03 costs no more than its baseline (10 clicks, 38 keystrokes).
- e2e pins the keyboard and touch paths.
- The user accepts the sheet at Gate 2.

## Do not

- Rebuild the toast or Undo (slice 74).
- Change section collapse (slice 5), task drag (slice 6) or the Markdown editor (slice 6).
- Touch domain, contracts, host, persistence, MCP or the gateway.
- Redesign the agent connections page (the agent connections slice). Only its permission-failure
  placement changes here.

<!-- ───────────── Written when the slice starts ───────────── -->

## Scope check

The slice-74 split assigned these findings here; all are reproduced in
[reproduction.json](../70-ui-ux/reproduction.json). Nothing from slice 74's other groups (L3-016,
L3-017, L3-012, W4-031, L3-023) is taken.

**Handed over by slice 74.** Its record (Acceptance, "Known inconsistency") and the
[one-toast decision](../../decisions/2026-10-feedback-is-one-toast-with-undo.md) say that
same-history task completion on Todos "awaits Slice 75's saved feedback": ticking a
descendant-owned task on Todos shows a toast, ticking a root-owned one shows nothing. This plan
must answer it; Open question 5 asks how.

**Code read for this plan** (paths under `apps/web/src/app/`):

- `features/projects/project-canvas.ts:216–222`: `revealTarget` finds only `[data-section-id]`
  wrappers and focuses `[data-section-title]`; only the `#section-<id>` fragment calls it.
  Shortcut wrappers carry `data-shortcut-id` instead (`project-canvas.html:74–75`).
  `closeCreate()` (`:303`) returns focus to the remembered opener, the insertion point, which the
  new item pushes off screen (W3-016).
- `features/projects/project-page-store.ts:531–561`: `addSection` and `addShortcut` return
  `CanvasWriteResult` (`{ ok: true }`) and do not say what they created.
- `features/projects/shortcuts/shortcut-frame.html:35`: the shortcut `h2` has no `tabindex="-1"`.
- `features/tasks/task-row.ts:23`: `task` is `input.required<Task>()`, so a not-yet-created task
  cannot be a `TaskRow` without a fake `Task`.
- `features/tasks/task-list-store.ts:192–217`: `create` is not optimistic, has no load-generation
  guard and owes no read after a failure. Every failure writes the one section-level
  `errorState`, shown as one `[data-tasks-error]` banner (L4-005). `updateTitle` with a blank
  title also writes it (`:222–224`).
- `features/tasks/task-list-store.ts:371–395`: `updateFields` is not optimistic, so the drawer
  shows the new value while the row shows the old one (L3-008). It queues edits per `id:field`
  and claims the field revision inside the queued operation.
- `features/tasks/task-row.html:61`: Delete uses `[disabled]` while archiving.
- `features/projects/sections/tasks/task-list-section.html:47–63`: the empty state and the
  `cdkDrag` row loop; `task-list-section.ts` `quickCreate` clears the field only after success.
- `features/activity/activity-store.ts`: revision reads are quiet and keep the rendered rows, so
  the push in W1-030/W2-010 is plain growth (up to 20 rows), not a loading flash. `ActivityFeed`
  is shared with the dashboard's Recent Agent Activity widget.
- `core/shell/sidebar/sidebar.ts:94–101`: an empty name returns silently.
  `features/projects/work-create-dialog.html:9`: the name field is `required`, so the browser's
  own validation blocks the submit with a native bubble that names nothing in the accessibility
  tree the auditor read.
- `features/settings/agents/agent-connections-store.ts:31–40`: a permission failure writes one
  page-level `errorState` (L4-005, third evidence).

## Findings closed

| Finding | Sev | Closed by |
|---|---|---|
| W1-024, W2-008 | S2 | After Create in the section dialog, the new section is scrolled to its top and its heading has focus, at 1440 and 375 (Open question 6 asks heading versus first control) |
| W3-016 | S2 | After Add in the shortcut picker, focus is on the new shortcut's heading, which is inside the viewport, never on an off-screen insertion point |
| W1-043 | S3 | A new shortcut is shown from its top, the same as a new section |
| L4-023 | S2 | In a 30-task list, the quick-added row is brought into view while the add field stays visible and focused, and "Added “X”." is announced (Open question 1) |
| L3-007, L4-004 | S2 | Within 100 ms of submit a pending row "X · Adding…" is in the list, the field is cleared and keeps focus, and **Add task** reads "Adding…" with `aria-disabled`; a second submit while pending is refused and keeps the draft |
| L3-008 | S2 | The drawer says "Changes save automatically." Each field shows "Saving…" then "Saved" beside its label; the row and the drawer show the same value throughout |
| W2-018 | S3 | On the phone sheet, "Saved" appears beside Due date, in view, and the drawer's Status fact stops reading "Overdue" once the new date is in the future |
| L4-005 | S2 | A failed complete says "Couldn't complete “X”. Try again." with the reason, on that row beside the reverted checkbox; a failed add names its title beside the add field; a failed permission change says "Couldn't change Modify tasks for Cursor. Try again." in Cursor's card. Two failures show two messages, each on its own object |
| L4-024 | S3 | Create with an empty name in New project or Add workstream, or Add task with an empty title, marks the field `aria-invalid` and says "Enter a name." (or "Enter a task title."), with focus kept in the field |
| W1-030, W2-010 | S3/S2 | Writes in a Task List below Recent Activity leave that Task List's top within 1 px of where it was, at 1440 and 375; new activity rows fade in with opacity only |
| W1-026, W3-012, W2-009, W4-008 | S3/S2 | Evidence for slice 73's change: after three quick-adds the drawer is closed, rows are full width and focus is in the add field, at 1440 mouse, 1440 keyboard, 375 touch and as Sam. "Before" comes from the pre-73 build, not `e15f3b7` |

## Acceptance check

**A. Foundations,** with stories and Lab specimens before any surface adopts them (protocol §7.1).

1. A presentational `PendingTaskRow` in `features/tasks/` takes a typed `{ key, title }`, renders
   the title and "Adding…" with `aria-busy="true"`, has no checkbox, Delete or title button, and
   shares `task-row.scss`. `TaskRow` gains one input, `error`: a message under the title with
   `role="alert"`, referenced by the checkbox's `aria-describedby`. TaskRow's Delete moves from
   `[disabled]` to `aria-disabled` while archiving (the shared vocabulary). Stories (`Adding`,
   `Failed`) and the Lab's live task-row panel, both themes. Tokens only.
2. A shared `.field-status` pattern in `apps/web/src/styles/_controls.scss` for a status beside a
   label: saving (muted), saved (success, fades with opacity after 2 s), failed (danger). Under
   reduced motion the fade is the capped 80 ms crossfade. One polite live region per surface
   announces it. Lab specimen and story.

**B. Task List.** Seeds nested-projects (Kitchen) and busy-week (Launch), 1440 dark and 375 touch
light.

3. With POST `/api/tasks` delayed 2 s, typing "Order tiles" and pressing Enter shows a pending
   row "Order tiles · Adding…" after the last task within 100 ms (keydown to row insertion,
   measured in the page, five runs, worst reported). The field is empty and focused; Add task
   reads "Adding…" with `aria-disabled="true"`. Typing "Second" and pressing Enter again sends
   nothing and keeps "Second" in the field. When the response lands, the pending row becomes the
   real row in the same place and "Added “Order tiles”." is announced politely.
4. In an empty list, the pending row replaces "No tasks yet. Add the first one above."; the empty
   state never shows beside it. The pending row is not draggable.
5. With the POST failing, the store makes one quiet read before deciding. If the task is absent,
   the pending row is removed, "Order tiles" goes back into the field if the field is still
   empty, and "Couldn't add “Order tiles”. Try again." with the reason is shown beside the form
   and referenced by the field's `aria-describedby`. The write counts as committed only if the
   read finds a task with this title whose id was not in the list at submit; then the row stays
   and no error shows. If the owed read itself fails, the pending row is removed, the title is
   **not** put back, and "Couldn't confirm “Order tiles” was added. Check the list before adding
   it again." is shown instead. A later successful add clears the message.
6. With 30 tasks (agent-heavy `project-work-manager` with a 30-task fixture), a quick-add brings
   the new row into view while the add field stays inside the viewport and focused (Open
   question 1 decides how). At 375 touch the same holds.
7. Pressing Add task with an empty field: `aria-invalid="true"`, "Enter a task title." beside the
   field, focus in the field. No request is sent. Typing clears the message.
8. With PATCH failing, ticking two tasks shows a message on each row; the section shows no banner
   for row writes. A failed reopen and a failed Delete show their messages on the row. The
   section-level `[data-tasks-error]` remains only for load and drag-receive failures.
9. A read-only shortcut Task List renders no add form, no pending row and no row errors
   (unchanged).

**C. Task drawer.** nested-projects at 1440 dark and overdue-chaos at 375 light (W2-018's case).

10. The drawer shows "Changes save automatically." under its eyebrow.
11. With PATCH delayed 2 s, changing Priority shows "Saving…" beside Priority within 100 ms, and
    the row behind already shows the new priority. After the response it shows "Saved". Title
    (Enter), Due date and Estimate behave the same. Changing Due date on an overdue task to a
    future date makes the Status fact stop reading "Overdue", using TaskRow's derivation.
12. With PATCH failing, the field shows "Not saved. Try again." with the reason; the field and the
    row both revert to the last value the server confirmed; nothing else in the drawer changes.
    A field shows one alert at most: the existing blank-title `titleError` and "Not saved" never
    show together.

**D. Canvas creation.** nested-projects Kitchen, 1440 and 375, mouse, touch and keyboard.

13. Insert at end → Task List → title "Shopping" → Create: the dialog closes, the Shopping
    section's top is inside the viewport (at or below the sticky top bar), and
    `document.activeElement` is its `[data-section-title]` heading. Never `body`.
14. Keyboard only: Insert before Markdown → Add shortcut → Add the first source: the new
    shortcut's heading has focus and its rect is inside the viewport (W3-016's exact check).
    This is measured by the verification script, not by core task T07, which has been blocked
    since the baseline.
15. A refused create keeps the dialog open with its message (unchanged), and a create whose canvas
    changed underneath it falls back to the existing focus return.

**E. Canvas holds still.** nested-projects Kitchen with a Task List added at the end, scrolled so
its rows are in view and the scroller is not at 0.

16. Adding a task whose new row is already in view (W2-010's repro, so no reveal runs),
    completing two tasks and editing one title in that Task List, each of which grows Recent
    Activity above it, leaves the Task List's `getBoundingClientRect().top` within 1 px of its
    value before the write, after the write settles, at 1440 and 375, in Chromium.
17. The hold applies only to growth above the working section, which is the section containing
    the focused element, or the last one interacted with. An explicit reveal (a quick-added row
    or a created section brought into view) resets the hold's baseline instead of being undone.
    A user scroll after the write began cancels the hold. Growth below never scrolls.
18. At scroll offset 0 nothing is above the viewport to hold against; the section may move as the
    page grows, which is recorded, not asserted.
19. New activity rows fade in with opacity, on the canvas and on the dashboard's Recent Agent
    Activity widget, which shares `ActivityFeed`; reduced motion uses the capped crossfade.

**F. Other forms.**

20. Sidebar New project and Add workstream with an empty name: as step 7, with "Enter a name.".
    Add workstream gets `novalidate`, so the browser bubble no longer pre-empts the message; an
    e2e test covers it, because jsdom does not reproduce native validation.
21. `/settings/agents` (agent-heavy), with PATCH failing, toggling Cursor › Modify tasks shows
    "Couldn't change Modify tasks for Cursor. Try again." with the reason inside Cursor's card,
    linked to the checkbox by `aria-describedby`; the page-level alert is used only for load
    failures. The agent checkboxes keep `[disabled]` while busy; the agent connections slice owns
    that page's controls.

**G. Evidence.**

22. Before: `ux:capture` from `e15f3b7`. The slice-73 pair uses the pre-73 build already kept in
    `apps/e2e/ux-output/slice73-baseline-web/` and served by `slice73.config.ts`, labelled as
    such. That build is git-ignored and local only; if it is missing, rebuild it from the commit
    before `6fc2d9d` as slice 72's handoff describes. After: the slice's final
    commit. `build-sheet.mjs --profile 75` produces the sheet with zero gate failures and every
    pair under Visual acceptance, with listed exceptions only.
23. `ux/placement-verification.ts` records steps 3, 6, 11, 13, 14 and 16 as measurements
    (timings, rects, active element) to `placement-verification.json`, which the sheet reads.
24. T03 re-runs through `ux/tasks.ts`: at most 10 clicks and 38 keystrokes.
25. `pnpm test`, `pnpm lint` (including `docs:check`), the production build under the 1,100 kB
    ceiling, Storybook build, and every e2e journey. Unrun checks are recorded as unrun. e2e runs
    Chromium only, so any WebKit reasoning is recorded as unverified.
26. Real use on nested-projects and busy-week at 1440 and 375, with friction recorded in
    `.prototype/notes.json`; `CURRENT_SLICE = 75`.

## Capture scope

**Must change:**

- Task drawer cells (the "Changes save automatically." line), 1440 and 375, both themes.
- The Lab's live task-row panel and the new `.field-status` specimen.
- Cells captured after a section or shortcut create (scroll position and focus).
- The supplemental state captures below, which exist only after this slice.

**Must not change** beyond 1 px: every other cell, including the Task List, sidebar, Add
workstream dialog, agent connections and the dashboard at rest, with no error and no pending
write. If Open question 1 is answered with a sticky add field, the Task List at rest still must
not change.

## Visual acceptance

Pending, failed and saved states need a delayed or failing route, so they are supplemental
captures from the verification script rather than matrix cells, with their provenance labelled
on the sheet, as slice 74 did.

| Pair (before → after) | Seed, size, theme | Findings |
|---|---|---|
| Section created below the fold, focus on body → new section at top, heading focused | nested-projects Kitchen, 1440 dark, 375 light | W1-024, W2-008 |
| Shortcut added, view on its bottom edge → shortcut from its top, heading focused | nested-projects Kitchen, 1440 dark keyboard | W3-016, W1-043 |
| 0.1 s after Add task: unchanged form → pending row, "Adding…" | busy-week Launch, 1440 dark, 375 light | L3-007, L4-004 |
| Long list, new row far below → new row in view with the field | agent-heavy, 1440 dark | L4-023 |
| Drawer edit, no cue, row disagrees → "Saving…"/"Saved", row agrees | nested-projects, 1440 dark | L3-008 |
| Phone due-date edit, nothing in view → "Saved", Status no longer Overdue | overdue-chaos, 375 light | W2-018 |
| One banner for two failures → a message on each row; permission failure in its card | busy-week 1440 dark; agent-heavy settings 1440 | L4-005 |
| Empty Create ignored → "Enter a name." on the field | nested-projects sidebar and Add workstream, 1440 | L4-024 |
| Task List pushed down by Recent Activity → same top before and after | nested-projects Kitchen, 1440 dark, 375 light (two frames each) | W1-030, W2-010 |
| After three quick-adds: drawer open (pre-73 build) → drawer closed, full-width rows | nested-projects Kitchen, 1440 dark, 375 light, as Sam | W1-026, W3-012, W2-009, W4-008 |

Behaviour findings are proved by tests as well as pictures: focus (W3-016, W2-008), 100 ms
(L3-007, L4-004), and the 1 px hold (W1-030, W2-010) are e2e assertions in
`apps/e2e/placement.spec.ts`.

## Behaviour vs. appearance

**Behaviour changes**, so §77 applies: tests, implementation and docs change together.

- **Behaviour:** optimistic quick-add with a pending row, a refused second submit and an owed
  read after failure; optimistic drawer field edits with revert to the last confirmed value;
  row-, field- and card-level failure state; field-level empty-name refusal; focus and scroll
  after canvas create; the scroll hold; whatever Open question 5 decides for Todos completion.
- **Appearance:** the pending and failed row, `.field-status`, the drawer's line, the activity
  row fade.
- **Specs that read the section-level task error or the changed focus and change with it**
  (Stage 0 re-greps before any edit): `apps/e2e/task-interaction.spec.ts`,
  `apps/e2e/row-history.spec.ts`, `apps/e2e/phone-layout.spec.ts` (only an error assertion may
  move; its layout assertions stay unedited); `task-list-section.spec.ts`;
  `task-list-store.spec.ts`; `task-row.spec.ts` (Delete `aria-disabled`); `sidebar.spec.ts` and
  `app-shell.spec.ts` (`data-create-error`); `agent-connections-page.spec.ts`;
  `work-create-dialog.spec.ts`; `project-canvas.spec.ts` (focus after create).
- **Only if Open question 5 is answered as recommended:** Todos completion failures move from the
  page-level `[data-todo-write-error]` (`todos-page.html:9–10`) to the row, so
  `apps/e2e/todos.spec.ts`, `todos-page.spec.ts` and `todos-page-store.spec.ts` change with it.
  Todos Delete failures stay page-level; only completion moves.
- Every other e2e spec stays green **unedited**.

## File-level change list

Paths are under `apps/web/src/app/` unless stated.

| File | Change | Responsibility |
|---|---|---|
| `features/tasks/pending-task-row.ts`, `.html`, `.spec.ts` | create | The pending-create row over `{ key, title }`, sharing `task-row.scss` |
| `features/tasks/task-row.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts` | modify | `error` input; Delete `aria-disabled`; `Adding` and `Failed` stories |
| `features/tasks/task-list-store.ts`, `.spec.ts` | modify | Optimistic create with a generation-guarded pending entry, one-at-a-time refusal and an owed read on failure; optimistic `updateFields` with claim, paint and the pending-mutation count all raised at call time, not at dequeue, so live re-reads wait behind a queued edit; `rowErrors`, `createError`, `fieldSaves` signals; section `error` kept for load and receive |
| `features/tasks/task-detail-drawer.ts`, `.html`, `.scss`, `.spec.ts` | modify | "Changes save automatically."; `saveStates` rendered with `.field-status`; one polite region; Overdue in the Status fact |
| `features/projects/sections/tasks/task-list-section.ts`, `.html`, `.scss`, `.spec.ts` | modify | Pending row after the drag loop and instead of the empty state, field refusal and failure, Adding… button, announcement, new row in view, row errors and save states |
| `features/projects/project-page-store.ts`, `.spec.ts` | modify | `addSection` and `addShortcut` resolve `{ ok: true, placementId }` |
| `features/projects/project-canvas.ts`, `.html`, `.spec.ts` | modify | `revealTarget` for both placement kinds; reveal and focus the created placement instead of the opener; the scroll hold |
| `features/projects/canvas-chrome/scroll-hold.ts`, `.spec.ts` | create | Keeps the working placement's top fixed while placements above it resize; reveals reset it (Stage 0 may replace it with a CSS fix) |
| `features/projects/shortcuts/shortcut-frame.html`, `.spec.ts` | modify | `tabindex="-1"` and `data-shortcut-title` on the heading |
| `features/activity/activity-feed.ts`, `.html`, `.scss` | modify | Opacity entry for rows that arrive after first render |
| `features/projects/pages/todos-page.*`, `todos-page-store.*` | modify (if Open question 5 takes it) | Same-history completion feedback on Todos |
| `core/shell/sidebar/sidebar.ts`, `.html`, `.spec.ts` | modify | Empty-name refusal on the field |
| `features/projects/work-create-dialog.ts`, `.html`, `.spec.ts` | modify | `novalidate` and the empty-name refusal on the field |
| `features/settings/agents/agent-connections-store.ts`, `agent-connections-page.html`, `.spec.ts` | modify | Permission failure kept per connection and permission, shown in its card |
| `../styles/_controls.scss`, `../styles/_tokens.scss` | modify | `.field-status` beside `.field` and `.control-label`, and any new duration token |
| `prototype/design-lab/panels/live-panels.html`, `.ts`; `primitive-panels.html`, `.ts` | modify | Adding and Failed task-row specimens; `.field-status` specimen |
| `prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 75` |
| `apps/e2e/placement.spec.ts` | create | Acceptance 3–8, 11–14, 16–17, 20–21 at 1440 keyboard and mouse and 375 touch |
| `apps/e2e/task-interaction.spec.ts`, `row-history.spec.ts`, `phone-layout.spec.ts` | modify | §77: section banner → row or field message |
| `apps/e2e/ux/placement-verification.ts`, `apps/e2e/ux/slice75.config.ts` | create | Measurements and supplemental captures for the sheet |
| `apps/e2e/ux/tasks.ts` | modify | T03 on its current path, if the path changed |
| `docs/roadmap/70-ui-ux/tooling/build-sheet.mjs` and its test | modify | `--profile 75`, its listed exceptions and the verification file |
| `Canvas Work Manager — … Specification.md` | modify | §26, §27, §30, §34, §63, §67, as listed under Spec sections |
| `docs/decisions/2026-10-feedback-stays-on-the-object.md` | create | Pending vocabulary, saved cue, failures on the object, new items in view, the hold, the answers to the Open questions |
| `docs/decisions/2026-10-feedback-is-one-toast-with-undo.md` | modify | Dated amendment: the create exemption (Open question 3) and Todos completion (Open question 5) |
| `docs/decisions/2026-10-creation-defaults-follow-the-open-work.md`, `2026-09-task-checkbox-reopen-and-selection.md`, `2026-09-task-delete-recovery-feedback.md` | modify | Dated amendments where their quick-add, completion-failure or delete-failure rules change; Stage 0 greps the rest of `docs/decisions/` |
| `docs/decisions/README.md` | modify | Index the new entry and the amendments |
| `docs/roadmap/70-ui-ux/direction.md` | modify | Dated amendment to principle 6 if Open question 3 is confirmed |
| `docs/architecture/web/tasks/{overview,how,what,why}.md` | modify | Optimistic create and edits, the pending row, row errors, the drawer cue |
| `docs/architecture/web/projects/{overview,how,what}.md` | modify | Reveal after create, the scroll hold, Recent Activity, Todos if taken |
| `docs/architecture/web/dashboard/how.md` | modify | `ActivityFeed`'s entry fade reaches the Recent Agent Activity widget |
| `docs/architecture/web/prototype-tooling/{how,what}.md` | modify | The new Lab specimens; `CURRENT_SLICE` |
| `docs/architecture/web/core/how.md`, `docs/architecture/web/how.md` | modify | Sidebar refusal; agent connections failure placement |
| `docs/architecture/testing/how.md`, `testing/what.md` | modify | `placement.spec.ts` and the slice-75 verification script |
| `docs/roadmap/goals.md`, `docs/roadmap/active/70-ui-ux-overhaul.md`, `docs/roadmap/completed/74-feedback-toast-and-undo.md` | modify | Links retargeted from `planned/` to `active/` (done at start, mechanical); direction and the umbrella's handoff at close |
| `.prototype/notes.json` | modify | Real-use friction only |

## Implementation sequence

0. **Stage 0.** Re-grep every spec and decision named above. Capture "before" from `e15f3b7`.
   Then measure W1-030 on the current build in Chromium, from a non-zero scroll offset: does
   native scroll anchoring already hold the working section after a task write?
   - If it does not, find the suppressor (CSS that defeats anchoring, or anchoring choosing a node
     inside Recent Activity) and prefer a CSS fix (`overflow-anchor: none` on the growing list)
     over the JS hold.
   - If it holds at both 1440 and 375, `scroll-hold.ts` is dropped and the finding closes on
     evidence plus the fade. WebKit has no `overflow-anchor`; that gap is recorded as unverified,
     not built for. The choice is recorded in Revisions.
1. **Foundations.** `PendingTaskRow`, TaskRow `error`, `.field-status`, stories and Lab specimens.
2. **Task List store and section.** Optimistic create, refusal, owed read, row errors, field
   refusal, new row in view.
3. **Drawer.** Optimistic field edits, `fieldSaves`, the line and cue, Overdue.
4. **Canvas.** Created id from the store; generalised reveal and focus; the hold (per Stage 0).
5. **Other forms.** Sidebar, Add workstream, agent permissions; Todos per Open question 5.
6. **Evidence.** Verification script, T03, sheet, real use; then step 4 reviews of the diff.

## Test plan — tests first

| Test | Proves |
|---|---|
| `pending-task-row.spec.ts`: renders title and "Adding…" with `aria-busy`; no checkbox, Delete or title button | A.1 |
| `task-row.spec.ts`: `error` renders an alert referenced by the checkbox's `aria-describedby`; Delete is `aria-disabled` while archiving and a click then does nothing | A.1, vocabulary |
| `task-list-store.spec.ts`: `create` inserts a pending entry synchronously before the gateway resolves; success replaces it in place; a second `create` while one is pending returns `false` without a request | L3-007, L4-004 |
| `task-list-store.spec.ts`: a failed create makes one quiet read; absent → pending entry removed and `createError` names the title; present (500 after commit) → the row stays, no error, and a retry cannot duplicate it; a same-title task already in the list before submit does not count as committed; a failed owed read leaves the title out of the field and sets the "Couldn't confirm" message | L4-005, §63 owed read |
| `task-list-store.spec.ts`: a `load` for another section while a create is pending drops the pending entry, and the late answer paints nothing | Generation guard |
| `task-list-store.spec.ts`: a live re-read during a pending create keeps the pending entry and does not duplicate the row when both land | No stale or double row |
| `task-list-store.spec.ts`: an empty title sets `createError` "Enter a task title." and sends nothing; a blank drawer title sets that field's error, not the section's | L4-024, error placement |
| `task-list-store.spec.ts`: a failed `complete`, `reopen` and `archive` each set `rowErrors` for that id only; success or a new attempt on the row clears it; two failures keep two entries; section `error` stays null | L4-005 |
| `task-list-store.spec.ts`: `updatePriority` paints at call time; `fieldSaves` moves saving → saved; failure restores the last server-confirmed value and sets failed; two same-field edits that both fail restore the server value, not the first edit's; an older failure never reverts a newer success; a live re-read during a pending edit does not repaint the old value | L3-008, §63 |
| `task-list-section.spec.ts`: submit clears and keeps focus in the field; "Adding…" with `aria-disabled`; "Added “X”." announced; failure returns the title only to an empty field and links the message by `aria-describedby`; the pending row replaces the empty state and sits outside `cdkDrag`; a read-only list renders none of it | Acceptance 3–5, 7, 9 |
| `task-list-section.spec.ts`: the new row is brought into view without moving the field out of the viewport (stubbed geometry) | L4-023 |
| `task-detail-drawer.spec.ts`: the line renders; `saveStates` renders Saving…, Saved and "Not saved. Try again." beside the right field; one polite region; `titleError` and "Not saved" never both show; Status reads Overdue from the same derivation as TaskRow | L3-008, W2-018 |
| `project-page-store.spec.ts`: `addSection` and `addShortcut` resolve `{ ok: true, placementId }` | Reveal input |
| `project-canvas.spec.ts`: after a successful dialog create, the new section's heading gets focus and is scrolled to; the same for a shortcut through `data-shortcut-id`; the opener does not get focus; a refused create returns focus as today; a stale canvas falls back | W1-024, W2-008, W3-016, W1-043 |
| `scroll-hold.spec.ts` (if kept): a resize above the working placement adjusts `scrollTop` by the delta; below, nothing; a user scroll since the write began cancels the hold; a reveal during a hold resets the baseline; growth above plus the working list's own growth with no reveal still holds its top | W1-030, W2-010, Acceptance 17 |
| `shortcut-frame.spec.ts`: the heading is focusable with `tabindex="-1"` | W3-016 |
| `activity-feed.spec.ts`: rows present at first render do not animate; rows that arrive later carry the entry class | Acceptance 19 |
| `sidebar.spec.ts`, `work-create-dialog.spec.ts`: an empty submit sets `aria-invalid`, shows "Enter a name.", keeps focus, emits nothing; typing clears it; the dialog form has `novalidate` | L4-024 |
| `agent-connections-page.spec.ts`: a failed toggle shows its message in that card only, names connection and permission, and reverts the checkbox | L4-005 |
| `placement.spec.ts` (e2e) | Acceptance 3–8, 11–14, 16–17, 20–21; keyboard and touch; the native-validation path of step 20 |

`placement.spec.ts` uses `page.route` with `route.fallback()` for delays and failures, role-based
locators, and both themes where the assertion is visual. The 100 ms check records the time from
the keydown to the row's insertion with a `MutationObserver` in the page, so the runner's own
latency does not count.

Write each test, watch it fail for the right reason, then implement.

## Boundaries touched

- **Gateway interfaces only.** No component touches HTTP; the stores keep using
  `WORK_MANAGER_GATEWAY`. No new gateway member.
- **Contracts once.** The pending entry is a store-local `{ key, title }`, rendered by
  `PendingTaskRow`; it is never a fake `Task` and carries no server fields. `CanvasWriteResult`
  is a browser type in the projects feature.
- **No domain, host or persistence change.** Optimism is browser-side; the server's answer still
  wins.
- **Dependency direction.** `features/tasks` never imports `features/projects`; `core/shell`
  imports no feature (the sidebar change is local). The scroll hold lives in the projects feature
  and finds its scroller through the DOM (the nearest scrolling ancestor), not through a `core/`
  import.
- **Tokens only.** Every new value is a token; the token lint covers the new styles.
- **No scattered prototype flag.** None is added.

## Explicit non-goals

- Everything listed for slices 5, 6 and the agent connections slice in slice 74's Scope check,
  including the agent checkboxes' `[disabled]`.
- Queueing several quick-adds while one is pending (Open question 2).
- Pending or saved cues for writes outside the Task List, the drawer, the create dialog and (per
  Open question 5) Todos completion — for example Markdown, Progress or the project details
  dialog. Each is noted for its slice if real use shows it matters.
- Grouping or collapsing completed tasks, or a task count, in long lists (L4-023's second half is
  a TH09 objects-and-states concern, slice 6).
- The drawer's half-width rows from L4-023's evidence: slice 73 moved the drawer into the top
  layer, so it no longer squeezes the list; this is confirmed on the sheet, not rebuilt.

## Open questions

These need the user before implementation, because each changes the shape of the work.

1. **Keeping the add field and the new row both in view (L4-023).** The list appends at the
   bottom, the field is at the top, and focus must stay in the field, so in a long list both
   cannot be on screen by scrolling alone.
   - *Recommended:* the quick-add form becomes sticky at the top of the scroller while its Task
     List is on screen, on its sheet plane, so scrolling the new row into view keeps the field
     visible. At rest nothing changes.
   - *Alternative A:* scroll only when both fit; otherwise announce and show "Added “X” · Show"
     beside the field, which scrolls to the row on request.
   - *Alternative B:* move the add field below the list, next to where rows appear.
2. **A second submit while one is pending.** *Recommended:* refuse it and keep the draft, as the
   candidate says; the pending interval is normally under 100 ms. *Alternative:* queue submits
   in order, each with its own pending row.
3. **No toast for task create.** Principle 6 as amended for slice 74 says confirmation uses "one
   predictable toast", and the one-toast decision covers "the supported writes". *Recommended:*
   exempt quick-add: the row itself is the confirmation, with a polite announcement. A toast per
   quick-add would close the previous write's toast and cover the list on a phone; Undo for a
   create stays in the header. If confirmed, principle 6 and the decision get dated amendments.
   *Alternative:* a toast with Undo for each add.
4. **Where the failed add goes.** *Recommended:* after the owed read finds no task, the pending
   row is removed and its title returns to the field with the message beside it, so Enter
   retries. The read is what keeps a retry from duplicating a task that committed behind a
   failure. *Alternative:* the pending row stays in the list marked failed, with Retry and
   Discard.
5. **Same-history completion on Todos** (handed over by slice 74). *Recommended:* treat the
   optimistic checked row as completion's confirmation on both surfaces, as the Task List
   already does, and give a failure its row message on Todos too; the cross-owner toast stays,
   because that write lands in another project's history. The decision records that the
   asymmetry is accepted. *Alternative:* a row-local "Saved" cue after every completion, on
   both surfaces.
6. **Where focus goes in a new section (W2-008: "so the user can start filling it").**
   *Recommended:* its heading, for every type: Progress and Recent Activity have no first
   control, and the next Tab reaches the first control. *Alternative:* the first control when
   the type has one (the add field in a Task List, the editor in Markdown), else the heading.

## Revisions

**Round 1 (2026-10-18).** An independent reviewer read the plan against the code, spec, findings
and slice 74's record and returned nine substantive and eleven minor findings. All were checked
against the repository before acting; all held. Changes:

- The pending row is a separate `PendingTaskRow` over `{ key, title }`, because `TaskRow`
  requires a `Task`; it replaces the empty state and sits outside the drag loop.
- A failed add owes a quiet read before its title returns (§63), with a no-duplicate test, and
  Open question 4 now says why.
- The hold and the reveal no longer contradict: reveals reset the hold's baseline, and step 16
  measures only writes whose growth is above.
- Slice 74's handover of same-history Todos completion is named and asked as Open question 5.
- Open question 3 now states its conflict with amended principle 6 and the one-toast decision;
  the change list amends both and the creation-defaults decision.
- `revealTarget` is generalised to shortcuts, with a test.
- Optimistic drawer edits claim and paint at call time and revert to the last confirmed value,
  with two-failure and live-read tests.
- The four links into `planned/75-…` broken by `roadmap.mjs start` were retargeted to
  `active/`; `docs:check` is green again.
- The slice-73 "before" comes from the pre-73 build, not `e15f3b7`.
- Minor: Add workstream's native `required` validation (`novalidate`, e2e coverage); the 80 ms
  reduced-motion cap; W2-018's overdue half; "Try again." in failure copy; one drawer seed; the
  dashboard and prototype-tooling docs; Delete's `aria-disabled`; the generation, read-only,
  empty-state and double-alert tests; scroll offset 0 and Chromium-only limits; the decision
  quote corrected; T07 not used for shortcut evidence; Open question 6 added.

**Round 2 (2026-10-18).** The reviewer confirmed all twenty round-1 findings resolved and raised
two substantive and two minor findings, all checked and accepted:

- The owed read counts a write as committed only for a same-title task whose id was absent at
  submit; a failed owed read does not return the title and says the add could not be confirmed.
  Store tests cover both.
- W2-010's own path (an add whose row is already in view, so no reveal) is back in Acceptance 16,
  with a matching hold test.
- Todos specs are listed as changing only if Open question 5 is answered as recommended; only
  completion failures move to the row.
- The optimistic edit raises the pending-mutation count at call time, not at dequeue.
- The pre-73 "before" build is noted as git-ignored and local only.

**Round 3 (2026-10-18).** The reviewer confirmed the four round-2 findings resolved and returned
no substantive findings. The plan is ready for the user's answers to the Open questions;
implementation has not begun.
