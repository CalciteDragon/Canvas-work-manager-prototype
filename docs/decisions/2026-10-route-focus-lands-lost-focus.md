# Route focus lands lost focus after user navigation

**Question**

Where does focus go when navigation removes its originating control?

**Options tested**

Leave body focused, always focus a heading, or recover lost focus after trusted input.
The user approved the last option on 2026-10-16 with Slice 73's plan.

**What we learned**

Headings arrive asynchronously. History fragments, removal recovery and phone navigation already
own hand-offs. Archive navigation can replace the shell, so its request must survive that shell.

**Current decision**

An app initializer starts `RouteFocus`. It skips initial navigation and input-free redirects,
requires trusted pointerdown or keydown since the previous NavigationEnd, and acts only on body
focus. It waits through renders for a heading, bounded to two seconds, then uses main, rechecking
focus before acting. Optional page headings take precedence over the shared header; the header
is eligible on canonical canvases. Open Archive explicitly lands on its heading and restores its
More, Todos or removal-notice caller on failure, using root-lived request state across shells.
A live redirect after an earlier click can count as user navigation; recovering lost focus is
acceptable then. A narrow column link can briefly land on a heading before its toggle wins.
Phone global-navigation links and root creation retain their existing main landing; desktop
creation lands on the new heading. Core imports no feature.

**Confidence**

Approved prototype rule, with unit policy and native browser route checks.

**Revisit when**

The one-tree redesign replaces existing phone and project-column hand-offs.
