# A toast says one short message; a longer reason opens from "View details"

**Question**

Slice 79's after sheet found the undo-refusal toast taller than its cap: the sentence ("Could not
undo “Reactivated “Legacy attic””: something it changed has changed since.") and its repair line
each scrolled on their own with nothing focusable in them (axe `scrollable-region-focusable`).
Slice 79 Open question 9 offered (a) focusable overflow, (b) one scrolling toast with sticky
actions, (c) a shorter line or a taller cap. Scrolling the toast as one broke
`feedback.spec.ts`'s pinned "Undo and Dismiss stay inside the phone toast" and was reverted.
§26, §31.

**Options tested**

- *(a) Focusable overflow*: fixes the axe rule but keeps a paragraph-sized toast to read and scroll.
- *(b) The toast scrolls as one*: tried in `baa78a2`, reverted in `f1eb835`.
- *(c) Make this toast fit*: fixes one case; any longer reason fails again.
- *The user's own answer (2026-11-04), chosen over all four*: "i think it would be more user
  friendly to show a simple undo failure on the toast, with a clickable view details option to
  open a view with the full reason. i think toasts should only contain short simple messages".

**What we learned**

A toast is glanced at, not read. The refusal's useful content (who changed what, and the repair)
is a list a person may want to keep open while acting, which a timed, capped popover is the wrong
place for.

**Current decision**

**Toasts carry only short, simple messages.** When there is a longer reason, the toast offers a
**View details** action that opens a view with the full text.

- The shared `Toast` takes the short `message`, and optionally a full `reason` sentence, `lines`
  (one per repair) and a failure's raw `detail`. With any of the three, the toast shows only the
  message, its owner's actions, **View details** and Dismiss; the three render in a modal
  `<dialog class="lift lift--dialog">` headed by the message, with a Close button. Focus moves
  to Close on open and returns to View details on close; Escape closes the view only, never the
  toast or anything under it. The toast holds open while its view is open, and closing the toast
  closes the view.
- The toast's live region still announces the message, the reason and the lines, so nothing is
  lost to a screen reader; the raw `detail` is still never announced (Slice 78).
- Undo and Redo refusals over conflicts say "Couldn’t undo." / "Couldn’t redo."; the reason
  ("“Label” can’t be undone: something it changed has changed since.") and each conflict's
  repair line are in the view.
- A failed write's raw reason, which Slice 78 put under a collapsed Details inside the toast, now
  opens from View details too, so no toast grows past its message.
- Auto-dismiss is unchanged: alerts (every refusal and failure) wait for Dismiss; a status
  toast keeps the eight-second timer, held by hover, focus and the open view.

**Confidence**

Medium-high: the user's rule, applied to every toast that has a longer reason today. Whether other
long messages (a status naming a long user title) should be shortened is left to the §8 comb.

**Revisit when**

A toast message itself (not its reason) needs more than a line or two, or Gate 2 finds the extra
step in the way of a refusal's repair.
