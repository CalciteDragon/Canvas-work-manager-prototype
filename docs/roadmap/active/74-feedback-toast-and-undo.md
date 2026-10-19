<!-- plan id="74" status="active" summary="Redesign slice 4a (TH07): one toast lift carries every confirmation and its Undo at the point of action; Archive is always visitable, so opening it records nothing" -->
# Slice 74 — Feedback: toast and Undo where the user acted

**Current execution state (2026-10-18):** implementation, independent review repairs, real use
and the full comparison sheet are ready. Gate 2 has not been accepted. See
[Execution resumption](#execution-resumption--gate-2-candidate-2026-10-18) for current evidence;
the earlier paused handoffs are historical. All final verification is green; user acceptance
is the only remaining step before the Outcome and phase closure.

Redesign slice 4a under the [UI/UX overhaul umbrella](70-ui-ux-overhaul.md). Theme **TH07**,
"Feedback is detached from the action", in [themes.json](../70-ui-ux/themes.json). This slice takes
its confirmation and Undo half. The pending, saved and scroll-into-view half is
[slice 75](../planned/75-feedback-pending-and-placement.md). The user chose this split on
2026-10-17.

## Goal

Every confirmation of a write, and the Undo for it, appears in **one** toast lift docked at the
bottom of the content track. It is reachable from where the user acted and written in plain words.
Opening the Archive never changes the project.

## Spec sections

- **§21** visual design system. The toast uses the slice-71 lift tokens, plus new toast tokens. No
  literals.
- **§23** application shell, project column. It lists the root's enabled pages, plus Archive while
  Archive is the current page (correction).
- **§26** project page design.
  - The Slice 41 paragraph ("the only browser surface that offers Undo", "one polite feedback line
    under the facts") is corrected.
  - The Slice 56/57 task-delete paragraphs: the status becomes the toast, with Undo.
  - "Pages": Archive is always routable, and its toggle shows or hides it in navigation.
  - More's Open archive no longer depends on the page being disabled.
- **§27** Section Canvas. "The canvas keeps only Open Archive and the explicit retries" becomes the
  toast with Undo.
- **§31** "Where archived work is found":
  - The frame sentence "undone and redone from the project header, not from the canvas" is
    corrected.
  - The "disabling the Archive page leaves Open archive … which enables and opens it" paragraph is
    corrected.
- **§34** task interactions. Todos "does not … add Undo here" is reversed.
- **§61–§63** operation history, read side only. The toast's Undo cites the write's own receipt.
  No contract, domain or host change.
- **§67** Design Lab. A toast specimen over the busy backing, in both themes.
- **§68** route map.
  - `/projects/:root/pages/archive` renders for every root.
  - The positive-rule paragraph ("the root has it enabled") and the Slice 25.8 "Enable …" paragraph
    stop applying to Archive.
  - A workstream's page URL still redirects.
- **§69** verification, **§77** design-first loop, **§78** decision log.
- [Overhaul protocol](../../guides/ui-ux-overhaul-protocol.md) §6–§7.

## Build

- **Toast foundations.** These live in `shared/feedback/`:
  - `.lift--toast` in `_lifts.scss`;
  - a presentational `Toast` component;
  - a root `ToastSlot`, which keeps one toast on screen at a time and closes it on navigation.
- **Undo in the toast.** A `core/history` token, `RECEIPT_UNDO`, has an inert default and is bound
  by the shell to `ProjectHistoryStore`. It undoes exactly the step a write recorded, in whichever
  history recorded it, and refuses when that step is no longer the latest.
- **Adopters.** These all speak through the toast:
  - the canvas removal states;
  - Task List and Todos delete;
  - the header's history line;
  - project archive;
  - Archive-page restore and Settings › Archived projects restore;
  - Todos workstream Complete;
  - writes recorded in another project's history.
- **Archive is always visitable** (W4-020, the user's answer of 2026-10-17). The Archive toggle in
  page settings only shows or hides the page in project navigation. **Open archive** navigates and
  writes nothing.

## Done when

- The 20 findings below are closed and demonstrated on the before/after sheet.
- Core tasks T05 and T09 cost no more than their baselines.
- e2e pins the keyboard and touch paths.
- The user accepts the sheet at Gate 2.

## Do not

- Build pending indicators, a saved cue, row-level failures, scroll-into-view for new items or
  layout anchoring (slice 75).
- Change section collapse (slice 5), task drag (slice 6), the Markdown editor's Cancel or Preview
  (slice 6), or agent Revoke (the agent connections slice).
- Touch domain, contracts, host, persistence, MCP or the gateway. History labels stay the server's
  strings.
- Remove the header's Undo and Redo. They stay the full-history surface; the toast adds the
  one-step Undo where the user acted.

<!-- ───────────── Written when the slice starts ───────────── -->

## Scope check

TH07 lists 38 findings. The user split them on 2026-10-17:

| Group | Findings | Slice |
|---|---|---|
| Confirmation, Undo and one feedback place | the 20 listed under Findings closed | **74** |
| Pending, saved, row failures, new items in view, a canvas that holds still | W1-024, W2-008, W3-016, W1-043, L4-023, L3-007, L4-004, L3-008, W2-018, L4-005, W1-030, W2-010, L4-024 | 75 |
| Section collapse waits on the server | L3-016 | 5 (section chrome) |
| Task drag snaps back; Markdown Cancel discards; Preview looks saved | L3-017, L3-012, W4-031 | 6 (objects and states) |
| Revoke is one click and permanent | L3-023 | agent connections |

Slice 73 implemented TH15's task-add findings (W1-026, W3-012, W2-009, W4-008). Slice 75 evidences
and closes them, together with L4-023.

**Decisions amended, never rewritten.** The five reopened by TH07:

- [disposable removal and immediate undo](../../decisions/2026-09-disposable-removal-and-immediate-undo.md)
- [task delete recovery feedback](../../decisions/2026-09-task-delete-recovery-feedback.md)
- [one-step section removal and task delete](../../decisions/2026-09-one-step-section-removal-and-task-delete.md)
- [optional page operation history](../../decisions/2026-09-optional-page-operation-history.md)
- [descendant history discovery](../../decisions/2026-09-descendant-history-discovery.md)

Eight more, because they state a rule this slice reverses:

- [project header history controls](../../decisions/2026-09-project-header-history-controls.md):
  the canvas offers no Undo.
- [root archive recovery guidance](../../decisions/2026-09-root-archive-recovery-guidance.md) and
  [optional page management lives in project navigation](../../decisions/2026-09-optional-page-management-lives-in-project-navigation.md):
  Open archive enables the page; the "Enable …" offer on a disabled Archive route.
- [optional pages are created on first enable](../../decisions/2026-09-optional-pages-are-created-on-first-enable.md):
  the archive-freeze exemption stays, and only its rationale changes.
- [recovery routes name what is actually there](../../decisions/2026-09-recovery-routes-name-what-is-actually-there.md):
  `SectionRecoveryNotice` is deleted.
- [project create, edit and archive surface](../../decisions/2026-08-project-create-edit-archive-surface.md):
  "Undo is available here."
- [route focus lands lost focus](../../decisions/2026-10-route-focus-lands-lost-focus.md): the
  Open archive landing is unchanged, but it is no longer reached through a write.
- The direction's **principle 6**, which says "next to the change". `direction.md` gets a dated
  amendment if the user confirms Open question 3.

## Findings closed

All are reproduced in [reproduction.json](../70-ui-ux/reproduction.json).

| Finding | Sev | Closed by |
|---|---|---|
| W1-036, L4-026 | S2 | Removing a section shows "Removed the Notes section." with **Undo** first. Focus lands on Undo (step 6) |
| L3-009 | S2 | Deleting a task shows "Archived “X”." with **Undo** and **Open archive**. No instruction names another place |
| L6-016 | S3 | No sentence points at "the header" or names a control the toast does not show |
| L3-010 | S2 | *After* half: every removal confirms with a way back, **including** a removal Archive will not list, such as Progress, which today sets no notice (`project-page-store.ts:782`). The *before* half (consequence first) is answered by the one-step removal decision, which stands (Gate 1 amendment) |
| W1-037, W2-021 | S3 | Removal, Undo, Redo, restore and archive all report in the same toast, in one style |
| L1-023 | S3 | The toast is centred in the content track, within its edges, and the track reserves its height. Whether it covers the acted region is measured and reported, not scrolled away (Acceptance 4 and 13). This is the interpretation the user accepts or rejects at Gate 2 (Open question 3) |
| L3-005 | S3 | A toast closes after 8 s (paused while hovered or focused), when a newer write begins in the workspace, on navigation, or on Dismiss. The header no longer grows, because the line is gone |
| L6-015, W1-013 | S3 | Plain sentences, such as "Undone: Moved the Markdown section." and "Created “Lighting”.". There is no "was recorded in … history", no raw timestamp, and one quote style |
| W4-007 | S3 | A write recorded in another project's history, such as creating Lighting under Kitchen, offers **Undo** in the toast through that history |
| L3-020 | S2 | Completing a workstream on Todos shows "Completed Kitchen." with **Undo**, through the workstream's own history, and **Open Kitchen** |
| W1-047, W2-029, L3-021, W4-021 | S2/S3 | Restore says what came back and where: "Restored “Old permit copy” to Kitchen › Work." with **Go to it** |
| L4-010 | S2 | Settings › Archived projects does the same: "Restored Home renovation as Active." with **Open it** |
| W3-004 | S2 | After a Restore, focus lands on the toast's first action, never on `body` |
| W4-020 | S2 | Archive is always visitable. Open archive navigates and writes nothing, so the removal stays the latest Undo step |

## Acceptance check

**A. Foundations.** These land, with a Lab specimen and a story, before any surface adopts them.

1. **`.lift--toast`** in `apps/web/src/styles/_lifts.scss`, with no literal values.
   - **Paint.** It is painted like `.lift`.
   - **Anchor.** It is docked at the bottom of the **content track**. On project routes that is
     `.project-workspace__main`, which excludes the project column; elsewhere it is `main`. The
     track carries `anchor-name: --toast-track`. Inside `@supports (anchor-name: --a)`, the toast
     centres on the track's inline centre with `--toast-max-inline-size` as its cap, and never
     wider than the track less `--space-4` on each side. The fallback is fixed and centred in the
     viewport with the same cap.
   - **Beside the drawer.** While the drawer is open, `.project-workspace--drawer-open` already
     pads the track's inline end by the drawer's width, so the anchored toast ends at the drawer's
     edge with no further offset. Only the viewport fallback, where anchor positioning is
     unsupported, subtracts `--lift-side-offset`.
   - **Block size.** It is capped by `--toast-max-block-size`. Conflict lines scroll inside it.
   - **Motion.** Enter animates `opacity` and a small upward `transform` over `--duration-base`
     with `--ease-out`. Leave uses `--duration-fast` with `--ease-in`. Reduced motion is a
     crossfade within 80 ms.
   - **Fallbacks.** Reduced transparency, no `backdrop-filter` and forced colours resolve to
     `--plane-lift-solid` with a border.
   - **Blur budget.** The toast blurs only when no other lift is open. Whenever any other `.lift`
     is open, it paints `--plane-lift-solid`, so transient blur stays at one layer. That covers a
     side drawer, an auto popover (More, page settings) and a dialog or the phone sheet:
     `:root:has(.lift:not(.lift--toast):popover-open, dialog.lift[open], [data-modal-lift])`.
     `[data-modal-lift]` marks the two custom creation dialogs, `section-create-dialog` and
     `work-create-dialog`. They are `.lift--contained` sections, neither popovers nor native
     dialogs.
   - **New tokens** in `_tokens.scss`: `--toast-max-inline-size` and `--toast-max-block-size`.
     There is no z-index token, because z-index has no effect in the top layer.
2. **`Toast`** (`shared/feedback/toast.ts`) is presentational.
   - **Inputs:** `open`, `tone` (`status` | `alert`), `message` and optional `lines`. Actions are
     projected buttons and links. **Output:** `dismissed`.
   - **Element.** It renders a `popover="manual"` element with `.lift .lift--toast`, shown and
     hidden by `showPopover` and `hidePopover` from an effect on `open`. Because it is manual, it
     never light-dismisses and never closes an auto popover.
   - **Announcement.** Two persistent, visually hidden live regions sit beside the popover, outside
     it: one `role="status"` and one `role="alert"`. The tone picks the region. Both are cleared
     when the toast closes. A hidden popover is `display: none`, and a region inside it would not
     be heard. Several Task Lists on one page each render their own regions, empty until used.
   - **Escape.** With focus inside, Escape emits `dismissed` and calls `stopPropagation`, so
     document-level Escape handlers do not also act. It is tested with the drawer open. The
     drawer's own `(keydown.escape)` never sees the event, because the toast is not inside the
     drawer.
   - **Dismiss** is a ghost button, last.
   - **Timer** (Open question 1, the user's choice).
     - A `status` toast emits `dismissed` 8 s after it opens. The value is `TOAST_DISMISS_MS` in
       `toast.ts`, named in the decision. It is a behaviour constant, not a style value, so it is
       not a token.
     - The timer pauses while the pointer is over the toast, while focus is inside it, and while
       `ToastSlot` suppresses it. When the pause ends, a fresh 8 s starts.
     - Focus moved into the toast under step 6 therefore holds it open until focus leaves. A
       timeout never fires with focus inside, so it needs no fallback focus.
     - An `alert` toast never times out, because a failure or refusal waits for the user. Neither
       does a toast whose Undo is pending.
     - When the toast morphs to "Undone: …" or to a refusal sentence, the timer restarts for the
       new tone.
   - **Focus.** The toast never takes focus by itself. Its callers move focus under step 6.
   - **Tab order.** Each surface renders its own `<app-toast>` in its own template, so the toast
     follows the acted region in Tab order while the top layer docks it visually.
   - **Focus on hide.** Native popover focus restoration on `hidePopover()` is verified in
     Storybook. Wherever it conflicts with step 6, the caller overrides it, as `LiftFocus` does.
3. **`ToastSlot`** (`shared/feedback/toast-slot.ts`) is provided at the root.
   - **One at a time.** `claim(close)` closes the previous holder's toast first, so at most one
     `.lift--toast:popover-open` exists. It releases on close and on destroy.
   - **Navigation.** It closes the held toast on every router `NavigationStart`, including moves
     between pages of one root, which reuse the shell.
   - **Suppression.** `suppress(reason)` and `release(reason)` hide the toast without dropping it.
     AppShell suppresses it while the phone navigation drawer is open, because the drawer and its
     scrim are not in the top layer and make `main` inert. The dev panel suppresses it while open,
     because it must stay on top. `prototype/` may import `shared/`. The two custom creation
     dialogs also suppress it while open. They are not in the top layer, so without suppression an
     open toast would paint above them, stay interactive and could cover their buttons at 375 px.
     They suppress it from the same open path that already calls `LiftStack.open`.
   - **Separate from `LiftStack`.** A toast does not close the drawer, a menu or a dialog, and they
     do not close it.
   - **Modal order.** A caller whose action closes a modal lift, such as the archive confirm, Edit
     details or the phone sheet, shows its toast only after the dialog has closed. A **native**
     modal opened while a toast is up covers it, and the toast is inert until the modal closes.
     The custom creation dialogs suppress it instead (above).
4. **Reserve and clearance.**
   - **Reserve.** While a toast is open, the content track's scroll container gets
     `padding-block-end` and `scroll-padding-block-end` equal to `--toast-max-block-size` plus
     `--space-4`. The end of the canvas can then scroll clear, and a focused control is never
     hidden beneath the toast (WCAG 2.4.11).
   - **No programmatic scroll.** Showing a toast never scrolls the page. Scroll-into-view and "a
     canvas that holds still" belong to slice 75. Whether the toast covers the acted region is
     measured and reported (Acceptance 13), and the user judges it at Gate 2 (Open question 3).
5. **Lab and Storybook.**
   - **Lab.** The plane panel gains a toast specimen with Undo, over the busy backing, in both
     themes.
   - **Storybook.** `shared/feedback/toast.stories.ts` has the stories `Status`, `Alert`,
     `WithUndo`, `OverOpenMenu` and `UnderModal`. They are the real-browser proof of the native
     calls; unit specs stub them, because jsdom has no top layer.
     - Each story opens the toast, presses Escape inside it, and checks that `dismissed` fired, the
       popover closed and focus restoration behaved as step 6 says.
     - `OverOpenMenu` checks that opening an auto menu does not close the toast.
     - `UnderModal` checks that a toast shown before `showModal` is inert beneath the dialog.

**B. Behaviour.** Every step has a failing test before it is implemented.

6. **Focus rule.**
   - **Moving in.** The action removes the control the user acted with in these cases: section
     Remove, task Delete, Restore on both surfaces, and Todos Complete. Focus then moves to the
     toast's **first** action once it renders, but only if focus is on `body` or still on the
     removed control. The existing `focusAfterRemoval` and task-delete guards keep that check.
     Otherwise focus stays where it is.
     - For a same-history removal or delete, the first action is **Undo**, rendered from the start
       (step 7).
   - **Closing with focus inside.** If the toast closes while focus is inside it, focus goes to the
     caller's fallback:
     - removal: the first surviving section title, or the canvas;
     - task delete: quick-create;
     - Archive restore: the next row's Restore, or the Archive heading;
     - Settings restore: the next row's Restore, or the page heading;
     - Todos complete: the next row's toggle, or the Todos heading.
   - **After a toast Undo** (step 7): the toast stays open and reads "Undone: …". Focus moves from
     Undo to Dismiss in the same render, so it is never on `body`. Once the restored section's
     heading renders, focus moves there, but only if focus is still in the toast. The wait is
     bounded to about 2 s, and when the bound runs out, focus stays on Dismiss.
     - **The section's return.** `setCanvas` today clears the removal notice when the section
       comes back (`project-page-store.ts:481-487`). It now clears only a notice still in its
       *removal* state, for a return made elsewhere, such as the header's Undo. A notice in its
       *undone* state is kept, and the return is only signalled: that signal is what moves focus to
       the heading.
   - **Closing by navigation.** When a toast closes because of a navigation, including its own
     Open archive, Go to it, Open {owner} or Open it, and a §68 redirect after an Undo, the
     fallback focus is skipped. The destination's landing or route focus owns focus.
   - **Route focus.** The toast does not interact with `core/a11y/route-focus.ts`, because every
     toast closes on `NavigationStart` (step 3) before route focus acts.
7. **`RECEIPT_UNDO`** (`core/history/receipt-undo.ts`).
   - **The token.** It is an `InjectionToken` with an inert default that offers nothing, the same
     pattern as `OPERATION_HISTORY_REPORTER`. The shell binds it to `ProjectHistoryStore` in
     `providers`. Components in `features/projects`, and anything rendered outside a shell
     (Storybook, the Lab, specs), inject the token, never the store. `features/tasks` does not
     import `features/projects`.
   - **Interface:**
     - `offer(report)` returns a signal of `'ready' | 'saving' | 'unavailable'`;
     - `undo(report)` returns the toast's next sentence and outcome.
   - **Classification is reactive.** Whether a receipt is same-history or cross-owner is decided
     the way `report()` and `settleOwed` already decide it.
     - If a summary is held when the report arrives, the receipt is classified at once.
     - Otherwise (the store is `loading` or `unavailable`), `offer` stays `'saving'` until the owed
       read classifies it as same-history or cross-owner.
     - If that read fails, `offer` becomes `'unavailable'`.
     - A test covers a write that lands while the store is still loading.
   - **Same history** (the receipt's `historyId` is the held one).
     - `offer` is `'saving'` while the store's `writePending` holds.
     - It is `'ready'` once the held summary's `undo.actionId` equals the receipt's and the Undo
       control is enabled.
     - It is `'unavailable'` otherwise: a newer step, `blockedBy` set, or the read unavailable.
     - The toast renders **Undo** from the start: `aria-disabled` with the name "Undo (saving…)"
       while `'saving'`, enabled when `'ready'`. Undo is removed when the offer is `'unavailable'`.
     - `undo` runs the store's transition only while `'ready'`, so the toast and the header can
       never undo different steps.
   - **Cross-owner** (the receipt names another history).
     - `offer` is `'ready'` with no pre-read.
     - `undo` reads `history.summary(report.projectId)`. It checks that the `historyId` equals the
       receipt's, `undo.actionId` equals its `actionId`, and `undo.blockedBy === null`. Only then
       does it call `history.transition` with that summary's `revision`.
     - It uses a **separate** path from `step()`. It never calls `adopt`, never sets the header's
       `feedbackState`, and handles every error itself:
       - a mismatch or `blockedBy` gives "That is no longer the latest change in Kitchen." with
         Open Kitchen, and withdraws Undo;
       - `rule_violation` refusals are worded as in step 8;
       - `forbidden` gives "You cannot undo changes in Kitchen.";
       - `not_found` gives "That change can no longer be undone.";
       - a transport failure or 5xx gives "Undo may not have completed. Check Kitchen before trying
         again." with Open Kitchen.
   - **One transition at a time.** Header and toast transitions share one in-flight guard. During a
     cross-owner transition the header's controls show "Saving a change…", as they do while any
     write is in flight, never "Undoing…" for a history they do not hold.
   - **No result feedback in the shell.** A toast Undo returns its sentence to the acting toast,
     which morphs in place. The store sets no shell feedback for it, so one Undo never opens a
     second toast.
   - **Staleness.**
     - `begin()` advances a public `writeSequence` signal. A toast captures the sequence after its
       own write has committed and closes when the sequence advances (L3-005).
     - **Exemption.** Retry remove, started from the toast, is begun with an exempt handle. It does
       not close that toast, and focus stays on the pressed action. Retry refresh is a read, never
       calls `begin()`, and needs no exemption.
     - A header Undo of the same step claims the slot with its own result, which closes the
       acting toast. Step 6's fallback focus applies if focus was inside it. The offer's change to
       `'unavailable'` is covered by a unit test only.
     - `prototype.reloaded` closes it, through a public `generation` signal.
8. **One write, one toast.**
   - **`feedback: 'own'`.** `OperationWriteReport` gains this optional field. A writer that shows
     its own toast sets it. The check sits **inside** `announceCrossOwner`, so both callers skip
     the announcement for that report: `report()`, and `settleOwed` after a read that settles
     while nothing was held. The type is in `core/history`, so this is not a contract change.
   - **The rule.** The shell shows the cross-owner "{label}." toast, with Undo and Open {owner},
     for every cross-owner write whose writer shows no toast of its own. These writers already
     produce today's "was recorded in … history" line, so the rule keeps today's coverage and only
     changes its form:
     - workstream creation from a root route;
     - page-settings toggles from a workstream route, which write the root's record
       (`project-workspace-store.ts:402`);
     - Todos complete and reopen of a descendant-owned task (`todos-page-store.ts:166`, `:228`);
     - Reflections page and section writes owned by another project;
     - shortcut placement into another project.
   - **Known inconsistency.** Ticking a descendant-owned task on Todos confirms with a toast;
     ticking a root-owned one shows nothing, because a same-history task write has no toast in
     this slice. That is today's asymmetry in a new form, recorded in the decision. Slice 75's
     pending and saved cues are where an ordinary completion gets its feedback.
   - **The claim test.** It enumerates every writer above plus each row of the map below, and
     asserts exactly one `ToastSlot.claim` per write.
9. **Feedback map.** Each row is a test in its own spec. e2e covers the starred rows.

   | Write | Toast | Actions | Replaces |
   |---|---|---|---|
   | Section Remove, listed* | "Removed the {name} section." | Undo, Open archive, Dismiss | `SectionRecoveryNotice` removal state |
   | Section Remove, unlisted* (Progress) | "Removed the {name} section." | Undo, Dismiss | nothing today |
   | Repeat removal, receipt recovered | "The {name} section was already removed." | Undo (if the offer allows), Open archive, Dismiss | its repeat state |
   | Section remove failed | alert "Could not remove the section. {reason}" | Retry remove, Dismiss | its failure state |
   | Committed write, failed refresh | "The change was saved, but this canvas could not be refreshed." | Retry refresh, Dismiss | its refresh state |
   | Task Delete (Task List* and Todos) | "Archived “{title}”." | Undo, Open archive, Dismiss | `deleteRecovery` paragraph, Todos status |
   | Project archive from More* | "Archived {name}." | Undo, Dismiss | `archivedHereFeedback` line |
   | Header Undo / Redo result* | "Undone: {label}." / "Redone: {label}.", with the placement notes kept | Dismiss | header feedback line |
   | Header transition refusal | alert, with conflict lines as a list | Dismiss | header feedback line |
   | Cross-owner write from a writer with no toast* | "{label}." | Undo, Open {owner}, Dismiss | `crossOwnerFeedback` line |
   | Archive-page Restore* | "Restored “{title}” to {breadcrumb} › {page}." | Go to it, Undo, Dismiss | silent row removal |
   | Settings › Archived projects Restore | "Restored {name} as {status}." | Open it, Dismiss | silent row removal |
   | Todos workstream Complete* | "Completed {name}." | Undo, Open {name}, Dismiss | nothing |

   - **Copy.** All copy lives in `history-feedback.ts` as pure functions, with curly quotes
     throughout. No sentence names "the header", "history", "the controls" or a control the toast
     does not show. These existing sentences are rewritten:
     These sentences are shared with Redo, so `{Verb}` and `{done}` keep today's `VERB` and
     `PAST` maps (Undo or Redo; undone or redone):
     - `history_revision_stale` / `history_not_next` → "Someone changed this project since. Try
       {Verb} again."
     - `history_retired` → "“{label}” can no longer be {done}, so it was skipped."
     - `history_expired` → "“{label}” is too old to {verb}." (no raw timestamp)
     - `history_blocked` → "{Verb} is blocked while {title} is archived. Reactivate it, then try
       again."
     - `historyGoneFeedback` → "That change can no longer be undone or redone."
     - `transitionUncertainFeedback` → "{Verb} may not have completed. Check the page before
       trying again."
     - `history_conflict` and `history_unavailable` keep their repair lines.
     - `conflictSubject` keeps its bracketed id for now. Two subjects with the same name would
       otherwise read alike. Removing ids is TH14 (the vocabulary slice).
   - **Go to it** links to the restored item's canonical route:
     - a section, by `#section-<id>` on its page;
     - a task, by its section;
     - a reflection, by its container;
     - a workstream, by its own route.
     - When the origin's `pageEnabled` is false, the toast says "…to {page}, which is switched off."
       and offers no Go to it, because the link would redirect to Home.
   - **Undo** follows the offer in step 7.
   - **Deleted.** `SectionRecoveryNotice` (component, template, styles, story and spec) and
     `ProjectHistoryFeedback`. Their behaviour specs are re-expressed against the toast adopters.
     The retry rules and the "focus moves only from `body` or the removed control" guard carry over
     unchanged.
10. **Archive is always visitable (W4-020).**
    - **Resolution.** `resolveProjectPage` renders `archive` for a root whether its record is
      missing, disabled or enabled. That resolution variant's `pageId` is `ProjectPageId | null`,
      and `null` only for a missing Archive record.
      - The shell's settle key uses the kind when the id is `null`.
      - `ProjectPageRendererInputs.pageId` widens to `ProjectPageId | null`, so
        `project-workspace-shell.ts:239` compiles.
      - Renderers other than Archive keep their required, non-null `pageId` inputs. Only the
        Archive variant can produce `null`, and `NgComponentOutlet` inputs are untyped, so the
        widening does not reach them.
      - `ArchivePage`'s `pageId` input accepts `null`. It never reads it.
      - The shell's `enableKind` and optional-notice branch for `archive` become dead and are
        deleted.
    - **Navigation.** Project navigation lists Archive when its record is enabled, and also while
      Archive is the current page, marked current (Open question 4). A hidden Archive leaves the
      list on the next navigation.
    - **Page settings.** The Archive row reads "Archive". Its write is the
      existing page toggle and still records a history step, because hiding the page is a choice
      the user made.
    - **Open archive** is a router navigation with the existing landing on `#archive-page-title`,
      from More, the removal toast, the delete toast and Todos. It sends **no write**; the page
      reads on arrival.
    - **Deleted:**
      - `ProjectWorkspaceStore.openArchive` and `retryArchiveContext`;
      - the `'archive'` surface of `writePage`;
      - `archiveRetryNeeded`, `retryArchiveOpen` and their template branches.
    - **Direct load.** Loading the Archive URL of a root whose Archive is hidden renders it, with no
      redirect notice. A workstream's Archive URL still redirects (§68).
    - **Record changes under the shown page.** The record can appear, flip or vanish while Archive
      is shown, for example by undoing the first-enable `page.add`. The Archive keeps rendering and
      re-settles without a notice.
    - **e2e proof.**
      - As Alex and as Sam on nested-projects (Archive hidden), load the Archive URL directly; it
        renders.
      - As Alex, remove a section, follow **Open archive**, come back, and the header's Undo still
        names the removal.

**C. Evidence.**

11. **Core tasks.** The `ux:capture` scripts for T05 and T09 cost no more than their
    [baseline](../70-ui-ux/baseline.json): T05 at most 2 clicks and 0 keystrokes, and T09 at most 1
    click and 0 keystrokes. T05 records whether it undid through the toast or the header.
12. **Sheet.** `build-sheet.mjs --profile 74`, run against the slice's start commit `74b243a`,
    reports 0 gate failures.
    - Closed-state cells, with no toast open, are gated at 1 px. On cells captured after a write,
      the deleted header line is the expected exception, and it is listed.
    - Toast cells are listed. axe reports no `aria-allowed-role`, `region` or `nested-interactive`
      violation in them.
    - No 375 cell overflows sideways. The Design Lab exception from slice 73 stands as amended.
13. **Feedback verification.** `apps/e2e/ux/feedback-verification.ts` (`UX_FEEDBACK=1`) records
    the following, per theme, at 1440 and at 375:
    - **Geometry, gated.** The toast's box is inside the content track's inline edges, less
      `--space-4`, within 1 px. It does not intersect the open drawer, the project column, or the
      focused element when that element is outside the toast.
    - **Geometry, reported.** Whether the toast intersects the acted region. This is for the user's
      Gate 2 judgement (Acceptance 4, Open question 3).
    - **Blur.** The persistent and transient `backdrop-filter` counts with the toast alone, and
      with the drawer, More or a dialog open. The transient count is at most 1.
    - **Fallbacks.** The solid fallbacks under forced colours and reduced transparency.
    - **Suppression.** The toast is hidden while the phone navigation drawer is open, and back
      afterwards.
    - **Focus.** A focus log for each starred row of step 9.
    - **Contrast.** Muted-text contrast on the toast, reported only.
14. **Checks.** `pnpm test`, `pnpm lint` (with `docs:check`), `storybook:build` and the full
    `pnpm e2e` pass. Behaviour vs. appearance lists the edited e2e specs.
15. **Bundle.** The initial bundle stays under the 1100 kB ceiling. Record the figure; at planning
    it was 1,049,943 bytes.
    - `Toast` and `ToastSlot` load eagerly, through the shell.
    - The deleted `SectionRecoveryNotice` was deferred; the deleted `ProjectHistoryFeedback` was
      eager.
16. **Real use (§77).**
    - **Seeds and sizes.** busy-week and nested-projects, at 1440 and at 375 touch.
    - **Do:**
      - remove a section and undo it from the toast;
      - delete three tasks in a row;
      - restore two archived items;
      - create a workstream under Kitchen and undo it from the toast;
      - complete Kitchen on Todos and undo it;
      - as Alex, open Archive while it is hidden.
    - Record friction in `.prototype/notes.json` under slice 74.

## Capture scope

**Must change:**

- Cells captured after a write on nested-projects and busy-week (removal, delete, restore, archive,
  Undo), at 1440 and 375, in both themes.
- The Archive route for Alex and Sam, which now renders instead of redirecting.
- Project navigation while on a hidden Archive.
- The page-settings popover's Archive row.
- The Lab's plane panel (the toast specimen).

**Must not change** beyond 1 px: every closed-state cell with no toast open. That includes the
header of a project with no feedback, the dashboard, settings, and the Lab outside its new specimen.

## Visual acceptance

| Pair (before → after) | Seed, size, theme | Findings |
|---|---|---|
| Removal notice bottom-right → toast with Undo, docked in the track | nested-projects Kitchen, 1440 and 375, both | W1-036, L4-026, L6-016, W1-037, W2-021, L1-023 |
| Progress removed with no feedback → toast with Undo | nested-projects Kitchen, 1440, dark | L3-010 |
| Task delete paragraph → toast with Undo and Open archive | nested-projects Kitchen, 1440, light | L3-009 |
| Header after Undo, line pushes canvas → header unchanged, toast "Undone: …" | nested-projects, 1440, both | L3-005, L6-015 |
| Workstream created, "was recorded in … history" → "Created “Lighting”." with Undo | nested-projects Kitchen, 1440, light | W1-013, W4-007 |
| Todos Complete with no feedback → toast with Undo and Open Kitchen | nested-projects root Todos, 1440, dark | L3-020 |
| Archive row vanishes → "Restored … to Kitchen › Work." with Go to it | nested-projects Archive, 1440 and 375 | W1-047, W2-029, L3-021, W4-021 |
| Settings restore, row vanishes → toast with Open it | nested-projects Settings, 1440 | L4-010 |
| Alex: Archive URL redirects to Home → Archive renders, navigation marks it current | nested-projects as Alex, 1440 | W4-020 |
| Toast beside the open drawer, solid | busy-week, 1440, both | Acceptance 1, 13 |

Behaviour findings are proved by tests rather than pictures:

- **W3-004 and the focus rule:** `feedback.spec.ts`, "restore lands focus on the toast" and the
  step 6 rows.
- **W4-020:** "Open archive keeps the removal as the latest Undo".
- **L3-005:** "a newer write closes the toast".

## Behaviour vs. appearance

**Behaviour changes**, so §77 applies: tests, implementation and docs change together.

- **Behaviour:**
  - Undo in the toast;
  - the focus rule of step 6;
  - toasts closing on a newer write and on navigation;
  - Archive rendering while hidden, and Open archive writing nothing;
  - restore confirmations;
  - Progress removal now confirmed.
- **Appearance:** the toast lift and its reserve; the header losing its feedback row.
- **e2e files that read deleted selectors or pin changed behaviour, and change with it** (Stage 0
  re-greps before any edit):
  - `archive.spec.ts`
  - `archived-projects.spec.ts`
  - `canvas-editing.spec.ts`
  - `canvas-history.spec.ts`
  - `project-history.spec.ts`
  - `page-history.spec.ts`
  - `project-creation-history.spec.ts`
  - `removal-undo.spec.ts`
  - `row-history.spec.ts`
  - `section-edit-undo.spec.ts`
  - `task-interaction.spec.ts`
  - `todos.spec.ts`
  - `work-navigation.spec.ts`
  - `lifts.spec.ts` (Open archive)
  - `phone-layout.spec.ts`: only its delete assertion at line 365 moves to the toast; the layout
    assertions stay unedited.
  - the helper `history-controls.ts`
  - `ux/lifts-verification.ts:177` (`[data-open-archive]`)
- Every other e2e spec stays green **unedited**.

## File-level change list

Paths are under `apps/web/src/app/` unless stated.

| File | Change | Responsibility |
|---|---|---|
| `../styles/_lifts.scss` | modify | `.lift--toast`, its anchor, motion, fallbacks and the solid-beside-a-lift rule |
| `../styles/_tokens.scss` | modify | `--toast-max-inline-size`, `--toast-max-block-size` |
| `shared/feedback/toast.ts`, `.html`, `.spec.ts`, `.stories.ts` | create | Presentational toast lift with its two live regions |
| `shared/feedback/toast-slot.ts`, `.spec.ts` | create | One toast at a time, close on navigation, suppression |
| `core/history/receipt-undo.ts`, `.spec.ts` | create | `RECEIPT_UNDO` token and its inert default |
| `core/history/operation-history-reporter.ts` | modify | `feedback?: 'own'` on `OperationWriteReport`; exempt handles |
| `core/shell/app-shell.html`, `app-shell.ts`, `app-shell.scss` | modify | `--toast-track` on `main`; suppress while the navigation drawer is open; reserve |
| `prototype/dev-panel/dev-panel.ts` | modify | Suppress the toast while open |
| `features/projects/section-create-dialog.html`, `.ts`; `work-create-dialog.html`, `.ts` | modify | `data-modal-lift`; suppress the toast while open |
| `features/projects/history/project-history-store.ts`, `.spec.ts` | modify | Implements `RECEIPT_UNDO`; separate cross-owner path; `writeSequence`, public `generation`; skip announce for `feedback: 'own'` |
| `features/projects/history/history-feedback.ts`, `.spec.ts` | modify | Toast copy and the rewrites in step 9 |
| `features/projects/history/project-history-feedback.ts` | delete | Replaced by the shell's toast |
| `features/projects/project-workspace-shell.ts`, `.html`, `.scss`, `.spec.ts` | modify | Header feedback through the toast; bind `RECEIPT_UNDO`; `--toast-track` on `.project-workspace__main`; Open archive as navigation; Archive render while hidden; dead branches removed |
| `features/projects/project-header.html`, `.scss` | modify | Remove the feedback row |
| `features/projects/project-workspace-store.ts`, `.spec.ts` | modify | Delete the archive-enable path; archive confirmation shown after the confirm closes |
| `features/projects/project-page-registry.ts`, `.spec.ts` | modify | Archive always resolves for a root; nullable `pageId` on that variant |
| `features/projects/project-page-navigation.ts`, `.html`, `.spec.ts` | modify | Archive listed when shown or current; short "Archive" label |
| `features/projects/project-canvas.ts`, `.html`, `.spec.ts` | modify | Removal, failure, refresh and result states in the toast; focus rule; clearance |
| `features/projects/project-page-store.ts`, `.spec.ts` | modify | Always set the removal notice; keep its receipt and owner |
| `features/projects/section-recovery-notice.*` (5 files) | delete | Replaced by the canvas toast |
| `features/projects/sections/tasks/task-list-section.ts`, `.html`, `.spec.ts` | modify | Delete toast with Undo |
| `features/tasks/task-list-store.ts`, `.spec.ts` | modify | Return the delete's report; mark it `feedback: 'own'` |
| `features/projects/pages/todos-page.ts`, `.html`, `.spec.ts`; `todos-page-store.ts`, `.spec.ts` | modify | Delete and workstream Complete toasts |
| `features/projects/pages/archive-page.ts`, `.html`, `.spec.ts`; `archive-page-store.ts`, `.spec.ts`; `archive-page.stories.ts` | modify | Restore toast, Go to it, focus, nullable `pageId` |
| `features/settings/archived-projects/archived-projects-page.ts`, `.html`, `.spec.ts`; `archived-projects-store.ts` | modify | Restore toast, Open it, focus |
| `prototype/design-lab/panels/plane-panels.html`, `.ts` | modify | Toast specimen |
| `prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 74` |
| `features/projects/project-canvas.stories.ts`, `history/project-history-controls.stories.ts` | modify | No longer render the deleted components |
| `apps/e2e/*.spec.ts`, `apps/e2e/history-controls.ts`, `apps/e2e/ux/lifts-verification.ts` (list in Behaviour vs. appearance) | modify | §77 changes |
| `apps/e2e/feedback.spec.ts` | create | Starred rows, focus, suppression, modal order, W4-020 |
| `apps/e2e/ux/feedback-verification.ts`, `apps/e2e/ux/tasks.ts` | create / modify | Acceptance 13; T05 and T09 on their new paths |
| `docs/roadmap/70-ui-ux/tooling/build-sheet.mjs` and its test | modify | `--profile 74` and its listed exceptions |
| `Canvas Work Manager — … Specification.md` | modify | §23, §26, §27, §31, §34, §67, §68, as listed under Spec sections |
| `docs/decisions/2026-10-archive-is-always-visitable.md` | create | The user's W4-020 answer |
| `docs/decisions/2026-10-feedback-is-one-toast-with-undo.md` | create | The toast, where it docks, its closing rules, one write one toast, cross-owner Undo |
| The twelve decisions in Scope check | modify | Dated amendments |
| `docs/decisions/README.md` | modify | Index the two new entries and the amendments |
| `docs/roadmap/70-ui-ux/direction.md` | modify | Principle 6 amendment, if Open question 3 is confirmed |
| `docs/architecture/web/projects/{overview,how,what,why}.md`, `web/core/{how,what}.md`, `web/tasks/how.md`, `web/how.md`, `testing/how.md`, `testing/what.md` | modify | The toast, the deleted components, Archive resolution, the verification script |
| `docs/architecture/web/overview.md` | modify | The rule "`core` imports only `shared/components/icon` from outside itself" now also allows `shared/feedback` |
| `docs/architecture/mcp-tools/how.md`, `docs/guides/mcp-setup.md` | modify | Drop "§31 keeps Open archive reachable" as the reason page toggles work on an archived root, and state the real one |
| `docs/guides/first-milestone-walkthrough.md` | modify | "Undo is in the header" and Open Archive steps |
| `docs/roadmap/goals.md`, `docs/roadmap/active/70-ui-ux-overhaul.md` | modify | Direction and the umbrella's handoff |
| `.prototype/notes.json` | modify | Real-use friction only |

## Implementation sequence

0. **Stage 0.** Re-grep the e2e and unit specs that read the deleted selectors, and confirm the
   list above. Capture "before" from `74b243a` with `ux:capture`.
1. **Foundations.** Toast, ToastSlot, `.lift--toast`, tokens, anchor, reserve, suppression, Lab
   specimen and stories.
2. **History.** `RECEIPT_UNDO`, the same-history and cross-owner paths, `writeSequence`,
   `feedback: 'own'`, the copy rewrites.
3. **Archive visitable.** Registry, navigation, the page-settings label, Open archive as
   navigation, deletions. This step does not depend on the toast and may land first.
4. **Adopters**, one per commit: canvas removal; task delete; header feedback and project archive;
   restore on both surfaces; Todos complete; cross-owner writes.
5. **Evidence.** Feedback verification, task scripts, sheet, real use.

## Test plan — tests first

| Test | Proves |
|---|---|
| `toast.spec.ts`: shows and hides with `open`; the tone picks the status or alert region outside the popover; regions clear on close; Escape inside emits `dismissed` and stops propagation; with fake timers, a status toast dismisses at 8 s, hover, focus and suppression pause it and restart 8 s, an alert or a pending Undo never times out, and a morph restarts it | The presentational contract, with native calls stubbed |
| `toast-slot.spec.ts`: a second claim closes the first; release on destroy; `NavigationStart` closes; suppress hides without dropping, and release shows again | One toast, closing and suppression |
| `toast.stories.ts`: `Status`, `Alert`, `WithUndo`, `OverOpenMenu`, `UnderModal`, Escape to close, focus after `hidePopover` | Native popover behaviour in a real browser |
| `receipt-undo.spec.ts`: the inert default offers nothing | Components work outside a shell |
| `project-history-store.spec.ts`: same-history `offer` is `'saving'` while the owed read is pending, even when it is slow, then `'ready'`; `'unavailable'` after a newer write, with `blockedBy` set, or with the read unavailable | Undo is present from the start and never wrong |
| `project-history-store.spec.ts`: a same-history `undo` runs one transition with the held revision and sets no shell feedback | One Undo, one toast |
| `project-history-store.spec.ts`: a cross-owner `undo` reads the owner's summary and transitions with its revision; never adopts; the held summary and header are unchanged | W4-007, L3-020 |
| `project-history-store.spec.ts`: cross-owner mismatch, `blockedBy`, `rule_violation`, `forbidden`, `not_found` and transport failure each give their sentence | Every failure path |
| `project-history-store.spec.ts`: header and toast transitions exclude each other, across histories; during a cross-owner transition the header shows "Saving a change…" | One transition at a time |
| `project-history-store.spec.ts`: a header Undo of the toast's step makes the offer `'unavailable'` | Withdrawal |
| `project-history-store.spec.ts`: `writeSequence` advances on `begin()`, not on an exempt handle; a `feedback: 'own'` cross-owner report does not announce | L3-005, the Retry exemption, one write one toast |
| `history-feedback.spec.ts`: every row of step 9 worded; no "header", "history", "the controls" or "was recorded"; no ISO timestamp or bracketed id; curly quotes | L6-015, L6-016, W1-013 |
| `project-canvas.spec.ts`: listed removal shows Undo first and Open archive; unlisted (Progress) shows Undo and no Open archive; repeat removal; focus to Undo only from `body` or the removed control; Retry remove keeps the toast and focus; Undo success focuses Dismiss, then the restored heading, bounded | W1-036, L4-026, L3-010 |
| `task-list-section.spec.ts`: delete toast with Undo and Open archive; a descendant-owned task's Undo is cross-owner; one claim | L3-009 |
| `todos-page.spec.ts`: workstream Complete toast with cross-owner Undo and Open link; delete toast; focus fallback | L3-020 |
| `archive-page.spec.ts`: the restore toast names title, breadcrumb and page; Go to it routes canonically; a disabled origin page gives no Go to it; a subproject restore links its route; focus lands on the first action, then falls back to the next Restore or the heading | W1-047, W2-029, L3-021, W4-021, W3-004 |
| `archived-projects-page.spec.ts`: the restore toast names project and status; Open it; focus fallback | L4-010 |
| `project-page-registry.spec.ts`: Archive renders for a root whose record is missing, disabled or enabled; a workstream's Archive redirects | W4-020, §68 |
| `project-workspace-shell.spec.ts`: Open archive sends no write and lands on the heading; `pageId` flipping between an id and `null` re-settles without a notice; the dead `enableKind` branch for Archive is gone | W4-020 |
| `project-page-navigation.spec.ts`: Archive listed when shown or current; the label "Archive" | W4-020 |
| `feedback.spec.ts` (e2e) | Acceptance 3, 4, 6–10 |

`feedback.spec.ts` covers:

- every starred row of step 9, at 1440 and at 375 touch, with keyboard only and with a pointer;
- the timer, using Playwright's clock: a status toast closes after 8 s untouched, but stays open
  while focus is on its Undo;
- one toast at a time;
- the toast beside an open drawer, and Escape in the toast with the drawer open;
- the toast hidden under the open phone navigation drawer;
- the archive confirm closing before its toast;
- a removal toast, then opening the insertion dialog: the toast is suppressed, and returns when
  the dialog closes;
- a cross-owner Undo whose step became stale. Histories are per actor, so the **same** persona
  makes a newer write in Kitchen from a second browser context between the write and the press.
  The toast then says "no longer the latest change". `forbidden` stays
  unit-only, because no seed gives an actor a cross-owner write that it cannot undo;
- Alex and Sam loading a hidden Archive directly;
- Alex's Open archive path keeping the removal as the latest Undo.

Write each test, watch it fail for the right reason, then implement.

## Boundaries touched

- **Gateway interfaces only.** The cross-owner Undo uses the existing `history.summary` and
  `history.transition` calls, from `ProjectHistoryStore`. No component touches HTTP.
- **Contracts once.** No new contract types. `OperationWriteReport` is a `core/` browser type, not a
  contract.
- **No domain change.** Archive resolution is a web routing rule. The domain already derives the
  Archive whether or not the page is enabled (`project-archive-service.test.ts`, "keeps ready
  content visible when the optional Archive page is disabled").
- **Dependency direction.**
  - `shared/feedback` depends on no feature and no `core/` store.
  - `core/history/receipt-undo.ts` declares an interface that a feature implements, as the
    reporter token does.
  - Feature components inject the token, never the store.
  - `features/tasks` never imports `features/projects`.
  - `core/` never imports `prototype/`. The dev panel calls `ToastSlot` in `shared/`.
- **Tokens only.** Every new value is a token, and the token lint covers `_lifts.scss`.
- **No scattered prototype flag.** None is added.

## Explicit non-goals

- Everything listed for slice 75 and the other slices in Scope check.
- A setting to change or turn off the 8 s timer (Open question 1).
- Keyboard shortcuts for Undo (Ctrl/Cmd+Z). They need the command palette's key map (planned
  slice 21).
- Rewording the server's history labels, such as "Enabled the archive page". That belongs to the
  vocabulary slice, and the decision records it.
- Removing the header's Undo and Redo.
- Undo on Settings › Archived projects (Open question 5).

## Open questions

**All five answered by the user on 2026-10-17.** They accepted the recommendations for 2–5. For 1
they chose the alternative, an 8 s timer.

1. **Auto-dismiss: an 8 s timer that pauses on hover and focus** (the user's choice). The plan
   had recommended no timer, because WCAG 2.2.1 makes a timed Undo a barrier. Acceptance 2 now
   specifies the timer. The header's untimed Undo stays as the equivalent path, and the decision
   records that trade-off.
2. **Toast blur.** *Recommended:* blurred when it is the only lift, and solid whenever any other
   lift is open, so transient blur stays at one layer. The alternative is always solid.
3. **Docked in the content track, not floated beside the change.** *Recommended.*
   - It gives one predictable place (W1-037, W2-021). The page never scrolls to make room for it;
     the reserve keeps everything reachable. The toast follows the acted region in Tab order. Focus moves to it when the acted control
     vanishes.
   - Gate 1's motion study floated the toast where the section had been. That conflicts with "one
     predictable place", and on long canvases the change scrolls away.
   - If confirmed, principle 6 in `direction.md` gets a dated amendment ("at the point of action"
     means reachable from it, in one place). At Gate 2 the user judges whether this
     satisfies the "does not cover content" half of W1-037, W2-021 and L1-023.
4. **Archive in navigation while current.** *Recommended:* listed and marked current while you are
   on it, even when hidden, so "you are here" holds (principle 8). §23 is corrected to match.
5. **Undo outside a workspace.** Settings › Archived projects has no project history store, so its
   restore toast offers Open it but no Undo. *Recommended* for this slice. The agent connections
   slice or the navigation slice can revisit it.

## Revisions

**Execution preparation (2026-10-17).** Stage 0 re-grep found 139 references across the
changed feedback surfaces and their tests, including the listed phone Delete assertion.
The genuine `74b243a` source was archived into ignored evidence storage and built separately
for before captures. The five pre-existing untracked Slice 73 evidence files are preserved.
The receipt/history reviewer reviewed an additional `core/history/receipt-toast.ts` helper
and its spec before implementation. It composes only the core Undo port and shared slot;
each adopter still renders its own `Toast`. Its tests cover reactive owed-read offers,
late Undo answers after replacement/navigation/reload, double presses, focus ownership and
bounded restored-heading handoff. These are shared mechanics of the six adopters, not a
new feature store. `apps/e2e/ux/slice74.config.ts` gives evidence its own scratch document
and ports, preserving the developer's running app.

**Round 1 (2026-10-17).** The reviewer returned 2 blocking findings, 19 substantive and 5 minor. The
orchestrator spot-checked the load-bearing claims against the code before revising:

- `--lift-gutter` is a `@position-try` name;
- `index.html` has no `viewport-fit`;
- a Progress removal sets no notice (`project-page-store.ts:782`);
- `phone-layout.spec.ts:365` reads the delete status;
- the e2e inventory was incomplete.

**Blocking.**

- **Cross-owner Undo could never appear.** `latestStep` gated it on the held summary. Now the
  cross-owner offer is ready with no pre-read, and pressing Undo reads the owner's summary and
  checks it.
- **One write produced two toasts.** The writer's toast and the store's cross-owner announcement
  both claimed the slot. Now a writer marks its report `feedback: 'own'`, and a test asserts one
  claim per write.

**Substantive.**

- **The cross-owner path is separate from `step()`.** It never adopts, and it handles every error
  itself, each with a test.
- **Undo is present from the start.** Same-history Undo renders as an `aria-disabled` "Undo
  (saving…)" until the owed read settles, so focus can land on it.
- **A toast Undo morphs the acting toast** and sets no shell feedback. Focus goes to Dismiss, then
  to the restored heading, bounded.
- **Closing:**
  - `NavigationStart` closes the toast, which covers moves within one root;
  - a public `generation` signal covers prototype reloads;
  - Retry actions use exempt handles.
- **Suppression.** The toast is suppressed under the phone navigation drawer and the dev panel.
  The order around modal dialogs is specified and tested.
- **Anchor and measure.** The toast anchors to the content track, not `main`, so it never covers
  the project column. It is measured inside the track's edges.
- **CSS errors fixed:**
  - a real spacing token replaces `--lift-gutter`;
  - the safe-area claim and the z-index token are dropped;
  - the block size is capped, so the reserve is exact.
- **Blur.** The solid rule covers every other open lift, not just the side drawer.
- **Injection.** Components inject the `core/` `RECEIPT_UNDO` token with an inert default, never
  `ProjectHistoryStore`, so stories, the Lab and isolated specs keep working.
- **Copy.** The refusal, gone, uncertain and expired sentences are rewritten, so the copy test can
  pass.
- **Coverage gaps closed:**
  - Progress removal always confirms;
  - the repeat-removal path is tested;
  - Go to it has a rule for a disabled origin page and for a workstream restore.
- **Spec corrections** now cover §23, §26 (Slice 41, 56, 57 and More), §27, §31, §34 and §68, with
  the earlier mis-citations fixed. Eight more decisions are amended, plus `direction.md` principle 6.
- **Documentation.** The guides, `mcp-tools/how.md` and the web overview's dependency rule are in
  the change list.
- **e2e.** The inventory is corrected. `phone-layout.spec.ts` loses its "unedited" promise for the
  delete assertion only.
- **Tests added:** permissions and blocks, withdrawal, races, Settings restore focus, direct loads
  for Alex and Sam, `pageId` flipping, and the native behaviours jsdom cannot test.
- **Visual acceptance.** A pairs table now maps cells and tests to findings.
- **"Does not cover content."** The acted region is scrolled clear and measured, and the
  interpretation goes to the user (Open question 3).

**Minor.**

- Two persistent live regions, cleared on close.
- "Sends no write", not "no request".
- `pageId` is nullable only on the Archive variant and the Archive input.
- The Escape rationale is corrected and tested with the drawer open.
- The header shows "Saving a change…" during a cross-owner transition.

**Round 2 (2026-10-17).** The reviewer confirmed that most round-1 findings were resolved and
raised five new substantive problems and six minor ones. The orchestrator checked N3 and N5 against
the code: the creation dialogs are custom `.lift--contained` sections, and the drawer-open track
already pads by the drawer's width.

- **N1. Classification is reactive.** A write that lands while history is still loading keeps its
  Undo "saving" until the owed read decides whether the receipt is same-history or cross-owner.
- **N2. The `'own'` check moves into `announceCrossOwner`,** so both of its callers honour it.
  - The list of writers that show no toast of their own was wrong and is now enumerated.
  - The rule keeps today's cross-owner coverage. The Todos asymmetry is recorded.
- **N3. The custom creation dialogs** suppress the toast while open and count toward the solid rule
  (`[data-modal-lift]`), with an e2e row.
- **N4. `setCanvas`** clears only a notice in the removal state; an undone notice only signals the
  section's return. A header Undo of the same step closes the toast, and fallback focus applies.
- **N5. The drawer is subtracted once.** The anchored toast uses the padded track. Only the
  viewport fallback uses `--lift-side-offset`.
- **N6. No programmatic scroll.** Clearance is the reserve only. Covering the acted region is
  reported, not gated, and the user judges it at Gate 2. Scrolling stays with slice 75.

Minor:

- **N7.** The focused-element test excludes focus inside the toast.
- **N8.** The rewrites keep the direction verb. Bracketed ids stay until TH14.
- **N9.** `ProjectPageRendererInputs.pageId` widens; the other renderers keep required inputs.
- **N10.** `forbidden` is unit-only. e2e uses a stale-step race between two personas instead.
- **N11.** A toast closed by navigation skips fallback focus.
- **Slips.** Retry refresh needs no exempt handle, §27 is renamed, and the decision count is
  corrected to twelve.

**Round 3 (2026-10-17).** The reviewer confirmed that every round-2 item was resolved. It raised
one new problem: the stale-step e2e row used a second persona. Operation histories are per actor,
so that write could never make the acting persona's step stale. The row now uses the same persona
in a second browser context. That is a one-line test-design fix, applied without a further round.
No substantive findings remain.

**The user's answers (2026-10-17).** The user accepted Open questions 2–5 as recommended:

- the toast is solid whenever another lift is open;
- it is docked in the content track, and principle 6 gets its amendment at implementation;
- Archive is listed while it is the current page;
- Settings restore offers no Undo.

For question 1 they chose the 8 s auto-dismiss timer over no timer. Acceptance 2 gained the
timer's rules. Alert toasts and a pending Undo never time out. Hover, focus and suppression pause
the timer, and a fresh 8 s starts when the pause ends. The toast and e2e tests cover it, and
L3-005's row names the timer. The decision entry records the WCAG 2.2.1 trade-off and the
header's untimed Undo as the equivalent path. Implementation has not started.

## Outcome

*Not yet written.*

## Execution handoff — paused at the user's request (2026-10-17)

The user requested an immediate stopping point and a handoff for a new chat. **The slice is
active and incomplete. Gate 2 has not been presented or accepted. No execution commits were
made.** All implementation, test and documentation edits remain in the working tree on top
of `efe8616` (the reviewed plan). Read `AGENTS.md` first, then this plan; do not restart planning.
All five product questions above were answered before execution.

### What is implemented

- Toast/ToastSlot foundations, lift/tokens, timer and persistent live regions, native stories,
  content-track anchor/reserve, phone/dev-panel/creation-dialog suppression and Lab specimen.
- `core/history/receipt-undo.ts` and the reviewed additional
  `core/history/receipt-toast.ts` controller. Each adopter still renders its own persistent Toast.
  The controller composes the Undo port and shared slot, never a feature store. It handles
  replacement/navigation/write/reload invalidation, async result staleness and focus ownership.
- Same- and cross-owner receipt Undo in ProjectHistoryStore, shared transition guard,
  writeSequence/generation, reporter exempt handles and `feedback: 'own'`, plus pure copy helpers.
- Archive is always visitable; Open archive navigates and writes nothing. Its toggle means
  navigation visibility; hidden Archive is listed while current. Missing Archive `pageId` is nullable.
- Canvas removal (including unlisted Progress), Task List/Todos Delete, header transitions,
  project archive, cross-owner writes, Archive Restore and Settings Restore adopt the toast.
  Retired SectionRecoveryNotice and ProjectHistoryFeedback were deleted. CURRENT_SLICE is 74.
- Two decision entries and twelve dated amendments, direction principle 6 amendment, spec and
  web architecture changes, plus partial guide/testing documentation updates. Documentation
  still needs a final audit against the final code.
- Existing browser behavior assertions were adapted; `apps/e2e/feedback.spec.ts`, isolated
  `ux/slice74*.config.ts`, `ux/feedback-verification.ts` and sheet profile 74 were added.

Additional file-list changes: `core/history/receipt-toast.ts` and `.spec.ts`,
`sections/section-frame/project-section-frame.ts` (stable Archive callback only to Task List),
`project-header.html/.scss` (remove feedback row), TaskList/Todos `.scss` (remove old cue paint),
and the isolated evidence configs. These are within the existing acceptance scope.

### Verified evidence, with limits

- Genuine before source `74b243a` was built independently. Full before matrix passed (16.2 min),
  at `apps/e2e/ux-output/74b243a/`. Archived source/build is under ignored
  `apps/e2e/ux-output/slice74-baseline-source/`; its dependency junctions point into this workspace.
- Foundation checks: Toast/Slot 12, shell 27, dialogs/dev panel 40 tests passed. TaskList/Todos
  adopter batch 133 passed; an additional Todos fallback review regression was red then its
  27-test suite passed. History 47 tests passed across four suites. Root canvas/store/shell/
  ReceiptToast batch 219 passed. Earlier Archive routing/workspace batch 149 and restore/
  navigation batch 69 passed.
- Five real Storybook plays passed, screenshots inspected:
  `apps/e2e/ux-output/slice74-toast-stories/results.json` and its PNGs. Storybook build passed.
  Real Escape required preventDefault as well as stopPropagation. Callers explicitly restore
  surviving opener focus after native hide; the primitive remains presentational.
- Full web lint passed before the final review repairs. E2e TypeScript lint passed before the
  most recent collector/test additions. `docs:api` and `docs:check` passed before later guide/
  decision/testing-doc additions. Sheet-builder tests passed **28/28** including profile 74.
- New feedback browser journeys passed **8/8** at desktop/touch, including Undo morph and
  restored-heading focus, timer pause, no-write Archive, Alex/Sam own-workspace direct routes,
  and stale cross-owner refusal. These predate the ninth long-title regression below.
- Latest production build passed at about **1,068.49 kB**, under 1,100 kB. It contains the
  long-text CSS repair and recent adopter repairs; it predates the unfinished receipt-per-task fix.
- Full `pnpm test` first failed to start contract tests on sandbox TEMP rename EPERM. An
  escalated retry with workspace TEMP passed contracts **370** and repositories **202** and
  reached web tests; it was **interrupted at the user's pause request**, not a full pass.
  Log: `.prototype/slice74-test-full.log`; original environment failure log:
  `.prototype/slice74-test.log`.
- Existing e2e was stopped: **116/252 executed, 110 passed, 6 failed**. Five failures were
  stale assertions corrected during the run and awaiting rerun. One light/1440 page-settings
  first-toggle focus failure remains unresolved. Do not claim the suite green.

TDD evidence includes history readiness fault (2 intended failures), copied-source ToastSlot
replacement fault (1 intended failure), suppression/timer tests, and the review regressions.
**All temporary fault injections were restored/removed**; no unavailable/unavailable history
readiness stub remains. A separate normal TDD scaffold for the pending task-receipt issue
below deliberately remains red.

### Resumed 2026-10-17 (second session)

Still no commits; still no Gate 2. Closed since the pause:

- **Per-task receipt.** `TaskListStore.archiveReport(id)` now reads a per-task map; the global
  `lastArchiveReport` is gone and `TaskListSection` asks for the deleted row's receipt. The
  out-of-order regression went green unchanged (store 39, section 35).
- **Drawer stole Delete focus.** Real browser evidence: when the deleted task's drawer was open,
  the coalesced live re-read closed it a render before Delete's reply resumed, and its focus
  return put focus on quick-add, so the toast's guard declined. `TaskListSection` now counts
  in-flight row Deletes and the drawer does not claim body focus while one is pending. New
  section regression (red, then green) reproduces that order in jsdom.
- **Stale assertions.** Project-archive reporter event now carries `feedback: 'own'`;
  `feedback.spec.ts` uses `#archive-page-title` (the archived region has a second "Archive"
  heading); `mcp.spec.ts` expects hiding Archive to keep the reader on Archive, per
  [the decision](../../decisions/2026-10-archive-is-always-visitable.md).
- **E2e discovery.** `playwright.config.ts` ignores `ux-output/`, whose archived baseline
  checkout was being collected as tests.
- **Provenance.** `ux/capture.ts` maps details/confirmation to inline More only for Slice 73's
  baseline `e56c7d7`. The affected `74b243a` before cells (`project-details`, `archive-confirm`)
  **have not been recaptured yet**.
- **Collector.** `feedback-verification.ts` now records blur/drawer intersection with the task
  drawer, More and a dialog open (gated at one transient layer; the dialog suppresses the toast)
  and a reported muted-text ratio (7.31:1 in both themes). Rerun: complete, 32 focus rows.
- **Offer from a stale summary.** `row-history.spec.ts` line 82 (second Delete after header
  Undo) failed under full-suite load twice: Undo was not focused. `ProjectHistoryStore.offer`
  said `unavailable` when the adopted same-history summary predated the receipt, so the toast
  hid Undo and focus took Open archive before Undo appeared. It now says `saving` while
  `summary.revision < receipt.revision`. Store regression red, then green; the row-history spec
  passed 12/12 with `--repeat-each 3`. That this was the load race is inferred, not observed.
- **Verified:** full `pnpm test` green (root 9, contracts 370, repositories 202, web 1116,
  prototype-data 112, domain 846, mcp-tools 181, host 291); production build 1,068.60 kB before
  the offer fix; feedback journeys 9/9 on the production rig; `pnpm lint` with `docs:check`
  green; Storybook build green. Existing e2e: see the last run recorded below.
- `canvas-editing.spec.ts:1065` timed out once in-suite (45 s against 2 s alone) and passed 3/3
  alone; recorded as a load stall.
- Temporary `apps/web/tsconfig.*-temp.json` files were removed.

- **Evidence run.** The eight `74b243a` before cells for details/confirmation were recaptured
  (the matrix PNG does not paint the modal top layer at either commit; the ARIA tree shows the
  dialog). The after matrix (194 cells), core tasks, depth and feedback evidence ran on one
  build. `refused` cells needed `getByRole('dialog').getByRole('alert')`: the toasts'
  persistent live regions are alerts too.
- **`feedback.spec.ts` extended** to every starred row × keyboard/pointer at 1440 and touch at
  375, the drawer + Escape path, insertion-dialog suppression, the phone drawer and the 8 s
  timer: **37/37** on the production rig. Archive-page Restore of a workstream reads "Restored
  {name} as {status}.", which the row accepts.
- **Profile 74 sheet: 298 geometry failures, not yet resolved.** Three distinct causes:
  1. *Header gap (−12 px, every project cell).* The deleted `project-header__history-feedback`
     wrapper was never hidden by its `:empty` rule (it held whitespace), so the baseline carried
     a blank 12 px grid row. **The user chose to list it** (2026-10-17). Profile 74 lists it
     only for an exact 12 px header shrink at the same top, with the header's column below it
     moving by that amount (fixture test added); everything else stays gated. Applying it showed
     a second gap: the shell's empty `<app-toast>` host was a grid item at the bottom of
     `.project-workspace__main`. `Toast` now has `:host { display: contents; }` (spec red, then
     green). After recapture, 1440 and 1024 have no geometry failures; 64 cells list the row.
     Controls in an anchored lift below the header may stay put; planes and scroll regions in
     its column must move by exactly the row.
  2. *Touch targets at 375 (44 → 32 px in after cells).* **Resolved 2026-10-18.** The toast's
     absolutely positioned live regions sat at the bottom of the scrolled track and made the
     phone document as tall as the content (2,894 px on 812). Playwright then took the
     full-page screenshot beyond the viewport, which drops Chromium's touch emulation, so the
     layout collected after it measured pointer sizes. The window could also scroll behind the
     app's own track, so this was a real phone bug. The regions are now `position: fixed`;
     a `feedback.spec.ts` test (red at 2,398 px, then green) holds the document to the viewport.
  3. *Task-drawer cells at 1440 (drawer not taking its column).* Flaked once in the full run;
     a single-cell recapture is correct (576 px, three scroll regions).
  After both fixes the whole after matrix, core tasks, depth and feedback evidence were
  recaptured on one build. **Profile 74 now reports 0 gate failures**, with the header row
  listed in 108 cells; T05 costs 2 clicks and T09 1 click, both within budget.

- **Final suite runs (2026-10-18, after both CSS fixes):** `pnpm test` green (root 9, contracts
  370, repositories 202, web 1117, prototype-data 112, domain 846, mcp-tools 181, host 291);
  `pnpm lint` with `docs:check` green; full `pnpm e2e` **185/185** in one run, with no
  intermittents this time (the earlier row-history, canvas-editing and Settings Restore
  failures did not recur).

Still open: profile 74's feedback screenshot gallery and findings mapping in the sheet HTML; real use with `.prototype/notes.json`;
goals/umbrella handoff; a final diff review; then Gate 2.

### First next step — finish the current red test (done; kept for the record)

`features/tasks/task-list-store.spec.ts`, test **keeps each archived task receipt when concurrent
replies arrive out of order**, has just failed correctly: expected `action-second`, received
`action-test` (**38 passed, 1 failed**). Two concurrent archives can overwrite the global
`lastArchiveReport` before an adopter reads it. A compile-ready scaffold
`TaskListStore.archiveReport(_id)` currently returns that same global signal; **it is not the fix**.

Implement per-task receipt retention (or an equally small per-call result), then have
`sections/tasks/task-list-section.ts` read the requested task's receipt instead of
`lastArchiveReport()`. Update the older receipt assertion as needed; no contract change.
Run the failing store test green, then the TaskList adopter tests. The regression has real
out-of-order responses and must not be weakened or removed. It is the best point to resume TDD.

### Review findings and remaining validation

Independent diff reviewer completed a named boundary pass with no substantive boundary
violation. The proposed Settings pure-copy import finding was withdrawn: acceptance 9
deliberately centralizes copy in history-feedback.ts. Three substantive findings:

1. **Long title clips actions at 375.** Browser reproduced it: action bottom 1603.5 while
   toast bottom 796. Ninth feedback test is red evidence. `_lifts.scss` now lets the message
   shrink/scroll and provides scrollable overflow; **rerun the ninth test against the new build**.
2. **Archive actions stale after Undo / offer unavailable.** `archive-page.html` fixes are in:
   Go to it is gated by the retained report, Undo follows saving/ready/unavailable and saving
   naming, result owner links render. New tests first failed correctly. Final Archive 12-test
   rerun was interrupted after correcting a test query to `a[data-toast-open]` (the popover also
   carries data-toast-open). **Run it green** using `tsconfig.archive-review-temp.json`.
3. **Todos skips next workstream control.** Red regression caught heading focus; nextControl
   now includes enabled workstream Complete as well as task checkboxes. **27/27 passed**.

Re-review these repairs and the per-task receipt fix. Reviewer did not see the evidence sheet
and made no visual-acceptance claim. Full correctness/spec/boundary/documentation review and
Gate 2 evidence review must close before marking the slice complete.

Other concrete remaining work:

- Existing e2e corrections await rerun. Agent stopped its ordinary 4200/4310 runners. Failure
  categories: two Archive enable/history assumptions; project-history conflict selector and
  hidden-but-current Archive assertion; section-edit conflict selector. Isolate the unchanged
  `lifts.spec.ts` light/1440 gear-focus failure to distinguish timing from a real defect.
- Feedback collector's first run got through desktop rows, then failed at phone suppression
  because it tried to click the covered backdrop. It now clicks `[data-shell-drawer-close]`;
  **rerun** `UX_FEEDBACK=1 ... --config ux/slice74.config.ts -g 'Feedback runtime evidence'`.
  Only partial `feedback-verification.json` exists under `ux-output/efe8616.../`.
- Collector still needs drawer/menu/dialog blur/clearance evidence beyond its toast-alone
  entries, contrast reporting, and coverage audit against acceptance 13. New feedback e2e
  needs the remaining starred/suppression/modal/Escape paths from the plan; do not assume the
  eight passing journeys cover every acceptance row.
- Before capture harness inherited Slice 73's `UX_BEFORE` mapping of details/confirmation to
  old inline More. For `74b243a` that is wrong: native dialogs already existed. Fix that
  provenance rule narrowly and recapture only affected before cells with UX_MATCH.
- Capture after matrix, run T05/T09 task evidence (T05 now records toast vs header), and depth
  token evidence required by sheet builder. Generate profile 74 sheet with **zero gate
  failures**; include all visual acceptance pairs, not only the old removal matrix cells.
  Profile 74 currently has fixture-backed geometry/overflow/task/focus/blur/fallback gates,
  but its HTML still needs a feedback screenshot gallery and findings mapping.
- Check closed-state geometry. Removing the previously empty header feedback wrapper may
  remove a grid gap; **measure it**, preserve the plan's 1 px gate rather than exempting it.
- Run real use on busy-week/nested-projects at both sizes and record friction in
  `.prototype/notes.json` (not yet changed). No MCP behavior changed; no domain/host work is due.
- Finish testing/how.md, test inventory, goals/umbrella handoff, plan revisions and final
  documentation audit. Do not write Outcome/complete until evidence and user Gate 2 acceptance.
- Run full pnpm test, lint/docs:check, Storybook build and full pnpm e2e after fixes. Root docs
  tests temporarily create invalid links, so never run docs lint concurrently with them.

### Commands and workspace cautions

Use workspace scratch TEMP to avoid sandbox Vite rename failures:
`$env:TEMP=(Resolve-Path .prototype).Path; $env:TMP=$env:TEMP`.
Host/browser runs needed escalation for ownership-file publishing/loopback. Use ordinary
`pnpm e2e` only when 4200/4310 are free; it owns disposable e2e-data, never developer data.
Slice 74 evidence config owns **4242/4342** and `.prototype/ux-slice74.json`.
Build before static-browser runs: `pnpm --filter web build`.
Evidence config output directories were separated after concurrent runs overwrote a trace.

Useful targeted command:
`pnpm --filter web test --include='**/task-list-store.spec.ts'`.
Root's `tsconfig.feedback-temp.json` narrows canvas/store/shell/controller specs;
`tsconfig.shell-feedback-temp.json` and `tsconfig.archive-review-temp.json` are also temporary.
Remove temporary configs/caches after use; never stage them. Avoid simultaneous Angular builds:
the machine has 8 GB, and concurrent full/unit/app builds became very slow.

Five **pre-existing untracked Slice 73 files must be preserved**:
`.prototype/slice73-canvas-browser.mjs`, `slice73-real-use.mjs`, `slice73-story-browser.mjs`,
`ux-slice73-use.json`, `ux-slice73.json`. Other untracked scratch/cache files and the toast
story reproducer are execution artifacts, not source to stage. Stage intended source/docs
explicitly. No branch switch, push, developer-data reset or worktree operation was performed.

Background root and subagent test sessions were stopped at pause; the last production build
finished successfully as it was being collected. Resume from the working tree, not a reset.

## Execution resumption — Gate 2 candidate (2026-10-18)

**Gate 2 revision requested, 2026-10-18.** The user wants the visible page-settings label to
stay **Archive**, while retaining its navigation-only toggle behavior. Use the ordinary
`definition.label` and `Show {label} page` accessible-name pattern for this row. Update the
existing navigation assertions first, run them red then green, amend the Archive decision,
and correct the spec and projects/how. No routing, write or history changes. Rebuild and
recapture the page-settings matrix cells, merge those into the reviewed after matrix with
explicit provenance, and regenerate the sheet. A focused navigation suite, production build,
capture/gate check and docs check verify this copy-only revision; the preceding full-suite
results remain evidence for unchanged behavior. Gate 2 remains pending.

The independent plan reviewer found no substantive concerns. The two existing missing/hidden
Archive cases then failed on the old visible copy (expected Archive, received Show Archive in
navigation), before the template was changed to the ordinary page-label pattern.
All 24 navigation tests and the production build then passed. The matrix contains four
page-settings cells (both themes at 1440 and 375), rather than the six initially assumed;
all four were recaptured. Their source is disclosed in the after index and sheet report's
`recaptures` field. Independent diff review found no substantive issue. Routing, toggle
handlers and history code have no change in this revision.

The handoff's implementation and evidence were committed as `c0edf0e` before this session.
The slice remains active; the user has not accepted Gate 2. The older handoff paragraphs above
are chronological evidence, not an instruction to redo their completed work.

**Final review and repair.** Independent correctness and boundary/documentation reviewers
checked the actual `efe8616..c0edf0e` diff. Boundary review found no violation. Documentation
review found obsolete claims that Open archive records a change, Undo removes the Archive
viewer, and the canvas holds no receipt; testing/how, projects/overview and the public
`ProjectPageStore.removeSection` comment now describe the implemented behavior.

Correctness review found one additional race: the live task read could return a deleted row
before its receipt Undo response, causing Task List or Todos to close and invalidate the
acting toast. Two deferred-response regressions failed for that reason, then passed with
guards that preserve the toast while its Undo is pending. The combined TaskListSection,
TodosPage and ReceiptToast suites passed 68 tests. Independent re-review confirmed that
navigation and newer writes still close the toast and invalidate late responses.

**Sheet.** The profile-74 HTML now has its own title, a twenty-finding mapping, a feedback
gallery and an explicit visual-pair audit. All sixteen required theme/size pairs are present,
alongside the 194 matrix pairs, with zero mechanical gate failures. Supplemental before and
after captures use `apps/e2e/ux/feedback-visual-pairs.mjs`, now part of the change list; its
operation is documented in testing/how. The exact Kitchen Restore example is prepared by
creating and archiving the same task fixture on each side. Settings restores the seed's
Legacy attic project; Alex uses an Alex-owned root because he does not own the seeded
renovation root.

The matrix folder's after label is `efe8616`, the HEAD at capture time; those captures included
the implementation working tree later committed in `c0edf0e`. They are not evidence that the
plan-only commit contains the feature. Supplemental captures disclose their actual source
commit, working changes, build directory and index hash. Their `visualFocus` records and
`feedback-visual-*` files remain separate from the original measured runtime evidence;
independent re-review checked that no prior pass or geometry was attached to a new picture.

**Use.** Busy-week and nested-projects were each exercised at 1440 keyboard/dark and 375
touch/light on a separate disposable file. Each pass removed and Undid a section, quick-added
tasks, deleted three consecutively and restored two items. Nested-projects also created
Lighting under Kitchen and Undid it, then completed and Undid Kitchen on Todos. Alex opened
his hidden Archive without any API write. Four observations are recorded in
`.prototype/notes.json` as `note-2026-10-18-001`, `002`, `005` and `006`; the bottom band takes
substantial phone space, and the reserved scroll space matters. No blocking friction appeared
in these passes. Two duplicate execution notes were removed. MCP behavior is unchanged.

**Verification.** The final production build is 1,068.76 kB, below 1,100 kB; the 850 kB warning
still reports. Sheet-builder regressions passed 30/30; the full offline suite passed (root 9,
contracts 370, repositories 202, web 1119, prototype-data 112, domain 846, mcp-tools 181,
host 291), and the final Storybook build passed. `pnpm lint` including `docs:check`, `docs:api`
and the full browser suite passed; e2e is **185/185 in one run** (12.5 min), with no failures
or skipped tests. Logs are `.prototype/slice74-resume-{test,lint,build,storybook,e2e,sheet-test,docs-api}.log`.
The independent final sheet review inspected full-size pictures at both widths and themes,
confirmed all sixteen pairs and twenty finding mappings, and returned no substantive findings.
Phone content overlap remains explicitly for the user's visual judgment. Goals and the umbrella
now identify Slice 74 as implemented with Gate 2 pending,
and leave Slice 75 planned. No Outcome or completion move is written before user acceptance.
