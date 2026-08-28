# Flow and grid both remain prototype layout candidates

**Question**

Should a project canvas behave like a vertical document, a dashboard grid, or a freeform
surface?

**Options tested**

- *Flow*: a vertical stack whose 12/8/6/4 presets change the block's proportional width.
- *12-column grid*: a wrapping dashboard layout using the same persisted presets.
- *Freeform X/Y placement*: not built. Neither tested layout needed coordinates to express
  the arrangements exercised here, so adding absolute placement would not yet answer a
  demonstrated need.

**What we learned**

With only a Rich Text and Task List section at width 12, flow and grid look effectively the
same. After reload, all four persisted presets were exercised in both modes: 12 filled the
977 px canvas, 8 rendered about 646–651 px, 6 about 481 px, and 4 about 315 px. The Website
launch seed placed an 8-column brief beside a 4-column task list in grid, while flow rendered
the same brief with intentional whitespace beside it.

Both reorder interactions worked with real pointer dragging and survived reload. Grid's
mixed CDK strategy also moved unequal 12- and 8-column sections across wrapped rows. The
4-column task list is possible, but it is a dense choice for content with titles, priority,
dates, overdue labels, and detail controls; the 8-column brief is the more natural narrow
card. Flow reads better as a document, while grid earns its complexity only when sections
have genuinely different visual roles.

The final storage inspection showed `project-launch` in `grid` mode with the brief at
position 0/span 8 and Task List at position 1/span 4. The UI therefore rendered the same
mode, order, and widths that `.prototype/data.json` persisted.

**Current decision**

Keep both modes in the prototype and persist the choice per project. Do not choose a
production default yet, and do not add freeform coordinates. Use flow for reading- or
work-list-heavy projects and grid to test dashboard-like compositions.

**Confidence**

Medium that the two modes are meaningfully different; low on which should be the default.
The first milestone still has only two section types.

**Revisit when**

Slices 10 and 11 add Timeline, Progress, Reflections, Sub-Projects, and dashboard widgets.
Those heterogeneous sections are the real test of whether grid justifies remaining a
project-level mode.
