# Feedback is one toast with receipt-specific Undo

**Question**

Where do confirmations, refusals and the immediate Undo belong across project surfaces?

**Options tested**

The header feedback line and detached recovery notices, a toast floating beside each change,
and one toast docked within the content track. On 2026-10-17 the user chose the dock, the
one-blurred-lift rule and an eight-second timer, with the recommendations for focus and scope.

**What we learned**

Header guidance separated a reversible removal from its way back. Restore silently removed
rows, cross-owner confirmations described history internals, and different surfaces competed
for feedback space. A single slot allows each surface to render its own toast in local Tab order.

**Current decision**

One manual-popover toast confirms the supported writes, docked at the bottom of the content
track. It uses lift tokens and becomes solid while another lift is open. Status closes after
`TOAST_DISMISS_MS = 8000`; hover, focus, suppression and pending Undo pause it. Alert feedback
waits for dismissal. Navigation, a newer workspace write, replacement and prototype reload
close the acting toast. Custom creation dialogs, phone navigation and the dev panel suppress it.

Undo names the write's exact receipt. Same-history offers wait for the owed summary read;
cross-owner Undo checks the owner's latest step and revision without adopting that summary
into the displayed header. The header keeps its untimed Undo/Redo, providing the equivalent
path for the timer's WCAG 2.2.1 trade-off. A toast Undo morphs the acting toast. Removed controls
hand focus to the first action only while focus remains lost or on that control. Dismissal
uses the caller's fallback; navigation leaves landing focus to the route.

Archive restore names title, breadcrumb and page, offers its canonical Go to it when enabled,
and Undo. Restored workstreams name the chosen status and link their own route. Settings restore
has Open it and no Undo because it has no project history provider. Task Delete and Todos
workstream Complete use their own receipts. Descendant task completion on Todos still gets
cross-owner confirmation while same-history completion awaits Slice 75's saved feedback;
that existing asymmetry is deliberately retained. Stored server labels are unchanged.
Spec §26, §27, §31, §34 and §67 are corrected.

**Confidence**

User-selected direction, with focused unit and browser verification. Whether the dock's
overlap with the acted region feels right is explicitly for Slice 74 Gate 2; showing a toast
never scrolls the canvas.

**Revisit when**

Gate 2 rejects the dock, or Slice 75 adds pending/saved feedback and placement behavior.

**Amendment (2026-10-17, closed-state geometry)**

Removing the header feedback row shortens every project header by 12 px. Its wrapper's
`:empty` rule never matched, so the baseline carried a blank grid row and its gap. The user
accepted the shorter header as Slice 74's one listed closed-state change. Profile 74 of the
sheet builder lists it only when the header is exactly 12 px shorter at the same top and
everything in its column below moves by that amount. Any other movement still fails the 1 px
gate. The same evidence found the toast host taking a grid gap at the bottom of the project
track; the host now has `display: contents`, so a closed toast takes no space.

**Amendment (2026-10-18, phone document height)**

The toast's two persistent live regions were absolutely positioned with no positioned ancestor,
so they sat at the bottom of the scrolled project track and made the document itself as tall as
the content (2,894 px on a 812 px phone). The window could scroll behind the app's own track,
and it hid the 375 touch-target evidence: Chromium drops touch emulation for a full-page
capture beyond the viewport. The regions are now fixed to the viewport, and a browser test
holds the document to the viewport height on a long phone page.
