# Nested project work is called a workstream

## Question

What should people and agents call the nested `subproject` kind?

## Options tested

Compared the nested-projects, personal-workspace and agent-heavy seed vocabulary: "work unit"
is mechanical, "work item" also describes a task, and "subproject" emphasizes hierarchy.
"Workstream" names work naturally at the root or inside another workstream.

## What we learned

The same noun belongs in navigation, projections, refusal messages and MCP descriptions.
Changing the noun does not require changing the stored model or the creation/history paths.

## Current decision

Use **Workstream** for user and agent prose describing `kind: 'subproject'`; keep **Project**
for roots and **Work** for the column heading. `create_project` and `get_project` explicitly
map the noun to the existing identifier. Keep identifiers, route and tool names, recorded
history labels and seed names. The Sub-Projects section retains its own copy until Slice 59
Stage E retires it. Persistence transaction "unit of work" is a separate term.

## Confidence

Medium. Wording assertions and MCP description contracts pin the map; sustained use must
still establish whether "workstream" reads naturally for small personal work.

## Revisit when

Real use confuses workstreams with tasks or suggests a better name for nested work.

**Amended, 2026-10-09 (Slice 66).** Stage E has landed: the Sub-Projects section and its copy are removed. Workstream remains the user/agent noun; stored identifiers and history labels remain unchanged.
See [the retirement decision](2026-10-retiring-the-sub-projects-section.md).
