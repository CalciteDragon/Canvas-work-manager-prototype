<!-- plan id="78" status="active" summary="Redesign slice 6b-1 (TH10): one failure form in product words with Try again, no false empty or loading states, the digest fails alone, not-found and no-access lead back" -->
# Slice 78 — States: failures and loading

**State (2026-10-31):** **awaiting Gate 2 (user review of the sheet).** The plan was reviewed in
twelve rounds and accepted by the user on 2026-10-29. Stages 0–4 are done, and so are Stage 5's
parts a and b, S5FIX (Q4–Q8), S5FIX2 (Q9) and S5C (the reviews). The sheet has 0 gate failures.
**Next: the user reviews the sheet at Gate 2. No real use before Gate 2. The Outcome is not
written, and the slice is not closed.**

- **Sheet:** `apps/e2e/ux-output/slice78-sheet/index.html`.
  - **Inputs:** before `0c1917081b73a2892a30e0c6c548bff8b4e2fdc6`; after
    `apps/e2e/ux-output/5728e2bf22f83d674afa496ed604dceceebbe3a0`. The after has 194 matrix cells
    with 0 errors, and 168 states entries, `complete`, with T01–T12.
  - **Result:** 194 pairs and **0 gate failures**: geometry, census, state checks (164 views),
    pins, Lab and tasks. All 24 visual acceptance pairs are present.
  - The 196 `intentionalLabChanges` are the same as S5FIX2's: the Lab panels and Q9's label
    reflow.
  - **Rebuild:** `node docs/roadmap/70-ui-ux/tooling/build-sheet.mjs
    apps/e2e/ux-output/0c1917081b73a2892a30e0c6c548bff8b4e2fdc6
    apps/e2e/ux-output/5728e2bf22f83d674afa496ed604dceceebbe3a0 apps/e2e/ux-output/slice78-sheet
    apps/e2e/ux-output/5728e2bf22f83d674afa496ed604dceceebbe3a0 --profile 78`.
- **What the user should look at, under "Visual acceptance before / after":**
  - The failure family. The `lab · dark · 1440` pair now has a second row, "scrolled to the
    region", that shows the old "Empty, loading and error" panel beside the new "Empty, loading
    and failed".
  - `dashboard-real-ai` at 375 light: its scrolled shot shows the digest's failure beside the
    six widgets.
  - The section failures in `kitchen-bodies-failing` (1440 dark, and 375 light with Details open).
  - The unavailable and `**` pages; the pinned failure at both edges (`pin-todos-below`); the
    header progress fact; Archive, Settings › Archived projects, and the agents retries.
  - The core task costs table: T12 goes from a dead end to one click.
  - Open question 10 below.
- **S5C (2026-10-31):** five review passes ran with fresh context, against the diff, the plan,
  the findings, `direction.md` and the sheet: correctness, spec, boundaries, acceptance and
  living documentation. They found no blockers. Each finding was checked against the code; the
  ones that held were fixed test-first. Commits:
  - `af79ac2`, store fixes:
    - Reflections re-reads quietly after a write, so a second failure keeps the saved
      reflection on screen.
    - Task List's Try again on the same section no longer clears a failed add, row or field
      write.
    - The Reflections page's stale Try again re-reads the journal, then completed work, then the
      container.
  - `1e60a94`: Go to Home and Reload page carry `data-recovery`. The gate's name is "Reload
    page". `failureCode` in `failure.ts` replaces the two archive stores' copied `codeOf`.
  - `5c61c74`: `CURRENT_SLICE` is 78.
  - `5728e2b`: the rig takes a `focus` shot scrolled to the region for `lab` and
    `dashboard-real-ai`, and the sheet shows it beside the pair. Until now the workspace's inner
    scroll had cut both images off: the Lab image showed only its top, and the 375 Home image
    ended before the digest. The `before` dir's states were re-run for those three views only
    (`UX_STATES_MATCH`), and stay `complete`. There are 86 tests in `build-sheet.test.mjs`.
  - `f981f7d`, documentation:
    - The spec carries Slice 78 paragraphs in §21, §23, §24, §34, §44, §63 and §68. They were
      promised but missing.
    - Walkthrough step 31 now says the real provider fails only the digest.
    - The decision is linked from the projects, contracts, domain and prototype-host `why.md`
      files.
    - Three `overview.md` files are updated.
    - The decision index blurb and a dated amendment on the failures decision are added.
    - The change list is corrected, and 79's plan gains the header archive refusal's "Try
      again." handoff.
  - **Findings that did not hold:**
    - The Markdown failure no longer says "your draft is kept". This was planned (Build, Markdown
      bullet), and the draft stays visibly kept.
    - The Lab importing `dailyDigestFailure` from `features/` is the allowed direction, as
      `live-panels.ts` already does.
    - The header archive refusal's sentence is handed to slice 79, which owns that wording.
  - **Left as a question, not fixed:** Open question 10.
  - **Checks:**
    - `pnpm test` (web 1,388) and `pnpm lint` are green.
    - `pnpm --filter web storybook:build` passes.
    - The initial bundle is 1.14 MB, under 1,150 kB.
    - e2e passed on one worker: `states`, `reflections`, `archive`, `archived-projects`,
      `placement` and `feedback`, 88 in all. The full `pnpm e2e` was last green at S5FIX
      (260). Since then the only product changes are the S5C fixes above.

- S5FIX2 (`00b84b9`, plus the docs commit), **Q9, user decision (a):**
  - Profile 78 accepts Q7's label reflow and nothing else. The label's height is measured: it is
    the growth of the prompt-to-body gap, and it must equal the "Prompt" label's gap. Boxes at or
    below the body move by exactly that height. A box holding the body grows by it, and a control
    centred in that box moves by half. The 375 toast-open workspace's scroll height also gains Q5's
    64 px.
  - **Tests:** two new tests make 85 in `build-sheet.test.mjs`. Twelve refusals prove that an
    unrelated shift, an over-sized shift, a taller label, a full-height centred move, an unlabelled
    body and misplaced toast clearance all still fail.
  - **Sheet:** `apps/e2e/ux-output/slice78-sheet/index.html`, 194 pairs, rebuilt with the
    command below. It has **0 geometry and 0 census failures**. State checks, pins, Lab and tasks
    pass. The reflow is listed under `intentionalLabChanges` for exactly the 66 cells Q9 named,
    and the toast clearance only on `kitchen-remove-feedback` at 375.
  - **No product code changed,** so the after capture is still `ccd792f`. That means the e2e
    result is still S5FIX's 260 green, and the initial bundle is still 1,139.27 kB; neither was
    re-run. `pnpm test` and `pnpm lint` are green.

- S5FIX (`f9f6cbe`, `ce00a7d`, `82fe7fb`, `ccd792f`, plus the docs commit):
  - **Q4:** the project read failure has a visible h1, "Couldn’t load this project", with
    `data-route-focus`. `headedReadFailure` words the sentence beneath.
  - **Q5:** on touch, `--toast-max-block-size` is 16rem. New `feedback.spec.ts` test: the failed
    removal toast at 375 touch shows its whole message.
  - **Q6, Q8:** the `settled` row kind, and `emptyHookFrames` with the frame-owned rule. Two new
    tests make 83 in `build-sheet.test.mjs`. Header-progress-empty-project and -legacy are
    `settled`.
  - **Q7:** a visible "Reflection" `.control-label` on the composer's body. The story's role
    query follows the new name.
  - **Checks:** `pnpm test` and `pnpm lint` are green. `pnpm e2e` is green in full: 260 tests in
    four batches, no retries. The initial bundle is 1,139.27 kB.
  - **After capture:** `apps/e2e/ux-output/ccd792fa94bd9f3a7d1c16deb6fd33eff93a2ae3`, from the
    build of `ccd792f`. It holds 194 matrix cells with 0 errors, and 168 states entries,
    `complete`, with T01–T12 completed.
  - **Sheet:** `apps/e2e/ux-output/slice78-sheet/index.html`, 194 pairs.
    - State checks, census, pins, Lab and tasks all pass.
    - **192 geometry failures in 66 cells**, all Q7's +27.5 px label reflow, or half of it for
      centred controls. In `kitchen-remove-feedback` at 375 it adds Q5's 4rem clearance: Open
      question 9.
  - **Rebuild:** `node docs/roadmap/70-ui-ux/tooling/build-sheet.mjs
    apps/e2e/ux-output/0c1917081b73a2892a30e0c6c548bff8b4e2fdc6
    apps/e2e/ux-output/ccd792fa94bd9f3a7d1c16deb6fd33eff93a2ae3 apps/e2e/ux-output/slice78-sheet
    apps/e2e/ux-output/ccd792fa94bd9f3a7d1c16deb6fd33eff93a2ae3 --profile 78`.
  - **Recapture** only if product code changes again. The recipe is below and in `testing/how.md`.
    Each of the 4 states views and 5 matrix views took about 2 minutes, run one per foreground
    command.

- Stage 5, part b (`0ba1095`, `a73ed6a`, `ead9993`, `02fd472`, `350086c`, `2a3fa6f`):
  - **Acceptance items 1–4 and 6:**
    - `pnpm test` and `pnpm lint` are green.
    - `pnpm e2e` is green in full: 233 existing tests in three batches, plus the new
      `states.spec.ts` (19 tests) and the new `mcp.spec.ts` test. Two failures were timeouts that
      passed on re-run (`canvas-history.spec.ts:145`, `project-history.spec.ts:285`).
      `phone-layout.spec.ts` is unedited.
    - The initial bundle is 1,138.63 kB, under 1,150.
    - The MCP null-digest tests pass: the mcp-tools contract test, the host stdio test and the
      new HTTP test in `mcp.spec.ts`.
  - **`apps/e2e/states.spec.ts` was missing.** It was in the file list but never written. It now
    covers the Test plan row. Behaviour was pinned after the fact; a mutation check (the reveal's
    scroll removed) turns the pin tests red.
  - **Fixed, product:**
    - `.pinned-failure__show` meets 44 px on touch.
    - The Lab page provides its own `PinnedFailures`. At 375 its failing TaskRow specimen had
      pinned a real copy over the Lab.
  - **Fixed, evidence:**
    - **Tall-banner drag:** it drops on a point the target list owns. At 375 the quick-add
      covers the list's top edge.
    - **Failure detection:** `failureProbe` and the probe's `isFailure` count
      `[data-failure-sentence]`, and a reason under a closed Details.
    - **Digest row:** its region is the digest tile, because a failed digest never renders
      `app-daily-digest-widget`. The test's pinned copy of the table follows.
    - **`dashboard-me-failing` at 375:** the rig opens the phone menu. A Details summary the
      pointer cannot reach opens from the DOM and is recorded as `detailsForced`.
    - **Profile 78** places Lab planes by their recorded `data-panel`. It also counts a state's
      own before as known when the two routes differ only by a rig-generated project id. Each
      has a new fault test (81 in `build-sheet.test.mjs`).
  - **Tried and reverted:** an `aria-label` on the reflection body. It cleared axe
    `label-title-only`, but changed the field's census identity in about 70 populated cells (Open
    question 7).
  - **Sheet:** `/workspace/projects/Canvas-work-manager-prototype/apps/e2e/ux-output/slice78-sheet/index.html`.
    - **Inputs:** before `0c19170…` (the slice-77 baseline, reused); after
      `apps/e2e/ux-output/2a3fa6f5589e380448edd91f797a46c4fde6b5ab` (194 matrix cells and 168
      states entries, complete).
    - **Result:** 194 pairs and 26 gate failures, all under Open questions 4–8. The census,
      Lab, pins, visual pairs and T01–T12 pass.
  - **Rebuild it:** `node docs/roadmap/70-ui-ux/tooling/build-sheet.mjs
    apps/e2e/ux-output/0c1917081b73a2892a30e0c6c548bff8b4e2fdc6 apps/e2e/ux-output/<after>
    apps/e2e/ux-output/slice78-sheet apps/e2e/ux-output/<after> --profile 78`.
  - **Capture recipe:** about 25 minutes in nine foreground commands; see `testing/how.md`.
    - **States:** one view per command, `UX_STATES_MATCH='\|dark\|1440$'` with
      `UX_STATES_SKIP_TASKS=1`; the last view runs without the skip.
    - **Matrix:** `UX_MATCH='-dark-1440$'` and so on, plus `-1024$`.
    - **Rebuild first:** `pnpm --filter web build` after any product change.

- Stage 5, part a (`d4c7ac8`, `fd754a8`, review fixes `dcbe1e3`), reviewed once by a subagent
  against the diff ("can the gate pass falsely?"). Five substantive findings and one minor finding
  were fixed. Two minor findings were left; see "Left" below.
  - **Profile 78** is in `docs/roadmap/70-ui-ux/tooling/build-sheet.mjs`; its 20 tests are in
    `build-sheet.test.mjs` (79 in all, green; run `node --test` on that file, as it is not part of
    `pnpm test`). It reads `states-verification.json` from the before and verification dirs.
    - **Profile 77's rules kept:** the breadcrumb-only census, new axe nodes and the visual
      pairs.
    - **Matrix:** every cell is gated at 1 px except `kitchen-error`, `kitchen-refused`,
      `kitchen-archived` and `not-a-route`, which are reported. The Lab is panel-relative, with
      `state-messages`, `states`, `task-row`, `navigation` and `section-states` changing.
    - **States:** every Done when rule against every row of the context table, in all four
      views.
    - **Pin gate:** recomputes the clear port from raw geometry and fails on any missing input.
    - **Tasks:** T01–T09 and T11 cost no more than before; T12 is a dead end before and costs
      exactly one click after.
    - **Gate-owned lists**, not the evidence: the Capture scope contexts, the visual pairs and
      the per-pin clearance (the toast for `pin-todos-below`, the stuck quick-add for
      `pin-tasklist-above`).
    - **Table pinned:** a test evaluates the rig's `ROWS` and deep-equals the fixture copy.
    - **Run it:** `node docs/roadmap/70-ui-ux/tooling/build-sheet.mjs
      apps/e2e/ux-output/0c1917081b73a2892a30e0c6c548bff8b4e2fdc6 apps/e2e/ux-output/<after>
      <sheet dir> apps/e2e/ux-output/<after> --profile 78`.
  - **Rig** (`apps/e2e/ux/states-verification.ts`):
    - **Rows:** a `pending` row declares its `text` (`Measuring…`).
    - **Probe records:**
      - the slot's scroll port client box, the `--toast-track` content track, the
        `[data-pin-clearance]` boxes and the open toast;
      - sentence anchors per region;
      - each pin's edge, indicator, box, Show and close boxes;
      - focus after a press;
      - recovery and summary boxes, Details visibility (measured on the summary) and busy
        loading lines;
      - canvas-level failures outside every frame.
    - **`pin-todos-below`** now deletes another row to open the Undo toast; a completion opens
      none.
    - **Details:** the step clicks element handles. It used to click `nth()` locators over a
      shrinking `:not([open])` set, so the last Details stayed closed.
  - **Proved on subsets only** (dark 1440 and a few 375 views of the pins, reads, loading,
    pending, Lab and `kitchen-bodies-failing`), against the real baseline. Two traps:
    - `UX_STATES_MATCH` runs append to `ux-output/<HEAD>/states-verification.json`, so stale
      entries from earlier subsets linger until the full run replaces them.
    - The gate reads the before from the slice-77 baseline, which is valid and reused, so do not
      rebuild it.
  - **Two relaxations, profile 78 only:**
    - The sidebar projects list's pre-existing axe `list` node keeps its identity across this
      slice's `div[data-projects-region]` wrapper.
    - A state's known axe nodes are those of every before state on the same route, theme and
      width, because a state's before often rendered that route another way.
  - **Found by the gate, for part b:** the pinned copy's Show button is **27.5 px tall at 375**.
    The plan requires 44 px on touch, so `pin-todos-below` and `pin-section-collapse` fail at 375
    until `pinned-failure-slot.scss`'s `.pinned-failure__show` meets the touch target.
  - **Not captured, for part b:**
    - `pin-tall-tasklist-banner` at 375 still has no banner, so the gate fails those two views.
      A CDP touch drag was tried: the CDK preview starts, but the placeholder never enters the
      target list. It was reverted and needs another way, such as a keyboard or programmatic
      move.
    - The Capture scope's "`FailureMessage` stories" have no capture: the rig covers the Lab's
      `state-messages` panel. Storybook builds are the Done when check.
  - **Left (minor):**
    - `dashboard-real-ai` has no injected `reason`, so provider text is caught only by the
      raw-reason patterns.
    - The post-press reveal and the `describes` focus check match any sentence in the region,
      not the pinned one by id. This is sound while each pinned region holds one failure.

- Stage 4, part e (`f4b157b`, `c79f71b`, `581982d`, docs `875f45c`), reviewed once by a subagent
  against the diff: no substantive findings. **Step 4 is complete.**
  - **Wired.** `[appPinnedFailure]` + subject + sentence id on the `TaskRow` `<article>`
    (`shownError()`, so read-only rows never register; subject the title; `task-error-<id>`); the
    Todos `<li>` (`store.rowErrors().get(id) ?? null`, `titleOf`, `todo-error-<id>`); the section
    frame and shortcut frame `<section>` (`collapseError()`, `name()`, the existing collapse-error
    ids, which their collapse buttons already name in `aria-describedby`); and the Task List
    section's root `.task-list-section` for `store.receiveError()` (subject `nameOf(section)`, new
    `receiveErrorId()` = `tasks-receive-error-<id>`, now passed to the banner's `sentenceId`; no
    control describes it, so a press focuses the sentence). Read banners, page-level failures and
    restore rows do not register (specs pin it). `.quick-create` carries `data-pin-clearance`.
    The feedback decision is amended (the pinned edge).
  - **Found in real use, fixed:** pressing a top pin revealed the sentence just below the stuck
    quick-add, which left the row's checkbox (the focus target) under it. The press now
    scrolls the sentence plus the focus target into the clear port when both fit, and the sentence
    alone otherwise (`c79f71b`, two directive tests).
  - **Rig:** `states-verification.ts` presses a pin before opening Details for pinned contexts
    (clicking a summary scrolls its row into view and unpins it, so `pinPresent` was false).
    With that, `UX_STATES_MATCH='^pin-'` against this build shows each pin at its edge with its
    arrow at 1440 and 375, and each press unpins it with the target in view.
    `pin-tall-tasklist-banner` at 375 still has no banner (touch drag, known).
  - **Bundle:** `pnpm --filter web build` initial total **1,138.38 kB** (850 + 288.38), under the
    1,150 kB ceiling with about 11.6 kB left. Stage 5 must watch it.
  - **Left (minor):** the reveal measures clearance before it scrolls, so a quick-add that only
    sticks after the scroll is not allowed for (this predates part e). The wiring specs assert the
    bound inputs, not registration in `PinnedFailures`; the rig covers registration. Part d's three
    "Left" items stand: the toast's clearance drops while it fades; the ResizeObserver does not watch
    `[data-pin-clearance]`, so a stuck quick-add that grows a create error without a scroll keeps a
    stale clearance until the next scroll; there is no dev warning for a missing sentence id.

- Stage 4, part d (`c5b0deb`, `eda2494`, `6ff8e28`, `5c5daf5`, docs `93cf6f3`, review fixes
  `e6695b8`), reviewed once by a subagent against the diff. Two substantive findings were fixed:
  an observer that never fires when a jump crosses nothing, and a toast measured mid-transition.
  One minor finding (renaming re-armed a pin) was fixed and two tests were added. Three minor
  findings were left: see "Left" below.
  - **What exists**, in `shared/feedback/`:
    - `PinnedFailures` (`pinned-failures.ts`), the root registry. `register(port, { subject,
      sentence, reveal })` returns `{ place(edge | null), unregister() }`, and `place` does nothing
      once the registration is unregistered. `pinsFor(port)` gives `{ top, bottom }`: the most
      recent occurrence on each edge, its `sentence` with a closing " Try again." stripped, and a
      `more` count. It also has `reveal(id)`, `dismiss(id)` (that occurrence only), and
      `clearanceOf` / `setClearance` per port. `scrollPortOf(element)` returns the nearest
      scrolling ancestor.
    - `PinnedFailureDirective`, selector `[appPinnedFailure]`. **API:** `[appPinnedFailure]="failure"`
      takes a `Failure | null`, and a new object is a new occurrence that re-arms a dismissed pin.
      `[pinnedFailureSubject]` is the “X” in "Show “X”: …". `pinnedFailureSentence` is the **id**
      of the sentence element inside the host, the `FailureMessage`'s `sentenceId`. The directive
      goes on the reference, the row or frame. It watches the sentence (falling back silently to the
      host if that id is not found inside it) with an `IntersectionObserver` on the port, shrunk by
      the clearance. While pinned, it also re-sides the pin on scroll. Subject and id are read
      untracked: only the failure object re-registers. On a press, it brings the sentence into the
      clear port (8 px in) and focuses the element **inside the host** whose `aria-describedby`
      names that id, with `preventScroll`. If that element is disabled, `aria-disabled` or inert,
      it focuses the sentence instead, or the host if the sentence is gone, adding
      `tabindex="-1"`. A reference that has left the document is unregistered.
    - `PinnedFailureSlot` (`app-pinned-failure-slot`), rendered by `app-shell.html` inside
      `main.workspace`. It draws `[data-failure-pin-region="top|bottom"]`, containing the press button
      `[data-failure-pin="top|bottom"]` ("↓ sentence", "and N more"; aria-label "Show “X”: sentence[ And N
      more.]") and the close button `[data-failure-pin-dismiss="top|bottom"]` ("Dismiss “X”").
      It is fixed to the measured clear port and centred on `--toast-track` (anchor positioning,
      with a port-rect fallback). The top clearance is any `[data-pin-clearance]` element (exported
      as `PIN_CLEARANCE_ATTRIBUTE`) whose top is at the port's top. The bottom clearance is any
      `[data-toast-open]`. It re-measures on scroll, resize, the port's ResizeObserver,
      `data-toast-open` mutations, a `[data-toast]` `transitionend`, and pins changing. A focused
      pin that goes hands focus to the other pin or the port, with `preventScroll`, unless focus
      already moved elsewhere.
    - Stories: `Shared/Feedback/Pinned failure` (PinnedBelow, PressReveals, Dismissed). Their
      behaviour was checked in Chromium from a static Storybook build at 1440 and 375: the pin is
      inside the port at the bottom, a press focuses the checkbox, and Dismiss keeps `scrollTop`.
  - **S4E must wire:**
    - (1) `[appPinnedFailure]` + subject + sentence id on the TaskRow (the canvas Task List and
      Todos); the canonical section frame and the shortcut frame collapse failures; and the Task
      List's drag-receive write banner (on the frame, with the banner's sentence id).
    - (2) Each failure's control must carry `aria-describedby` = that sentence id inside the same
      host, or the press falls back to focusing the sentence. Check the collapse buttons.
    - (3) Put `data-pin-clearance` on the sticky quick-add (`.quick-create`,
      `task-list-section.html`).
    - (4) Read banners, page-level failures and restore rows do **not** register.
    - (5) Amend `docs/decisions/2026-10-feedback-stays-on-the-object.md` (the pinned edge), as the
      change list says. This is left until the behaviour is live, per "no aspirational docs".
    - (6) `pinPress` in `states-verification.ts` clicks `[data-failure-pin]`, which is the press
      button, as built.
  - **Left:** a closing toast drops its clearance at once while it fades. The ResizeObserver does
    not watch `[data-pin-clearance]` elements, which matters if a stuck quick-add changes height
    without a scroll (S4E may add it). There is no dev warning when the sentence id is not found.
    `pnpm test` and `pnpm lint` are green. Bundle 1.13 MB initial, under 1,150 kB.

- Stage 4, part c (`cc7f3c1`, `c245227`, review fixes `ee91cf0`), reviewed once by a subagent
  against the diff (no substantive findings; three minor ones fixed, two kept, below).
  - **Progress fact.** `ProjectHeader.progress` is a `ProgressFact` (`'pending' | 'empty' |
    'failed' | number`, exported from `project-header.ts`; the store imports the type — kept, it
    is type-only). The header says a muted "Measuring…" (`data-project-progress-pending`), "No
    tasks to measure" (`-empty`), "Couldn’t load" (`-failed`) or "N% complete"; "Not available" is
    gone. `ProjectWorkspaceStore` adds `progressFailedState` (set only while nothing has been read
    for this project; a failed re-read keeps the last value) and a read sequence, so only the
    newest progress read speaks. `progressResult` (unused) is deleted. **Behaviour change:** a
    load now sets `loading` false once the context answers and reads progress afterwards (still
    inside `track()`, so `PendingTasks` waits), so the page renders with "Measuring…" instead of
    "Loading project…" during the progress read (Stage 0's trap). `task-interaction.spec.ts:46`
    now waits for `% complete` before reading the "before" value. A domain test pins that a root
    whose tasks sit in a workstream measures nothing, archived or not.
  - **Not-found.** New `shared/components/unavailable-page/` (`UnavailablePage`, spec, stories):
    `h1` with `data-route-focus` and `tabindex="-1"`, one sentence (`data-unavailable-sentence`),
    Go to Home (`a[data-go-home]` → `/app`), and an `<ng-content>` slot. The workspace's
    `not_found` branch renders it (`data-project-unavailable`, "This project isn’t available" /
    "It may have been removed, or it isn’t shared with you."), projecting the history Retry; no
    Details, no Try again, no id (the store still holds the reason; nothing renders it). The narrow
    column's focus target is `[data-project-unavailable] h1`. `NotFoundPage` renders it ("This page
    doesn’t exist" / "Check the address, or go to Home."); `PlaceholderPage` stays for Calendar and
    Search. `.project-workspace__notice`, its `h1` rule and `.project-workspace__retry` are deleted.
    e2e edited, not run (they use ports 4200/4310): `web.spec.ts:361`,
    `project-creation-history.spec.ts:124,140`, `project-history.spec.ts:526`, `todos.spec.ts:108`
    and `task-interaction.spec.ts:46`.
  - **Chunk failure.** `[data-project-nav-error]` holds a `.state-message--region.state-message--failed`
    block: "Couldn’t load project navigation." (`role="alert"`) and a Reload page link at the current URL.
  - **Left alone:** the page-resolution line (`[data-page-unavailable]`, still `.project-workspace__error`,
    `project-workspace-shell.html:116`) is in the shell's change-list row but no part of step 4 has
    taken it yet; the Design Lab's dashboard-row sample "Not available · planning" is a dashboard
    row, not the header fact. Bundle 1,124.28 kB initial. `pnpm test` and `pnpm lint` green.

- Stage 4, part b (`fb1cc70`, `22ef8a7`, `9063191`, `e84511a`, `b9e0104`, docs `3722dc5`, review
  fixes `73eff1f`), reviewed once by a subagent against the diff (no substantive findings; two
  minor ones fixed; leaving `phone-layout.spec.ts:310` alone, as this plan requires, was a choice).
  - **Canvas creates.** `CanvasWriteResult` is `{ ok: false; failure: Failure }`.
    `mutateWithResult` takes a sentence: `addSection` says "Couldn’t add the {Type} section. Try
    again." or "Couldn’t add “{title}”…"; `addShortcut(input, sourceName)` (new required argument)
    says "Couldn’t add a shortcut to “{name}”…". Not loaded → "The page is still loading. Try again
    in a moment." (`CANVAS_STILL_LOADING`); order incomplete → the shortcuts-read sentence, both
    reason-less. `project-canvas.ts`'s own refusals are reason-less (`refusal()`).
  - **Dialogs.** Section-create (`data-create-section-error`, describes the name field), the
    picker's Add (`createError` is `{ sourceSectionId, failure }`; only that source's Add is
    described), work-create (`createWorkstream` → `Failure | null`, "Couldn’t add “X”…",
    `data-create-work-error` describes the name), project details (one
    `data-project-details-error`: the blank-name refusal describes the name, a failed save
    describes Save; `NOT_SAVED` is now "Couldn’t save the details of “X”…"), and the sidebar's New
    project (`ShellStore.createError` is a `Failure`, "Couldn’t create “X”. Try again.", inline
    beside the form, describing the reopened name). All inline weight, `live="alert"`. Dead
    `section-create-dialog__error`, `shortcut-picker__error`, `work-create-dialog__error`,
    `project-details__error` deleted; the sidebar's `[data-create-error]` keeps only its inset.
  - **Markdown.** `SectionContentInputs.onConfigChange` and the frame's `saveConfig` are
    `Promise<Failure | null>`; shortcuts' no-op answers `READ_ONLY_CONFIG` (`section-contract.ts`).
    `mutate`/`updateSection` take `onFailure`; `updateConfig` uses it, so the canvas
    `sectionError` is neither cleared nor set. The editor's `failure` input renders one inline
    alert (`data-markdown-failed`) that describes the source. Its sentence is the store's "Couldn’t
    save “X”. Try again." (the old "Not saved — your draft is kept." is gone; the draft stays
    visibly kept). Cancel clears it.
  - e2e edited, not run: `canvas-editing.spec.ts:544`, `work-navigation.spec.ts:137,154`,
    `lifts.spec.ts:143`. Bundle 1,122.58 kB initial (1,122.16 kB at the part's start).
  - `web/projects/how.md` and `web/core/what.md` say what is true. `pnpm test` and `pnpm lint`
    green at the end of the part.
  - Still raw: Revoke (slice 8), as recorded. No dialog slot is left raw.

- Stage 4, part a (`f05744f`, `9e688be`, `a71cd02`, `90560ce`, `7fd25f1`, `b3b4cd6`, `a8619b8`,
  docs `b3390a7`, review fixes `554201e`), reviewed once by a subagent against the diff (no
  substantive findings; two minor ones fixed, one kept as a choice, below). Every write slot
  below is now a `Failure` in its slice-75 place, rendered by `FailureMessage` (or, in the
  drawer, a `[data-field-details]` Details outside the field's label), the control's
  `aria-describedby` naming the sentence alone. Validation refusals are `Failure`s with
  `reason: null`, so they show no Details.
  - **Task List.** `rowErrors` (complete/reopen/delete), `createError` (add, uncertain commit —
    its Details holds the *write's* reason, deliberately — and validation), `receiveError`
    ("Couldn’t move the task into this list. Try again.", this part's sentence), and
    `TaskFieldSave` `{ state: 'failed', failure }` ("Not saved. Try again."). `TaskRow.error` is
    a `Failure`; its selection guard adds `summary, details`. `.task-row__error` and
    `.task-list-section__error` are deleted.
  - **Todos.** `rowErrors` and the Delete page alert `writeError` ("Couldn’t delete “X”. Try
    again.", region weight, as its old banner). `.todos__error` is deleted.
  - **Canvas.** `sectionError()` is a `Failure`: `mutate`/`updateSection`/`writePlacementField`
    take a sentence, named by `placementName` ("Couldn’t move/resize/rename/save/change/remove
    “X”. Try again.", "this shortcut" for a sourceless shortcut). `FAILED_REMOVAL_GUARD` is a
    reason-less `Failure` (identity check kept). `collapseErrors` are `Failure`s ("Couldn’t
    collapse “X”…", now with curly quotes); both frames' `collapseError` inputs take them.
    `CanvasWriteResult` still carries a raw `message` (dialogs part).
  - **Reflections.** Section `createError`/`editError`, the page's `writeError` and
    `addContainerError`. `ReflectionComposer.error` is a `Failure` and the body names the
    sentence by `aria-describedby` (new).
  - **Workspace.** `writeError()` names the write by its fields (`projectWriteSentence`:
    rename, status, description, date, archive, "save the details of"); the header and, because
    it shares the signal, the **project details dialog's** save failure render it (the dialog's
    own validation and the rest of the dialog are the dialogs part's). `pageWriteError()`:
    "Couldn’t turn on the Todos page. Try again." or "Turned on the Todos page, but navigation
    couldn’t refresh." with FailureMessage's Retry refresh; `data-page-toggle-retry` is gone.
  - **Agents.** The permission card's failure is a `Failure`; Revoke stays raw (slice 8).
  - e2e edited, not run: `placement.spec.ts` (create, complete, field, permission),
    `section-chrome.spec.ts:38,140`. Others keep passing on the wrapper's `textContent`.
  - Still raw, for later parts: sidebar New project (`ShellStore.createError`), work-create
    (`createWorkstream`), `CanvasWriteResult`/`mutateWithResult` and the section-create and
    picker `create` callbacks, the picker's `createError`, Markdown's save.
  - `docs/architecture/web/tasks/how.md`, `web/projects/how.md` and `web/what.md` say what is
    true. `pnpm test` and `pnpm lint` green at the end of the part; e2e not run.

- Stage 3, part d (`bd30373`, `a8755fc`, `fb65a87`, review fixes `0dfc976`), reviewed once by a
  subagent against the diff (no substantive findings; the minor ones were fixed or are noted
  below). **Stage 3 is complete.**
  - **Settings › Archived projects.** `ArchivedProjectsStore.error()` is an `ArchiveError` (the
    type is imported from `archive-page-store.ts`), with Archive's four states and precedence,
    said of "this list": load (`readFailure(…, 'this list')`), stale ("This list may be out of
    date.", polite), refused ("Couldn’t restore “X”. The list may have changed.", or the reach
    sentence for `unreachable`) and committed-unrefreshed ("Restored “X”, but this list couldn’t
    refresh.", Retry refresh). `COMMITTED_UNREFRESHED` is gone. `retry()` is a quiet `handover`
    read with `retryPending()`; a load no longer clears the error at its start (only a successful
    read or a persona reload does). The page renders one `FailureMessage` (`data-archived-error`);
    `data-archived-retry` and `.archived-projects__error` are gone; the focus code finds
    `[data-archived-error] [data-recovery]`. `apps/e2e/archived-projects.spec.ts:196,201` updated
    (not run).
  - **AI & Agents.** `AgentConnectionsStore.error()` is the list read's `Failure` ("your agent
    connections"), rendered by a region `FailureMessage` (`data-agents-error`, Try again busy on
    `loading()`, kept while it re-reads). Revoke's failure is the new `revokeError()`
    (`data-agents-revoke-error`, raw reason, same placement, no Try again, list kept).
    `agent-connections-store.spec.ts` is new.
  - **Picker.** `ShortcutStore.error()` is the discovery read's `Failure` ("the list of
    sections"), with `retry()`; a re-read of the same project/page keeps it, another page clears
    it. The picker renders it as a region `FailureMessage` (`data-shortcut-picker-error`) before
    the loading branch, so Try again stays busy in place.
  - **Loose ends for Stage 4:** the picker's `create` callback and `createError`, the agent
    permission card, Revoke's raw reason (carried to slice 8), and every other write slot named in
    parts a–c are still raw strings. Known minor gap (shared with Archive): a live frame arriving
    while Settings' Try again is pending supersedes the handover read, so if it fails the refusal
    stays rather than turning stale. Untested: the Settings page's refused-restore render, and
    committed-unrefreshed under a failing live-frame read (the store logic is Archive's).
  - `docs/architecture/web/how.md`, `web/what.md` and `web/projects/how.md` say what is true.
  - `pnpm test` and `pnpm lint` green at the end of the part; e2e not run.

- Stage 3, part c (`525e7de`, `50f118f`, `1ad44e1`, `1d9153d`, `032c209`, `120f5e3`, `eb49edb`,
  `6f44a9e`, review fixes `837a7c1`), reviewed once by a subagent against the diff (one
  substantive finding, a CSS regression, fixed; the minor ones fixed or noted below):
  - **Sections.** Timeline ("this timeline"), Recent Activity ("recent activity"), Progress
    ("progress"), the Reflections section ("this journal") and the Task List ("this task list")
    hold their read failure as a `Failure` with `retry()`, rendered by a region `FailureMessage`
    (`live="alert"`, Try again busy on the loading flag) **in place of** the empty sentence and
    loading line. A re-read of the same project/section keeps the failure until it answers;
    another one clears it; a successful quiet read clears it. Writes are kept apart (§19):
    Progress `writeError()` (a `Failure`, "Couldn’t change how progress is measured. Try again.",
    inline beside the controls — given its sentence now because the slot is new) and `stale()`
    ("This progress may be out of date.", quiet `retryStale()`/`stalePending()`); Reflections
    `createError()` (on the composer) and `editError()` (beside the edit form); Task List
    `receiveError()` (`data-tasks-error data-tasks-receive-error`, no Try again). Those write
    slots other than Progress's stay **raw strings until Stage 4**. `TaskListStore.loadFailed`
    is deleted. A successful add/receive after a failed read runs the quiet `refresh()` (which
    waits for writes in flight); a successful Reflections write runs `retry()`.
  - **Shortcuts.** A shortcut frame has no read: it inherits its source body's failure. The
    shortcut store is the picker's discovery read and moves with **the picker** (next).
  - **Pages.** Todos: `error()` (`readFailure(…, 'this list')`), Try again busy;
    `refreshError()` is the stale `Failure` "This list may be out of date." in an always-mounted
    `[data-todos-status] role="status"`, with quiet `retryRefresh()`/`refreshPending()`; a held
    load failure is never covered by stale. `data-todos-retry` is gone (the button is
    `[data-recovery]`). Reflections page: journal/picker ("completed work")/container ("this
    page’s Reflections container") reads are `Failure`s with Try again; `savedUnrefreshed()`
    ("Saved, but this journal couldn’t refresh.", Retry refresh) outranks the stale notice in
    `[data-reflections-status]`; the container add failure is `addContainerError()`, apart from
    the container read. Archive: `error()` is an `ArchiveError` (`Failure` + `kind`:
    `committed-unrefreshed` > `refused` > `stale` > `load`), one `FailureMessage` for all four
    (`live` status for stale, alert otherwise; Retry refresh for committed, Try again otherwise;
    `retryPending()`), Restore paused under all; `retry()` hands a refusal over to its read.
    `data-archive-retry` is gone. `apps/e2e/archive.spec.ts:593,606` are updated for it (not run).
  - Empty always-mounted status regions use `:empty { position: absolute; }` so they take no gap.
  - Known minor gaps: on the Reflections page a stale notice raised by a picker or container
    quiet read is cleared by a journal-only Try again (pre-existing); a stale notice inserted
    already holding its text may not be announced (Archive's first stale state).
  - `docs/architecture/web/projects/how.md` and `web/tasks/how.md` say what is true.
  - `pnpm test` and `pnpm lint` green at the end of the part; e2e not run.

- Stage 3, part b (`73d79c3`, `f4f667b`, `7093c77`), reviewed once by a subagent against the diff
  (no substantive findings; the minor ones were fixed, or are noted below):
  - **Workspace.** `ProjectWorkspaceStore.error()` is a `Failure` (subject `this project`), with
    `retry()`. A `load()` of the *same* project keeps `error` and `missing` until it answers;
    another project's load clears them at once. The shell's branches are now creation recovery >
    failure > loading > project. A non-`not_found` failure is a region `FailureMessage`
    (`data-project-error`, `live="alert"`, Try again busy on `store.loading()`) with no heading;
    the narrow-column focus falls back to its Try again. **Interim until Stage 4:** `not_found`
    keeps the "Project unavailable" heading and history Retry, over a `FailureMessage` saying
    "This project isn’t available." **with** the reason under Details, so the e2e `toContainText('not
    found')` assertions (`web.spec.ts:361`, `project-creation-history.spec.ts:124,140`,
    `project-history.spec.ts:526`) and `todos.spec.ts:108`'s heading still pass. Stage 4's
    `UnavailablePage` drops the Details and changes those assertions. `.project-workspace__notice p`
    is deleted; `.project-workspace__error` still styles the page-resolution line (Stage 4).
  - **Page and canvas.** `ProjectPageStore.error()` is the sections read's `Failure` (subject
    `this page`: "Couldn’t load this page."), with `retry()`, kept the same way per page. The
    shortcuts read has its own `shortcutsError()` ("Couldn’t load all of this page’s sections, so
    adding and moving are paused.", reason kept) with `retryShortcuts()`/`shortcutsRetryPending()`,
    generation-guarded and reset by `load()`. `sectionError` now holds writes only (still raw
    strings: Stage 4). The canvas renders `data-shortcuts-error` (hidden while `error()` is set,
    so one message) and `data-canvas-error`; `data-placement-order-incomplete` is deleted;
    "Loading canvas…" is `state-message state-message--loading` with `aria-busy="true"`.
    `mutateWithResult`'s order-incomplete refusal returns the shortcuts sentence for now; Stage 4's
    `CanvasWriteResult` `Failure` replaces it.
  - **Carried items done.** `FailedSectionRemoval` carries `failure: Failure`, sentence "Couldn’t
    remove the {name} section. Try again."; `sectionRemoveFailedFeedback(failure)` gives the
    sentence and `detail`; the canvas toast binds `[detail]`. The test-plan row "its `detail`
    reaches the toast" is now met (`project-canvas.spec.ts`, the failed-removal toast case).
  - Known minor gap: `retryShortcuts()` while a section write is pending only queues the read, so
    its busy state ends before the queued read lands.
  - `docs/architecture/web/projects/how.md` says what is true.

- Stage 3, part a (`b84072d`, `50e502c`, plus the review-fix commit after them), reviewed once by
  a subagent against the diff (no substantive findings; the minor ones were fixed):
  - **Shell.** `ShellStore.error()` is a `Failure` (`readFailure(error, 'your projects')`). A
    loud read no longer clears it at start: the failure stays, its Try again busy
    (`[pending]="store.loading()"`), until a read answers; a loud read queued behind a quiet one
    sets `loading` at once. `Sidebar` inputs are now `failure`, `loading` and output
    `retryRequested` (`AppShell` calls `store.load()`). The failure sits in one persistent
    `role="status"` div (`data-projects-status`) inside `data-projects-region` (`aria-busy`
    while loading), and `FailureMessage` has `live=null` there. "Loading projects…" is
    `data-projects-loading`, shown while loading with no tree. `createError` is still a raw
    string: it is a write failure, Stage 4's.
  - **Dashboard.** `DashboardStore.error()` is a `Failure` (subject `Home`), the page's one
    alert, with Try again kept busy the same way. `retryDigest()` and `digestPending()` exist;
    `DashboardWidgetDefinition.failureOf` exists, the digest's is `dailyDigestFailure`
    (exported from `daily-digest-widget.ts`), and `DashboardWidgetFrame` takes `pending` and
    emits `retry`, rendering `[data-widget-failure]` in the widget's place. `.dashboard__error`
    is deleted.
  - The fake gateway exports `dashboardWithoutDigest()`; the Lab has `labDashboardWithoutDigest()`
    and the `state-messages` panel's `[data-lab-digest-failure]` specimen; the live Navigation
    panel shows loaded, loading and failed sidebars.
  - The decision entry `docs/decisions/2026-10-failures-speak-product-words.md` is written and
    indexed (Whole prototype), linked from `web/core/why.md` and `web/dashboard/why.md`. Stage 4
    still amends `2026-10-feedback-stays-on-the-object.md`.
  - e2e not yet touched: `apps/e2e/web.spec.ts:23-30`'s comment says the sidebar renders "No
    projects yet" before the persona loads, which is no longer true (it says "Loading
    projects…"); fix the comment with the e2e edits. The assertions should still pass.

- Stage 2 (`23f1d02`, `e19d5c1`, `e8f1442`, `e75d4d1`, `9654581`, `331eac1`), reviewed once by a
  subagent against the diff:
  - `shared/feedback/failure.ts`: `Failure { sentence, reason: string | null }`, `readFailure` and
    `writeFailure`. Sentences use curly apostrophes, as the app's copy does.
  - `shared/feedback/failure-message.{ts,html}` (+ spec, stories). Its inputs are `failure`,
    `weight` (`region`|`inline`), `live` (`alert`|`status`|`null`), `recovery`
    (`try-again`|`retry-refresh`|`null`, with `data-recovery`), `pending` and `sentenceId`, and it
    emits `retry`. The host is the wrapper: put the caller's `data-*-error` hook on
    `<app-failure-message>`. The sentence is `[data-failure-sentence]`, and Details is a closed
    native `<details>` beside it. While `pending`, Try again is **`aria-disabled`**, not `disabled`,
    so it keeps focus (see Revisions).
  - `.state-message` (`--failed`, `--region`, `--inline`, `--loading`, `__sentence`, `__details`)
    in `_controls.scss`.
  - `Toast.detail` renders as Details and is never announced. `ReceiptUndoResult.detail` exists.
  - The Lab's `states` panel is now **`state-messages`**, badge "shared". The stub section's error
    case uses `FailureMessage`.
  - The dead `.archived-region__error` is deleted. The web, core and prototype-tooling docs say
    what is true.
- **Moved from Stage 2 to Stage 3** (done in part b; each needed its consumer's migration first; the `null`-digest
  dashboard, fixture and specimen are done in part a):
  - `history-feedback`'s `sectionRemoveFailedFeedback` sentence and `detail`;
  - binding `[detail]="toast.state()?.detail ?? null"` in the canvas toast template. Until then,
    test-plan row "its `detail` reaches the toast" is only half met: the toast renders it, but no
    feature passes one yet.
- **Trap for Stage 3:** a `live="status"` `FailureMessage` inserted by `@if` with its text already
  in it is often not read by screen readers. Where a polite announcement matters (the sidebar,
  stale notices), keep the component mounted and change `failure`, or accept it as silent.

- Stage 1 (`8b9fe7b`, `80634fb`, `8ca09c7`): `dailyDigest` is nullable in the contract;
  `DashboardService` catches only the provider's rejection; `get_dashboard_context`'s description
  says so; `RealAIProvider` writes the digest reason to `console.error`. Tests: contract, domain
  (provider rejects → `null` and full lists; repository rejects → still rejects), MCP contract
  (null digest, no provider text; the MCP harness takes `{ ai }`, the domain harness `options.ai`),
  host stdio (`connect` takes an env; `PROTOTYPE_AI_PROVIDER=real`), `prototype/routes.test.ts`
  (200 + `null` + console.error; reset restores a `prototype` digest), `api/real-ai-provider.test.ts`.
  The host/contract/domain/MCP docs and README line 147 say what is now true.
- To keep the web build green, `daily-digest-widget.html` renders only inside
  `@if (dashboard().dailyDigest; as digest)`: under the real provider Home shows six widgets and
  an **empty** digest tile until Stage 3 adds `failureOf`/`dailyDigestFailure` and the frame's
  failure. `web/dashboard/why.md` says so; Stage 3 rewrites that paragraph.
- Not yet done from Stage 1's neighbourhood, by design: `apps/e2e/mcp.spec.ts`'s nullable digest
  over HTTP (with the e2e edits), the decision entry `2026-10-failures-speak-product-words.md`
  (written with the web failure work), the fake gateway's `null`-digest dashboard and the Lab
  fixture (Stages 2–3).

- The spec inventory is under Behaviour vs. appearance › Stage 0 inventory.
- The capture harness is committed: `apps/e2e/ux/slice78.config.ts`, `ux/states-verification.ts`
  (the `ROWS` context table and 42 `CONTEXTS`), T12 in `ux/tasks.ts`, and the `capture.ts`
  hook assertion.
- The **before** is complete and gitignored:
  - the baseline build: `apps/e2e/ux-output/slice78-baseline-web/` (from `0c19170`, 1,101.98 kB
    initial);
  - the captures: `apps/e2e/ux-output/0c1917081b73a2892a30e0c6c548bff8b4e2fdc6/`, holding
    `index.json` (all 194 slice-77 matrix cells), `states-verification.json` (168 entries,
    `complete: true`) and `tasks/` (T01–T09 and T11 completed; T12 blocked as a dead end, as
    expected).
  - To redo it: `cd apps/e2e && UX_BEFORE=0c1917081b73a2892a30e0c6c548bff8b4e2fdc6 pnpm exec
    playwright test --config ux/slice78.config.ts <capture.ts|states-verification.ts>`. Split
    runs with `UX_MATCH` (matrix ids) or `UX_STATES_MATCH` (`context|theme|width`); a
    `UX_STATES_SKIP_TASKS=1` run keeps the recorded tasks. Each run takes a few minutes; run them
    in the foreground.

**Next:** Stage 5 (`## Implementation sequence` step 5): re-capture, sheet, reviews, Gate 2,
real use. Stage 4 is complete (part e above).
The raw write slots left by parts a–d are listed in their entries above.

**Traps found in Stage 0:**
- The before build's workspace waits on the progress read, so `header-progress-pending` shows
  the whole page's "Loading project…".
- `pin-tall-tasklist-banner` produces its drag-receive banner only at 1440. Touch emulation does
  not drive the CDK drag, so its 375 entries carry a `notes` field and no banner.
- Pinned-context presses look for the after build's `[data-failure-pin]` hook, which is the name
  that was built. The rig presses pins before opening Details (S4E).
- Profile 78 in `build-sheet.mjs` is not written yet; it is Stage 5's.

Redesign slice 6b-1 under the [UI/UX overhaul umbrella](70-ui-ux-overhaul.md). Redesign slice 6b
("States", theme **TH10** "Empty, loading, error and archived states are accidental" in
[themes.json](../70-ui-ux/themes.json)) is **split** by the user's choice on 2026-10-29, as slices
4 and 6 were. This slice, **6b-1**, takes the failure and loading half. **6b-2** is
[Slice 79](../planned/79-empty-archived-and-editing.md): first-run and empty states, archived
pages, the archive refusal, restore, the digest's overdue line, the Markdown editor's Cancel and
Preview, and L4-023's count. The protocol §8 comb runs after 79 closes, not after this slice.

The user also answered on 2026-10-29: a failure's raw host reason moves **behind a collapsed
Details toggle**. The visible text is a product sentence only. This amends slice 75's
[feedback decision](../../decisions/2026-10-feedback-stays-on-the-object.md), whose sentences end
with the reason today.

## Goal

A read that fails says, in product words and in one recognisable form, what could not be loaded,
offers Try again, and never claims the content is empty. Loading never reads as empty. A failed
digest leaves the rest of Home standing, and a missing project or page leads back to work
(direction principles 4, 6 and 8).

## Spec sections

- **§21** visual design system: one `.state-message` pattern, tokens only, for loading and failed
  regions.
- **§19** stores own their state: each store holds a `Failure`, not a string, and keeps a read
  failure apart from a write failure.
- **§23** application shell: the sidebar says it is loading, and says when it failed.
- **§24** Home Dashboard: a failure is one message, and a failed digest fails only its own widget.
- **§34** task interactions: quick-add's "the reason beside the form" becomes a sentence beside the
  form, with the reason under Details; the section banner carries load and drag-receive failures.
- **§42 and §44** AI features: "Real AI must never be required to run the prototype". A provider
  failure must not take the dashboard with it.
- **§61** Prototype API: the error envelope is unchanged. The UI stops printing its `message`.
- **§63** Optimistic UI: "revert + show error". The error is a product sentence; the reason sits
  under Details.
- **§67** Design Lab: failure, loading and Details specimens.
- **§68** route map: the `**` page and an unavailable project lead back to Home.
- **§69** verification, **§77** design-first loop, **§78** decisions.
- [Overhaul protocol](../../guides/ui-ux-overhaul-protocol.md) §6–§7.

## Build

- **One failure shape.** A pure `failure.ts` in `shared/feedback/` defines
  `Failure { sentence, reason }` and two builders:
  - `readFailure(error, subject)` gives the product sentence for a failed read, by the error's
    `code`, with no record id, enum, path or status:

    | Code | Sentence |
    |---|---|
    | `not_found` | "{Subject} isn't available." (every subject that can answer `not_found` is a singular noun phrase: "this task list", "this journal"; the sidebar's "your projects" is a list read that cannot) |
    | `unreachable` | "Couldn't reach your workspace, so {subject} didn't load." |
    | anything else | "Couldn't load {subject}." |

  - `writeFailure(error, sentence)` keeps slice 75's "Couldn't <verb> “X”. Try again." frame and
    takes the reason out of it.

  `reason` is the error's `message`, or `String(error)` for anything without one. `failure.ts` reads
  `code` and `message` **structurally** (duck typing), so `shared/` gains no import from `core/`.
  There is no `retryable` field: each caller chooses its recovery (Try again, Go to Home, Reload
  page). `failure.ts` is the only translation, and every local `messageOf` outside `prototype/`
  goes (the dev panel's tools keep theirs: they are for developers).
- **One component, two weights.** `FailureMessage` (`shared/feedback/failure-message.ts`) renders
  one `.state-message.state-message--failed`:
  - an outer wrapper, which carries the caller's existing `data-*-error` hook, so an e2e
    `toContainText` on the reason still matches once Details is in the DOM;
  - inside it, the **sentence** element. It has `role="alert"` when the caller asks for an alert, and
    it is the only element a control's `aria-describedby` names;
  - an optional **Try again** button emitting `retry`. Every recovery control in this slice
    (Try again, Go to Home, Retry refresh, Reload page) carries
    `data-recovery="try-again|go-home|retry-refresh|reload"`, which the gate reads;
  - when there is a reason, a collapsed native `<details>` with the summary "Details", a sibling of
    the sentence, so a screen reader never reads the reason as the control's description.

  The *region* weight replaces a section body, page or widget. The *inline* weight keeps slice 75's
  row, field and card placement and its `field-status--failed` tone. A `.state-message--loading`
  variant carries the muted loading line, with `aria-busy` on its region. Styles live in
  `_controls.scss` and use tokens only. The `__error` classes it replaces are deleted (listed under
  the change list).
- **Read and write failures are separate state.** A store that both reads and writes holds its read
  failure apart from its write failures, so a write failure never replaces the read's state and a
  failed read never clears a write failure. This applies to:
  - the task-list store: its read and drag-receive failures. Both render in the section's banner, as
    §34 says, and a drag-receive failure has no Try again;
  - the reflections section store (`reflections-store.ts`): its read apart from its create and edit
    failures (lines 19 and 21), which today share `errorState` and show raw in the
    `data-reflections-error` banner. The section passes `[error]="null"` to its composer today;
    after the split, a create failure renders on the composer through its `error` input and an edit
    failure beside the edit form, each as a sentence with Details;
  - the progress store: its read apart from the `setFormula` write (`progress-store.ts:64, 73`).
    Today both, and the re-read after a write (line 78), share one `errorState` that
    `progress-section.html:3` renders *in place of* the result and the Count/Weighted/Manual
    controls. After the split, a formula write failure renders inline beside the controls, "Couldn't
    change how progress is measured. Try again." with Details, and the result and controls stay on
    screen. A failed re-read after a successful write is the polite stale form ("This progress may
    be out of date.") with Try again;
  - the page store: the canvas's shortcuts read (`project-page-store.ts:342, 406, 459, 1226`) moves
    out of `sectionErrorState` into its own read failure, and the reads that clear
    `sectionErrorState` today (lines 352, 402, 1233) and the full `load()` (line 443) clear both the
    shortcuts read failure and the write failure, as they clear `sectionErrorState` today: a fresh
    canvas supersedes a move or add alert. Only a *failed* read never clears a write failure. It is
    rendered on the canvas with Try again: "Couldn't load all of this page's sections, so adding
    and moving are paused." An unrelated section write can no longer clear it. The existing
    `data-placement-order-incomplete` line is **deleted**: today it also shows during every load
    (`load()` sets `orderComplete` false at line 433, and the line renders outside the loading
    branch), a false failure beside "Loading canvas…". Writes and drag stay gated by
    `orderComplete()`;
  - the Archive and Settings › Archived projects stores, which hold four states: a load failure
    (Try again), a committed restore whose refresh failed (Retry refresh, replacing the
    `COMMITTED_UNREFRESHED` string sentinel), and a restore write failure. That last one says
    "Couldn't restore “X”. The archive may have changed." (it does not end in slice 75's "Try
    again", because its button does not restore), with Details and a **Try again** button that
    re-reads. Slice 47's rule stands: any of the four pauses
    Restore until a successful read, because the item on screen may be stale, so the write-failure
    state must offer that read. The fourth, **stale** state applies when a read fails while a list
    is already on screen and no write state is held: a live frame's quiet re-read, or the user's
    Try again on a refusal. That Try again hands the refusal over to the read it starts (Restore
    stays paused while it is pending, `archive-page-store.ts:64-66`); if that read fails the state
    is stale. A live frame's failed read leaves a held refusal as it is: "This archive may be out of date." on
    Archive and "This list may be out of date." on Settings, polite, with Try again and Details,
    Restore still paused. It never says "Couldn't load" over content that is there. The sentences
    are this slice's: the refused restore says "The archive may have changed." on Archive and "The
    list may have changed." on Settings, and an `unreachable` refusal says "Couldn't reach your
    workspace, so “X” may not have been restored." (under slice 76's rules it may have committed).
    **Precedence**, highest first: committed-unrefreshed, refused restore, stale, load failure. A
    failed read never displaces a held write state; Settings' quiet re-read before it shows a
    refusal (`archived-projects-store.ts:115-118`) therefore ends in the refusal, not in stale. Committed-unrefreshed says "Restored “X”, but Archive couldn't refresh." and
    "Restored “X”, but this list couldn't refresh." beside Retry refresh, without today's "Try
    again." / "Retry the list." Slice 79 owns only the archive refusal said *before* commit;
  - the agent connections store: the list read apart from Revoke's page-level failure. Revoke's
    failure keeps its text and placement, and never shows Try again or clears the list. That text
    is the raw reason today; it is the one raw-reason exception this slice leaves, carried to slice
    8 with the brief's Revoke work (`70-ui-ux-overhaul.md:395`) and named in the decision.

  **A successful write after a failed read starts a full read** (today quick-add only appends, at
  `task-list-store.ts:288`, which is why L4-027 still reproduces after the host recovers).
- **Try again everywhere a read can fail.** Read retries say **Try again**, which repeats only that
  read:
  - the sidebar, dashboard and project page;
  - the canvas's sections and shortcuts reads, and every section body: Task List, Progress,
    Reflections, Timeline and Recent Activity, including a section that answers `not_found`. A
    shortcut frame has no read of its own (its body is the source section's component); its only
    failure is a collapse write;
  - Todos, the Reflections page, Archive, Settings › Archived projects, Settings › AI & Agents and the
    Add a shortcut picker's discovery read (`shortcut-store.ts:33`).

  The **retry label rule** is:
  - a read that failed to load, or a stale refresh, says **Try again**. "Retry archive read" and
    "Retry list" (their load branches) and the Reflections page's stale-refresh "Retry journal read"
    become Try again. The Reflections and Todos pages' load branches already say Try again;
  - a refused restore says **Try again** too, because what it offers is the re-read Slice 47
    requires before another write;
  - a committed write whose follow-up read failed says **Retry refresh**, on Archive and on
    Settings › Archived projects alike (today both show their read-retry label for it), and on the
    Reflections page, whose "Reflection saved, but the journal could not refresh. Try again."
    (`reflections-page-store.ts:226`) becomes "Saved, but this journal couldn't refresh." with
    Retry refresh, rather than the stale notice. The page keeps the saved-unrefreshed state apart
    from the stale notice (today both share `refreshErrorState`, lines 46, 226, 259), and as on
    the archive pages the committed write outranks stale: a later failed quiet read does not
    replace it;
  - **Retry remove** is unchanged;
  - the header's history **Retry** keeps its label here (the user's choice on 2026-10-29). It is
    a note for the §8 comb, which settles one reload vocabulary across the app, including inside
    the Undo/Redo controls. Slice 79's restore work touches the two archive pages and takes this
    rule as given.
- **No false empty, and failures clear.** A section, page or list whose read failed shows the
  failure *instead of* its empty sentence ("No tasks yet. Add the first one above." never appears
  under a failure). The read failure clears on the next successful read of the same thing: Try
  again, a quiet live re-read, or the full read a successful write starts. Quick-add and the
  reflection composer stay enabled under a read failure (recorded in the decision): a write does
  not depend on the failed read, and its success re-reads (L4-003, L4-027).
- **Stale content says so politely.** Where a refresh fails over content still on screen (Todos'
  and the Reflections page's "…may be out of date — {reason}" notices), the notice becomes a polite
  `FailureMessage` (`role="status"`): "This list may be out of date." on Todos and "This journal may
  be out of date." on the Reflections page (their nouns today), with Try again and the reason
  under Details. It never says "Couldn't load", because the content is there. **A stale Try again
  runs a quiet read**: it keeps the content on screen, and a failure leaves the notice stale. Todos
  gains a `retryRefresh()` like the Reflections page's (its `retry()` at `todos-page-store.ts:139`
  is the non-quiet load, which empties the list on failure); Progress gains a quiet retry like its
  `sync` (its `load()` shows "Calculating progress…" and nulls the result).
- **Loading is not empty.** The canvas's "Loading canvas…" adopts `.state-message--loading` with
  `aria-busy`; section bodies' own loading lines are left as they are and have no loading row. The
  sidebar shows "Loading projects…" (`state-message--loading`,
  `aria-busy` on the tree) while its first read is in flight, and never "No projects yet" until a
  read has answered with none (L4-001).
- **The digest fails alone.**
  - The contract: `DashboardResultSchema`'s `dailyDigest` becomes
    `GeneratedContentSchema.nullable()`, documented as "the provider failed". **No reason travels
    over the wire.** The host deliberately answers unhandled errors without their message
    (`api/errors.ts:69-71`), because a real provider's exception could carry endpoint or key
    details; the digest keeps that rule.
  - The domain: `DashboardService` catches only the `generateDailyDigest` rejection and returns
    `null`. Every other failure still rejects.
  - The host: `RealAIProvider` logs its rejection with `console.error` (never stdout, which stdio
    owns) before rejecting, so the reason reaches the console under HTTP and under stdio alike, and
    README's "printed on the host's console" stays true.
  - The widget: the registry definition gains an optional `failureOf(dashboard)` hook. Widgets still
    take data only. The widget frame renders a region `FailureMessage` "Couldn't write today's
    digest." with Try again and no Details (there is no reason to show), and emits `retry`. The
    dashboard page calls a new public `retryDigest()` on the store, which runs the private quiet
    re-read (`dashboard-store.ts:60`) and keeps the other six widgets on screen. While it runs the
    digest region is `aria-busy` and Try again is disabled, so a retry that fails again visibly
    ended rather than doing nothing.
  - MCP: `get_dashboard_context`'s description says the digest is `null` when the provider failed.
- **One message per failure on Home.** The dashboard says "Couldn't load Home." as the single
  alert. The sidebar says "Couldn't load your projects." politely, not as an alert. Each has Try
  again. They are different sentences about different regions, never the same host string twice
  (L4-002).
- **Unavailable and unknown lead back.**
  - A project read that answers `not_found` shows the heading "This project isn't available" and
    the sentence "It may have been removed, or it isn't shared with you.", with a **Go to Home**
    link. There is no Try again, no Details and no id. This holds for another persona's project too,
    and reveals nothing about whose it is (W4-024, L4-014). The header's existing history Retry
    stays available on this page, as it is today.
  - Any other project read failure shows a visible h1, "Couldn't load this project" (with
    `data-route-focus`), over a region `FailureMessage` whose sentence says only what the heading
    does not ("Something went wrong while it was loading.", or "Couldn't reach your workspace."),
    with Try again and Details. It replaces the "Project unavailable" notice section
    (`project-workspace-shell.html:17`) rather than sitting under that heading. (Amended
    2026-10-30, Open question 4: this said "no heading".)
  - The `**` page says "This page doesn't exist", then "Check the address, or go to Home.", with
    the same link, in the same layout. It no longer cites §68.
  - The shared layout is a new `UnavailablePage` component
    (`shared/components/unavailable-page/unavailable-page.ts`): heading with `tabindex="-1"` and
    `data-route-focus`, one sentence, Go to Home. `not-found-page.ts` and the workspace shell both
    render it; `PlaceholderPage` is no longer used for `**`.
  - Both headings **gain** `data-route-focus`.
- **Writes keep their place, lose the raw text.** Every write failure that today appends
  `messageOf(error)` keeps its slice 75 placement, sentence and `aria-describedby` link, and moves
  the reason into the inline Details. That covers:
  - task complete, reopen and Delete;
  - quick-add (including its uncertain-commit sentence);
  - drawer field saves;
  - Todos rows and `data-todo-write-error`;
  - section collapse and the canvas's other `sectionError` writes. `FAILED_REMOVAL_GUARD_MESSAGE`
    stays a sentence, with no Details;
  - the Reflections page's composer (`reflection-composer.html:22`) and the Reflections section's
    create and edit failures (above);
  - canvas creates that answer through `CanvasWriteResult` (`project-page-store.ts:87`, filled at
    :1199 and returned by `project-canvas.ts:169, 183`): it carries a `Failure`, not a string, and
    the section-create dialog and shortcut picker's `create` callbacks return `Failure | null`. Its
    two synthetic refusals get product sentences: "The page is still loading. Try again in a
    moment." (line 1182) and the shortcuts-read sentence above (line 1187);
  - the agent permission card;
  - create dialogs (section, work, project details, the shortcut picker's create) and the sidebar's
    New project;
  - the project header's own writes and the page navigation's writes. The header's archive refusal
    goes through the same `writeError`: this slice only moves its reason into Details, and slice 79
    owns its wording and timing;
  - `createWorkstream`'s failure (`project-workspace-store.ts:300`, shown by the work-create
    dialog);
  - the section-removal toast: `sectionRemoveFailedFeedback` gives a sentence only, and an optional
    `detail` is added where the toast's state is typed (`ReceiptUndoResult` in
    `core/history/receipt-undo.ts`, which `HistoryFeedback` extends), so the toast renders it as
    Details.

  Read failures and write failures now look like one family (L4-018, L6-003).
- **An off-screen failure is pinned to the viewport's edge** (the user's choice on 2026-10-29,
  closing slice 75's open question). When an inline write failure's sentence anchor is wholly
  outside the workspace's scroll port, a compact copy of the failure is clamped
  to the nearer edge, top or bottom, with an indicator pointing toward the reference
  (↑ or ↓). The row or frame remains its reveal/focus reference; observing the compact sentence
  prevents a tall visible frame from hiding an off-screen banner. It applies to:
  - task rows (canvas Task List and the Todos page);
  - section and shortcut frames (collapse, and the Task List's drag-receive write banner).

  Archive and Settings › Archived projects keep their existing page-level failure placement;
  they have no row-local restore failure to pin. Read failures and page-level banners do not
  register with this mechanism.

  How it behaves:
  - **Nothing scrolls on its own**, so principle 6's "feedback never scrolls" stands. The pinned
    copy is a button, "↓ Couldn't complete “X”." with the arrow matching the direction; pressing it
    scrolls the failure sentence anchor into unobscured view (even when its tall owner is already
    partly visible), then focuses the control the failure describes, with
    `preventScroll` so focus does not cause a second jump. If that control is disabled or gone,
    focus the surviving failure sentence or reference (`tabindex="-1"`). Only the user's press
    scrolls. Resolve the target before scrolling; a removed reference is unregistered instead.
  - It unpins as soon as any part of the sentence anchor enters the unobscured scroll port
    (below a stuck quick-add and above an open toast), and goes when the
    failure clears. A close button dismisses that failure occurrence; the failure stays on its
    row, and scrolling out again does not re-pin it. Clearing or replacing the failure re-arms
    the registration. If dismissal removes the focused button, focus another surviving pinned
    control or the scroll port with `preventScroll`; never reveal the off-screen row on close.
    The same guarded fallback applies if a focused pin disappears on a quiet clear or scrolling;
    preserve focus already moved elsewhere. Activation captures its destination before unpinning,
    so an intersection callback cannot interrupt the requested reveal/focus handoff.
  - **One pinned copy per edge**: the most recent failure, with "and N more" when several are off
    the same edge. Pressing it goes to the most recent.
  - **Edges are the workspace's scroll port** (`.workspace` in `app-shell.scss`, which scrolls,
    not the window). The top edge sits below any stuck control in the list (the sticky quick-add);
    the bottom edge sits above an open toast. The slot explicitly measures the visible stuck
    quick-add and toast bounds and applies their clearance to its edge insets; workspace padding
    alone does not position an overlay. Recompute on scroll, resize, and toast/sticky geometry
    changes, with no change to the existing toast's position or reserve. Pins occupy the content
    track, outside the project navigation column and any reserved desktop drawer width, without
    changing content geometry when no failure is pinned.
  - **Accessibility.** The row's sentence keeps `role="alert"` and stays the only element the
    control's `aria-describedby` names, so the failure is announced once. The pinned copy is not
    an alert: it is a button whose accessible name is "Show “X”: " plus the sentence, reachable by
    keyboard. It carries no Details; its reason is on the row.
  - **Motion** is opacity and transform only, and none under `prefers-reduced-motion`.
  - **Mechanism.** A root-provided `PinnedFailures` service in `shared/feedback/` (the
    `ToastSlot` pattern) holds registrations; an `appPinnedFailure` directive on each reference
    registers its failure and watches the sentence anchor with an `IntersectionObserver` whose
    root is the nearest scrolling ancestor, accounting for the measured edge clearance; a
    `PinnedFailureSlot` component that the app shell renders in
    `.workspace` draws the pinned copies with tokens only. Registrations are tied to the current
    failure occurrence and reference; clearing, reference removal, directive destruction, or a
    route/context replacement unregisters them and disconnects observers/listeners. Late observer
    callbacks cannot re-pin a detached or superseded reference. A slot filters registrations by
    its scroll root; the product surfaces here use `.workspace`. Registry/observer callbacks
    update Angular signals so intersection and geometry changes render in the zoneless app.

  This amends the [feedback decision](../../decisions/2026-10-feedback-stays-on-the-object.md):
  feedback still never moves the page, but a failure on an object off screen is shown at the edge
  and leads back to it.
- **Task rows ignore Details.** The row's selection guard adds `summary, details`, so opening Details
  never selects the row.
- **The Markdown save failure is one message, on the editor.** The section contract's
  `onConfigChange` (`section-contract.ts:23`) and the frame's `saveConfig` return a result that
  carries the `Failure` instead of `Promise<boolean>`. Today `updateConfig` → `updateSection` →
  `mutate()` always writes `sectionErrorState` (`project-page-store.ts:1159`); only
  `writePlacementField` has an `onFailure` option. `mutate()` and `updateSection` gain the same
  option, and the config save uses it, so the canvas-level `sectionErrorState` is neither set on
  failure nor cleared before the write (as `writePlacementField` skips the clear at line 1077), and
  a Markdown save never touches an unrelated canvas alert. "Not saved — your
  draft is kept." becomes an inline `FailureMessage` alert with Details. Cancelling the edit leaves no
  stray alert (L4-018). Cancel and Preview semantics are slice 79's.
- **Progress names its state.** The workspace store gains a progress-failure state, and the header
  takes a progress input with four values, not `number | null`: *pending*, *empty*, *failed* and a
  percentage. While pending (a load sets it, `project-workspace-store.ts:253`) the fact renders
  a muted "Measuring…" in the fact's own text style, never "No tasks to measure" or "Couldn't
  load". It is not a loading row (the header's 1 px rule holds), and the gate table declares it a
  `pending` row: a muted line with a declared expected text ("Measuring…"), which the gate
  requires and which no empty or failed sentence may replace, and no loading assertion. Otherwise it reads "No tasks to measure" when there is
  nothing to count, on live and archived projects alike. That is the domain's own explanation, and
  it stays true on a root whose tasks all sit in workstreams, because `ProgressService` counts only
  the project's own tasks (`progress-service.ts:35-44`); "No tasks yet" would be false there. Archiving does not
  exclude a project's tasks from the count (`project-service.ts:262-271` only sets `status`), so
  an archived project with tasks already shows its percentage, and "Not available" only ever meant
  zero tasks. "Couldn't load" appears only when no percentage has been read for this project yet;
  a later re-read that fails keeps the last value, as today (lines 520-522). "Not available" is
  retired (L4-017).
- **Project navigation's chunk failure** keeps **Reload page**, because reloading is the real cure
  for a failed lazy chunk. It adopts the `.state-message` layout.

## Done when

- Every finding under Findings closed is closed on the before/after sheet, each by its named pair,
  ARIA snapshot or e2e assertion.
- Profile 78's states gate passes. It is driven by a **context table** in
  `ux/states-verification.ts`, written out to `states-verification.json`. Each row declares
  `{ context, region, kind: read | write | stale | loading | pending, recovery: try-again | go-home |
  retry-refresh | reload | none, details: boolean, emptyHook: string | null, pinned: top | bottom |
  null }`. Every exemption
  comes from the table, not from prose, and `build-sheet.test.mjs` pins the table: it fails when a
  Capture scope context has no row, or when a row's `emptyHook` no longer exists in the web
  source, so a renamed hook fails instead of passing silently. Against each row the gate checks:
  - no `[data-*-empty]` element is visible inside the row's region, for every `read` row (the hooks
    in the source today are `data-activity-empty`, `data-agents-empty`, `data-archive-empty`,
    `data-archived-empty`, `data-dashboard-empty`, `data-projects-empty`,
    `data-reflections-empty`, `data-reflections-picker-empty`, `data-shortcut-picker-empty`,
    `data-tasks-empty`, `data-timeline-empty`, `data-todos-empty`, `data-widget-empty` and
    `data-work-empty`, plus `data-empty-canvas`, which the gate matches by name);
  - the declared recovery control is present in the region and passes the target census, and no
    recovery control is present for `none` (the header progress fact, which re-reads on the next
    live frame);
  - `details: true` rows open to show the exact injected reason; `details: false` rows (the
    unavailable and `**` pages, the digest, the progress fact, loading rows)
    show no Details;
  - every `loading` row shows `.state-message--loading` with `aria-busy="true"` on its region;
  - every row with `pinned` shows one pinned copy at that edge, inside the scroll port, with the
    matching indicator, and no pinned copy shows when its sentence anchor is in view;
  - the exact injected reason is not visible outside a closed `<details>`;
  - no visible text outside a closed `<details>` matches the raw-reason patterns: a quoted record id
    (`"[a-zA-Z]+-[0-9a-z-]+"`), `answered \d{3}`, `GET|PATCH|POST|DELETE /api`, `prototype host`,
    `§\d+`.
- Core tasks T01–T09 and T11 cost no more than their slice-77 counts. A new task, **T12 "Recover a
  section after a failed read"**, is recorded before and after. It uses busy-week at
  `/projects/project-launch`. Every tasks read fails until the failure renders; then the route is
  lifted. T12 completes when the Task List shows its tasks without a page reload. Before is a dead
  end; after costs one click.
- `pnpm test`, `pnpm lint`, `pnpm e2e` and `pnpm --filter web storybook:build` pass, and the
  production build is under 1150 kB initial.
- The user accepts the sheet at Gate 2.

## Do not

- Touch first-run or empty-workspace content, the sidebar's archived-only wording, archived pages,
  the archive refusal, restore controls, the digest's text, the Markdown editor's Cancel or Preview,
  or a Task List count. All of those belong to [Slice 79](../planned/79-empty-archived-and-editing.md).
- Reword domain or host messages. Agents read them over MCP, and they stay as they are. The UI stops
  *printing* them as the sentence.
- Add a structured rule code to `DomainRuleError`. 67 of its 68 call sites carry no details, and the
  refusals that matter most to people (writes under an archived project) are prevented by slice 79
  rather than reworded here.
- Change the toast's placement, Undo, pending or saved behaviour (slices 74 and 75), navigation or
  document titles (slice 7), the agent card's layout or Revoke (slice 8), or vocabulary beyond
  failure sentences (slice 9). The page ids that `history-feedback.ts` prints in two receipts
  (lines 116 and 119) are slice 9's.
- Rename Retry refresh, Retry remove or the header's history Retry.

<!-- ───────────── Written when the slice starts ───────────── -->

## Scope check

TH10 has twenty-two findings. Slice 77 closed three (L4-016, W1-042, W2-025). Of the nineteen left,
this slice takes ten (9 S2, 1 S3), each re-read from
[reproduction.json](../70-ui-ux/reproduction.json). Nine go to slice 79, with the three items
earlier records assigned to 6b (L3-012, W4-031, L4-023's count half):

- **78:** L4-001, L4-002, L4-003, L4-018, L4-022, L4-027, L4-014, W4-024, L6-003, L4-017.
- **79:** W1-001, W4-001, L4-020, W4-034, L4-007, L1-028, L4-008, L4-012, W4-028, plus L3-012,
  W4-031 and L4-023's count.

L4-018's Markdown evidence is split along the same line. Its failure *form* and the lingering
canvas alert are here; Cancel's discard is L3-012, in 79. L4-017's archived evidence (Legacy
attic) is an archived project with no tasks: "No tasks to measure" is true there too, so L4-017 closes
whole here. Round 4 had split it on the false premise that archived tasks leave the count.

**Candidates from the brief, decided:**

- *Row failure below the fold* (slice 75's open question). **Here**, by the user's choice on
  2026-10-29: an off-screen failure is pinned to the viewport's edge with an indicator, and nothing
  scrolls unless the user presses it (Build). It closes no TH10 finding of its own; it is
  slice 75's open question, and it lands here because it is part of the failure form.
- *Drag explanation reserve* (`note-2026-10-22-002`) and *Todos' workstream Complete
  `[disabled]`* go to slice 79. They are layout and disabled-state items, not failures.

## Findings closed

| Finding | Sev | Closed by |
|---|---|---|
| L4-001 | S2 | Sidebar "Loading projects…" until the first read answers |
| L4-002 | S2 | `readFailure` sentences and Try again on the dashboard, sidebar, project page, canvas sections and shortcuts reads, every section body, the agents page and the picker; one label rule; no duplicated string; one alert on Home |
| L4-003 | S2 | Failure replaces the empty sentence in Task List, Reflections and Timeline |
| L4-027 | S2 | Try again; separate read and write slots; a successful write after a failed read re-reads in full |
| L4-018 | S2 | One `FailureMessage` family for read and write failures; Markdown failure on the editor only |
| L4-022 | S2 | Nullable digest; the digest widget fails alone, with Try again; the reason stays on the host console |
| L4-014 | S2 | Project unavailable and `**` share one layout, plain words and Go to Home |
| W4-024 | S2 | Another persona's project reads "isn't available" with no id |
| L6-003 | S2 | No raw host text outside a closed Details, enforced by profile 78's gate. One named exception: Revoke's failure text, carried to slice 8 |
| L4-017 | S3 | "No tasks to measure", "Measuring…" and "Couldn't load" in place of "Not available", live and archived |

Ten findings (9 S2, 1 S3).

## Acceptance check

1. `pnpm test`, then `pnpm lint` (with `docs:check`), run one after the other.
2. `pnpm e2e` passes in full, including the new `states.spec.ts`. `phone-layout.spec.ts` stays
   unedited. Every other spec edit is listed under Behaviour vs. appearance.
3. `pnpm --filter web build` reports an initial bundle under 1150 kB.
4. **Before:** export the slice-77 closing commit (`0c19170`) outside `apps/e2e/`, link
   `node_modules`, and `ng build` it to `apps/e2e/ux-output/slice78-baseline-web/`, served from its
   `browser/` folder as `slice77.config.ts` serves its baseline. Then run
   `UX_BEFORE=1 pnpm --filter @cwm/e2e exec playwright test --config ux/slice78.config.ts`.
   **After:** run the same config without `UX_BEFORE` on the slice's final build. Then run
   `node docs/roadmap/70-ui-ux/tooling/build-sheet.mjs <before> <after> <output> <after> --profile 78`.
   Profile 78:
   - keeps profile 77's rules: the full control census with only slice 72's breadcrumb exception;
     a gate on any axe node absent from the same cell before (`color-contrast` reported only);
     Must-not-change cells moving more than 1 px fail; and every Visual acceptance pair is present;
   - reads `states-verification.json`'s context table and fails on any rule under Done when,
     including a Details that does not reveal the injected reason where the row declares one;
   - treats the Lab's new state specimens as changing, and four slice-77 matrix cells this slice
     changes on purpose (`apps/e2e/ux/matrix.ts:13-14`): `kitchen-error` (the project read
     failure's sentence and Details), `kitchen-refused` (the section-create refusal's reason moves
     under Details), `kitchen-archived` (Legacy attic's "Not available" becomes "No tasks to
     measure") and `not-a-route` (the unavailable layout). The `prototype-design-*` cells are gated
     panel-relative, as profile 77's Lab rule does, with these panels named as changing by id: the
     new state specimens panel (which replaces `states`, and holds the digest-failure specimen),
     `task-row`, `navigation` and `section-states` (whose stub error case changes). No other cell
     or panel is exempt.

   Zero gate failures. Capture ports are never 4200 or 4310; at most two browser jobs run at once.
5. `ux/states-verification.ts` (in the same config) records T01–T09, T11 and T12 before and after,
   and the failure contexts listed under Capture scope, plus a Lab row with every panel's box in
   both builds, which the panel-relative gate reads.
6. **MCP:** the `packages/mcp-tools` in-process contract test and the host stdio test pass the
   real provider's failure through `get_dashboard_context` as `dailyDigest: null` with every other
   field present and no provider text in the output. `apps/e2e/mcp.spec.ts` checks the same over
   HTTP.
7. **Real use** on busy-week and nested-projects, at 1440 with mouse, at 1440 keyboard only, and
   at 375 touch. Set the dev panel's failure rate to 100 %, then 0 %, and recover each surface with
   Try again. Switch the AI provider to real and use Home; confirm the host console logs the
   provider failure. As Alex, open Demo's project URL and an unknown address. Record friction in
   `.prototype/notes.json` (`CURRENT_SLICE` = 78).
8. The user accepts the sheet at Gate 2.

## Capture scope

**Must change.** Each failure context is injected by route (`route.fulfill` with a 500, a 404 or
an aborted request), as L4-states did. Delays use `route.fallback()` after a wait, never
`route.continue()`. Both themes; 1440 and 375:

- the dashboard with `/api/me` failing, and with the real AI provider (digest only);
- the sidebar while loading (8 s delay) and failed;
- `/projects/project-launch` with the project read failing (500), on busy-week; and Alex on Demo's
  project (404), on nested-projects;
- the nested-projects Kitchen canvas (the one seeded canvas with all five read sections) with the
  sections read failing, the shortcuts read failing, and the tasks, reflections, timeline, progress
  and activity reads failing;
- a Reflections section create failure and edit failure;
- a section-create dialog add that fails through `CanvasWriteResult`;
- the Kitchen canvas after a failed tasks read is lifted, then Try again;
- Todos, the Reflections page, Archive and Settings › Archived projects with their reads failing;
- Settings › AI & Agents with its read failing;
- the Add a shortcut picker with discovery failing, and a canvas with its shortcuts read failing;
- Todos with a stale-refresh notice;
- Archive with a restore write failure, with a committed restore whose refresh failed, and with a
  stale list after a failed quiet re-read; Settings › Archived projects with a stale list;
- the Kitchen Progress section with a formula write failure;
- write failures with their Details closed and open: a task row complete, a drawer field and
  quick-add, using the existing injected-failure routes from `placement.spec.ts`; and the
  section-removal toast;
- the Markdown save failure, before and after Cancel;
- a pinned failure at each edge, at 1440 and 375: a task row complete failure on nested-projects
  Renovation Todos below the scroll port with the toast open; a Task List row failure above the
  scroll port with its quick-add actually stuck; and the same after pressing each pinned copy;
- a section and a shortcut collapse failure off screen; a tall Task List frame still partly in
  view while its write-banner sentence is off screen, proving the sentence anchor controls pinning;
- the header progress fact on a new empty project and with progress failing;
- `/nope`;
- the Kitchen canvas while the first load is pending (a loading row), and its header's progress
  fact while pending (a muted-line row);
- the Lab's state specimens, and the `FailureMessage` stories.

**Gated within the change:** every pinned copy sits wholly inside the workspace's scroll port,
clear of the stuck quick-add and an open toast, and its indicator points toward its reference.
Every pinned copy's button and close button, Try again button, Details summary and Go to Home link passes the
target census (24 px, 44 px on touch). Every failure region in a section body sits inside that
section's frame, not above the canvas.

**Must not change** beyond 1 px, in their non-failure states: every populated page and section, the
section frame headers and tools, insertion marks, the project header's layout apart from the
progress fact's text, the sidebar tree, the task drawer, the toast, the creation dialogs' chrome,
and Lab panels other than those acceptance item 4 names. Populated captures are the slice-77 matrix cells,
except the four named under acceptance item 4.
Their pixels must hold, because this slice changes only failure, loading and empty-vs-failed
branches.

## Visual acceptance

| Pair (before → after) | Seed, size, theme | Findings |
|---|---|---|
| Sidebar during an 8 s load: "No projects yet" → "Loading projects…" | busy-week, 1440 dark, 375 light | L4-001 |
| Home with `/api/me` failing: two raw strings → one alert, one polite sidebar sentence, each with Try again | busy-week, 1440 dark | L4-002 |
| Kitchen canvas, section reads failing: raw text + false empty → failure in each frame with Try again | nested-projects Kitchen, 1440 dark, 375 light | L4-002, L4-003 |
| Kitchen canvas, shortcuts read failing: raw text + order-incomplete line → one message with Try again | nested-projects Kitchen, 1440 light | L4-002 |
| Kitchen after the failure is lifted: stale error → Try again → tasks | nested-projects, 1440 light | L4-027 |
| Real AI provider: whole dashboard one red box → six widgets + digest failure | agent-heavy, 1440 dark, 375 light | L4-022 |
| Alex on Demo's project: raw id → "This project isn't available" + Go to Home | nested-projects, 1440 light | W4-024, L4-014 |
| `/nope`: dashed card citing §68 → same layout as above | nested-projects, 1440 light, 375 dark | L4-014 |
| Five failure forms side by side → one family (region, inline, Details open) | busy-week, 1440 dark | L4-018, L6-003 |
| Markdown save failure, then Cancel: second canvas alert stays → none | nested-projects Kitchen, 1440 dark | L4-018 |
| Task row complete failure: reason inline → sentence + Details | nested-projects Kitchen, 1440 light | L6-003 |
| Section-removal failure toast: reason in the toast → sentence + Details | nested-projects Kitchen, 1440 light | L6-003 |
| Row failure below the fold: nothing visible → pinned copy at the bottom edge with ↓ | nested-projects Renovation Todos, 1440 dark, 375 light | slice 75's open question |
| Header progress: "Not available" ×2 → "No tasks to measure" / "Couldn't load" | busy-week new project; Launch with progress failing, 1440 dark; nested-projects Legacy attic, 1440 light | L4-017 |
| Settings and Archive retry labels → Try again | nested-projects, 1440 light | L4-002 |

## Behaviour vs. appearance

**Behaviour changes**, so §77 applies: the tests, the implementation and the docs change together.

- **Behaviour.**
  - The contract's `dailyDigest` becomes nullable, the domain catches provider failure, and the
    real provider logs it.
  - Read failures gain Try again where they had none: the dashboard, sidebar, project page, canvas
    sections and shortcuts reads, section bodies, the agents page and the picker.
  - Todos' stale-refresh notice gains Try again (the Reflections page's had one).
  - A refused restore offers Try again; canvas create results carry a `Failure`; the digest gains a
    public retry with a pending state.
  - Stores keep read and write failures apart. A read failure clears on the next successful read,
    and a successful write after a failed read starts a full read.
  - The empty sentence is suppressed under a failure.
  - Read-retry labels follow the label rule; Settings' committed restore says Retry refresh.
  - The Markdown failure no longer reaches the canvas-level alert.
  - The sidebar failure is polite, not an alert.
  - Opening Details does not select a task row.
  - An off-screen inline failure is pinned to the scroll port's edge; pressing it scrolls to and
    focuses its control.
  - Every displayed failure's text changes. The reason moves into Details.
- **Not behaviour.** No write path's commit changes: no rollback, revert, pending, Undo or history
  change. The host envelope, MCP tool handlers and domain messages are unchanged.
- **Appearance.** The pinned copy and its indicator, the `.state-message` pattern, loading lines, the not-found layout, the progress
  fact and the toast's Details.
- **Specs that change with it.** Stage 0 greps every `data-*-error` selector and every reason
  string across unit and e2e specs, and lists each hit here before editing it. Known now:
  - unit specs for every store and component in the change list that asserts error text or
    `error()` as a string, including `app-shell.spec.ts`, `history-feedback.spec.ts`,
    `toast.spec.ts`, `task-row.spec.ts`, the dialogs' and shortcut specs;
  - e2e: `placement.spec.ts` (four exact-text assertions at lines 113, 175, 210 and 302 change to
    the sentence plus the opened Details), `todos.spec.ts:108`, `section-chrome.spec.ts`,
    `canvas-editing.spec.ts`, `project-creation-history.spec.ts`, `project-history.spec.ts`,
    `archive.spec.ts` (including the committed-unrefreshed text at line 593), `archived-projects.spec.ts`
    (line 196) and `web.spec.ts:361` (its `[data-project-error]`
    "not found" assertion follows the new unavailable layout);
  - host: `apps/prototype-host/prototype/routes.test.ts:147` and `:166` (the real provider now
    answers 200 with a `null` digest; the comments change with them), and
    `core/gateway/prototype-work-manager-gateway.spec.ts:876` (spreads `dailyDigest`),
    `apps/prototype-host/api/routes.test.ts:982` and `packages/mcp-tools/src/contract.test.ts:479-480`,
    which dereference `dailyDigest.source` and must narrow it once it is nullable.
- **Stay green unedited:** `phone-layout.spec.ts` (its `[data-create-error]` `toContainText`
  'could not reach' still matches, because the hook is on the wrapper that holds Details),
  `removal-undo.spec.ts`, `feedback.spec.ts`, `objects.spec.ts`, `task-interaction.spec.ts`, and
  every spec the Stage 0 grep does not list. Frozen evidence scripts of completed slices are not
  re-run.

### Stage 0 inventory (2026-10-29)

Grepped at `937eb16` (the app code equals `0c19170`) and checked by hand. Each hit is edited,
or confirmed still green, by the stage that changes its store or template. **D** marks
display-text assertions that change, **N** marks assertions that a hook is absent and stay as
they are unless the hook is renamed, and **E** marks empty-hook assertions, which need
re-checking where the gate suppresses the empty sentence under a failure.

**`data-*-error` selectors, e2e.** `archived-projects.spec.ts:196` D ('Restore succeeded');
`archive.spec.ts:592-593` D; `lifts.spec.ts:144,149` N, `:161` visible; `placement.spec.ts:112-113` D,
`:122` D (couldn't confirm), `:138` validation 'Enter a task title.' stays, `:143` N, `:175` D, `:178`
count, `:179` N, `:278`, `:288` validation 'Enter a name.' stays, `:301-302` D, `:305` N;
`task-interaction.spec.ts:98` D ('Reopen refused'), `:99` N, `:109` visible; `web.spec.ts:341` D,
`:342` N, `:349` D (page toggle), `:361` D (unavailable layout); `phone-layout.spec.ts:310` stays
unedited ('could not reach', on the wrapper that holds Details); `row-history.spec.ts:200` visible,
`:201` N; `project-creation-history.spec.ts:124,140` D ('not found'); `project-history.spec.ts:526`
D ('not found'); `todos.spec.ts:502` visible; `section-chrome.spec.ts:38,140` N plus an alert D,
`:160` D ('Move refused'); `canvas-editing.spec.ts:544,804,926` D; `work-navigation.spec.ts:48` D.
In `apps/e2e/ux/placement-verification.ts:227-257`, frozen slice-75 evidence that records rather
than asserts, nothing is edited.

**`data-*-error` selectors, unit** (all under `apps/web/src/app/`). `core/shell/app-shell.spec.ts:297,323,336,355` D, `:366`
present; `core/shell/sidebar/sidebar.spec.ts:118` D, `:166,177,187,192` validation stays,
`:203,225` D, `:205` N; `prototype/dev-panel/state-inspector-page.spec.ts:124` and
`dev-panel.spec.ts:178` are dev-panel failures, outside this slice, and stay;
`features/projects/sections/tasks/task-list-section.spec.ts:378,521,650,766,798,812,814,840` N,
`:506,580,649,763-764,780,813` D, `:792` validation stays; `section-create-dialog.spec.ts:113,183` D;
`work-create-dialog.spec.ts:72,82` validation stays; `reflection-composer.spec.ts:84` D;
`project-workspace-shell.spec.ts:322-324,502,542,556,570,1132` D, `:1011` present;
`agent-connections-page.spec.ts:156-158,187` D, `:162,163,172` N; `shortcut-picker.spec.ts:80,184` D;
`project-page-navigation.spec.ts:344` D; `reflections-section.spec.ts:197` D;
`recent-activity-section.spec.ts:115` D; `task-row.spec.ts:262-264` D, `:257,274` N;
`archived-projects-page.spec.ts:98,117` D; `project-header.spec.ts:205` N;
`project-canvas.spec.ts:524,671,933,1103,1268` D, `:366` N; `dashboard-page.spec.ts:177` D;
`timeline-section.spec.ts:120` D; `todos-page.spec.ts:252,414,542,593,604-605,617` D,
`:253,608,629` N; `archive-page.spec.ts:245,253` D, `:261` N. Nothing in `packages/` or
`apps/prototype-host/` uses these selectors.

**Reason text without a `data-*-error` hook.** In e2e: `lifts.spec.ts:143` ('Details refused'),
`placement.spec.ts:210` (field status), `section-chrome.spec.ts:38,140` (alerts),
`work-navigation.spec.ts:137,154` (dialog alerts) and `todos.spec.ts:108` (the 'Project unavailable' heading,
which the retryable project failure replaces). `task-interaction.spec.ts:196` is validation and
stays. In components: `shortcut-frame.spec.ts:194`, `project-section-frame.spec.ts:490`,
`project-canvas.spec.ts:365`, `project-header.spec.ts:206`, `work-create-dialog.spec.ts:120`,
`project-workspace-shell.spec.ts:535` ('keeps Project unavailable…'), `:574` (the 'Retry' label,
which becomes Try again) and `:678` (page notice), `task-list-section.spec.ts:377`,
`task-detail-drawer.spec.ts:244,271` and `shortcut-picker.spec.ts:91`. `project-header.spec.ts:146` and
`task-detail-drawer.spec.ts:67` are validation and stay. Store `error()`-as-string assertions:
`shell-store.spec.ts:115,341,357`; `dashboard-store.spec.ts:113,124`;
`project-page-store.spec.ts:512,526,531,620,636,703,809,838,926,972,975,1066,1120,1171,1196,1215,1333,1516,1612,1893,1925,1983,2011,2294`;
`project-workspace-store.spec.ts:114,257,271,665,691,791,852`;
`reflections-page-store.spec.ts:152,168,222,271`; `reflections-store.spec.ts:138,140,177`;
`progress-store.spec.ts:73`; `timeline-store.spec.ts:105`;
`archived-projects-store.spec.ts:39,49,56,66,80`;
`archive-page-store.spec.ts:156,168,183,186,193,198,216,230,243,273,322`;
`todos-page-store.spec.ts:182,242,347,387,658`;
`task-list-store.spec.ts:230,239,304,358,383,418,661,710,795,821,833,892,893,913,915,924,951`. Of these,
`dev-panel-store.spec.ts:52,113` and `state-inspector-store.spec.ts:96` are the dev panel's and stay.
Domain, MCP and host refusal-message tests stay, because those messages are unchanged:
`packages/domain` (`operation-history-service`, `operation-execution`, `project-service`,
`project-history` tests), `packages/mcp-tools/src/registry.test.ts:108`,
`apps/prototype-host/router.test.ts`, and `api/errors.test.ts:58`. History-control labels ('Loading
history…', 'History unavailable', 'Nothing to undo') are control names and stay.

**`dailyDigest` readers.** `apps/prototype-host/api/routes.test.ts:982`;
`apps/prototype-host/prototype/routes.test.ts:147,166`; `packages/mcp-tools/src/contract.test.ts:479-480`;
`packages/domain/src/dashboard-service.test.ts:35,48,199,216,233`;
`packages/contracts/src/dashboard.test.ts:110,129`; `core/gateway/prototype-work-manager-gateway.spec.ts:853,876`;
`features/dashboard/dashboard-page.spec.ts:54` (fixture).

**Empty-state hooks asserted.** In e2e: `web.spec.ts:30` and `project-creation-history.spec.ts:69` E
('No projects yet', on a successful empty read, so they stay), `project-creation-history.spec.ts:78`,
`placement.spec.ts:51,73`, `archived-projects.spec.ts:125,226`, `canvas-editing.spec.ts:110,288`,
`row-history.spec.ts:141`, `web.spec.ts:57` and `ux/objects-verification.ts:81` (frozen). In
units: `sidebar.spec.ts:112`, `dev-panel-controls.spec.ts:167`,
`agent-connections-page.spec.ts:179,188`, `archived-projects-page.spec.ts:103`,
`archive-page.spec.ts:218`, `project-workspace-shell.spec.ts:782,1289`, `shortcut-picker.spec.ts:156`,
`reflections-section.spec.ts:189`, `reflections-page.spec.ts:188`, `project-canvas.spec.ts:229,374,375`,
`project-page-navigation.spec.ts:379`, `recent-activity-section.spec.ts:107`,
`activity-feed.spec.ts:125`, `task-list-section.spec.ts:447,743,746,861`,
`timeline-section.spec.ts:113`, `todos-page.spec.ts:438,618,626,627` and
`dashboard-page.spec.ts:156,168,221`. All of them are E. Only `agent-connections-page.spec.ts:188`
and `todos-page.spec.ts:618` already assert suppression under a failure; the stage-3 store specs
add that assertion for the rest.

**Dead `__error` classes.** One is dead today: `.archived-region__error`
(`features/projects/archived-region/archived-region.scss:33`), which no template uses. It is
deleted with the first stylesheet edit. Each of the 27 live `__error` classes below is styled and
used. Each one dies when its template moves to `FailureMessage`, and it is deleted in that same
stage (change-list row "Component stylesheets holding dead `__error` classes"). A class that
still styles a validation message keeps only that rule: `create-project`, `work-create-dialog`,
`drawer` and `quick-create`. The dev panel's `dev-panel` and `state-inspector` stay. The 27 are
`create-project`, `dashboard`, `archive-page`, `reflections-page`, `todos`, `project-canvas`,
`project-details`, `project-header`, `project-workspace`, `section-create-dialog`,
`recent-activity`, `progress-section`, `reflection-composer`, `reflections`, `section-frame`,
`quick-create`, `task-list-section`, `timeline`, `shortcut-frame`, `shortcut-picker`,
`work-create-dialog`, `agents`, `archived-projects`, `drawer`, `task-row`, `dev-panel` and
`state-inspector`.

## File-level change list

Paths are under `apps/web/src/app/` unless stated. "(+ spec)" means the colocated spec, and
"(+ stories)" the colocated stories, change with the file.

**Contract, domain, MCP and host**

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/dashboard.ts` (+ test) | modify | `DashboardResultSchema.dailyDigest` nullable, documented |
| `packages/domain/src/dashboard-service.ts` (+ test) | modify | Catch only the digest provider's rejection → `null` |
| `packages/mcp-tools/src/tools/workspace.ts`, `packages/mcp-tools/src/contract.test.ts`, `apps/prototype-host/mcp/stdio.test.ts` | modify | Describe and assert a `null` digest under the failing provider; narrow `dailyDigest.source` (lines 479-480); the stdio test's `connect` helper (lines 32-44) accepts an environment so it can pass `PROTOTYPE_AI_PROVIDER=real` |
| `apps/prototype-host/api/real-ai-provider.ts` | modify | `console.error` the reason before rejecting; doc comment: the dashboard now answers with a `null` digest |
| `apps/prototype-host/api/real-ai-provider.test.ts` | create | The rejection is logged to `console.error`, not stdout (console spy) |
| `apps/prototype-host/prototype/routes.test.ts` | modify | Line 147: 200 with `dailyDigest: null` under the real provider; line 166: after reset, a non-null digest with `source: 'prototype'`, so the reset check cannot pass vacuously |
| `apps/prototype-host/api/routes.test.ts` | modify | Line 982: narrow the nullable digest |

**Shared foundations**

| File | Change | Responsibility |
|---|---|---|
| `shared/feedback/failure.ts` (+ spec) | create | `Failure`, `readFailure`, `writeFailure`; structural read of `code`/`message`; the only translation |
| `shared/feedback/failure-message.{ts,html}` (+ spec, stories) | create | Region and inline weights, sentence element, Try again, Details |
| `shared/feedback/toast.{ts,html}` (+ spec, stories) | modify | Render an optional `detail` as Details |
| `shared/feedback/pinned-failures.ts` (+ spec) | create | Root-provided registry, most recent per edge, counts, occurrence dismissal and lifecycle cleanup |
| `shared/feedback/pinned-failure.directive.ts` (+ spec) | create | Registers the failure sentence anchor and reveal/focus reference; observes the nearest scrolling ancestor and cleans up on replacement/destruction |
| `shared/feedback/pinned-failure-slot.{ts,html}` (+ spec, stories) | create | Draws pins in the content track at measured clear edges; press reveals/focuses the owner; close dismisses with guarded focus recovery |
| `core/history/receipt-undo.ts` (+ spec), `core/history/receipt-toast.spec.ts` | modify | `ReceiptUndoResult` gains the optional `detail`; the receipt toast already passes the result on, so only its spec changes |
| `apps/web/src/styles/_controls.scss` | modify | `.state-message` with `--failed`, `--loading`, `__details` |
| Component stylesheets holding dead `__error` classes (Stage 0 lists each) | modify | Delete the classes `FailureMessage` replaces |
| `core/gateway/testing/fake-gateway.ts` | modify | A dashboard with a `null` digest; per-read failure switches the specs need |

**Shell and dashboard**

| File | Change | Responsibility |
|---|---|---|
| `core/shell/shell-store.ts` (+ spec) | modify | `Failure`; loading state; Try again |
| `core/shell/sidebar/sidebar.{html,ts}` (+ spec) | modify | Loading line; polite failure with Try again; New project failure Details |
| `core/shell/app-shell.{html,ts}` (+ spec) | modify | Shell-level failures through `FailureMessage`; render `PinnedFailureSlot` in `.workspace` (`app-shell.scss` needed no change) |
| `features/dashboard/dashboard-store.ts`, `dashboard-page.{html,ts}` (+ specs) | modify | `Failure`; Try again; public `retryDigest()` with a pending flag; widget `retry` calls it |
| `features/dashboard/widgets/registry.ts` (+ spec) | modify | `DashboardWidgetDefinition` (lines 24-31) gains optional `failureOf(dashboard)`; the digest's entry (line 44) supplies it |
| `features/dashboard/widgets/widget-frame/dashboard-widget-frame.{ts,html}` | modify | When `failureOf` returns a failure, render it instead of mounting the widget; emit `retry`; a `pending` input sets `aria-busy` and disables Try again |
| `features/dashboard/widgets/widget-frame/dashboard-widget-frame.spec.ts` | create | `failureOf` renders and emits `retry`; no hook renders as before |
| `features/dashboard/widgets/daily-digest/daily-digest-widget.{ts,html}` | modify | Export `dailyDigestFailure` (the `failureOf` the registry imports, as it imports `upcomingWidgetQuery`); narrow the nullable digest (template lines 2, 7); the widget is never mounted with `null` |
| `features/dashboard/widgets/daily-digest/daily-digest-widget.spec.ts` | create | `failureOf` on a `null` digest; nothing on a present one |

**Project page and sections**

| File | Change | Responsibility |
|---|---|---|
| `features/projects/project-workspace-store.ts` (+ spec) | modify | Unavailable vs failed project; progress-failure state; page navigation write failure (line 474); `createWorkstream` failure (line 300) as a `Failure` |
| `features/projects/project-workspace-shell.{html,ts}` (+ spec) | modify | Unavailable layout, `data-route-focus`, Go to Home, history Retry kept; progress binding; chunk failure layout (line 56); page-resolution message (line 100) |
| `features/projects/project-header.{html,ts}` (+ spec) | modify | Progress input with empty and failed; wording |
| `features/projects/project-page-navigation.{html,ts}` (+ spec, stories) | modify | Navigation write failure (line 102) with Details |
| `features/projects/project-page-store.ts`, `project-canvas.{html,ts}` (+ specs) | modify | `Failure`; sections read and a separate shortcuts read failure (store lines 342, 352, 402, 406, 459, 1226, 1233), each with Try again, `data-placement-order-incomplete` deleted; `data-canvas-loading` (canvas html lines 30-31) becomes `.state-message--loading` with `aria-busy`; the full load (line 443) clears both; `sectionError` writes with Details; guard sentence kept; `CanvasWriteResult` (line 87) and `mutateWithResult` carry a `Failure`, with product sentences at lines 1182 and 1187 (canvas lines 169, 183); the canvas callbacks' own refusals (`project-canvas.ts:158-161, 173-175`) become reason-less `Failure`s; `mutate()`'s not-loaded return (line 1148) gives the Markdown save a sentence; `onFailure` on `mutate`/`updateSection`/`updateConfig`, skipping the clear at line 1154, used by the Markdown save (canvas line 509) |
| `features/projects/sections/section-contract.ts` | modify | `onConfigChange` returns a result carrying the `Failure` |
| `prototype/design-lab/panels/live-panels.{ts,html}` | modify | `saveSectionConfig` (line 67) returns the new result; the failed task row (html line 10), the error sidebar (html line 95, ts line 83) and a new loading sidebar take `Failure`s and product sentences |
| `features/projects/sections/section-frame/project-section-frame.{html,ts}` (+ spec, stories) | modify | Frame-level failure (line 106) through `FailureMessage`; `saveConfig` input's result (lines 62, 77) |
| `features/projects/sections/{tasks,progress,reflections,timeline,activity}/*-section.{html,ts}` (+ specs) | modify | Failure instead of empty; Try again |
| `features/projects/sections/{progress,reflections,timeline}/*-store.ts`, `features/activity/activity-store.ts` (+ specs) | modify | `Failure`; separate read and write slots (reflections create and edit, lines 19 and 21); retry; clear on success; re-read after a write |
| `features/projects/sections/reflections/reflections-section.{html,ts}` | modify | Composer `[error]` bound to the create failure; edit failure beside the edit form; banner for the read only |
| `features/projects/sections/reflections/reflection-composer.{html,ts}` (+ spec, stories) | modify | Composer failure (line 22) with Details |
| `features/projects/sections/markdown/markdown-section.ts`, `markdown-section-body.{html,ts}`, `markdown-source-editor.{html,ts}` (+ specs, stories) | modify | `saveConfig` result with the `Failure`; inline alert with Details |
| `features/projects/shortcuts/shortcut-store.ts` (+ spec) | modify | Picker discovery read failure (line 33) as a `Failure` |
| `features/projects/shortcuts/shortcut-frame.{html,ts}` (+ spec, stories) | modify | Collapse write failure (line 69) with Details; `noopConfig` (line 60) result type |
| `features/projects/shortcuts/shortcut-picker.{html,ts}` (+ spec, stories) | modify | Discovery failure with Try again; `create` returns `Failure \| null` (result path lines 84-86, catch line 88); `noopConfig` (line 43) |
| `features/projects/{section-create,work-create,project-details}-dialog.{html,ts}` (+ specs; section-create and work-create stories) | modify | Create failures through `FailureMessage`; section-create's `create` returns `Failure \| null` (result path lines 89-91, catch line 93; work-create line 120; project-details line 91) |
| `features/projects/history/history-feedback.ts` (+ spec) | modify | `sectionRemoveFailedFeedback` gives a sentence and a `detail`; `FailedSectionRemoval` (`project-page-store.ts:79, 802`) carries a `Failure`, and the canvas toast (`project-canvas.html:212`, `project-canvas.ts:213`) binds `detail` |

**Tasks, pages and settings**

| File | Change | Responsibility |
|---|---|---|
| `features/tasks/task-list-store.ts` (+ spec) | modify | `writeFailure`; separate read and drag-receive slots, both in the section banner; full read after a write that follows a failed read (line 288) |
| `features/tasks/task-row.{html,ts}` (+ spec) | modify | Details beside the described sentence; `summary, details` in the selection guard (line 118) |
| `features/projects/pages/todos-page.ts`, `features/projects/sections/tasks/task-list-section.{html,ts}` (+ specs) | modify | Import/bind the pin directive for Todos row failures and Task List drag-receive write banners; TaskRow and canonical/shortcut frame files above register their own row/collapse failures |
| `features/tasks/task-detail-drawer.{html,ts}` (+ spec) | modify | Field failure Details (line 22) |
| `features/projects/pages/{todos,reflections}-page{-store.ts,.html}` (+ specs) | modify | `Failure`; label rule; row failures' Details; `data-todo-write-error`; polite stale-refresh notice |
| `features/projects/pages/archive-page{-store.ts,.html}` (+ specs) | modify | Load failure, committed-unrefreshed and restore write failure and stale, as four states with their precedence (store lines 15, 91, 150; page lines 25-27) |
| `features/settings/archived-projects/archived-projects-page.{html,ts}`, `archived-projects-store.ts` (+ specs, stories) | modify | The same four states (store lines 10, 80, 118) |
| `features/settings/agents/agent-connections-page.{html,ts}` (+ spec), `agent-connections-store.ts` | modify | List read failure with Try again, apart from Revoke's page-level failure (lines 15, 32, 46); permission failure Details |
| `features/settings/agents/agent-connections-store.spec.ts` | create | Read failure, Try again, clear on success; a Revoke failure shows no Try again and keeps the list |
| `shared/components/unavailable-page/unavailable-page.ts` (+ spec, stories) | create | Shared heading (`tabindex="-1"`, `data-route-focus`), sentence and Go to Home |
| `shared/components/placeholder-page/not-found-page.ts` | modify | Renders `UnavailablePage` with plain words |
| `shared/components/placeholder-page/not-found-page.spec.ts` | create | Heading, no §, link to `/app` |

**Prototype tooling, e2e and evidence**

| File | Change | Responsibility |
|---|---|---|
| `prototype/design-lab/panels/primitive-panels.{ts,html}`, `prototype/design-lab/design-lab-fixtures.ts` | modify | State specimens **replace** the `states` primitive panel (html lines 132-139, "not yet a shared component"), keeping its "No projects yet" empty specimen as it is (empty content is slice 79's), and the stub section's error case (fixtures lines 179-180); a `null` digest fixture, shown in the state specimens panel; config save result (fixtures line 191). The project-card specimen's "Not available · planning" (html line 116) is not the header fact and is left for the §8 comb |
| `prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 78` |
| `apps/e2e/states.spec.ts` | create | Behaviour pins (Test plan) |
| `apps/e2e/{placement,todos,section-chrome,canvas-editing,project-creation-history,project-history,archive,archived-projects,mcp,web}.spec.ts` | modify | Sentence + Details; label rule; nullable digest over HTTP; unavailable layout |
| `apps/e2e/ux/capture.ts` | modify | Line 97 asserts the raw reason as visible text; assert the `[data-project-error]` hook in both builds instead, so the after capture does not fail before the gate |
| `apps/e2e/ux/slice78.config.ts`, `ux/states-verification.ts`, `ux/tasks.ts` | create / modify | Failure contexts, gate data, T12 |
| `docs/roadmap/70-ui-ux/tooling/build-sheet.mjs`, `build-sheet.test.mjs` | modify | Profile 78 |

**Documentation**

| File | Change | Responsibility |
|---|---|---|
| Spec §21, §23, §24, §34, §44, §63, §68 | modify | Amendments in place (§34: quick-add's reason and the drawer's "Not saved. Try again." wording at spec line 2230; the digest's provider failure is §44's, not §42's) |
| `docs/guides/first-milestone-walkthrough.md` (step 31) | modify | The real provider now fails only the digest |
| `docs/decisions/2026-10-failures-speak-product-words.md` | create | One failure shape; sentence by code; reason under Details; Try again repeats only the read; the label rule; read and write kept apart; no false empty; stale content said politely; writes stay enabled under a read failure; the digest fails alone and its reason stays on the console. *Revisit when* the MVP is specified: **Details should be hidden in production** (the user's note, 2026-10-29); the prototype keeps it for diagnosis, and nothing changes now. Links [dashboard layout and content split](../../decisions/2026-08-dashboard-layout-and-content-split.md) |
| `docs/decisions/2026-10-feedback-stays-on-the-object.md` | amend | Sentences keep their place; the reason moves under Details; an off-screen failure is pinned to the scroll port's edge and only the user's press scrolls |
| `docs/decisions/README.md` | modify | Index |
| `README.md` (line 147) | modify | The real provider leaves a `null` digest and six widgets; the reason is still on the console |
| `docs/architecture/prototype-host/why.md` (line 52), `docs/architecture/prototype-host/prototype-runtime/why.md` (line 63), `docs/architecture/prototype-host/api/how.md` (line 57), `docs/architecture/web/dashboard/why.md` (line 39) | modify | Same |
| `docs/architecture/web/{how,what}.md`, `web/core/*`, `web/dashboard/*`, `web/projects/*`, `web/tasks/*`, `web/prototype-tooling/*`, `docs/architecture/contracts/what.md`, `docs/architecture/domain/{how,what}.md`, `docs/architecture/mcp-tools/what.md`, `docs/architecture/testing/{how,what}.md` | modify | What is now true |
| `docs/roadmap/active/70-ui-ux-overhaul.md` | modify | Handoff: 6b split into 78 and 79 |
| `docs/architecture/web/overview.md`, `docs/architecture/prototype-host/api/overview.md`, `docs/architecture/{contracts,domain}/why.md`, `docs/roadmap/planned/79-empty-archived-and-editing.md` | modify | What is now true; the decision linked from each system it shapes; 79's handoff |

## Implementation sequence

0. Grep every `data-*-error` selector, every reason string and every empty-state hook across unit
   and e2e specs; list each hit under Behaviour vs. appearance, and list the dead `__error` classes.
   Build the "before" from `0c19170`.
1. Contract and domain (tests first), then MCP, the host's provider log and its tests.
2. `failure.ts`, `FailureMessage`, `.state-message`, the toast's Details, Lab specimens and stories
   (foundations first, protocol §7.1).
3. Stores to `Failure`, one store with its template and spec at a time: shell, dashboard and widget
   frame, workspace, page and canvas, sections and shortcuts, pages, settings, picker.
4. Write failures' Details; dialogs; Markdown; progress fact; not-found.
   Build the pin registry/directive/slot tests first, then wire the directive to TaskRow, Todos
   rows, canonical and shortcut collapse failures, and Task List drag-receive write banners.
   The row, section/frame and page files already listed above gain the directive imports and
   bindings; read banners, page-level failures and restore rows do not register.
5. Re-capture, sheet, reviews, Gate 2, real use.

## Test plan — tests first

| Test | Proves |
|---|---|
| `contracts/dashboard.test.ts`: `dailyDigest: null` accepted; a malformed digest still refused | Shape |
| `domain/dashboard-service.test.ts`: a rejecting provider gives `dailyDigest: null` and the full lists and counts; a rejecting *repository* still rejects | Only the digest fails alone |
| `mcp-tools` contract test and host stdio test: `get_dashboard_context` under a failing provider returns `dailyDigest: null` and no provider text | Agents see it; nothing leaks |
| `prototype/routes.test.ts`: under the real provider `/api/dashboard` is 200 with `dailyDigest: null` and no provider text; reset still restores the mock provider | Host |
| `real-ai-provider.test.ts`: the digest rejection is written to `console.error`, not `console.log` | The reason stays on the console under HTTP and stdio |
| `failure.spec.ts`: each code's sentence; no sentence contains the reason, a quoted id or a status; an object with only `code` and `message` works; a non-error gives the generic sentence and `String(error)` as reason | Translation; no `core/` import |
| `failure-message.spec.ts`: region has the sentence with `role="alert"` when asked, Try again emitting `retry`, and a closed Details holding the reason; no Details when there is no reason; the wrapper's text contains the reason; the described element contains only the sentence | Component |
| `toast.spec.ts`, `history-feedback.spec.ts`, `receipt-toast.spec.ts`: a removal failure's sentence has no reason; its `detail` reaches the toast and renders as closed Details | Toast |
| `shell-store.spec.ts` / `sidebar.spec.ts`: while the first read is pending the tree shows "Loading projects…" and never "No projects yet"; a failed read shows "Couldn't load your projects." with Try again and no `role="alert"`; Try again re-reads and clears | L4-001, L4-002 |
| `dashboard-page.spec.ts`: `/me` failure shows one alert and Try again; a `null` digest renders six widgets and the digest failure; the digest's Try again re-reads quietly, keeping the widgets | L4-002, L4-022 |
| `dashboard-widget-frame.spec.ts`, `registry.spec.ts`: a definition's `failureOf` renders the failure without mounting the widget and emits `retry`; `pending` sets `aria-busy`; a widget without the hook renders as before | Widget contract stays data-only |
| `project-workspace-shell.spec.ts`: `not_found` gives "This project isn't available", Go to Home, no Try again, no Details, no id, focus on the heading, and the history Retry still offered when history failed; `internal_error` gives the h1 "Couldn't load this project" (route focus) over "Something went wrong while it was loading." with Try again that re-reads | W4-024, L4-014 |
| `project-canvas.spec.ts`, `project-page-store.spec.ts`: a failed sections read and a failed shortcuts read each show Try again that re-reads; a later section write does not clear the shortcuts read failure; a `sectionError` write shows the sentence with Details; the removal guard shows its sentence alone | L4-002, L6-003 |
| `task-list-section.spec.ts`, `reflections-section.spec.ts`, `timeline-section.spec.ts`: under a failed read the empty sentence is absent; Try again re-reads; a later successful quiet read clears the failure; quick-add and the composer stay enabled | L4-003, L4-027 |
| `task-list-store.spec.ts`, `reflections-store.spec.ts`: a write failure does not replace or clear the read failure; a successful write after a failed read starts a full read that clears it | L4-027 |
| `progress-store.spec.ts`, `progress-section.spec.ts`: a formula write failure keeps the result and controls and shows its sentence with Details; a failed re-read after a write is the stale form with Try again; a stale Try again that fails again stays stale and keeps the result and controls | L6-003; no lost controls |
| `todos-page-store.spec.ts`, `todos-page.spec.ts`: a stale Try again runs a quiet read; failing again it stays stale, keeps the list and never shows "Couldn't load" | Stale Try again is quiet |
| `archive-page-store.spec.ts`, `archived-projects-store.spec.ts`: a failed quiet read while committed-unrefreshed or a refusal is held keeps that state; Settings' refusal after its failing quiet re-read still shows the refusal | Precedence |
| `reflections-page-store.spec.ts`: a save whose refresh fails says "Saved, but this journal couldn't refresh." with Retry refresh; a later failed quiet read keeps it rather than turning it stale | Label rule |
| `project-page-store.spec.ts`: a successful quiet read clears a move failure, as today; a failed one does not | Canvas clearing kept |
| `task-list-section.spec.ts`: a drag-receive failure renders in the section banner with Details and no Try again, beside an intact list | §34 placement |
| `progress-section.spec.ts`, `recent-activity-section.spec.ts`, `shortcut-store.spec.ts`: Try again re-reads, including after `not_found` | L4-002 |
| `shortcut-frame.spec.ts`: a collapse failure shows its sentence with Details | L6-003 |
| `todos-page.spec.ts`, `reflections-page.spec.ts`: a failed refresh over a list on screen shows "This list may be out of date." on Todos and "This journal may be out of date." on the Reflections page, politely, with Try again and Details, never "Couldn't load" | Stale content |
| `archive-page-store.spec.ts`, `archived-projects-store.spec.ts` and their page specs: a load failure with nothing on screen says Try again; a failed read with a list on screen is the polite stale notice, keeps the list and keeps Restore paused; a refused restore whose Try again fails becomes stale; a committed restore whose refresh failed says Retry refresh and re-reads; a restore write failure shows "Couldn't restore “X”. The archive may have changed." with Details and a Try again that re-reads; Restore stays paused in all four until a successful read, and Try again unpauses it | Label rule; Slice 47's pause kept and escapable |
| `reflections-section.spec.ts`, `reflections-store.spec.ts`: a create failure renders on the composer and an edit failure beside the edit form, each with Details; neither replaces nor clears the read state | Section writes |
| `project-page-store.spec.ts`, `section-create-dialog.spec.ts`, `shortcut-picker.spec.ts`: an add that fails through `CanvasWriteResult` shows its sentence with Details; the not-loaded and order-incomplete refusals show product sentences; a shortcuts read failure shows one message; while the first load is pending the canvas shows no failure text | Result path; no false failure while loading |
| `dashboard-page.spec.ts`: the digest's Try again sets `aria-busy` and disables itself while `retryDigest()` runs | Visible retry |
| `unavailable-page.spec.ts`: heading focusable with `data-route-focus`, Go to Home to `/app`, no Details | Shared layout |
| `project-workspace-store.spec.ts`, `project-header.spec.ts`: pending → "Measuring…", never "No tasks to measure" or "Couldn't load"; no tasks → "No tasks to measure"; a root with tasks only in workstreams → "No tasks to measure"; progress failure → "Couldn't load"; a failed re-read after a percentage keeps the percentage; an archived project with no tasks reads "No tasks to measure"; never "Not available" | L4-017 |
| `task-list-store.spec.ts`, `todos-page-store.spec.ts`: complete, reopen and add failures keep the sentence and expose the reason as `Failure.reason`, not in the sentence | L6-003 |
| `task-row.spec.ts`, `task-detail-drawer.spec.ts`, `reflection-composer.spec.ts`, the three dialog specs, `shortcut-picker.spec.ts`, `project-page-navigation.spec.ts`: the control's `aria-describedby` target text equals the sentence; Details is outside it | No reason in the accessible description |
| `task-row.spec.ts`: clicking a row's Details summary does not select the row | Selection guard |
| `pinned-failures.spec.ts`, `pinned-failure.directive.spec.ts`, `pinned-failure-slot.spec.ts`: a sentence anchor wholly below (above) the unobscured root pins bottom (top) with ↓ (↑), including a visible row whose error is below the fold and a tall visible frame whose banner is off screen; any part of the anchor entering unpins it; clearing removes it; two off one edge show latest and "and 1 more"; activation reveals its sentence anchor within the unobscured port and focuses its owner despite synchronous unpin, with sentence/reference fallback for disabled or missing controls; dismissal suppresses only that occurrence, preserves its row failure and never scrolls; a replacement failure re-arms; destroy/context replacement disconnects observation and late callbacks cannot re-pin; focused pin disappearance/dismissal recovers locally with preventScroll, preserving focus moved elsewhere; the copy is a button, not an alert, and has no Details; observer callbacks update signals | Pinned failure and lifecycle |
| `markdown-section-body.spec.ts` (line 71's "no alert" assertion changes), `markdown-source-editor.spec.ts`, `project-canvas.spec.ts`, `project-page-store.spec.ts`: a config save failure returns its `Failure`, leaves an existing `sectionError` untouched, and renders one inline alert in the editor; Cancel leaves no alert | L4-018 |
| Todos, Reflections page, AI & Agents (`agent-connections-store.spec.ts` new) and the picker specs: the load failure button reads "Try again" and re-reads | L4-002, label rule |
| `project-workspace-store.spec.ts`, `work-create-dialog.spec.ts`: a `createWorkstream` failure is a `Failure`; the dialog shows the sentence with Details | L6-003 |
| `app-shell.spec.ts`: shell failures render the sentence, not the reason | L6-003 |
| `not-found-page.spec.ts`: plain heading with `data-route-focus`, no §, Go to Home link to `/app` | L4-014 |
| `apps/e2e/states.spec.ts`: tasks reads fail until the failure renders → Try again and no empty sentence → lift → Try again shows the tasks (T12); real provider → six widgets and the digest failure; Alex on Demo's project → Go to Home lands on `/app`; sidebar during a delayed read reads Loading; keyboard reaches Try again and Details; a Todos row failure below the fold pins above an open toast, and a Task List row failure above the fold pins below its actually stuck quick-add; section/shortcut collapse and Task List drag-receive failures pin to their own reference; a visible owner with an off-screen sentence still pins; nothing scrolls until activation, which reveals the sentence anchor, removes the pin and focuses its surviving control, including for the tall visible owner; keyboard dismissal does not scroll or lose focus; navigation leaves no pin from the old context (1440 and 375) | End to end |
| `build-sheet.test.mjs` pin fixtures: reject a missing pin, wrong edge/indicator, pin for a visible sentence anchor, pin outside the scroll port/content track, overlap with stuck quick-add or open toast, and missing anchor/clearance geometry; accept corresponding valid evidence. `states-verification.ts` records scroll-port/content-track, sentence-anchor, pin, sticky-control and visible-toast bounds for those checks, plus the post-activation focus target | Pin gates cannot pass falsely |
| `build-sheet.test.mjs` profile 78: fails on a Capture scope context with no table row, any `[data-*-empty]` inside a `read` row's region, a row whose `emptyHook` no longer exists in the source, a missing declared recovery or an undeclared one, a loading row without the loading line or `aria-busy`, the injected reason visible outside a closed Details, a raw-reason pattern outside it, a `details: true` row whose Details does not reveal the reason, a `details: false` row that shows Details, a Must-not-change cell moved 2 px (and only the four named matrix cells and four named Lab panels exempt), missing Lab panel evidence, a `pending` row without its declared text, or a missing `states-verification.json`; still applies the breadcrumb exception | The gate cannot pass falsely |

## Boundaries touched

- **Contracts once.** `Failure` is view state, not a contract. It lives in the web and carries no
  wire shape. The digest's nullability is declared once, in `packages/contracts`.
- **The host's error rule.** Unhandled errors answer without their message (`api/errors.ts`). The
  digest keeps that rule: no provider text crosses HTTP or MCP, and tests assert it.
- **Domain over abstractions.** `DashboardService` gains a `try`/`catch` around its existing
  `AIProvider` call: no new dependency, no `Clock` change, no `new Date()`. It does not learn the
  transport; it treats any provider rejection the same.
- **MCP calls domain services.** Tool handlers are unchanged; only a description and tests change.
- **Components depend on gateway interfaces.** `failure.ts` reads `code` and `message`
  structurally and imports nothing from `core/`, so `shared/` gains no new edge. No lint governs
  imports between web folders; the Step 4 boundaries review pass checks that no `shared/` file
  imports `core/` or a concrete gateway.
- **`core/` and `shared/`.** The app shell renders `PinnedFailureSlot` from `shared/feedback/`, as
  it renders the toast slot; the pinned-failure files import nothing from `core/` and find the
  scroll port as the nearest scrolling ancestor, not by naming the shell.
- **Widgets take data only.** `failureOf` is a pure function on the definition; the frame, not the
  widget, renders the failure and emits `retry`.
- **Tokens only** in `_controls.scss` and every touched stylesheet; the token lint covers them.
- **`core/` never depends on `prototype/`.** Unaffected. The Lab imports the shared component, not
  the reverse.

## Explicit non-goals

- Everything under Do not.
- A global error boundary or an offline banner.
- Retrying writes automatically, or adding Try again to write failures, with one named exception:
  a refused restore offers Try again as the re-read Slice 47 requires before another write, and
  its sentence does not say "Try again" (recorded in the decision). Their slice 75 sentence
  already says Try again, meaning *do it again*.
- Changing what `unreachable` or `invalid_response` *do*. Slice 76's "owe one quiet read" rule
  stands.
- A lint rule for imports between web folders.

## Open questions

None open. Three were answered by the user on 2026-10-29:

1. **Row failure below the fold.** Pinned to the viewport's edge with an indicator (Build).
2. **Details in production.** It should be hidden in production. This is a note in the decision
   entry's *Revisit when*; the prototype keeps Details, and nothing changes in this slice.
3. **The header's history Retry.** Keeps its label; a note for the §8 comb.

**Answered by the user on 2026-10-30** (from Stage 5 part b; each closed its sheet failures):

4. **The project read failure has no h1** (8 failures). **Accepted (a):** a visible h1, "Couldn't
   load this project", with `data-route-focus`; the sentence beneath is reworded by
   `headedReadFailure` so it is not said twice. Build is amended.
5. **The toast clips its message at 375** (2 failures). **Accepted (a):** on touch
   (`(hover: none), (any-pointer: coarse)`) `--toast-max-block-size` is 16rem, not 12rem. The
   shell's toast clearance follows the token.
6. **Non-failure rows declared `read`** (8 failures). **Accepted (a):** a `settled` row kind in the
   context table and profile 78. It must declare recovery `none` and no Details, may not sit in a
   context with an injected failure, and is not held to the empty rule.
7. **The reflection body has no label** (4 failures). **User chose a visible label:** "Reflection",
   a `.control-label` like the composer's "Prompt". No `aria-label`. The reflection screens' after
   captures change on purpose.
8. **Canvas-wide false-empty rule on `kitchen-shortcuts-failing`** (4 failures). **Accepted (a),
   narrowed by the user:** a canvas-region row ignores an empty hook only inside a section or
   shortcut frame that is itself the region of a row in the table (Reflections and Recent Activity
   here). The rig records each hook's frame (`emptyHookFrames`); a hook outside every frame, in a
   frame with no row, or without frame evidence still fails.

**Answered by the user on 2026-10-30** (from S5FIX):

9. **The geometry gate had no way to accept Q7's intended reflow** (192 failures in 66 matrix
   cells). **Accepted (a), the narrow exception:** profile 78 measures the label and lets boxes at
   or below the reflection body move by exactly its height, or half of it for controls centred in
   the box that holds the body. On the 375 toast-open screen, the workspace may also gain Q5's
   64 px of toast clearance. Any other movement still fails. No cell became report-only, and the
   before was not recaptured.

**Raised by S5C (2026-10-31), for Gate 2:**

10. **Archive's and Settings › Archived projects' stale notice may not be announced.**
    - **Context:** each page renders one `FailureMessage` for its four states. It is mounted only
      while an error is held: `archive-page.html` and `archived-projects-page.html`.
    - **The problem:** when a quiet re-read fails over a list with no error held, the message is
      inserted already holding its `role="status"` text. `FailureMessage`'s own doc comment says
      screen readers often skip such an insertion. Todos, Reflections and the sidebar avoid this
      with a `role="status"` wrapper that is always mounted.
    - **Why it was not fixed:** the one-message design is deliberate. A refusal that turns stale
      keeps the same instance, so Try again keeps focus (Build, "Archive").
    - **Options:**
      - (a) Leave it. The stale case on these two pages is rare and visible.
      - (b) Mount a wrapper around the stale case only. This costs the refusal-to-stale focus
        continuity.
      - (c) Add a visually hidden status region that is always mounted and repeats the stale
        sentence. A screen reader reads it twice when browsing.
    - **Impact:** a11y only. Nothing visual changes, and no gate depends on it.

## Revisions

- **Round 1 (2026-10-29):** fifteen substantive and ten minor findings, each checked against the
  code before acting. Changes:
  - **E2e hooks.** `data-*-error` stays on a wrapper holding the sentence and Details, so
    `phone-layout.spec.ts` stays unedited; `aria-describedby` names the sentence only. The specs
    that do change are listed, and Stage 0 greps every selector and reason string.
  - **Read and write kept apart** in the task-list, reflections and progress stores, and a
    successful write after a failed read now re-reads in full: the quick-add append (task-list
    store line 290) was why L4-027 survives recovery.
  - **Digest.** The contract carries the reason (`dailyDigestFailure`), the host's switchable
    provider logs it, and the host tests (`prototype/routes.test.ts`, not `api/`), README and two
    host docs were added. Retry comes from a `failureOf` hook rendered by the widget frame, so
    widgets stay data-only.
  - **Markdown.** `saveConfig` returns its failure and uses the page store's existing `onFailure`,
    so the canvas alert is skipped; the Markdown files and stories were added.
  - **Missing renderers** added: shortcut store and frame, section frame, reflection composer, page
    navigation, the workspace shell's chunk failure, the canvas `sectionError` writes and sections
    read, the three dialogs' `.ts`, the drawer, app shell, Todos' write error and the toast.
  - **Label rule** written out; Settings' committed restore says Retry refresh; the header's history
    Retry is out of scope and kept on the unavailable page.
  - **Task row** selection guard gains `summary, details`.
  - **Progress** gains a failure state and a header input that can say empty and failed.
  - **No `core/` import from `shared/`:** `failure.ts` reads errors structurally, and the
    `retryable` field is dropped; callers choose the recovery, so `not_found` sections still offer
    Try again.
  - **Gate:** the exact injected reason must not be visible outside Details; the id pattern is
    widened; the empty-state selectors are named; T12 fails reads until the failure renders.
  - **Minor:** the activity capture moves to agent-heavy and the 404 pairs to nested-projects; both
    unavailable headings *gain* `data-route-focus`; the sidebar failure is polite so Home has one
    alert; the not-found page has no Details; a §30 amendment; quick-add and the composer stay
    enabled (recorded in the decision); L4-017 split; two new spec files marked create; dead
    `__error` classes listed; the dashboard layout decision linked.
- **Round 2 (2026-10-29):** seven substantive and seven minor findings, each checked against the
  code. Changes:
  - **Markdown routing.** There was no `onFailure` on the config path: `mutate()` always writes
    `sectionErrorState`. `mutate`/`updateSection`/`updateConfig` gain the option, and
    `section-contract.ts`'s `onConfigChange` changes with the frame's `saveConfig`.
  - **More read/write splits.** The canvas's shortcuts read lived in the write slot
    `sectionErrorState`; it gets its own read failure with Try again. Archive and Settings ›
    Archived projects get three states (load, committed-unrefreshed, restore write failure); the
    plan had wrongly said Archive already showed Retry refresh. The agents list read is kept apart
    from Revoke's failure, whose wording stays slice 8's.
  - **Shortcut rows corrected:** `shortcut-store.ts:33` is the picker's discovery read and
    `shortcut-frame.html:69` is a collapse write; the frame has no read of its own.
  - **Gate.** The empty-state check now matches any `[data-*-empty]` in the failed region, with the
    real hook names, and the test fails if an expected hook disappears from the source. Loading
    contexts get a positive rule.
  - **Digest.** `dailyDigestFailure` is dropped: no provider text crosses the wire, keeping the
    host's `errors.ts` rule. `RealAIProvider` logs with `console.error`, which covers stdio too.
    The digest failure has Try again and no Details.
  - **Spec section.** Quick-add's "reason beside the form" is §34, not §30.
  - **Minor:** cited lines corrected (chunk failure line 56, quick-add append line 288,
    `DashboardResultSchema`); three spec files marked create; `receipt-undo.ts`/`receipt-toast.ts`,
    the two `dailyDigest.source` dereferences, `prototype-host/why.md`, `web/dashboard/why.md` and
    `web.spec.ts:361` added; a polite stale-refresh notice designed and tested; `createWorkstream`'s
    failure named; drag-receive placed in the section banner; the header's archive refusal noted
    as wording owned by slice 79.
- **Round 3 (2026-10-29):** six substantive and ten minor findings, each checked against the code.
  Changes:
  - **Seed.** agent-heavy has no Progress or Timeline section; the section-read captures move to
    nested-projects Kitchen, which has all five.
  - **Archive escape.** Slice 47 pauses Restore until a successful read; a restore write failure
    with no read retry would have left the page stuck. It now offers Try again (a re-read), and the
    label rule says so.
  - **Canvas create results.** Section-create and the shortcut picker get failures as
    `CanvasWriteResult` strings, not throws; it now carries a `Failure`, and its two synthetic
    refusals get product sentences.
  - **Gate as a table.** Recovery, Details and empty-hook expectations are declared per context in
    `states-verification.json` and pinned by the test, replacing prose exemptions that contradicted
    the plan's own states (Retry refresh, the progress fact, the unavailable project).
  - **Reflections section writes** (create and edit) split from its read and placed on the composer
    and the edit form.
  - **Revoke** named as the one raw-reason exception, carried to slice 8.
  - **Minor:** all shortcuts-read and clearing sites listed; the shortcuts failure replaces the
    order-incomplete line; the Reflections page's stale retry and its "journal" noun corrected;
    `live-panels.ts`, the fixtures and the `noopConfig`s added; `markdown-section-body.spec.ts:71`
    named; a public `retryDigest()` with a pending state; the double-log sentence dropped; the
    project-launch capture put on busy-week; a shared `UnavailablePage` named; `messageOf` removal
    limited to outside `prototype/`; the config save skips the pre-write clear too.
- **Round 4 (2026-10-29):** three substantive and seven minor findings, each checked against the
  code. Changes:
  - **Order-incomplete line deleted.** It showed during every canvas load, a false failure beside
    "Loading canvas…"; the shortcuts read failure is now its only honest case and says it. A canvas
    loading row joins the gate.
  - **Progress has four values:** pending shows the loading line; archived projects keep "Not
    available" for slice 79, because their tasks are excluded from the count.
  - **Restore refusal sentence.** "Couldn't restore “X”. The archive may have changed." so the
    re-read button labelled Try again is honest; named as the one exception in the non-goals.
  - **Minor:** Revoke and the removal guard removed from the gate's examples (no capture context);
    "shortcut frames" leftover removed from L4-002; reflections-store lines corrected to 19 and 21;
    the reset test at `routes.test.ts:166` asserts the mock digest, not just 200; the canvas's own
    refusal strings and `mutate()`'s not-loaded return named; `load()` (line 443) added as a
    clearing site; the gate test's prose carve-out replaced by the table's declared recovery.
- **Round 5 (2026-10-29):** two substantive and eight minor findings, each checked against the
  code. Changes:
  - **L4-017 closes whole.** Archiving only sets `status`; tasks stay in the count, so "Not
    available" only ever meant zero tasks and "No tasks yet" is true on archived projects too.
    Round 4's archived carve-out rested on a false premise and is removed here and from slice 79.
    A failed re-read keeps a shown percentage.
  - **Archive stale state.** Both archive stores keep their list on screen when a read fails; a
    fourth, polite stale state replaces "Couldn't load" over that list, keeping Restore paused.
  - **Minor:** this slice owns the refused-restore and committed-unrefreshed sentences, with a noun
    per page and the reach sentence for `unreachable`; the widget definition is in `registry.ts`,
    and the frame does not mount a failed widget and takes a pending input; the canvas loading line
    adopts the pattern; a `data-recovery` attribute lets the gate find recovery controls; subjects
    are singular; `mutate()`'s line corrected.
- **Round 6 (2026-10-29):** two substantive and seven minor findings, each checked against the
  code. Changes:
  - **Archive precedence.** Committed-unrefreshed, then refused restore, then stale, then load
    failure; a failed read never displaces a held write state, so Settings' re-read before its
    refusal no longer hides a failed restore.
  - **Progress formula write.** Split from the read and placed inline beside the controls, which
    stay on screen; its re-read failure is the stale form. The impossible "write after failed read"
    progress test is replaced.
  - **Minor:** the Reflections page's saved-but-unrefreshed case takes Retry refresh; canvas reads
    keep clearing write alerts on success, as today; the frame's `.html` and the digest's exported
    `failureOf` listed; `data-empty-canvas` added to the gate; the singular-subject rule scoped to
    subjects that can answer `not_found`; an `unreachable` refused restore says it may not have
    been restored; the stdio `connect` helper and the gateway spec's `dailyDigest` spread added.
- **Round 7 (2026-10-29):** two substantive and five minor findings, each checked against the
  code. Changes:
  - **Matrix cells.** Four slice-77 matrix cells change on purpose (`kitchen-error`,
    `kitchen-refused`, `kitchen-archived`, `not-a-route`); profile 78 names them as changing and
    the test pins that no other cell is exempt. `capture.ts:97` asserted the raw reason as visible
    text and would have failed the after capture; it is added to the change list.
  - **Stale Try again is quiet.** Todos' only retry and Progress's `load()` empty their content on
    failure; stale notices now run a quiet read, with tests that a second failure stays stale.
  - **Minor:** a refusal's Try again hands over to its read (stale only if that read fails); the
    Reflections page keeps saved-unrefreshed apart from stale; the progress fact says "No tasks to
    measure" (true on a root whose tasks sit in workstreams) and "Measuring…" while pending, not a
    loading row; `FailedSectionRemoval` carries the `Failure` the toast's `detail` comes from.
- **Round 8 (2026-10-29):** one substantive and five minor findings, each checked against the
  code. Changes:
  - **The Lab.** The type changes force existing Lab panels to change (the failed task row and
    error sidebar pass raw strings; the `states` primitive panel and the stub's error case show raw
    text). `live-panels.html` is added; the new specimens replace those panels; acceptance item 4
    names the Lab panels that change and gates the rest panel-relative.
  - **Minor:** a `pending` kind for the header's "Measuring…" row; "four states" in the archive
    rows; each stale noun in the test row; the project-card specimen's "Not available" left for the
    comb; the retryable project failure replaces the "Project unavailable" section.
- **Round 9 (2026-10-29):** no substantive findings; five minor ones, folded in. The changing Lab
  panels are named by id (`task-row`, `navigation`, `section-states` and the new specimens panel,
  which holds the digest-failure specimen); acceptance item 5 records Lab panel boxes in both
  builds; `pending` rows declare their expected text and the gate checks it; the replaced
  `states` panel keeps its empty specimen unchanged for slice 79.
- **User answers (2026-10-29), after round 9:** the row failure below the fold is now in scope. An
  off-screen inline failure is pinned to the workspace scroll port's edge with an indicator, and
  only the user's press scrolls (Build; amends the feedback decision). Details should be hidden in
  production, recorded as a note in the decision's *Revisit when*, with no change now. The header's
  history Retry keeps its label, as a note for the §8 comb. Open questions are now empty.
- **Round 10 (2026-10-29):** two reviewers checked the pinned-failure addition against the
  actual shell, toast, Task List, Todos and archive code. Substantive findings corrected:
  - Visibility observes the compact failure sentence, retaining the row/frame as the reveal
    destination; a visible fragment of a tall owner cannot hide its off-screen failure.
  - Restore errors stay page-level and outside pin scope; no disabled Restore focus target or
    new row-local placement. Todos supplies bottom/toast evidence; a real Task List supplies
    top/sticky-quick-add evidence. Canonical and shortcut frame registration sites are explicit.
  - Edge clearance is measured explicitly; toast padding does not position an overlay. Pins
    remain within the content track, clear of navigation/drawer space.
  - Occurrence dismissal, replacement/destruction cleanup, late callbacks, zoneless updates and
    guarded focus on activation, dismissal and passive disappearance are specified and tested.
  - Pin geometry evidence and failing gate fixtures cover absent pins, wrong edges/indicators,
    visible anchors, out-of-track pins and sticky/toast overlap.
- **Round 11 (2026-10-29):** mechanism reviewer found no substantive issues. Behavior reviewer found one follow-through: revealing a tall owner alone could leave its sentence off screen. Activation now explicitly reveals the sentence anchor inside the unobscured port before focusing the owner control with preventScroll; unit and browser assertions require the anchor visible and the pin gone, including the tall-owner fixture. Pin scope is named precisely: task rows, collapse failures and the Task List drag-receive banner.
- **Round 12 (2026-10-29):** behavior reviewer verified the activation correction and returned
  no substantive findings. Together with the round 11 mechanism review, Step 2 is complete;
  implementation remains stopped for the user's acceptance. No implementation or commit.
- **Plan accepted (2026-10-29):** the user accepted the revised plan and requested a planning
  commit and push. Implementation has not started.
- **Stage 0 (2026-10-29):** the inventory is added under Behaviour vs. appearance. The sweep
  found no spec edits beyond the plan's list other than `todos.spec.ts:108` (the "Project
  unavailable" heading) and `project-workspace-shell.spec.ts:535,574`. The `__error` row of the
  change list is made concrete: one class is dead today, and validation-only and dev-panel rules
  stay. The harness's context table names a region selector that exists in both builds for every
  Capture scope context.
- **Stage 2 (2026-10-29):** one review pass over the diff. Two plan changes came from it.
  - The digest's Try again, and every `FailureMessage` recovery while `pending`, is
    `aria-disabled` with a click guard, not the `disabled` that Build and the test plan say. A
    disabled button drops focus to `<body>` at the moment of activation, and the repo's pending
    buttons already use `aria-disabled`.
  - Four items move to Stage 3 because each needs its consumer: the fake gateway's and the Lab's
    `null` digest, the removal feedback's `detail`, and the canvas toast binding.
  - The new Lab panel id is `state-messages`. Profile 78 names it as the changing panel in place
    of `states`.
- **Stage 3, part a (2026-10-29):** shell and dashboard; one review pass over the diff, no
  substantive findings. Two choices the plan did not spell out:
  - A read's Try again keeps the failure on screen, busy, until the read answers, rather than
    clearing it for the loading line. The control the person pressed stays, with focus, and a
    retry that fails again visibly ends. A loud read queued behind a quiet one is `loading` at
    once (review finding).
  - The sidebar's polite failure sits in a persistent `role="status"` region mounted with the
    Projects group, per the Stage 2 trap, rather than `FailureMessage`'s own `live="status"`.
    The announcement may include "Try again" and "Details"; a retry that fails again with the
    same sentence is not re-announced. Both are for real use to judge.
- **Stage 5, part a (2026-10-30):** the gate tooling. Three plan changes came from it.
  - **Context table rows** gain `text`, a `pending` row's declared text, which the test plan's
    "a `pending` row without its declared text" needs.
  - **Rules added to profile 78 beyond Done when's list**, each from Capture scope's "Gated within
    the change":
    - every Details summary passes the target census;
    - beside a section row, no failure sits on the canvas outside every frame;
    - a pinned context shows exactly one pin, and none after the press.
  - **Two relaxations to the new-axe-node rule:** the sidebar list's re-anchoring, and a known set
    taken per route and view (see the State header). Both came from real evidence, where
    pre-existing violations read as new.
- **Stage 5, part b (2026-10-30):** the acceptance run and the sheet. Four plan changes came
  from it.
  - **`dashboard-real-ai`:** the row's region is the digest tile
    (`[data-dashboard-tile][data-widget-type="daily_digest"]`), not `app-daily-digest-widget`,
    which a failed digest never renders.
  - **Two gate rules sharpened** with fault tests, not loosened:
    - A Lab plane belongs to the `data-panel` that holds it.
    - A state's own before is known even when a rig-generated project id changes its route.
  - **Failure detection:** the rig's wait and failure probe count the shared
    `[data-failure-sentence]`.
  - **Open questions 4–8** are added for the 26 remaining gate failures.
- **S5FIX (2026-10-30), user decision:** the user answered Open questions 4–8 (see Open
  questions). Changes:
  - Build's "no heading" for the retryable project failure becomes a visible h1 with a reworded
    sentence (Q4).
  - The toast's height cap rises on touch only (Q5).
  - Profile 78 and the context table gain the `settled` row kind (Q6).
  - The reflection body gains a visible "Reflection" label (Q7).
  - A canvas row ignores empty hooks inside frames that have rows of their own (Q8).
  - The re-capture and sheet rebuild cleared all 26 failures. They surfaced Open question 9,
    Q7's reflow under the strict geometry gate, which is left for a gate call.
- **S5FIX2 (2026-10-30), user decision:** the user answered Open question 9 with (a). Changes:
  - Profile 78 gains the narrow reflection-label reflow rule (State header, `testing/how.md`).
  - Its height is measured rather than declared. The prompt-to-body gap must grow to equal the
    "Prompt" label's gap, so a shifted body cannot set its own allowance.
  - The rebuilt sheet has 0 gate failures.
- **S5C (2026-10-31), reviews:** five review passes ran (State header).
  - The change list was corrected:
    - `app-shell.scss` and `receipt-toast.ts` were never changed.
    - The spec row names §44 in place of §42.
    - The walkthrough, the two `why.md` files and the docs edited outside the list are now listed.
  - Open question 10 was added.
  - The rig's `focus` shot and the sheet's scrolled row are evidence changes only. No gate rule
    changed.
