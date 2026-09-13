# Direct canvas editing is the next development direction

**Question**

How should section organization become available without a separate layout-editing mode?

**Options tested**

The existing application uses Edit Layout Mode, Quick Add, size dropdowns and frame buttons.
Contextual insertion, drag resizing and inline naming were discussed as a replacement;
they have not yet been implemented or tested in use. Finer width increments and fixed
grid cells were considered during the specification discussion.

**What we learned**

The user reported a content-dependent sidebar height and incorrectly rendered section
indicators, requested fewer permanent controls, and approved the complete draft and its
recommendations on 2026-09-13. This is explicit product direction, not evidence from a
completed implementation experiment.

**Current decision**

Open [Slice 27](../roadmap/active/27-direct-canvas-editing.md) with the approved feature
specification before writing an implementation plan. It is the authoritative record of
the accepted interactions and acceptance criteria. Keep the existing 4/6/8/12 widths and
ordered, wrapping layout; empty areas offer insertion rather than reserved cells. Preserve
archive recovery, source ownership and read-only shortcuts while replacing editing-mode
controls with contextual actions.

This selects the next direction after the
[editing-mode decision](2026-08-view-mode-section-chrome.md) and
[Quick Add decision](2026-08-project-header-quick-add.md). Those entries and the living
product spec still describe the shipped behavior; implementation will amend them alongside
code and tests. Both layout candidates remain in scope as already decided in the
[layout experiment](2026-08-flow-vs-grid-layout-experiment.md).

**Confidence**

High that this captures the user's approved scope; interaction quality still needs browser,
keyboard and touch verification during development.

**Revisit when**

Slice 27 is implemented and used with realistic mixed-width content, especially grid-gap
insertion, resize reflow and discoverability without hover.
