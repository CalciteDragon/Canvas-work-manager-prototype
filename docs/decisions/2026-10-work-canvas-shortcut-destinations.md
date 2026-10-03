# A workstream's Work canvas takes shortcuts the way a root's Home does

**Question**

Slice 59's Stage D asked what a "shortcut section to a sub-project" should be. §27 allowed shortcut
placements only on a root's Home, so a workstream's Work canvas could show nothing from its
ancestors or siblings. Should a Work canvas be a destination? If so, which sources can it take,
whose history records the placement, and what happens to a placement when its workstream moves to
another root?

**Options tested**

- *A Work canvas is a destination with Home's rules* — kept. It reuses §27's placement model and its
  existing dialog, picker, frame and combined order without changes. Stage A already made the
  sidebar the way to reach nested work.
- *A project-link card that opens a sub-project*: rejected. That would be a different capability,
  and the sidebar already does this job.
- *Restrict Work sources to ancestors and siblings*, as the umbrella plan worded it: rejected.
  Excluding descendants would be a Work-only exception with no stated reason, since Home already
  shows them.
- *Allow shortcuts on a root's optional pages too*: rejected. Reflections, Projects, Todos and
  Archive are projections or containers with their own rules (§30). The canonical page is the one
  canvas every project has.
- *Record the action in the root's history*: rejected. The placement is on the workstream's
  canvas, and the header that offers its Undo is the workstream's (§31).

**What we learned**

Four places assumed Home: the service's destination check, the history executors' destination
check, commit-time integrity and the web shell's gate. Three more compared the source's root with
the destination's **id**. That was correct only because a root is its own root. With Work
destinations, each comparison has to use the roots of both ends.

The reparent check had only ever looked at the source end. A move now carries the subject's Work
canvases as well as its sections. A placement with **both** ends in the moving subtree travels
with it and stays same-root. A placement with **exactly one** end inside it would cross roots.
Because integrity keeps every stored placement same-root, this one-end-inside rule is complete.

The web store's live filter compared a frame's `rootProjectId` with the canvas's project. That
silently missed every same-root change for a Work canvas, so the shell now passes the root.

**Current decision**

- A shortcut's destination is its project's **canonical page**: a root's Home or a workstream's
  Work canvas. Any other page is refused (`DomainRuleError`; 409 over HTTP). An omitted `pageId` on
  a list resolves to that page.
- Sources follow Home's rule at any depth: any section in the same root tree and workspace that is
  not on the destination page. That includes ancestors, siblings and descendants. A disabled page
  is still a valid source. Another root or workspace is not found (404).
- Placement writes are recorded in the **destination project's** history: the root for Home, the
  workstream for Work. They are never recorded in the source's history.
- A move to another root, forward or as a reparent's Undo or Redo, refuses each placement with
  exactly one end in the moving subtree. The refusal names every such placement. One helper,
  `shortcutsCarriedAcrossRoots`, serves all three paths.
- There is no new tool, no grant change and no schema change. Moves stay API/MCP-only.

**Confidence**

High for canonical-page destinations and destination-owned history, which reuse settled rules.
High for the one-end-inside rule, which is exactly what integrity demands. Medium on whether
people want Work shortcuts often. Seeds do not exercise them, so real use has to say.

**Revisit when**

Stage E retires the Sub-Projects section, or real use shows Work canvases want a different
reference: a link card, a live summary or a copy. Revisit too if a move UI arrives and people hit
the split-placement refusal often.
