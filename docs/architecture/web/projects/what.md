# What the projects feature is made of

## Structure

```mermaid
flowchart TB
  shell["ProjectWorkspaceShell<br/>both project routes; header once; page resolution"]
  wstore["ProjectWorkspaceStore<br/>record, progress, writes, work tree"]
  nav["ProjectPageNavigation<br/>pages, toggles, work tree (ProjectWorkItem)"]
  header["ProjectHeader → ProjectMoreMenu"]
  reg["PROJECT_PAGE_REGISTRY<br/>home · todos · archive · reflections → renderer"]
  subgraph renderers["Page renderers (ProjectPageRenderer, callback inputs)"]
    canvas["ProjectCanvas<br/>Home and work pages"]
    todos["TodosPage"]
    archive["ArchivePage → ArchivedRegion"]
    refl["ReflectionsPage"]
  end
  pstore["ProjectPageStore<br/>one page's sections + placements"]
  tstore["TodosPageStore"]
  astore["ArchivePageStore"]
  rstore["ReflectionsPageStore"]
  frame["ProjectSectionFrame<br/>chrome: drag, title, collapse, settings, size, duplicate, remove"]
  sreg["SECTION_REGISTRY"]
  subgraph sections["Section contents (SectionContentComponent)"]
    rt["RichTextSection"]
    tl["TaskListSection → TaskListStore (tasks)"]
    sp["SubProjectsSection → SubProjectsStore"]
    pg["ProgressSection → ProgressStore"]
    rf["ReflectionsSection → ReflectionsStore, ReflectionComposer"]
    tm["TimelineSection → TimelineStore"]
    ra["RecentActivitySection → ActivityStore (activity)"]
  end
  sc["ShortcutFrame (read-only source) · ShortcutPicker · ShortcutStore"]
  dialog["SectionRemovalDialog"]
  shell --> wstore
  shell --> nav
  shell --> header
  shell --> reg --> renderers
  canvas --> pstore
  todos --> tstore
  archive --> astore
  refl --> rstore
  canvas --> frame --> sreg --> sections
  canvas --> sc
  canvas --> dialog
```

## Opening a root's Home

```mermaid
sequenceDiagram
  participant R as Router
  participant S as ProjectWorkspaceShell
  participant W as ProjectWorkspaceStore
  participant N as ProjectPageNavigation
  participant C as ProjectCanvas
  participant P as ProjectPageStore
  R->>S: /projects/:id (or /pages/:kind)
  S->>W: load(projectId): record, pages, progress, tree
  S->>S: resolve page: root? navigable kind? enabled? renderable? else fallback + notice
  S->>N: pages, enabled flags, tree
  S->>C: mount renderer via NgComponentOutlet with ProjectPageRendererInputs
  C->>P: load(projectId, pageId): sections + shortcut placements, one combined order
  P-->>C: placements → frames (sections) and ShortcutFrames
  Note over W,P: live — progress on any frame for this project, record on project.*, sections via refreshSections(), tree on rootProjectId
```

## Inventory

| Part | Path | Role |
|---|---|---|
| `ProjectWorkspaceShell` | `project-workspace-shell.ts` | Both routes; header; page resolution and fallback notice; breadcrumbs for a subproject |
| `ProjectWorkspaceStore`, `WorkTreeNode` | `project-workspace-store.ts` | Project-level state and writes |
| `ProjectPageNavigation`, `ProjectWorkItem` | `project-page-navigation.ts`, `project-work-item.ts` | The column and its rows |
| `ProjectHeader`, `ProjectMoreMenu` | `project-header.ts`, `project-more-menu.ts` | Name, status, progress, target date; rename/status/date/archive |
| `PROJECT_PAGE_REGISTRY`, `ProjectPageDefinition` | `project-page-registry.ts` | Navigable kinds → renderer and label |
| `ProjectPageRenderer`, `ProjectPageRendererInputs` | `project-page-contract.ts` | What every renderer receives |
| `ProjectCanvas` | `project-canvas.ts` | One page's canvas: controls row, drag-drop, removal dialog, arrival at `#section-<id>` |
| `ProjectPageStore`, `SectionRemovalPrompt` | `project-page-store.ts` | Sections and placements of one page; the typed refusal |
| `SectionRemovalDialog` | `section-removal-dialog.ts` | Cascade or reassign, containers by name |
| `TodosPage`, `TodosPageStore` | `pages/todos-page*.ts` | §34's chronology with inline completion and canonical links |
| `ArchivePage`, `ArchivePageStore`, `ArchivedRegion` | `pages/archive-page*.ts`, `archived-region/` | §31's root-wide projection and restores |
| `ReflectionsPage`, `ReflectionsPageStore` | `pages/reflections-page*.ts` | §36's page, the completed-work picker, the journal |
| `SECTION_REGISTRY`, `SectionDefinition` | `sections/registry.ts` | §29 |
| `SectionContentComponent`, `SectionContentInputs` | `sections/section-contract.ts` | What every content component receives |
| `ProjectSectionFrame` | `sections/section-frame/` | §31's chrome, with the Name field in its inspector |
| Seven section types | `sections/{rich-text,tasks,sub-projects,progress,reflections,timeline,activity}/` | Content components and their stores |
| `ShortcutFrame`, `ShortcutPicker`, `ShortcutStore` | `shortcuts/` | §27's Home shortcuts |
