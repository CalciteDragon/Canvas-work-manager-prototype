# Pending, saved and failed feedback stays on the object it is about

**Question**

Direction principle 6 asks for feedback where the user acted: new things in view with focus,
pending within 100 ms, failures that name what failed. After slice 74's toast, what do pending
writes, saves, failures and new items look like on the object itself (§26, §27, §34, §63, §67)?
TH07 found quick-add with no pending state, failures as one section banner, a drawer with no
saved cue, new sections off screen with focus on the body, and a Task List that moved as Recent
Activity grew above it (W1-024, W1-030, W2-010, L3-008, L4-005, L4-023, L4-024).

**Options tested**

- *A toast for every write*: rejected for quick-add. Each add would close the previous write's
  toast and cover the list on a phone. The row is already the confirmation, and Undo for a
  create stays in the header.
- *Queued quick-adds, each with its own pending row*: rejected. The pending interval is normally
  under 100 ms, and a queue makes the failure order hard to read.
- *A failed add left in the list with Retry and Discard*: rejected for the field. Putting the
  title back with the message beside it lets Enter retry.
- *Browser scroll anchoring for the canvas*: measured and rejected. In Chromium it did not hold
  a Task List at the end of a page as Recent Activity grew above it (48.5 px at 1440, 129 px at
  375). WebKit has no anchoring at all.
- *A "Saved" cue after every completion*: rejected. The checked row is completion's
  confirmation on the Task List and on Todos alike.

**What we learned**

A pending row that paints synchronously costs nothing and settles the "did it take?" question
before the network answers. Failures said on the object they concern leave every other row
usable, and two failures stay two messages. A JavaScript hold keyed to the placement the person
is working in, which lets any scroll stand as its new baseline, behaves the same in both engines.
A reveal and the hold do not fight.

**Current decision**

- **Pending.** One vocabulary: `aria-busy` on the busy object, `aria-disabled` (never
  `disabled`) on its control so focus stays, and "<Verb>ing…" copy. Quick-add paints
  `PendingTaskRow` ("Adding…") synchronously, clears and keeps focus in the field, and refuses
  a second submit while one is pending, keeping that draft.
- **Created.** No toast for a task create. The real row replaces the pending row in place, a
  polite region says "Added “X”.", and in a long list the row scrolls into view under the
  sticky add form. A section or shortcut made in the create dialog is scrolled to its top and
  its heading takes focus, for every type.
- **Failed add.** Failure owes one quiet read. The write counts as committed only for a
  same-title task whose id was absent at submit. Otherwise the pending row goes, the title
  returns to an empty field, and "Couldn’t add “X”. Try again." with the reason shows beside
  the form. If the read fails as well, the title is not returned, and the message says "Couldn’t
  confirm “X” was added. Check the list before adding it again."
- **Saved.** The task drawer says "Changes save automatically.". Each field edit paints at once
  and shows Saving…, then Saved (which fades after 2 s), or "Not saved. Try again." with the
  reason. A failure reverts to the last server-confirmed value.
- **Failures on the object.** Complete, reopen and Delete failures sit on their task row, and
  Todos complete and reopen failures on their Todos row, as "Couldn’t <verb> “X”. Try again."
  with the reason, linked from the control. Todos Delete failures stay page-level. A refused
  agent permission change is said in that connection's card. A blank name or title is refused
  beside its field with "Enter a name." or "Enter a task title.", with focus kept there.
- **Held still.** `ScrollHold` keeps the working placement still while placements above it
  grow, and the canvas opts out of native anchoring. New activity rows fade in with opacity only.

**Confidence**

Medium. The user chose every recommendation on 2026-10-20. Unit and Chromium journeys verify
it. WebKit behaviour is reasoned from the absence of anchoring there, not measured.

**Revisit when**

Real use shows the sticky add field crowding short screens, a second quick-add wanted while one
is pending, or a held list that a person expected to move.

**Amended, 2026-10-20 (Gate 2 accepted).** The user accepted Slice 75's sheet, including the one
listed closed-state change: the canvas live region left the grid, and project content rose 24 px.
The sticky add form is transparent at rest, with a solid plate only while stuck. Field status
stays out of the field's accessible name.

**Amended, 2026-10-30 (Slice 78).** A failure's sentence keeps its place on the object, and the
host's raw reason moves under a collapsed Details beside it. Feedback still never moves the page,
but an inline write failure whose sentence is wholly outside the workspace's scroll port is pinned
to the nearer edge, clear of the stuck quick-add and an open toast, as a button "↓ Couldn’t
<verb> “X”." (↑ above). It applies to task rows (canvas Task List and Todos), section and shortcut
collapse failures and the Task List's drag-receive banner; read failures, page-level failures and
restore rows are not pinned. Only the user's press scrolls: it brings the sentence and the control
it describes into view and focuses that control. Close dismisses that occurrence; a new failure
re-arms. This closes the "row failure below the fold" open question (the user's choice on
2026-10-29).
