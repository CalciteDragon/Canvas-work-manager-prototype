# A shortcut resolves source identity, not source content

**Question**

What may `list_section_shortcuts` return under `projects.read` when the placement points at a
Task List or Reflections section whose rows need their own grant?

**Options tested**

- *Resolve the source and include its task or reflection rows*: rejected. It makes a layout read
  a permission bypass and forces `projects.read` to imply every content grant.
- *Return only the stored source id*: rejected. The browser and an agent still need the source
  project's name, page and breadcrumb to identify what the placement means.
- *Return placement plus source identity, and let the content surface read its own rows*: chosen.

**What we learned**

The service can make the permission boundary structural: it depends on projects, pages, sections
and activity, but not on `TaskRepository` or `ReflectionRepository`. A resolved placement carries
its local layout, the canonical `ProjectSection`, source project/page identity, breadcrumb and an
availability state — never a row collection. The read-only Angular content component then uses the
same gateway path as the owning canvas, so `tasks.read` or `reflections.read` remains independent.

**Current decision**

`list_section_shortcuts` and the picker require `projects.read` and return placement/source
identity only. Adding, moving, changing layout and removing a placement require
`projects.write`. There is no `resolve_shortcut` MCP tool that returns source rows. An agent that
wants the rows reads the source section through its own content grant.

**Confidence**

High. The service boundary makes the forbidden result unrepresentable, and the MCP contract test
checks the read with `projects.read` alone.

**Revisit when**

Agents need a bulk read model that combines layout and content intentionally; that API must name
each content grant rather than widening shortcut discovery.
