# A Task List shows its count in the frame header

**Question**

A Task List says nothing about its size until it is read row by row (L4-023's count half), and its
drag explanation takes a line above the list the moment a drag starts, so every row jumps down
under the pointer (`note-2026-10-22-002`). Where do the count and the hint go, without moving the
populated lists everywhere else? (Slice 79; §29, §34.)

**Options tested**

- *The count as muted text after the frame's name, reported by the section through a callback only
  types marked `summary: true` receive*: chosen.
- *A count line inside the section, above the rows*: rejected. It pushes every Task List down and
  moves every populated cell that holds one.
- *`reportSummary` passed to every section*: rejected. `NgComponentOutlet` sets each key with
  `setInput`, and an input the content does not declare raises NG0303, so every type would have to
  declare an input it never uses.
- *The drag hint in a reserved line*: rejected. It adds height to every Task List at rest.
- *The drag hint over the quick-add row while a drag lasts*: chosen. Quick-add cannot be used
  mid-drag, and nothing in the list moves.

**What we learned**

The frame already had the stable class-property callback pattern (`onConfigChange`), so the count
is one more such callback: the canonical and shortcut frames hold a `summary` signal and add
`reportSummary` to the content inputs only when the definition says `summary: true`. The list
counts what it loaded and reports `null` while loading, after a failed read, at zero and when it is
destroyed; a collapsed frame shows no count, since nothing keeps it current. The header's
`flex-wrap: wrap` let a long name push the tools onto a second line; it is now one line in which
the name truncates. The step cost 1.85 kB of initial bundle (1,144.14 → 1,145.99 kB).

**Current decision**

`SectionDefinition.summary?: true`, set only on Task List. The frames render the reported text in
`[data-section-summary]` / `[data-shortcut-summary]`, outside the heading, so the section's
accessible name stays its name. The text is "N tasks", "1 task" for one, counting open and done
tasks. The drag hint (`[data-task-drag-hint]`, unchanged wording) is absolutely positioned over the
quick-add form on the solid sheet while a drag is in progress.

**Confidence**

High for the behaviour: `registry.spec.ts` pins the marker to Task List and to the components that
declare the input; `project-section-frame.spec.ts` and `shortcut-frame.spec.ts` cover the
rendering, its absence for other types (no NG0303), the collapsed case and the one-line header;
`task-list-section.spec.ts` the count's states and the hint's placement. Medium for the look: the
header and the hint are checked in a browser by the slice's after capture (step 13).

**Revisit when**

Another section type has a summary worth showing (mark it and declare the input), or task
reordering (Slice 20) makes the drag hint say something else.
