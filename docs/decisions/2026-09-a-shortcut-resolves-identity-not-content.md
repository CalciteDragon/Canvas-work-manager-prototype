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

The 25.8 browser/MCP pass used a nested Task List and a Reflections-page source. The frame showed
canonical source identity and live source updates, while removing the placement changed neither
the source section nor its rows. A revoked content grant also left discovery separate from source
content access, as intended.

**Current decision**

`list_section_shortcuts` and the picker require `projects.read` and return placement/source
identity only. Adding, moving, changing layout and removing a placement require
`projects.write`. There is no `resolve_shortcut` MCP tool that returns source rows. An agent that
wants the rows reads the source section through its own content grant.

**Confidence**

High. The service boundary makes the forbidden result unrepresentable, the MCP contract test checks
the read with `projects.read` alone, and the integrated browser/MCP pass confirmed nested, cross-page,
read-only and remove-placement behavior.

**Revisit when**

Agents need a bulk read model that combines layout and content intentionally, or use shows that
read-only source frames create more navigation than value; either change must name each content
grant rather than widening shortcut discovery.


**Amended, 2026-09-20 — Slice 37.** The rule now reaches the inverses. Each of the four placement
writes records an action in the **destination** root project's history, never the source
sub-project's, and its payload captures the placement record and nothing of the source. Undo and
Redo write `sectionShortcuts` and the combined page order only — the executor's repository type
deliberately has no task or reflection repository in it — so an edit to the source is never a
conflict for a placement action, while a source that has gone, left the root tree or moved onto the
destination page is, because integrity would no longer allow the placement. Recreating a reference
onto an archived or hidden source is allowed and produces the existing unavailable placeholder; it
never unarchives the source ([decision](2026-09-section-restore-and-shortcut-history.md)).
