# Projects

`apps/web/src/app/features/projects` is the project workspace (§23, §26–§32): the shell
that serves both project routes, the project navigation column with its page toggles,
the header rendered once per project, the page renderers — a section canvas for Home and
for a subproject's work page, and the Todos, Archive and Reflections projections for a
root — the section registry and its seven section types, Home shortcuts, and the shared
archive list. It is the largest feature and where most of the product learning happens.

**Code:** `apps/web/src/app/features/projects` and its `pages/`, `sections/`,
`shortcuts/`, `archived-region/` · **Tests:** `*.spec.ts` beside each file; stories for
the canvas, navigation, frame, pages, shortcuts and archive list · **Parent:**
[web](../overview.md)

## Responsibilities

- `ProjectWorkspaceShell`: both §68 project routes; resolves the page positively (root,
  navigable kind, enabled, renderable) and falls back with a notice that survives the
  redirect; a subproject opens on its work canvas and keeps its root's column.
- `ProjectWorkspaceStore`: the project record, §39's progress, §26's writes, and the
  root's work tree — the things that describe the *project* rather than one page.
- `ProjectPageNavigation`: the column — pages, optional-page toggles, the work tree —
  placed beside the sidebar by one `:has()` rule.
- `ProjectCanvas` + `ProjectPageStore`: one page's sections and shortcut placements in
  flow or grid, direct drag, contextual insertion, snapped resizing, inline naming and
  removal, plus canonical navigation to `#section-<id>`. A canvas-local notice holds the
  committed removal receipt and offers immediate Undo, retry guidance and Archive access.
- `SECTION_REGISTRY` and the section types: Rich Text, Task List, Sub-Projects,
  Progress, Reflections, Timeline, Recent Activity — each its own folder inside
  `ProjectSectionFrame`.
- The three root pages: `TodosPage`, `ArchivePage`, `ReflectionsPage`, each with its
  store over the matching derived read.
- Home shortcuts: `ShortcutFrame` (read-only source content), `ShortcutPicker`,
  `ShortcutStore`.
- `SectionUndoNotice`: accessible, in-memory feedback for one removal receipt or an
  uncertain removal request; it does not persist Undo state across page changes or reloads.

## Not responsible for

- Task rows and the task detail drawer — [tasks](../tasks/overview.md), reused by the
  Task List section and the Todos page.
- The activity feed component — `features/activity`, reused by the Recent Activity
  section.
- Rules: which page accepts which section, where a write lands, what removal does —
  all refused or resolved by the host; the UI shows the answer
  ([domain](../../domain/overview.md)).

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
