<!-- plan id="75" status="planned" summary="Redesign slice 4b (TH07, TH15 task-add): pending within 100 ms, a saved cue, failures on the row, new items scrolled into view and focused, a canvas that holds still" -->
# Slice 75 — Feedback: pending, saved and new items in view

<!-- The first line is the state marker; scripts/roadmap.mjs owns it. While the plan is in
     planned/ keep only the first five sections and keep them short. When it starts (roadmap.mjs
     start), write the rest per AGENTS.md step 1, then revise it through review (step 2) and
     record the rounds under Revisions. Before roadmap.mjs complete, write Outcome. -->

## Goal

Redesign slice 4b under the [UI/UX overhaul umbrella](../active/70-ui-ux-overhaul.md): every write
shows it is pending within 100 ms, edits without a Save button say they saved, failures name the
row, and what the user just made is on screen and focused while the rest of the canvas holds still
(principles 6 and 7).

## Spec sections

§21 tokens and motion, §26 project page, §29 sections, §34 task interactions, §67 Design Lab, §69
verification, §77 design-first loop; the [overhaul protocol](../../guides/ui-ux-overhaul-protocol.md)
§6–§7.

## Build

- **New items in view** (W1-024, W2-008, W3-016, W1-043, L4-023): a created section or shortcut
  scrolls to its top and focuses its heading, reusing the canvas's `revealTarget`; a quick-added
  task is scrolled into view in a long list and announced, with focus kept in the add field.
- **Pending within 100 ms** (L3-007, L4-004): quick-add shows a pending row and refuses a second
  submit; one pending vocabulary with completion's.
- **Saved cue** (L3-008, W2-018): the task drawer says its edits save automatically and shows
  saving and saved beside the field.
- **Failures on the row** (L4-005, L4-024): a failed add, complete or permission change names its
  row; an empty name says why instead of ignoring the click.
- **A canvas that holds still** (W1-030, W2-010): Recent Activity growth above the working section
  does not push it down, with transform/opacity motion only.
- **Evidence for slice 73's quick-add change** (W1-026, W3-012, W2-009, W4-008): closed on the
  sheet with captures, since slice 73 implemented it without claiming them.

## Done when

The 13 TH07 findings and four TH15 findings above are closed on the before/after sheet; core task
T03 costs no more than its baseline; e2e pins the keyboard and touch paths; the user accepts the
sheet at Gate 2.

## Do not

- Rebuild the toast or Undo (slice 74).
- Change section collapse (slice 5), task drag or the Markdown editor (slice 6).
- Touch domain, contracts, host or persistence.
