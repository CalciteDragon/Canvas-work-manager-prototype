# How the projects feature works

The persistent end action uses a static `InsertionPoint` host after the drop list, projecting
the labelled ghost button. Its end identity remains available to existing browser journeys;
only before/gap points paint insertion overlays.

`ArchivePageStore` passes the root's ready-only projection to `ArchivedRegion`. The component
words the supplied origin, cause and recovery counts without determining eligibility. Restore
uses the canonical project, section, task or reflection write and then re-reads; independent
archived children become visible only once their owner has returned. `ArchivePageStore.error()` is
an `ArchiveError` (a `Failure` with a `kind`), one of four states in precedence: a committed
restore whose re-read failed ("Restored “X”, but Archive couldn’t refresh.", Retry refresh), a
refused restore ("Couldn’t restore “X”. The archive may have changed.", or for `unreachable`
"Couldn’t reach your workspace, so “X” may not have been restored.", Try again), `stale` (a failed
read over a list on screen: "This archive may be out of date.", polite) and `load` (a failed read
with nothing on screen, `readFailure(…, 'this archive')`). Any of them pauses every Restore
(`restorePaused`, distinct from the archived-project `restoreBlocked` note) until a read of the
same root succeeds, so a stale row is never written twice. A failed read never displaces a held
write state, except that Try again hands a refusal over to its own read, which turns stale if it
fails. One `FailureMessage` renders all four, so its button keeps focus as the state changes; it is
busy (`retryPending()`) while Try again reads. A quiet live re-read and Try again (quiet when a
list is on screen) keep the message visible; a reconnect reads non-quietly and
shows "Loading archive…" while Restore stays paused; a prototype reload clears the list and error, even
with a Restore pending, and its read supersedes that Restore's refresh. A subproject's chosen status is keyed by id and survives the replacement projection;
each option binds `[selected]`, because a `[value]` on the select runs before its `@for` options exist.

## Runtime flow

Section content receives `sourceLink` alongside `readOnly`: canonical frames pass `null`,
shortcut frames pass the source route and `#section-<id>` fragment, and Task List shortcut rows
use it for title navigation. Shortcut headings explain that editing happens at the source.
The picker groups identities by owner and page. Opening Preview mounts that source's registry
component with read-only inputs, stable no-op callbacks and `sourceLink: null`; content reads use
the viewer's gateway grants and failures remain inside the disclosure while Add stays available.
Only the open Preview mounts content, so source discovery never reads owned rows.

`ShortcutFrame.name` and the shortcut branch of `ProjectCanvas.placementName` call contracts'
`shortcutNameOf(source, sourceProjectName)`. Untitled sources gain their owning project in
parentheses, while a title override stays alone. The same name reaches frame controls, resize
handles, insertion labels and keyboard move announcements. Local sections still use `nameOf`.
The frame follows current resolved identity; the header displays the server's captured history
label, so an owner rename does not rewrite older steps.

The root-name gear declaratively opens a root-scoped auto popover. Its toggle event keeps
settingsOpen in sync, opening focuses the first enabled toggle, and navigation or a root change
closes it. Escape or the gear restores the gear; outside dismissal preserves the clicked control.
Pending toggles use aria-disabled and reset refused native state so the pressed toggle keeps
focus through settlement. The Work plus requests the shell's deferred `WorkCreateDialog`, with an
inner `@if` so closing destroys its draft. Parent options flatten the live tree, root first;
completed parents are marked. A disappearing parent resets to the root with a named polite note,
deferred until a pending submit settles. The shell closes on `store.loading()` or a root change;
chosen closes focus the visible plus or the narrow column toggle after rendering.
`ProjectWorkspaceStore.createWorkstream` trims and validates the draft, guards a single flight per
load generation, reports the child's creation receipt and requests a quiet context read only in
the generation that started it. Creation keeps the URL and uses the header's existing cross-owner
history feedback. The user-facing `subproject` noun is Workstream; stored identifiers stay intact.
The column itself is deferred inside the loaded-root branch, alongside the deferred create dialog;
the loaded context triggers it immediately. Loading reserves the navigation grid track; a failed
chunk keeps that track and offers Reload page at the current URL. This keeps the initial graph
under the unchanged 1050 kB error ceiling (the final measurement is in the Slice 60 record).

Todos task checkboxes complete or reopen to `todo` through the canonical task gateway. Reopen
clears `completedAt` optimistically and failure restores the exact item; generation/disposal
guards discard late responses, and a queued live read runs after the shared write slot settles.
Pending toggles use `aria-disabled` and the handler resets native checked state from the store
before its first await, then reconciles again from the current row after settlement so an immediate
refusal cannot leave the browser's own state changed. Cancelled tasks have no toggle, and
workstreams retain one-way Complete. A failed complete or reopen is said on its row
(`rowErrors`, `[data-todo-row-error]`, linked from the control by `aria-describedby`) as
"Couldn’t complete “X”. Try again." with the reason; that row's next attempt or a load clears it.
Only a failed Delete uses the page alert `[data-todo-write-error]` (Slice 75).

Todos captures the task title and owner before optimistic Delete removes the row. A committed
answer opens its own “Archived …” toast with receipt Undo and Open archive, even after the final
row leaves. Workstream Complete opens “Completed …” with Undo and Open owner. A failed write
retains the existing error/focus path. Receipt feedback closes on a later write, navigation or
prototype generation change. Focus enters the toast only when the acted control or body owned
focus, and dismissal falls back to a surviving row control or the heading.

1. `ProjectWorkspaceShell` reads `projectId` and optional `pageKind` from the route,
   provides `ProjectWorkspaceStore`, and loads the project, its pages, progress and work
   tree. It resolves the page positively; a non-resolvable URL redirects to the canonical
   page carrying a notice in navigation state.
2. It renders `ProjectHeader` once and `ProjectPageNavigation` in the column, then
   mounts the registry's renderer for the page through `NgComponentOutlet` with a
   `computed()` inputs record whose callbacks are class-property arrows. While narrow, the
   column's `linkSelected` collapses the column and records the link's URL in the root-scoped
   `ProjectColumnFocusRequest`. An effect honours it once no navigation is in flight, the store
   is not loading and §68 is not redirecting, and only if `Router.url` still equals it: then the
   toggle — or "Project unavailable" / "Creation undone", or a failed read's Try again — takes
   focus after the render. A §68
   fallback redirect moves the request to its target; any other winning navigation drops it,
   and the request itself drops on any `NavigationEnd` elsewhere, so leaving for a route with no
   project shell cannot leave it to fire on a later visit
   ([why](../../../decisions/2026-09-phone-navigation-drawer.md)).
3. `ProjectCanvas` provides `ProjectPageStore`, which loads the page's sections and
   shortcut placements as one combined order, renders each section inside
   `ProjectSectionFrame` with the registry's content component, and each shortcut inside
   `ShortcutFrame`. Container sections provide their own row stores. The shell sets
   `shortcutsAllowed` for the rendered project's canonical page — a root's Home or, since
   Slice 65, a workstream's Work canvas — and passes the tree's root as the `rootProjectId`
   renderer input, which the canvas hands to `ProjectPageStore.load`. Every renderer declares
   `rootProjectId` because `NgComponentOutlet` sets every key; the derived pages ignore it. The
   store's shortcut live filter compares a frame's `rootProjectId` with that root, not with the
   canvas's project — on a Work canvas the two differ, and comparing the project silently missed
   every same-root change ([why](../../../decisions/2026-10-work-canvas-shortcut-destinations.md)).
   The content contract no longer carries a hierarchy-change callback. The canvas retains the
   page renderer's callback input but does not call it; pages still use theirs. Timeline receives
   `projectHierarchyRevision` to refresh its dated hierarchy after project writes.
4. Canvas controls are available without a mode: grip drag and keyboard movement reorder
   placements, inline title edits report write results to the frame, resize handles snap
   to supported widths, and insertion points open `SectionCreateDialog`. The canvas keeps
   a placement ID as the insertion anchor and resolves its current position at submit;
   `ProjectPageStore.orderComplete` withholds insertion points and blocks move writes
   when a canonical page's combined section/shortcut order could not be fully read. Writes go through
   the gateway behind the store's in-flight guards. One remove action sends only the section id;
   the domain cascades live owned rows and the canvas has no policy dialog. Every canvas write — section add, move,
   update and removal, and every shortcut placement write — runs through `reportedWrite`, which
   tells core's `OPERATION_HISTORY_REPORTER` the write began, what it committed (the response's own
   project and receipt) and that it ended. The canvas keeps the removal report for its
   component-owned `ReceiptToast`. Both listed and unlisted removals confirm; only a listed
   removal offers Open archive. An exact-actor repeated-removal receipt is reported and can offer
   Undo. A failed follow-up read offers read-only Retry refresh; an uncertain removal retains its
   exact id for explicit Retry remove with an exempt write handle. Live reads never repeat writes.
   Undo begins as an aria-disabled saving action until its owed summary read settles. Focus moves
   into the toast only from body or the removed control, and Undo morphs it in place before a
   bounded restored-heading handoff. New writes, navigation and reloads close it. Angular `@defer`
   loads the creation dialog; Archive loads `ArchivedRegion` after its read completes.
5. **Undo and Redo** (Slice 41). The shell provides `ProjectHistoryStore` and binds
   `OPERATION_HISTORY_REPORTER` to it in `providers` (not `viewProviders`), so the page store, a
   task list inside a shortcut and the Todos, Archive and Reflections stores mounted through
   `NgComponentOutlet` all report to it; `project-workspace-shell.spec.ts` asserts that binding,
   because the core token's inert default would hide a wiring mistake. The shell calls
   `load(projectId)` from its project effect; Home ↔ other root pages cross route shapes and
   re-create the shell, so every such navigation starts in `loading`. The store:
   - reads the summary coalesced (one in flight, one queued), drops a read from an earlier
     generation (navigation, `prototype.reloaded`, destruction) and a lower `revision` of the held
     history, and moves to `unavailable` when a read fails — with a read-only Retry, except after
     a `not_found` answer, which a second read cannot change;
   - re-reads on a frame naming the displayed project, any `isProjectRecordEvent` frame,
     `prototype.reloaded` (a new generation) and reconnect;
   - hands each write a handle bound to the generation it began in (a commit or end from before a
     navigation is ignored); a handle's `committed(report)` with a receipt from the held history, or
     while nothing is held, **owes a read requested after it** that reaches the receipt's revision
     (re-reading at most three times for it);
     a receipt naming another known history, or a fresh read that still names another, opens a
     cross-owner toast with Undo and Open owner unless the report has `feedback: 'own'`. Its name
     comes from the report or `projects.get`. An uncommitted handle owes a read too because a
     transport error or 5xx may have committed. Both controls stay unavailable through owed reads;
   - runs one transition at a time with the held entry's `actionId` and the held `revision`,
     adopts the result's or a refusal's summary, words it through `history-feedback.ts`, and
     re-reads after a 404, a transport failure or `history_expired`. Content is reconciled by the
     transition's live frame; a late result after destruction (undoing the displayed page's enable
     sends the shell to Home) is dropped.
   `ProjectHistoryControls` renders two icon buttons with `aria-disabled` and a guarded click (never
   `disabled`), named by `historyControl`, projected into the header's actions cell — which moves to
   its own row below 40rem so the project name keeps its width, and there both that row and the
   Undo/Redo pair wrap, so at 375 px the controls stay inside the header box instead of
   overflowing (Slice 45). Since Slice 58 the global sidebar is a drawer there, so the header has
   the full width.
   The accessible `Undo: …` and `Redo: …` names use the server summary's captured action label;
   section rename, Markdown source, collapse and resize now name their edit without a browser mapper;
   labels stored before version 6 keep their Rich Text wording.
   Transition results and refusals flow into the shell's `ReceiptToast`; project archive confirms
   “Archived {name}.” with receipt Undo after the modal closes. The More menu does not offer
   Archive on an archived project.
   The shell also binds `RECEIPT_UNDO` to this store. Same-history receipt Undo uses the held
   revision; cross-owner Undo reads and validates the owner's next step, then transitions with
   that read's revision without adopting its summary. Both paths share the header's transition
   guard and return feedback to the acting toast without setting shell feedback. Cross-owner
   failures distinguish stale/blocked, denied permission, missing action and uncertain response.
   Public `writeSequence` and `generation` signals withdraw stale toasts; Retry remove's exempt
   handle leaves the sequence unchanged.
6. Live frames: progress re-reads on any frame naming the project; the record on
   `project.*`; sections through `refreshSections()` unless a write is in flight. A page action or
   transition frame is a `project.*` frame, so it reaches project-context refresh and page
   resolution with no new case: undoing the enable that created a displayed page other than Archive,
   or disabling it, returns to Home with the existing explanation — without the re-enable offer, because there is no
   record left to switch on — while enabling or recreating one restores its tab and forces no
   navigation. Archive remains rendered and only its navigation visibility changes. Task/reflection
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
8. A descendant row on root Todos or Archive derives the owner route and name from its
   projection, separate from its content link and Restore. `#history-controls` reaches the
   existing header group. The shell checks the current route fragment and loaded project after
   each render until that group exists, then scrolls and focuses it once for that URL. Leaving
   the fragment resets the arrival guard, so a later `#section-…` cannot regain history focus.
   `ProjectHistoryStore` still reads only the displayed project's actor-scoped summary.

Creation recovery uses the same project route. A not-found project read clears the record and sets
`missing`; the caller's history summary shows the recovery section only when its next Redo is
`project.add`. The section uses the normal history controls and feedback. Creation Undo/Redo frames
reload project context once per history revision, so a root tree updates after the project is
removed or restored without another history read. An actor without that anchored summary continues
to see *Project unavailable*. If the history summary itself is unavailable, that state offers a
generic Retry for the summary read; it does not expose an Undo/Redo entry until the read confirms it
([decision](../../../decisions/2026-09-project-creation-history.md)).

`ProjectWorkspaceStore.error()` is the project read's `Failure`
([decision](../../../decisions/2026-10-failures-speak-product-words.md)). Not-found keeps the
*Project unavailable* heading over "This project isn’t available." Any other failure replaces the
page with "Couldn’t load this project." and Try again (`retry()`), with the reason under Details.
A re-read of the same project keeps the failure on screen, its Try again busy, until the read
answers; loading another project clears it at once.

`ProjectPageStore` keeps its two reads' failures apart from its writes' (§19). `error()` is the
sections read's `Failure` ("Couldn’t load this page.", Try again through `retry()`, kept busy
while the same page re-reads). `shortcutsError()` is the shortcuts read's: "Couldn’t load all of
this page’s sections, so adding and moving are paused.", with Try again through
`retryShortcuts()` (`shortcutsRetryPending()` while it runs). Only a successful shortcuts read
clears it; `sectionError()` holds write failures only, so an unrelated write cannot. Writes and
drag stay gated by `orderComplete()`. "Loading canvas…" is a `.state-message--loading` line with
`aria-busy`; nothing else says the order is incomplete. A failed removal's `FailedSectionRemoval`
carries a `Failure`, and the canvas toast binds its reason as `detail`, the toast's Details.

Section bodies say their own read failures the same way, in place of their empty sentence, with
Try again kept busy while the same section re-reads, and cleared by the next successful read,
quiet or loud: `TimelineStore` ("this timeline"), `ActivityStore` ("recent activity"),
`ProgressStore` ("progress") and `ReflectionsStore` ("this journal"); the Task List's is in
[tasks](../tasks/how.md). Each keeps its read failure apart from its writes (§19).
`ProgressStore.writeError()` is the formula write's ("Couldn’t change how progress is measured.
Try again.", beside the controls, the result kept); `stale()` is a failed re-read after a write
("This progress may be out of date.") whose Try again, `retryStale()`, is quiet.
`ReflectionsStore.createError()` shows on the composer and `editError()` beside the edit form
(raw text until Stage 4); a successful write after a failed read re-reads in full. A shortcut
frame's body is its source section's component, so it inherits these.

The Todos and Reflections pages do the same for their reads (`readFailure(…, 'this list')`;
the Reflections page's journal, completed work and container reads each with their own Try
again). A failed quiet re-read over content on screen is the polite stale notice, "This list may be
out of date." or "This journal may be out of date.", in a `role="status"` region mounted always,
with a quiet Try again (`retryRefresh()`, busy as `refreshPending()`). On Todos a held load failure
is never covered by a stale notice. On the Reflections page a save whose re-read failed is
`savedUnrefreshed()`, "Saved, but this journal couldn’t refresh." with Retry refresh; it outranks
stale, and a later failed quiet read keeps it. The container add's failure is
`addContainerError()`, apart from the container read's `containerError()`.

MarkdownSection is an eager shell with a deferred body and escaped source placeholder.
`placeholderTextOf` simplifies the placeholder for converted prose: it drops a backslash before
ASCII punctuation or a line break and the `&#32;`/`&#9;`/`&#13;` references the conversion writes,
so the escapes do not flash before the body renders. It is display-only, not a decoder.
The frame supplies a stable `saveConfig(id, config): Promise<boolean>` callback through
`SectionContentInputs`; the canvas delegates to `ProjectPageStore.updateConfig`. Shortcuts
pass a false-returning no-op. The body mounts a fresh `MarkdownSourceEditor` for each Edit;
Save replaces the whole config after an awaited result, while Cancel and unchanged Save write
nothing. A failed Save keeps the draft, and pending protects it from further edits or dismissal.
A live source update keeps the draft and announces replacement; unreadable config blocks Save
and shows only the guidance note. `MarkdownConfigSchema` comes from contracts, where the domain
enforces it on every write, so only a hand edit, or Undo/Redo replaying state recorded before Slice 64,
can store an unreadable config
([decision](../../../decisions/2026-10-section-config-validated-on-write.md)).
Successful Save and Cancel restore focus to Edit. Preview renders only the local draft.

**Accessible names and state.** Timeline uses `.object-row` over shared subgrid columns.
Task titles link to their owning section and workstream titles to their project; project and
milestone rows are static. Reversed source dates are explained inline. There is no selection
or expanded detail. A read-only picker Preview has `sourceLink: null` and suppresses navigation;
a shortcut retains the item links. A Progress bar is named from what its frame displays: each frame provides
`SECTION_FRAME_NAME` (`nameOf` or `shortcutNameOf`) in its own `providers`, and outlet content
inherits it. The bar appends "progress" unless the name already says it, never uses the frame's
heading's interactive state, and is described by its own summary through a per-instance id. The Reflections composer's prompt select and the
Reflections page's subject picker carry visible `.control-label`s ("Prompt", per-instance id;
"Subject"); the title and body stay named by their placeholders. Each shortcut picker Add is named by
its row's identity ("Add {name}, {breadcrumb} · {page}"), because a source carries no title for
`shortcutNameOf`.

## Key symbols

**Section chrome (slice 76).** Plain `[data-section-title]` and `[data-shortcut-title]`
headings name their regions and remain the create/reveal focus targets. The section's Rename
tool opens a selected current name; unchanged saves write nothing. A title click requires a
preceding mouse or pen pointerdown. `toolbarKeydown` handles Left/Right/Home/End;
`toolbarFocusin` makes any focused tool the one Tab stop. Move uses Up/Down only, and the
canvas restores its focus after successful and refused keyboard moves.

The canvas supplies rest opacity to tools and end resize, with start resize hidden until
item hover/focus. Insertion marks own a full-plus button box and show a line only on their own
hover/focus. Add a section is a sibling after the drop list; `sorting` suspends it and the
marks. End resize reaches `--space-4 / 2` into the gap and `--space-4` into frame padding;
start keeps its original straddle. Narrow layouts still hide gap marks and resize handles.

`ProjectPageStore` reapplies pending `collapsed` and `columnSpan` fields in `setCanvas`,
including every `replaceSection` and `replaceShortcut`. Collapse records history normally,
but paints before the response. `collapsePending` and `collapseErrors` are keyed by placement
id and passed to frames. Refusals restore the confirmed field. The gateway codes
`unreachable`, `internal_error` and `invalid_response` also owe one quiet read. A read clears
an error only if it confirms the requested collapse value; the next toggle, load or generation
clears it too. The frame's alert describes Collapse.

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `ProjectWorkspaceShell` | component | Both routes, header, page resolution | [API](../../../api/components/ProjectWorkspaceShell.html) |
| `ProjectWorkspaceStore` | injectable | Project-level state and writes | [API](../../../api/injectables/ProjectWorkspaceStore.html) |
| `ProjectPageNavigation` | component | The column; page toggles | [API](../../../api/components/ProjectPageNavigation.html) |
| `WorkCreateDialog` | component | Workstream draft, explicit parent, pending/refusal and modal focus | [API](../../../api/components/WorkCreateDialog.html) |
| `WorkCreateParent` | interface | Live parent option view state | [API](../../../api/interfaces/WorkCreateParent.html) |
| `ProjectHeader`, `ProjectMoreMenu` | components | Header and its menu | [API](../../../api/components/ProjectHeader.html) |
| `PROJECT_PAGE_REGISTRY` | const | Navigable kinds → renderers | [API](../../../api/miscellaneous/variables.html#PROJECT_PAGE_REGISTRY) |
| `ProjectPageRenderer`, `ProjectPageRendererInputs` | interfaces | Renderer contract | [API](../../../api/interfaces/ProjectPageRenderer.html) |
| `ProjectCanvas` | component | One page's canvas, contextual editing and stable callback inputs | [API](../../../api/components/ProjectCanvas.html) |
| `ProjectPageStore` | injectable | Sections and placements of one page | [API](../../../api/injectables/ProjectPageStore.html) |
| `ProjectHistoryStore` | injectable | The displayed project's summary, pending state, transitions and feedback; the reporter | [API](../../../api/injectables/ProjectHistoryStore.html) |
| `ProjectHistoryControls` | component | Header Undo/Redo icons; results go to the shell toast | [API](../../../api/components/ProjectHistoryControls.html) |
| `historyControl`, `transitionRefusalFeedback` | functions | Control names and refusal wording | [API](../../../api/miscellaneous/variables.html#historyControl) |
| `SectionRecoveryNoticeState` | interface | Removal report and recovery state consumed by the canvas toast | [API](../../../api/interfaces/SectionRecoveryNoticeState.html) |
| `SECTION_REGISTRY`, `SectionDefinition` | const / interface | §29 | [API](../../../api/miscellaneous/variables.html#SECTION_REGISTRY) |
| `SectionContentComponent`, `SectionContentInputs` | interfaces | Content contract | [API](../../../api/interfaces/SectionContentComponent.html) |
| `ProjectSectionFrame` | component | §31's chrome | [API](../../../api/components/ProjectSectionFrame.html) |
| `SectionCreateDialog` | component | Section and shortcut creation; owns pending/error state | [API](../../../api/components/SectionCreateDialog.html) |
| `InsertionPoint`, `SectionResizeHandle` | components | Canvas insertion and resize controls; their marks come from the shared `Icon` | [API](../../../api/components/InsertionPoint.html) |
| `toolbarKeydown`, `toolbarFocusin` | functions | Roving toolbar movement and active tool on any focus entry | [API](../../../api/miscellaneous/functions.html#toolbarKeydown) |
| `gridInsertionGaps` | function | Sparse grid gaps that can fit a supported width | [API](../../../api/miscellaneous/variables.html#gridInsertionGaps) |
| `CanvasWriteResult` | type | Success or displayed canvas-write failure | [API](../../../api/miscellaneous/typealiases.html#CanvasWriteResult) |
| `TaskListSection`, `ProgressSection`, `ReflectionsSection`, `TimelineSection`, `RecentActivitySection` | components | The five registered types beside Markdown | [API](../../../api/components/TaskListSection.html) |
| `MarkdownSection`, `MarkdownSectionBody` | components | Eager shell, deferred source rendering and awaited authoring | [API](../../../api/components/MarkdownSection.html) |
| `placeholderTextOf` | function | Display-only simplification of escaped source for the eager placeholder | [API](../../../api/miscellaneous/variables.html#placeholderTextOf) |
| `MarkdownSourceEditor` | component | Presentational draft, Preview and Save/Cancel requests | [API](../../../api/components/MarkdownSourceEditor.html) |
| `ProgressStore`, `ReflectionsStore`, `TimelineStore` | injectables | Per-section stores | [API](../../../api/injectables/ProgressStore.html) |
| `TodosPage`, `ArchivePage`, `ReflectionsPage` | components | Root pages | [API](../../../api/components/TodosPage.html) |
| `TodosPageStore`, `ArchivePageStore`, `ReflectionsPageStore` | injectables | Their stores | [API](../../../api/injectables/TodosPageStore.html) |
| `ArchivedRegion` | component | Presentational archive list; labels domain-supplied recovery metadata, two-step guidance and the placement Restore actually produces | [API](../../../api/components/ArchivedRegion.html) |
| `ShortcutFrame`, `ShortcutPicker`, `ShortcutStore` | components / injectable | Shortcuts on Home and Work canvases | [API](../../../api/components/ShortcutFrame.html) |

## Dependencies

**Depends on**

- [core](../core/overview.md) — `WORK_MANAGER_GATEWAY` (`projects`, `projectPages`,
  `sections`, `sectionShortcuts`, `history`, `progress`, `todos`, `archive`, `journal`,
  `reflections`, `timeline`), `LIVE_UPDATES`, `OPERATION_HISTORY_REPORTER`, `RECEIPT_UNDO`,
  `ReceiptToast` and `reportedWrite`,
  `PrototypeSettings` for the layout flags and `SHELL_NARROW_QUERY` for task sheet selection.
- [tasks](../tasks/overview.md) — `TaskListStore`, `TaskRow`, `TaskDetailDrawer` inside
  the Task List section; `TaskDrawerCoordinator` provides shell-scoped selection ownership.
  Todos owns its separate task row and store.
- `shared/lifts` — `LiftFocus`, `LiftStack` and `menuKeys` for focus, one-open ownership
  and menu keyboard movement; no transport or domain dependency.
- `shared/feedback` — presentational `Toast` and root `ToastSlot` for one confirmation, timer,
  navigation dismissal and modal suppression; no feature or core-store dependency.
- `features/activity` — `ActivityFeed` and `ActivityStore` in the Recent Activity section. A row
  that arrives later fades in; its growth above a working Task List is what `ScrollHold` holds.
- [contracts](../../contracts/overview.md) — `nameOf`, `shortcutNameOf`, `SECTION_OWNERSHIP` (through the
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
- **Receipt Undo cites exactly the reported step.** The toast removes Undo when the held step
  changes or becomes blocked. Cross-owner transitions never adopt a foreign summary. Header and
  receipt transitions exclude each other. An explicit Retry remove uses the saved id after an
  uncertain response.
- **Every browser write reports**, through `reportedWrite` or `begin`/`committed`/end, with the
  project named by its **response**. A new write site that forgets leaves the header offering a stale
  step until the next frame.
- **No `#section-<id>` selector interpolation** — the canvas matches ids it loaded.
- **Tokens only** in every `.scss` here — the token lint.

## Commands

```bash
pnpm --filter web test -- projects      # the feature's specs
pnpm storybook                          # ProjectCanvas, ProjectHistoryControls, Toast, SectionCreateDialog, navigation, pages, shortcuts, archive list
pnpm e2e                                # project-history (header Undo/Redo), web, canvas editing, removal and section edit Undo, MCP, todos, archive, reflections
```

## Changing it

- **A new section type:** copy `sections/markdown/` (a view) or `sections/tasks/` (a
  container). Implement `SectionContentComponent`; add one line to `SECTION_REGISTRY`;
  declare its recovery capability in contracts (and `proseKey` for config prose); a spec and, if it renders states worth seeing, a
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
  A successful create resolves `{ ok: true, placementId }`, and closing the dialog scrolls that
  section or shortcut to its top and focuses its heading (`[data-section-title]` or
  `[data-shortcut-title]`, both `tabindex="-1"`) instead of returning focus to the insertion
  point (Slice 75). A cancel, or a create that landed after the page changed and so names no
  placement, returns focus to the opener as before.
  On entering shortcut mode, focus the persistent mode-switch control while sources load; the
  dialog's Tab trap recovers focus to an in-dialog control if the active element is not present.
- **Layout that moves the scroll:** `ScrollHold` (`canvas-chrome/scroll-hold.ts`) is the one
  mechanism. It keeps the working placement (the one holding focus, or the last one pressed) still
  while placements above it change height, lets any scroll since its last check stand as the new
  baseline the moment its `scroll` event fires, and holds nothing at offset 0, off screen or mid-drag. The canvas host sets
  `overflow-anchor: none` so native anchoring never corrects the same growth too. A reveal that
  scrolls (a quick-added row, a created placement) is a scroll like any other and is not undone.
- **Browser geometry:** add the assertion to `apps/e2e/canvas-editing.spec.ts`; unit
  specs cannot prove pointer hit-testing, touch behavior or the absence of layout shift.
- **The trap:** a page-scoped read that answers project-wide. Every read here names its
  page; the canvas once drew another page's container because one did not.
- **The column's focus trap:** `/projects/:projectId` and `/projects/:projectId/pages/:pageKind`
  are two route configs, so a link between them makes the router replace the shell
  synchronously inside `RouterLink`'s click handler. A bubbling listener on the column is gone
  before the click reaches it, and a shell field is gone with the old instance. That is why
  `linkSelected` is reported from a capture-phase listener and the request is root-scoped.

Plane containers use --plane-pane-background/filter or --plane-sheet-background/filter. Global token fallbacks resolve solid surfaces, and shared focus tokens draw every focus-visible outline. No spacing or layout rules change for Depth.

## Native project lifts and Archive landing

ProjectHeader owns the native More popover and defers ProjectDetailsDialog and
ProjectArchiveConfirm until requested. ProjectMoreMenu supplies menu/radio semantics and
shared keyboard movement. Status commits immediately; Edit details opens a three-field draft
with one Save. ProjectWorkspaceStore.saveDetails uses its existing optimistic project write,
sending only changed name/description/date fields in one PATCH. Clean fields follow refreshes;
dirty fields retain their base. Unchanged Save closes without writing, blank name refuses,
dirty dismissal asks Discard changes, and a failed Save keeps the draft and one dialog alert.
Discard clears that error before the header returns. Archive confirmation uses the existing
archive callback, keeps header Undo and returns focus to More, including refusal.

All surfaces register with shared LiftStack; custom work/section creation dialogs retain
their existing CDK traps and adopt the lift paint. The canvas releases section creation's
registration on page/context changes and destruction, without scheduling focus into the old
view. The shell provides TaskDrawerCoordinator
and reserves --layout-drawer-width while desktop details are open. Task List sections own
native opening and focus; no feature writes bypass the gateway.

openArchive(returnTo) records the target URL in root-lived ProjectColumnFocusRequest.archiveUrl
and navigates without a write. Root Archive resolves whether its page record is absent, hidden or
shown; only its renderer accepts a nullable page id. Navigation lists a hidden Archive while it
is current, and the toggle reads “Archive” while controlling navigation visibility. A rendered shell consumes the
matching request when #archive-page-title exists; a different winning URL clears it. This explicit
request survives shell replacement. Generic core route focus remains a fallback.

Archive restore toasts name the returned item's breadcrumb and page, with canonical Go to it and
receipt Undo. A switched-off origin page gets explanatory copy and no Go to it. Project restore
links to its own route. Settings recovery has Open it without Undo because it has no workspace
history store. Restore focus observes the native toast action until it has a nonzero layout box,
inside the existing pending task. It moves focus only while the removed control or body still
owns it at that point. Closing the toast, a newer Restore or component destruction cancels and
settles the observation; dismissal falls back to a surviving Restore or the heading.

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| ProjectDetailsDialog | component | Single-commit project draft | [API](../../../api/components/ProjectDetailsDialog.html) |
| ProjectArchiveConfirm | component | Modal archive confirmation | [API](../../../api/components/ProjectArchiveConfirm.html) |
| ProjectColumnFocusRequest | injectable | Cross-shell column and Archive focus requests | [API](../../../api/injectables/ProjectColumnFocusRequest.html) |


Task Lists disable CDK sorting within a list. The dragged list announces cross-list movement and clears that hint on drag end; dropTask still calls receive only for a different container. Read-only Task Lists pass sourceLink into TaskRow and distinguish an empty source. Todos uses the same object-row anatomy and taskMeta while retaining its own write store and exact status hooks. ArchivedRegion renders static object rows with separate Restore controls. Progress emphasises the pressed formula, without a lone primary. Settings archived-project cards show ancestor names only or Top-level project.
