# A new workstream opens, and its toast's Undo returns to the parent

**Question**

Once creating a workstream opens it (W1-014, W2-007), what does the create's toast say, and where
does Undo from that toast leave the person? Before Slice 81 the create stayed on the current URL and
the toast linked to the new workstream; its Undo could only be reached from where the person
already was. (§23, §26, §77; Slice 81 plan, Q13.)

**Options tested**

- *(a) Undo stays on the new workstream's URL*, which shows "Creation undone" with Redo, as the
  header's Undo does. Consistent with Slice 42, but the person who undoes a mistaken create is left
  on a page for something that no longer exists.
- *(b) Undo from the create's toast returns to the parent*: chosen by the user at the plan's
  acceptance (2026-11-09).

**What we learned**

A committed Undo cannot be told from a stale one by its tone: "That is no longer the latest change
in Pantry." is a `status` toast too. So `ReceiptUndoResult` gains `committed`, set by the project
history store's `undoReceipt` only when the transition commits, and `ReceiptToast.undo` resolves the
result to its caller. The new row must exist before the heading takes focus, so the shell awaits the
shell's quiet tree re-read (`ShellCommands.refreshProjects`) before it navigates; a failed re-read
still navigates.

**Current decision**

- **Create opens the new workstream.** The dialog closes, the tree re-reads, the route moves to the
  new workstream, its `h1` takes focus, and only then the toast shows "Created Pantry under
  Kitchen." with Undo and no link (it is the page). A refusal stays in the dialog with its draft. A
  create that answers after the person left the project moves nothing.
- **The toast's Undo returns to the parent** when it commits: a push (not a replace), the parent's
  `h1` focused, and the toast "Undone: Created “Pantry”." with "Open Pantry to redo", which opens
  Pantry's "Creation undone" with Redo. Back from the parent reaches the same page, so Redo has a
  lasting way back after the toast has gone.
- **Not committed** (stale, gone, refused, failed): the person stays on the new workstream with
  today's toast and focus. An Undo that answers after the route left the workstream moves nothing.
- **Unchanged:** the header's Undo on the new workstream still lands on "Creation undone" at its
  URL ([creation history](2026-09-project-creation-history.md)); root creation navigates without a
  toast, as before.

**Confidence**

Medium. Pinned by the shell's unit cases and `work-navigation.spec.ts` /
`project-creation-history.spec.ts` / `phone-layout.spec.ts`; whether people find "Open Pantry to
redo" when they wanted it back needs real use.

**Revisit when**

People undo from the toast and expect to stay, or lose the Redo once the toast closes; or a second
create path (MCP, the dashboard) should behave the same way.
