<!-- plan id="69" status="planned" summary="A shortcut to an untitled section is named with its source's owner on its frame and in history labels, so it cannot be mistaken for a local section" -->
# Slice 69 — Distinguishable names for untitled shortcut sources

## Goal

A shortcut whose source section has no title can be told apart from the canvas's own sections. This
applies on its frame, in its control labels and in the header's Undo/Redo labels.

**Source.** Friction note `note-2026-10-03-001` (Slice 65 real use).
- Kitchen's Work canvas took a shortcut to Garden's untitled brief.
- Its frame and the header label (`Undo: Added the Markdown shortcut`) both said only "Markdown".
- It sat directly under Kitchen's own untitled "Markdown" brief, and only the small breadcrumb line
  told them apart.
- Untitled sections are the default, and Work canvases now take shortcuts, so this collision will
  be common.

## Spec sections

- **§27, §30:** shortcuts are read-only references, shown with their source.
- **§31:** a section has a derived name ([decision](../../decisions/2026-09-a-section-has-a-name.md)).
- **§20:** accessible names of the frame's controls.
- **§57:** history labels.
- **§77, §79:** real use and friction.

## Build

- **One naming rule, owned by the domain.** A shortcut's display name is the source's `nameOf`
  when the source has a title override. When it doesn't, the name also says whose section it is,
  e.g. "Garden's Markdown" or "Markdown · Garden". The exact form is settled with a §78 decision.
  - The domain owns it, because both of these must agree:
    - the history label (`shortcutWriteLabel` in `packages/domain/src/shortcut-history.ts`, which
      today receives only the source name);
    - the web frame (`sourceName` in `shortcut-frame.ts`).
  - Decide during planning whether the owner name already travels with the resolved shortcut
    (its `breadcrumb`), or needs a small addition in contracts.
- **Frame.** The title and the Move/Collapse/Remove accessible names use the new name. The
  breadcrumb line stays.
- **Labels.** New history labels use the new name. Stored labels are historical and are not
  rewritten.
- **Tests.**
  - Domain label tests: a titled source, an untitled source, and a source the actor cannot read
    (keep the `a shortcut` fallback).
  - The shortcut-frame spec.
  - An e2e assertion on a Work canvas with a local untitled Markdown section next to a shortcut to
    another workstream's untitled Markdown section. Their visible names and the Undo label differ.

## Done when

- **On a `nested-projects` copy, Kitchen's Work canvas** holds its own untitled Markdown brief
  above a shortcut to Garden's untitled brief.
  - The two frames show different names, and so do the shortcut's control labels.
  - The header reads e.g. `Undo: Added the Garden's Markdown shortcut` (exact wording per the
    decision).
  - A titled source still shows just its title.
- **MCP.** An agent's `add_section_shortcut` receipt label uses the same rule.
- **Gates.** `pnpm test`, `pnpm lint` and the affected e2e pass, and real use is recorded.

## Do not

- Rename stored sections, add titles automatically, or rewrite stored history labels.
- Change local section naming. Only shortcuts gain the owner qualifier.
- Make shortcut titles editable, or add a per-shortcut name override (the Slice 59 non-goal
  "editable shortcut content").
