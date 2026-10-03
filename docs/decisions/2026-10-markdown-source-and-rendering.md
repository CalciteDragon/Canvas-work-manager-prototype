# Markdown stores source and renders safely

## Question

How should Markdown coexist with Rich Text in Stage C1 without persisting generated HTML or silently overwriting unreadable content?

## Options tested

markdown-it 15 with HTML disabled versus a parser requiring a separate sanitizer; a deferred body versus eager parser loading; scoped unencapsulated styles versus emulated styles that cannot reach innerHTML. Renderer, config, capability and callback tests ran. The full editor remains pending at the active plan’s mandatory budget gate.

## What we learned

The renderer escapes raw HTML, disables images and keeps unsafe-link validation, with Angular sanitization as a second layer. Headings shift beneath the frame title, links open with noopener/noreferrer and table alignment becomes classes. Contracts can declare a prose key without owning its editor schema; domain recovery and history labels use that key without parsing Markdown. The early production build measured 1,052.60 kB against the unchanged 1,050 kB ceiling, despite placing the parser/body in a 117.80 kB lazy chunk.

## Current decision

Source lives in config.markdown. The folder distinguishes empty, exact string source and unreadable config; unknown content stays recoverable. ViewEncapsulation.None is scoped under .markdown-renderer rather than using ::ng-deep. Rich Text remains registered and schema version 5 remains. Markdown-only history updates say Edited Markdown; existing Rich Text wording stays.

Implementation is paused at the bundle gate; Save/Cancel/Preview authoring and its draft/focus guarantees are still requirements in [Slice 62](../roadmap/completed/62-markdown-section.md), not delivered behavior. No ceiling increase is approved. The shell’s escaped source placeholder accepts a small loading layout shift.

## Confidence

High for the tested renderer and domain policy; pending integrated checks and real use for authoring and the final bundle strategy.

## Revisit when

The user resolves the bundle gate, the remaining editor is delivered, or real use identifies dialect or draft friction. C2 separately converts Rich Text content and history.


**Amended, 2026-10-02 — approved bundle remedy and authoring.** The user approved deferring
DevPanelControls inside its existing eager dialog. The early build now totals 1,032,388
initial bytes, with controls/store/layout and Markdown parser/body lazy; the 1,050,000-byte
ceiling stays unchanged. Authoring now has a fresh draft per Edit, Source/Preview, explicit
Save/Cancel and awaited whole-config replacement. Unchanged Save and Cancel write nothing;
refused Save retains the draft. Pending blocks repeated actions and source edits. Live updates
keep the draft and announce replacement; unreadable config blocks Save even mid-session.
The shell accepts a brief escaped source placeholder on first load. C2 still owns migration.

The dialect is markdown-it’s default block/inline syntax, tables and strikethrough, with
HTML, images, linkification and typography disabled. Markdown-it was chosen over marked
for its built-in HTML escaping and unsafe-link validation; Angular still sanitizes output.
Save replaces the latest source rather than merging concurrent edits. There is no autosave
or Escape dismissal. Navigation, reload, frame collapse and removal destroy an unsaved
session; section.updated keeps it. A mid-session read-only change also blocks Save and
keeps the draft available to copy or Cancel.

**Amended, 2026-10-02 — Slice 63 delivers C2.** Rich Text content and history are converted to Markdown at schema version 6 and Rich Text is retired; see [Schema version 6 converts Rich Text to Markdown and retires it](2026-10-schema-version-6-markdown-conversion.md). Converted prose is escaped source, so the shell placeholder strips backslash escapes and the space, tab and CR references before the body renders, and an unreadable config that still holds a `markdown` string renders it read-only above the guidance note.
