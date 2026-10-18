# Projects

Root Archive now presents only the domain's currently restorable archived items, highest ready
owner first. Restoring an owner can reveal independently archived children; hidden live content
and blocked descendants are absent from the list. Archived-root recovery is in workspace Settings.
Root Todos and Archive rows owned by descendants link to that owner's existing header history;
the displayed project's controls retain full-history Undo and Redo. A committed write's toast
also offers Undo of its exact receipt, including a descendant-owned write.

`apps/web/src/app/features/projects` is the project workspace (§23, §26–§32): the shell
that serves both project routes, the project navigation column with its page toggles,
the header rendered once per project with its Undo and Redo, the page renderers — a section canvas for Home and
for a subproject's work page, and the Todos, Archive and Reflections projections for a
root — the section registry and its six section types, shortcuts on Home and Work canvases, and the shared
archive list. It is the largest feature and where most of the product learning happens.

**Code:** `apps/web/src/app/features/projects` and its `history/`, `pages/`, `sections/`,
`shortcuts/`, `archived-region/` · **Tests:** `*.spec.ts` beside each file; stories for
the canvas, navigation, frame, pages, shortcuts and archive list · **Parent:**
[web](../overview.md)

Markdown renders and edits source through a deferred body and presentational source editor, and
is the first type in the picker. Rich Text is retired and absent from the registry. Live and
recreating history copies are refused on load with reset or reseed guidance; the historical
schema-version-6 converter was removed in Slice 66.

## Responsibilities

- `ProjectWorkspaceShell`: both §68 project routes; resolves the page positively (root,
  navigable kind, renderable, and enabled except Archive) and falls back with a notice that survives the
  redirect; a subproject opens on its work canvas and keeps its root's column. While the
  column is collapsible (≤60rem), a chosen column link collapses it again and focuses its toggle
  once any reload has rendered (Slice 58). After project
  creation Undo it renders creator-only recovery at the original project URL; if the history read
  fails while that project is missing, the unavailable state offers a generic Retry — but not
  for a `not_found` history, which is what everyone but the creator receives.
- The shell provides `TaskDrawerCoordinator`, reserves desktop drawer width and keeps explicit
  Archive-heading requests in root-lived `ProjectColumnFocusRequest` across shell replacement.
- `ProjectWorkspaceStore`: the project record, §39's progress, §26's writes, the `missing` state
  used by creation recovery, and the root's work tree — the things that describe the *project*
  rather than one page.
- `ProjectHistoryStore` + `ProjectHistoryControls` (`history/`):
  the header's Undo and Redo of the **displayed project's** history (Slice 41). The store is
  provided by the shell and bound to core's `OPERATION_HISTORY_REPORTER`, so every writer
  inside the workspace reports its receipts to it; it holds the server summary, the pending
  state that covers each write's owed re-read and a shared transition guard. It implements
  `RECEIPT_UNDO` for the component-owned toast; pure `history-feedback.ts` words every confirmation.
- `ProjectHeader`, `ProjectMoreMenu`, `ProjectDetailsDialog`, `ProjectArchiveConfirm`: the
  native menu, single-commit details draft and archive confirmation, with focus returned to More.
- `ProjectPageNavigation`: the column — pages, the root-name page-settings gear, the Work plus and work tree —
  placed beside the sidebar by one `:has()` rule. Its gear opens a native page-settings popover
  whose pending toggles retain focus.
- `WorkCreateDialog`: Name and an explicit live Parent for a new workstream, with draft retention
  on refusal. The shell supplies the callback; the workspace store uses the existing project create.
- `ProjectCanvas` + `ProjectPageStore`: one page's sections and shortcut placements in
  flow or grid, direct drag, contextual insertion, snapped resizing, inline naming and
  one-gesture removal (live rows cascade with their owner), removal feedback with Undo, plus canonical navigation to
  `#section-<id>`. Every canvas write reports its receipt to the header's history; the canvas
  retains the removal report for its receipt-specific toast Undo.
- `SECTION_REGISTRY` and the section types: Markdown, Task List,
  Progress, Reflections, Timeline, Recent Activity — each its own folder inside
  `ProjectSectionFrame`.
- The three root pages: `TodosPage`, `ArchivePage`, `ReflectionsPage`, each with its
  store over the matching derived read. Todos owns its own task rows and Delete writes;
  Todos and Archive link descendant owners to their header controls. After a committed
  Delete, Todos confirms with receipt Undo and root Archive access in its own toast;
  workstream Complete and Archive Restore use the same shared feedback slot.
- Shortcuts on a canonical page (Home or a workstream's Work): `ShortcutFrame` (read-only source content), `ShortcutPicker`,
  `ShortcutStore`.
- The canvas's `ReceiptToast`: removal acknowledgement and Undo, Open archive for a listed
  removal, Retry remove after an uncertain removal and Retry refresh after a committed write's
  read failed. The toast is docked in the content track with reserved space; shared `ToastSlot`
  keeps all confirmation surfaces mutually exclusive.

## Not responsible for

- Task rows and the task detail drawer — [tasks](../tasks/overview.md), used by the Task List
  section. Todos renders its own rows and store because it has a different projection and write
  lifecycle.
- The activity feed component — `features/activity`, reused by the Recent Activity
  section.
- Rules: which page accepts which section, where a write lands, what removal does —
  all refused or resolved by the host; the UI shows the answer
  ([domain](../../domain/overview.md)).

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)

The navigation column paints the pane plane; the project header, section frames and shortcut frames paint the same unblurred sheet plane.
