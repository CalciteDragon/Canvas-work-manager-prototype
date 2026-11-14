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

**Amended, 2026-10-14 (Slice 70 Gate 1).** Two parts are reopened. Add workstream's Parent now defaults to the open workstream, and to the root only on root pages ([decision](2026-10-creation-defaults-follow-the-open-work.md)). The gear's placement moves with [one navigation tree](2026-10-one-navigation-tree.md).

**Amended, 2026-11-13 (Slice 81, step 6).** The root-name gear and the Work plus are gone with the
column. Their jobs are the tree's pencil "Edit project" menu ("Pages of <root>…" and Add
workstream) and the same two items in the header's More, after Open archive. The page-settings
popover opens with `showPopover({ source })` anchored to the menu's button through inline
`position-anchor: auto`; from the phone drawer the drawer closes first, Menu takes focus, and the
popover opens as a sheet with no source and Menu as its focus return. Chosen dialog closes return
focus to the request's opener (the pencil, More or Menu), not the plus or the collapsed-column
toggle. An archived root's Add workstream stays a focusable no-op described by its reason. Parent
selection and the awaited, same-URL create are unchanged ([plan](../roadmap/active/81-one-navigation-tree.md)).

**Amended, 2026-11-13 (Slice 81, step 7).** The create no longer stays on the current URL: it
re-reads the tree, opens the new workstream and focuses its heading; its toast names the parent
and has no Open link ([decision](2026-11-undoing-a-new-workstream-returns-to-its-parent.md)).
