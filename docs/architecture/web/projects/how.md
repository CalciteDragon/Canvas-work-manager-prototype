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
   `section_not_empty` details opens the existing cascade/reassign dialog. A successful
   explicit add, update, move or removal stores its server receipt in the current
   `ProjectPageStore` before refreshing; `supersedesReceipt` ignores a stale response — within one
   history by `revision`, across histories by arrival. `SectionUndoNotice` offers the operation's
   receipt action, typed refusal guidance,
   Archive access only for a removal whose result's `archiveListed` says Archive holds it, and a
   read-only refresh retry, including after a committed add or move whose follow-up read failed.
   An Undo response that lands after a newer receipt
   was captured reconciles without replacing that notice. Shortcut and Archive Restore receipts are
   deliberately **not** offered through the notice in this phase — persistent Undo/Redo header
   controls are later Stage C work — but the store unwraps their envelopes where it inserts,
   replaces or optimistically resizes a placement, and `undoResultMessage` names every new result
   kind explicitly — the two page kinds included — so a new union member can never be read as a
   section with a placement. A page receipt is never routed into this notice at all: §26's toggles
   live on `ProjectWorkspaceStore`, whose `writePage` awaits the write, then `readContext`, and
   handles a committed write and a failed read separately. Undo is a `history.transition` with the
   receipt's `historyId`, `actionId` and `revision`; `undoFailureNotice` maps the seven history
   reasons explicitly — `history_expired`, `history_retired` and not-found are terminal;
   `history_revision_stale` keeps the receipt at the summary's revision when its action is still
   the next Undo, and counts the Undo as landed (reconciling the canvas) when the summary names it
   as the next Redo; `history_not_next`, `history_conflict`, `history_blocked` and
   `history_unavailable` keep the receipt for a retry after a repair. `ReflectionsPageStore`
   captures the explicit container add's receipt by the same rule; its Undo refreshes the container
   and returns the page to the empty-container prompt, re-reading the container when a stale
   refusal shows the Undo already landed. Every repairable refusal leaves Undo enabled — whether an
   action can never succeed is the server's call, answered by retiring it. The notice stays Undo-only;
   Redo has no browser control until Stage C. The notice is fixed at the viewport's end
   corner rather than placed in flow, because each blur save, resize or move can offer one. If a remove
   response is uncertain and a live frame has already removed the section, the store keeps
   the exact removal input and exposes an explicit Retry remove. Neither path guesses
   retention or reconstructs inverse state. Leaving the page/project clears this local notice.
   Angular `@defer` loads the create dialog, removal dialog and Undo notice when needed (on the
   canvas and the Reflections page); the
   Archive page loads `ArchivedRegion` after its read completes. These boundaries keep the
   eager route graph under the 1050 kB initial-bundle error ceiling.
5. Live frames: progress re-reads on any frame naming the project; the record on
   `project.*`; sections through `refreshSections()` unless a write is in flight. A page action or
   transition frame is a `project.*` frame, so it reaches project-context refresh and page
   resolution with no new case: undoing the enable that created the displayed page, or disabling it,
   returns to Home with the existing explanation — without the re-enable offer, because there is no
   record left to switch on — while enabling or recreating one restores its tab and forces no
   navigation. Task/reflection
   Add and Add Undo/Redo frames also re-resolve section existence because the row operation may
   own an implicit container; the
   tree on `rootProjectId`. Root pages re-read their projection on the same frames.
6. Following a Todos or Archive link to `#section-<id>` scrolls to the loaded frame,
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
| `SectionUndoNotice`, `SectionUndoNoticeState` | component / interface | In-memory receipt action, typed refusal guidance and explicit recovery retries | [API](../../../api/components/SectionUndoNotice.html) |
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
  `sections`, `sectionShortcuts`, `undo`, `progress`, `todos`, `archive`, `journal`,
  `reflections`, `timeline`), `LIVE_UPDATES`, `PrototypeSettings` for the layout flags.
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
- **A removal receipt is a server capability, not local inverse data.** The notice holds only
  the public receipt for this canvas session. Its state clears on navigation, while an explicit
  Retry remove uses the saved id and policy only after an uncertain response.
- **No `#section-<id>` selector interpolation** — the canvas matches ids it loaded.
- **Tokens only** in every `.scss` here — the token lint.

## Commands

```bash
pnpm --filter web test -- projects      # the feature's specs
pnpm storybook                          # ProjectCanvas, SectionUndoNotice, SectionCreateDialog, navigation, pages, shortcuts, archive list
pnpm e2e                                # web, canvas editing, removal and section edit Undo, MCP, todos, archive, reflections
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
  `pendingWrites` guard, the gateway member, and a spec that a live frame during the
  write does not overwrite the paint.
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
