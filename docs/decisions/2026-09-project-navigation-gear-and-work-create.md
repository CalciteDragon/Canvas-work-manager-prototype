# Page settings and work creation live beside their navigation

## Question

Where should root page settings and nested work creation be reachable without a section?

## Options tested

Compared the existing Manage pages disclosure and Sub-Projects creation form with a gear
beside the root name and a plus beside Work. An explicit parent selector covers every live
level without making the routed project's depth an implicit creation target.

## What we learned

Page settings remain root-owned from descendant routes. Creation already returns the child's
history receipt, so the header can explain and link that history without a second notice.
The modal needs draft retention on refusal and a named stale-parent reset after live changes.

## Current decision

The root-name gear toggles a disclosure with fixed Home and the three optional pages. Escape
closes it and returns focus; outside clicks leave it open. The Work plus opens Add workstream
with Name and an explicit Parent, defaulting to the root even on a descendant route. Completed
parents remain available and are marked; archived ancestry is excluded. An archived root keeps
a focusable unavailable plus with its reason. A create is awaited, stays on the current URL,
re-reads the tree and reports the child's receipt to the header's existing Open link.
Chosen dialog closes return focus to the plus or the collapsed-column toggle. Loads and live
root changes close draft dialogs without moving focus.

## Confidence

Medium. The behavior is pinned by component, store and browser journeys; discoverability and
the root default still need sustained use.

## Revisit when

People choose the wrong parent repeatedly, miss the gear, or expect creation to open its canvas.
