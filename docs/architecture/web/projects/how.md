# How the projects feature works

## Runtime flow

1. `ProjectWorkspaceShell` reads `projectId` and optional `pageKind` from the route,
   provides `ProjectWorkspaceStore`, and loads the project, its pages, progress and work
   tree. It resolves the page positively; a non-resolvable URL redirects to the canonical
   page carrying a notice in navigation state.
2. It renders `ProjectHeader` once and `ProjectPageNavigation` in the column, then
   mounts the registry's renderer for the page through `NgComponentOutlet` with a
   `computed()` inputs record whose callbacks are class-property arrows.
3. `ProjectCanvas` provides `ProjectPageStore`, which loads the page's sections and
   shortcut placements as one combined order, renders each section inside
   `ProjectSectionFrame` with the registry's content component, and each shortcut inside
   `ShortcutFrame`. Container sections provide their own row stores.
4. Canvas controls are available without a mode: grip drag and keyboard movement reorder
   placements, inline title edits report write results to the frame, resize handles snap
   to supported widths, and insertion points open `SectionCreateDialog`. The canvas keeps
   a placement ID as the insertion anchor and resolves its current position at submit;
   `ProjectPageStore.orderComplete` withholds insertion points and blocks move writes
   when Home's combined section/shortcut order could not be fully read. Writes go through
   the gateway behind the store's in-flight guards. A refused removal with
   `section_not_empty` details opens the existing cascade/reassign dialog. Every canvas write — section add, move,
   update and removal, and every shortcut placement write — runs through `reportedWrite`, which
   tells core's `OPERATION_HISTORY_REPORTER` the write began, what it committed (the response's own
   project and receipt) and that it ended; the canvas holds no receipt. `SectionRecoveryNotice`
   offers only what the header cannot: after a removal whose `archiveListed` is true, "Removed the
   Notes section. Undo is in the header." with **Open Archive**; after a repeated removal whose
   exact-actor receipt came back in `details`, that receipt is reported and the notice keeps Archive
   (an unknown verdict); after a committed write whose follow-up read failed, a read-only
   **Retry refresh**. A forward write whose read succeeded shows no notice. If a remove response is
   uncertain and a live frame has already removed the section, the store keeps the exact removal
   input and exposes an explicit **Retry remove**. Leaving the page/project clears the notice.
   Angular `@defer` loads the create dialog, removal dialog and recovery notice when needed; the
   Archive page loads `ArchivedRegion` after its read completes. These boundaries keep the
   eager route graph under the 1050 kB initial-bundle error ceiling.
5. **Undo and Redo** (Slice 41). The shell provides `ProjectHistoryStore` and binds
   `OPERATION_HISTORY_REPORTER` to it in `providers` (not `viewProviders`), so the page store, a
   task list inside a Home shortcut and the Todos, Archive and Reflections stores mounted through
   `NgComponentOutlet` all report to it; `project-workspace-shell.spec.ts` asserts that binding,
   because the core token's inert default would hide a wiring mistake. The shell calls
   `load(projectId)` from its project effect; Home ↔ other root pages cross route shapes and
   re-create the shell, so every such navigation starts in `loading`. The store:
   - reads the summary coalesced (one in flight, one queued), drops a read from an earlier
     generation (navigation, `prototype.reloaded`, destruction) and a lower `revision` of the held
     history, and moves to `unavailable` with a read-only Retry when a read fails;
   - re-reads on a frame naming the displayed project, any `isProjectRecordEvent` frame,
     `prototype.reloaded` (a new generation) and reconnect;
   - hands each write a handle bound to the generation it began in (a commit or end from before a
     navigation is ignored); a handle's `committed(report)` with a receipt from the held history, or
     while nothing is held, **owes a read requested after it** that reaches the receipt's revision
     (re-reading at most three times for it);
     a receipt naming another, known history — or a fresh read that still names another — sets
     "… was recorded in Kitchen's history." with an Open link (the name comes from the report or a
     `projects.get`); a handle that ends without its own commit owes a read too, because a transport
     error or 5xx may have committed. A removal notice withdraws itself once its section is back on
     the canvas. Both controls are unavailable while any write or owed read is
     pending;
   - runs one transition at a time with the held entry's `actionId` and the held `revision`,
     adopts the result's or a refusal's summary, words it through `history-feedback.ts`, and
     re-reads after a 404, a transport failure or `history_expired`. Content is reconciled by the
     transition's live frame; a late result after destruction (undoing the displayed page's enable
     sends the shell to Home) is dropped.
   `ProjectHistoryControls` renders two icon buttons with `aria-disabled` and a guarded click (never
   `disabled`), named by `historyControl`, projected into the header's actions cell — which moves to
   its own row below 40rem so the project name keeps its width; `ProjectHistoryFeedback` is the always-present polite
   region under the header's facts. `confirmArchive` stays on the project and `announce`s "X is
   archived. Undo is available here."; the More menu does not offer Archive on an archived project.
6. Live frames: progress re-reads on any frame naming the project; the record on
   `project.*`; sections through `refreshSections()` unless a write is in flight. A page action or
   transition frame is a `project.*` frame, so it reaches project-context refresh and page
   resolution with no new case: undoing the enable that created the displayed page, or disabling it,
   returns to Home with the existing explanation — without the re-enable offer, because there is no
   record left to switch on — while enabling or recreating one restores its tab and forces no
   navigation. Task/reflection
   Add and Add Undo/Redo frames also re-resolve section existence because the row operation may
   own an implicit container; the
   tree on `rootProjectId`. Root pages re-read their projection on the same frames. Since Slice 39
   the tree, Todos, Archive and Reflections **also** re-read on a project-record frame
   (`isProjectRecordEvent` from contracts) from any root: a cross-root reparent, or its Undo or Redo,
   publishes one frame naming the sub-project's new root, and the root it left would otherwise keep
   showing it. Archive's live re-read keeps its list on screen rather than flashing "Loading archive…".
   Every `projects.update` caller — the header's rename, status, date and archive, Todos completion,
   Archive reactivation, the progress setting — reads `project` from the `{ project, operation }`
   answer and reports the receipt to the header's history.
7. Following a Todos or Archive link to `#section-<id>` scrolls to the loaded frame,
   focuses its heading, and transiently expands a collapsed container.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `ProjectWorkspaceShell` | component | Both routes, header, page resolution | [API](../../../api/components/ProjectWorkspaceShell.html) |
| `ProjectWorkspaceStore` | injectable | Project-level state and writes | [API](../../../api/injectables/ProjectWorkspaceStore.html) |
| `ProjectPageNavigation` | component | The column; page toggles | [API](../../../api/components/ProjectPageNavigation.html) |
| `ProjectHeader`, `ProjectMoreMenu` | components | Header and its menu | [API](../../../api/components/ProjectHeader.html) |
| `PROJECT_PAGE_REGISTRY` | const | Navigable kinds → renderers | [API](../../../api/miscellaneous/variables.html#PROJECT_PAGE_REGISTRY) |
| `ProjectPageRenderer`, `ProjectPageRendererInputs` | interfaces | Renderer contract | [API](../../../api/interfaces/ProjectPageRenderer.html) |
| `ProjectCanvas` | component | One page's canvas, contextual editing and stable callback inputs | [API](../../../api/components/ProjectCanvas.html) |
| `ProjectPageStore` | injectable | Sections and placements of one page | [API](../../../api/injectables/ProjectPageStore.html) |
| `SectionRemovalDialog`, `SectionRemovalPrompt` | component / interface | Cascade or reassign | [API](../../../api/components/SectionRemovalDialog.html) |
| `ProjectHistoryStore` | injectable | The displayed project's summary, pending state, transitions and feedback; the reporter | [API](../../../api/injectables/ProjectHistoryStore.html) |
| `ProjectHistoryControls`, `ProjectHistoryFeedback` | components | Header Undo/Redo icons and their feedback line | [API](../../../api/components/ProjectHistoryControls.html) |
| `historyControl`, `transitionRefusalFeedback` | functions | Control names and refusal wording | [API](../../../api/miscellaneous/variables.html#historyControl) |
| `SectionRecoveryNotice`, `SectionRecoveryNoticeState` | component / interface | Open Archive, Retry remove and Retry refresh; no Undo | [API](../../../api/components/SectionRecoveryNotice.html) |
| `SECTION_REGISTRY`, `SectionDefinition` | const / interface | §29 | [API](../../../api/miscellaneous/variables.html#SECTION_REGISTRY) |
| `SectionContentComponent`, `SectionContentInputs` | interfaces | Content contract | [API](../../../api/interfaces/SectionContentComponent.html) |
| `ProjectSectionFrame` | component | §31's chrome | [API](../../../api/components/ProjectSectionFrame.html) |
| `SectionCreateDialog` | component | Section and Home shortcut creation; owns pending/error state | [API](../../../api/components/SectionCreateDialog.html) |
| `CanvasIcon`, `InsertionPoint`, `SectionResizeHandle` | components | Shared SVG canvas controls | [API](../../../api/components/CanvasIcon.html) |
| `gridInsertionGaps` | function | Sparse grid gaps that can fit a supported width | [API](../../../api/miscellaneous/variables.html#gridInsertionGaps) |
| `CanvasWriteResult` | type | Success or displayed canvas-write failure | [API](../../../api/miscellaneous/typealiases.html#CanvasWriteResult) |
| `TaskListSection`, `RichTextSection`, `SubProjectsSection`, `ProgressSection`, `ReflectionsSection`, `TimelineSection`, `RecentActivitySection` | components | The seven types | [API](../../../api/components/TaskListSection.html) |
| `ProgressStore`, `ReflectionsStore`, `SubProjectsStore`, `TimelineStore` | injectables | Per-section stores | [API](../../../api/injectables/ProgressStore.html) |
| `TodosPage`, `ArchivePage`, `ReflectionsPage` | components | Root pages | [API](../../../api/components/TodosPage.html) |
| `TodosPageStore`, `ArchivePageStore`, `ReflectionsPageStore` | injectables | Their stores | [API](../../../api/injectables/TodosPageStore.html) |
| `ArchivedRegion` | component | Presentational archive list; labels domain-supplied recovery metadata, two-step guidance and the placement Restore actually produces | [API](../../../api/components/ArchivedRegion.html) |
| `ShortcutFrame`, `ShortcutPicker`, `ShortcutStore` | components / injectable | Home shortcuts | [API](../../../api/components/ShortcutFrame.html) |

## Dependencies

**Depends on**

- [core](../core/overview.md) — `WORK_MANAGER_GATEWAY` (`projects`, `projectPages`,
  `sections`, `sectionShortcuts`, `history`, `progress`, `todos`, `archive`, `journal`,
  `reflections`, `timeline`), `LIVE_UPDATES`, `OPERATION_HISTORY_REPORTER` and `reportedWrite`,
  `PrototypeSettings` for the layout flags.
- [tasks](../tasks/overview.md) — `TaskListStore`, `TaskRow`, `TaskDetailDrawer` inside
  the Task List section and on the Todos page.
- `features/activity` — `ActivityFeed` and `ActivityStore` in the Recent Activity section.
- [contracts](../../contracts/overview.md) — `nameOf`, `SECTION_OWNERSHIP` (through the
  registry's `kind`), `NAVIGABLE_PAGE_KINDS`, `isRootProject`, and every shape.
- `@angular/cdk/drag-drop`.

**Depended on by**

- `ShellStore` in [core](../core/overview.md) shares the `project.*` frames but does not
  import this feature.
- [prototype-tooling](../prototype-tooling/overview.md) — the Design Lab's live panels
  render `ProjectSectionFrame` and the canvas with fixtures; `ProjectLayoutControl`
  writes `projectLayoutMode`.
- [testing](../../testing/overview.md) — the web, todos, archive and reflections e2e
  journeys, plus direct canvas editing.

## Invariants and lints

- **Registry lists are pinned** — `sections/registry.spec.ts` and
  `project-page-registry.spec.ts`; `registry.spec.ts` also fails when a type incurs the
  display-name cost without a `SECTION_DISPLAY_NAMES` entry, or when a registered type has no
  `SECTION_CAPABILITIES` declaration.
- **Archive lists what the domain projected.** `ArchivePageStore.items` passes the projection
  through unchanged; `ArchivedRegion` only words its `recovery` metadata, plus the one fact about
  the *operation* a row's button performs — that Restore appends to the end of the page.
- **Callback inputs have stable identity** — class-property arrows, `computed()` records.
- **Stores are guarded** on project, page and generation, and defer re-reads behind
  `pendingWrites`; a stale response after navigation is discarded.
- **The UI never decides a rule.** Where a write lands, whether a page accepts a kind,
  whether a removal is safe — the host answers; a refusal is shown, never softened.
- **Undo is the header's alone.** No surface other than `ProjectHistoryControls` offers Undo or
  Redo; the canvas reports receipts and never holds one. An explicit Retry remove uses the saved id
  and policy only after an uncertain response.
- **Every browser write reports**, through `reportedWrite` or `begin`/`committed`/end, with the
  project named by its **response**. A new write site that forgets leaves the header offering a stale
  step until the next frame.
- **No `#section-<id>` selector interpolation** — the canvas matches ids it loaded.
- **Tokens only** in every `.scss` here — the token lint.

## Commands

```bash
pnpm --filter web test -- projects      # the feature's specs
pnpm storybook                          # ProjectCanvas, ProjectHistoryControls, SectionRecoveryNotice, SectionCreateDialog, navigation, pages, shortcuts, archive list
pnpm e2e                                # project-history (header Undo/Redo), web, canvas editing, removal and section edit Undo, MCP, todos, archive, reflections
```

## Changing it

- **A new section type:** copy `sections/rich-text/` (a view) or `sections/tasks/` (a
  container). Implement `SectionContentComponent`; add one line to `SECTION_REGISTRY`;
  if it owns rows, the contracts map; a spec and, if it renders states worth seeing, a
  story. A view that needs data provides its own store at the content boundary.
- **A new root page kind:** the contract's `ProjectPage` kinds, a renderer implementing
  `ProjectPageRenderer`, one line in `PROJECT_PAGE_REGISTRY`, the host's derived read.
  There is no generic page builder (§80).
- **A new canvas write:** `ProjectPageStore` method with an optimistic paint inside the
  `pendingWrites` guard, the gateway member wrapped in `reportedWrite` with the response's own
  project, and specs that a live frame during the write does not overwrite the paint and that the
  write reports begin, commit and end.
- **A popup or frame that must preserve input on failure:** return a `CanvasWriteResult`
  from the store and translate its message at the callback boundary. `ShortcutPicker` reports
  its pending state to `SectionCreateDialog`, which blocks Back, Cancel and Escape until a
  shortcut write settles; success closes the dialog and refusal keeps the picker error visible.
  On entering shortcut mode, focus the persistent mode-switch control while sources load; the
  dialog's Tab trap recovers focus to an in-dialog control if the active element is not present.
- **Browser geometry:** add the assertion to `apps/e2e/canvas-editing.spec.ts`; unit
  specs cannot prove pointer hit-testing, touch behavior or the absence of layout shift.
- **The trap:** a page-scoped read that answers project-wide. Every read here names its
  page; the canvas once drew another page's container because one did not.
