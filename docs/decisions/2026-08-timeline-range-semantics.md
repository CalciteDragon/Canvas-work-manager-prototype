# Timeline derives ranges without inventing a project start date

**Question**

How should §38 render a project target when the project contract has no explicit start date?

**Options tested**

- Add a project start-date field solely for Timeline: rejected as premature contract growth.
- Always show the target as a marker: accurate, but loses useful density when child work has dates.
- Infer a display range from dated descendants to the target: chosen with strict safeguards.

**What we learned**

The seeded timelines become much easier to scan when a project's target is contextualized by
its earliest dated child. Equal or later child dates cannot form a meaningful range. Tasks
with inverted dates still need to remain visible rather than disappear.

**Current decision**

A target-only project renders as a deadline marker. If an earlier task, milestone, or nested
project date exists, Timeline derives a visual range from the earliest date to the target.
Equal/later inference stays a marker. Inverted task dates are normalized for chronological
display and visibly flagged in selected details. No timeline-event records are persisted.

**Confidence**

Medium-high for the prototype.

**Revisit when**

Scheduling controls or an explicit project start-date concept enter scope.
