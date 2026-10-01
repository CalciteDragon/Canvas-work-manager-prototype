# Task checkboxes reopen, task titles select, and editing lives in the drawer

**Question**

Should a done task be reversible where it was completed, and should a Task List title select
the task or immediately become an editor? Slice 61 implements Stage B of the requested
interaction change in Slice 59.

**Options tested**

- Keep one-way checkboxes and the separate Details button: this leaves the simplest recovery
  unavailable at the control that caused it.
- Remember a task's status before completion: rejected because the model has no such field.
- Toggle selection off on a repeated title click: rejected because selection names the current
  task; the drawer already has Close.
- Natively disable a pending checkbox: rejected because a focused disabled control loses focus,
  preventing a second Space from reversing the first toggle.
- Keep direct inline title editing: replaced with a title field in the existing drawer, so
  title and background clicks have the same selection intent.

**What we learned**

The domain already reopens through `update({ status: 'todo' })`, clears `completedAt`, keeps
linked reflections, and records `task.updated` in Activity. HTTP and MCP evidence tests fail
when the timestamp clear is temporarily removed and pass with it restored. The browser owns
native checkbox state before Angular responds, so refusing an intent must explicitly reset it.
Drawer drafts need a remembered base title: comparing against the newest task title would turn
an agent rename into an apparent local edit and send stale text back on blur.

**Current decision**

Task List and Todos task checkboxes complete and reopen to `todo`, with no remembered status,
new endpoint, tool or confirmation. Reopen retains the existing `Updated "…"` history label.
Todos cancelled tasks have no toggle; Task Lists retain their existing cancelled-to-done behavior.
Workstream completion remains one-way on Todos and reopens from its header.

Task List titles are native buttons named `<title>, open details`. Title or background click
selects idempotently; Enter and Space on the title do the same. Nested controls never select.
Mouse or pen gestures moving more than 4 px and background gestures creating a text selection
do not select; touch taps permit ordinary finger slop. Read-only shortcut rows have no actions.

The drawer edits a trimmed title on Enter or blur, refuses blanks, suppresses the duplicate blur
after Enter, and preserves dirty drafts through refreshes and failures. Explicit Enter retries.
Escape discards a dirty title draft first; otherwise Escape closes. Close returns focus to the
selected title, or quick-create after the row disappears, when focus came from the drawer.
Opening keeps focus where it was: the stacked phone drawer remains unscrolled, retaining the
[known narrow-drawer trade-off](2026-09-phone-navigation-drawer.md).

Pending toggles use `aria-disabled` and refuse/reset intents while keeping keyboard focus.
Stores optimistically clear completion time, revert the exact saved fields on failure, defer
live re-reads behind writes and discard answers after changing containers. The existing owner
receipt reporter refreshes history and progress. This corrects spec §34 and its Todos paragraph,
and updates the component-test wording in §4/§69 in the same change.

**Confidence**

High for the existing domain rule and transport evidence. The selection and phone-drawer choices
remain prototype defaults to evaluate through real use, rather than a claim about sustained use.

**Revisit when**

Real use shows accidental selection, a need to scroll the stacked drawer into view, or confusion
between an `Updated` history label and a reopened checkbox. Record that evidence in §79 notes.

**Dated 2026-10-01 — Slice 61.** The filename follows the active plan's existing link target.
