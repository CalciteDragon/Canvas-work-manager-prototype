# Add workstream defaults to the open workstream, and adding a task does not open its details

**Question**

Theme TH15 reproduced two defaults that work against the user.

- **Wrong parent.** Add workstream always proposes the root as parent, even when opened from
  inside Kitchen. A user who accepts the dialog as shown creates the workstream in the wrong
  place (W1-008, W2-004, W3-010, W4-029).
- **Unwanted drawer.** Adding a task selects it and opens its details drawer, which halves the
  list while the user keeps typing (W1-026, W3-012, W2-009, W4-008).

**Options tested**

- *Keep both defaults*: rejected by the user at Gate 1 (2026-10-14).
- *Default the parent to the open work, and add tasks without opening details*: chosen.

**What we learned**

The parent default and the root-by-default rule come from
[the gear and work create](2026-09-project-navigation-gear-and-work-create.md). The audit shows
the open workstream is what users expect, from all four walkthrough auditors independently.

**Current decision**

- **Parent default.** Add workstream's Parent defaults to the workstream currently open. On a
  root page it defaults to the root. The explicit Parent choice remains.
- **Adding a task** keeps focus in the add field. It does not select the new task or open its
  drawer. The new task is visible and announced (principle 6). Opening details stays an explicit
  action.
- **Behaviour changes** follow §77: tests, implementation and docs change together.
- **Interpretation.** The user's words were "adding a workstream should default open". This
  entry reads them as the Gate 1 question asked them: the default parent is the open workstream.
  Whether a newly created workstream should then open (W1-014, W2-007) is **not** decided here.

**Confidence**

High on both defaults. The interpretation is recorded so the user can correct it.

**Revisit when**

Revisit when the user confirms or corrects the interpretation, or at the slice that implements
it.

**Amended, 2026-10-14 (user confirmation).** The user confirmed the interpretation: Parent defaults to the open workstream. They also decided that a newly created workstream opens itself, so the app navigates to it after creation (W1-014, W2-007), as creating a root project already does.

**Amended, 2026-10-16 — Slice 73 (partial implementation).** Task quick-add now preserves the
existing selection and keeps keyboard focus in the add field; it neither selects the new row nor
opens details. This was pulled into lifts because opening a modal phone sheet after every Add
would interrupt entry. Scroll-into-view and feedback remain with redesign slice 4. The Parent
default and newly-created-workstream navigation choices remain for the navigation redesign;
current workstream creation still defaults to the root and keeps the current route. Spec §26's
quick-add rule now has its implementation.
