# Archive is always visitable

**Question**

Should Open archive enable the root's optional Archive page before navigating?

**Options tested**

The prior enable-and-open path, and the user's 2026-10-17 choice to make Archive routing
independent of its navigation toggle (W4-020, Slice 74).

**What we learned**

Enabling Archive recorded a newer history step immediately after removal, replacing the
removal as the next Undo. Visiting recovery was itself a project mutation.

**Current decision**

A root's Archive renders with an enabled, disabled or absent page record. Its toggle means
**Show Archive in navigation**. Hidden Archive appears in navigation while current and leaves
on the next navigation. Open archive only navigates, with the existing Archive-heading landing;
it records nothing. Workstream page URLs still redirect to their canonical Work route.
Toggling navigation still uses the existing reversible page write. The archived-root freeze
exemption remains because a navigation preference is permitted while archived; it is no
longer needed to reach recovery. No contract, domain, host or persistence changes are involved.
Spec §23, §26, §31 and §68 are corrected.

**Confidence**

User-selected product rule; routing and no-write behavior have focused test coverage.
Visual acceptance remains with Slice 74 Gate 2.

**Revisit when**

The navigation-tree slice replaces the page list or real use finds the shown-while-current
rule confusing.

**Amended, 2026-10-18 (Slice 74 Gate 2).** The user chose the shorter visible label **Archive**,
matching the other page names, and the usual accessible name **Show Archive page**. The
navigation-only toggle behavior, always-visitable route and write-free Open archive stay as
decided above. Spec §23 and the project architecture describe the shorter label.

**Amended, 2026-10-18 (Gate 2 accepted).** The user accepted Slice 74's revised comparison
sheet with the short Archive label and unchanged navigation-only behavior. Visual acceptance
is complete; the routing and no-write rule stand.
