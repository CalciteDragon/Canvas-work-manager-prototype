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

Open [Slice 27](../roadmap/completed/27-direct-canvas-editing.md) with the approved feature
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

**Amended, 2026-09-13.** Slice 27 implements the approved direct-editing direction. The settled
positioning contract is recorded in [Contextual insertion remembers its target and creates in
one positioned write](2026-09-contextual-insertion-names-its-position.md); the in-place,
accessible canvas controls and failure behavior are recorded in
[Canvas chrome is revealed in place, not gated by an editing mode](2026-09-canvas-chrome-is-revealed-not-moded.md).
The product spec now describes the landed behavior in §23, §26–§27 and §31–§32. This entry's
original text remains the record of the approved direction before implementation.

**Amended, 2026-09-13.** The implementation phase is closed; see the
[completed Slice 27 record](../roadmap/completed/27-direct-canvas-editing.md) for its outcome
and verification.
