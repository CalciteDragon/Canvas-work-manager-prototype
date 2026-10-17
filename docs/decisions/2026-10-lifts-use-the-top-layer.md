# Lifts use the browser's top layer

**Question**

How can lifts escape section containment and follow the user's focus?

**Options tested**

Inline panels, CDK Overlay and native popovers/dialogs. The user approved native lifts on
2026-10-16 with Slice 73's reviewed plan.

**What we learned**

Size containers capture fixed descendants; the native top layer escapes them. Native light
dismissal and inertness avoid another dependency within the 1050 kB initial bundle ceiling.

**Current decision**

More and page settings use auto popovers. Desktop task details use a manual popover with shell
width reservation; phone task details use a modal sheet at the shell's 48rem threshold.
Details and archive confirmation use native modal dialogs. One root `LiftStack` closes the
previous lift, including custom creation dialogs, which retain their traps and adopt lift paint.
`LiftFocus` remembers the real opener and preserves outside focus, with a named fallback.
Dirty details handle Escape on keydown with `closedby="none"` and backdrop clicks explicitly.
Chromium 134+ supplies the `closedby` floor; CSS anchors have fixed placement fallback.
Each popover names its opener explicitly, because the invoker's implicit anchor did not resolve
and More rendered at the viewport corner; a too-wide popover falls back to the viewport gutter.
Reduced motion crossfades and solid plane tokens cover reduced transparency, unsupported filters
and forced colours. Persistent project blur stays at three panes; transient lifts share one slot.
Muted lift text contrast remains reported only under the Depth amendment. New dialogs are deferred
to fit the unchanged bundle budget.

**Confidence**

Approved prototype direction; unit/browser checks and the Slice 73 sheet supply evidence.

**Revisit when**

Real use needs simultaneous lifts, another phone sheet, or an older browser floor.
