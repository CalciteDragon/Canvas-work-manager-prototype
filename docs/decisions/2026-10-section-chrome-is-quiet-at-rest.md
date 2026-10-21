# Section chrome is quiet at rest on every device

**Question**

How can canvas organization stay discoverable without competing with its content, and how
should a section name and a collapse action answer keyboard, pointer and touch users?

**Options tested**

- Hover-only tools and insertion hid the available actions. Permanently full-strength touch
  controls made the phone louder than the desktop.
- A title button named “Rename X” named both the heading and its region as a command.
- Separate tool stops cost five Tab presses before content. Removing only the title stop
  would leave four.
- A wider resize target on both edges would recreate the neighbouring-handle overlap.

**What we learned**

The accepted plan's baseline has five chrome stops before content and six per section.
Collapse waits for the write response. Whole-record responses can overwrite pending collapse
or width intent, so field optimism must be reapplied wherever a placement enters state.

**Current decision**

The user accepted all eight recommendations on 2026-10-20. Tools and small insertion marks
stay visible at a Lab-adjustable rest opacity on pointer and touch. Hover, focus and press
raise tools to full emphasis. Canvas Remove ink is muted until interaction; global danger
tools keep their existing treatment. A labelled “Add a section” follows the drop list, and
the entire painted insertion plus belongs to its button. Sorting hides and suspends both.

A plain level-2 heading names the region and starts at the content edge. Rename is the first
tool; only a mouse or pen primary click on the title also opens it. The field is prefilled and
selected. An unchanged save, including an untitled section's exact derived default, writes
nothing; clearing still removes the override. Enter and Escape return focus to Rename, blur
preserves the destination, and failure keeps the draft. Default names remain unchanged;
L6-010 and W1-028 belong to redesign slice 9.

Each frame has one toolbar stop, with Left/Right wrapping and Home/End selecting tools.
Any focus entry updates its active tool. The Move grip uses Up/Down in both layouts.
Shortcuts have Collapse, Move and unlink Remove, plus an explicit Read-only cue; unknown
sections have Move and Remove. The end resize handle persists at rest, reaching half the gap
outward and one frame padding inward. Start keeps its original straddle and appears on hover
or focus, including on coarse-pointer tablets. Narrow layouts hide resize and grid-gap marks.

Collapse paints immediately, carries frame `aria-busy` while pending, and records the usual
history receipt. Pending `collapsed` and `columnSpan` fields survive whole-record answers.
A refusal restores only the last confirmed field and reports the action and reason on its
frame, linked from Collapse. `unreachable`, `internal_error` and `invalid_response` also owe
one quiet read because the write may have committed. A confirming read clears the error;
an unchanged read keeps it. A new toggle, navigation or generation clears it too.

**Confidence**

The behavior is covered by component and store assertions; browser geometry, timing and
visual evidence are the Gate 2 checks in [slice 76](../roadmap/active/76-section-chrome.md).
Gate 2 acceptance remains pending.

**Revisit when**

Real use finds the quiet tools too faint, toolbar navigation unexpected, or a placement's
concurrent writes repaint an older intent. Inert shortcut rows belong to redesign slice 6;
the project header's independent left edge belongs to slice 7.
