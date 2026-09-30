# Descendant rows link to their owner's existing header history

**Question**

How can a person on a root's Todos or Archive page find the history of work owned by a descendant, when §26 offers Undo and Redo only for the displayed project?

**Options tested**

- *Merge descendant actions into the root header*: rejected because each actor and project has its own revision and cursor (§31).
- *Add row-level Undo controls*: rejected because they would duplicate the header's transition surface and suggest that the row's action is necessarily the next step.
- *Link to the owner's header*: kept. The projections already carry the owner id and breadcrumb, and the existing project route works for archived subprojects too.

**What we learned**

A root projection's content link answers where to work or restore; it does not reveal where a descendant's Undo step lives. In the `nested-projects` browser journey, a separate named link reached the child header from both pages, kept focus after reload and keyboard activation, and left the root revision unchanged after child Undo/Redo. A foreign persona saw Project unavailable; the same-workspace agent's MCP read did not expose the person's step.

**Current decision**

A root Todos or Archive row whose owner is a descendant offers `Open <owner> history` beside its content/origin link. It targets `#history-controls` on the owner's canonical route (`/projects/:id` for a subproject, `/projects/:id/pages/home` for a root). Root-owned rows omit it. The shell scrolls and focuses the existing header group after rendering and checks the current project and exact fragment before doing so. The link carries no receipt or step identity and never promises that a particular Undo is available. The server continues to scope the summary to the current actor and project.

**Confidence**

Medium-high: component tests cover the projection variants and focus guard; the isolated browser journey covers navigation, reload, keyboard use and actor isolation. Sustained use may change the link wording.

**Revisit when**

Real use shows that people mistake the owner link for a guaranteed Undo of the listed row, or cannot find it in a long chronology or Archive list.
