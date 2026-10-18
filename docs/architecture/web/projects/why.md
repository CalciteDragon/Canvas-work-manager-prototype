# Why the projects feature is shaped this way

## The problem it solves

The root-name gear and Work plus put settings and creation beside the navigation they affect,
with an explicit root-default parent and the child's existing history feedback
([navigation controls](../../../decisions/2026-09-project-navigation-gear-and-work-create.md)).
Nested `subproject` work is called a workstream in user prose
([terminology](../../../decisions/2026-09-workstream-user-terminology.md)).

The project page is the central product experience and where most learning happens
(§26). It has to let a person try answers to §2's page questions — Notion-like or
widget-like, columns or not, resizable or not, which section types deserve to exist —
by adding and removing section types cheaply (§29, §66), while carrying the 25.x model:
a root is a workspace with pages, a subproject is one canvas, and Home can hold
read-only references to sections elsewhere in the tree (§26–§27).

## Forces

- **A section must be removable without destabilising the page** (§66): its folder,
  one registry line, nothing else.
- **A root has several canvases and one header**: what describes the project cannot live
  in what describes a page.
- **`NgComponentOutlet` binds inputs only**, so page renderers and section contents
  report upward through callbacks with stable identity.
- **Live frames arrive before your own response**, so optimistic reorders and writes
  need an in-flight guard, and re-reads must be quiet.
- **Rules live in the host.** The UI must ask, show the refusal, and never guess where a
  write lands or whether a removal is safe.

## The shape, and the alternatives rejected

**One shell for both routes, one header per project.** `ProjectWorkspaceShell` serves
`/projects/:id` and `/projects/:id/pages/:kind`; Angular reuses the instance across a
parameter change, so moving between pages keeps the project loaded. The header moved
here from the canvas because it would otherwise vanish when Todos mounted. Creation and
layout controls stay with the current canvas: insertion targets name their position,
and controls reveal on hover, focus, or touch without a separate editing mode
([direct canvas chrome](../../../decisions/2026-09-canvas-chrome-is-revealed-not-moded.md)).

**Two stores: project and page.** `ProjectWorkspaceStore` holds the record, progress,
writes and work tree; `ProjectPageStore` holds one page's sections and placements,
guarded on page identity as well as project and generation. Rejected: one project
store — 25.3 split it because progress describes the project while sections describe a
page, and the three live rules (progress on any frame naming the project; the record on
`project.*`; the tree on `rootProjectId`) are cleaner stated separately.

**The navigation column lives here, not in `AppShell`.** Placement and state are
separable; a root's pages and an ancestor walk in the store every route pays for would be
the mega-store §20 forbids. One `:has()` rule keyed on a declared attribute places it
([decision](../../../decisions/2026-09-where-the-project-navigation-column-lives.md)).
The optional-page toggles sit in that column
([decision](../../../decisions/2026-09-optional-page-management-lives-in-project-navigation.md)).

**Page resolution is a positive rule** — root, navigable kind, renderable, and enabled except for Archive — so
`/pages/work` on a root falls back like any other non-tab instead of rendering a
subproject canvas on a workspace. `PROJECT_PAGE_REGISTRY` lists navigable kinds only.

**Renderers and section contents receive callback inputs, not outputs.** Forced by
`NgComponentOutlet`; the callbacks are class-property arrows and input records are built
in `computed()`, because `setInput` runs every change-detection pass and only `Object.is`
prevents a re-render loop in a zoneless app (`project-page-contract.ts`,
`section-contract.ts`).

**Flow and grid both remain**, persisted per project; no freeform canvas
([decision](../../../decisions/2026-08-flow-vs-grid-layout-experiment.md)). Direct canvas
controls replace the View/Edit split: users move from a grip, resize in supported column
steps, rename at the title, and create at a visible insertion point. Settings appear only
for a type with an inspector; removal is one ID-only gesture whose cascade and recovery are
decided by the domain, and its receipt Undo appears in the acting toast
([canvas chrome](../../../decisions/2026-09-canvas-chrome-is-revealed-not-moded.md),
[removal and Undo](../../../decisions/2026-09-disposable-removal-and-immediate-undo.md)).

**Header Undo/Redo and receipt Undo share one guard.** The header covers the displayed project's
whole history; a toast offers the exact step just committed, including another owner's action.
Same-history availability waits through the owed read and uses each entry's own `blockedBy`, so an
archived project can still undo its own archive. Cross-owner Undo reads and validates the owner's
step at press time without changing the header's held summary
([header history](../../../decisions/2026-09-project-header-history-controls.md),
[one toast](../../../decisions/2026-10-feedback-is-one-toast-with-undo.md)).

**Ownership is read from `historyId`, not guessed at the write site.** A task list inside a
shortcut writes a row its source sub-project owns, and a restore from root Archive can record in a
descendant; so a writer reports the response's own project only for wording, and the store compares
the receipt's history with the one it holds — re-reading when it cannot tell — before opening
cross-owner feedback with its receipt and Open owner. **Pending lasts until the owed re-read lands**, so the window
between a write's response and its summary read never offers the pre-write step
([decision](../../../decisions/2026-09-project-header-history-controls.md)).

**A history refusal is mapped, not parsed.** Every refusal carries the caller's current summary,
which the store adopts only for its own held history before it words the reason; a transport
failure re-reads rather than
assuming either outcome, which is what makes a lost response safe without a retry cache
([deferrals](../../../decisions/2026-09-history-stage-a-deferrals.md),
[retired actions](../../../decisions/2026-09-operation-history-retired-actions.md)).

**A missing project keeps a generic Retry when its history read is unavailable.** The route cannot
claim creation was undone until the creator's summary confirms it, and an unavailable summary must
not strand a person who could restore the project as soon as the host responds again. The button
does not identify the history or reveal whether the project ever existed. A `not_found` summary is
an answer rather than a failure — another person, another workspace, an id that never existed —
so it offers no Retry: pressing it could only ever produce the same answer.

**Section stores follow ownership.** A Task List provides its own `TaskListStore`, a
Reflections section its `ReflectionsStore`, Progress its `ProgressStore` — one per
section, synced against the page's data revision — because under
[sections own their data](../../../decisions/2026-09-sections-own-their-data.md) two
Task Lists must differ. A shortcut never gets a writable store: `ShortcutFrame` mounts
the source read-only ([decision](../../../decisions/2026-09-a-shortcut-resolves-identity-not-content.md)).

**Untitled shortcut names identify the owner on the frame itself.** A breadcrumb alone leaves
a local `Markdown` beside an indistinguishable shortcut. The shared `shortcutNameOf` makes the
latter `Markdown (Garden)` throughout its controls without inventing a stored override or
changing a chosen title ([decision](../../../decisions/2026-10-untitled-shortcut-sources-name-their-owner.md)).

**Section removal is one gesture with a recoverable result.** The canvas sends only the section
id; the domain archives live owned rows with it and leaves independently archived rows alone.
An uncertain write keeps an ID-only Retry remove, while a failed follow-up read offers Retry
refresh. Stored operation history still executes earlier reassign actions
([decision](../../../decisions/2026-09-one-step-section-removal-and-task-delete.md)).

**One confirmation owns its recovery actions.** The canvas toast acknowledges both listed and
unlisted removals and offers the exact receipt's Undo. Open archive still follows the server's
listing verdict. An uncertain removal retains its saved id for explicit Retry remove, and a
committed write whose follow-up read failed offers read-only Retry refresh. One shared slot and
the writer's own-feedback marker keep one write from opening two confirmations. Docking in the
content track makes feedback predictable while the reserve keeps content reachable
([decision](../../../decisions/2026-10-feedback-is-one-toast-with-undo.md)).

**A route is offered only when the person can take it.** The notice reads `archiveListed` off the
removal result rather than inferring Archive from the operation's name, and a conflict's copy in
the header
says "Someone else changed it since" — under a per-actor history a conflict is always someone
else's change, and the person's own later change is a newer step to undo first. `ArchivedRegion`
says on the row that Archive Restore returns a section
at the end of its page, because Undo, not Restore, is what returns it between its old neighbours
([decision](../../../decisions/2026-09-recovery-routes-name-what-is-actually-there.md)).

**Archive is a root-wide page, not a canvas footer.** The page-local Archived region
became wrong when the canvas became page-scoped; `ArchivePage` owns the whole-tree
projection and the canonical restores, and `ArchivedRegion` is the presentational list
([decision](../../../decisions/2026-09-root-archive-recovery-guidance.md)).

**Arriving at a section is a DOM match, never a selector interpolation.** The canvas
matches `#section-<id>` against the sections it loaded, focuses the frame heading, and
opens a collapsed target through a transient input that leaves the record alone
([decision](../../../decisions/2026-09-todos-chronology-and-canonical-navigation.md)).

**A root projection names the descendant history owner.** Todos and Archive show work from
the whole root tree, while the header holds only the displayed project's current actor history.
A separate owner link reaches that same header and its focus target; it does not imply the row
is the next action. A newly committed write's toast can separately
undo its own receipt after checking that it remains next
([decision](../../../decisions/2026-09-descendant-history-discovery.md)).

## Consequences

- A new section type is one folder and one line; `registry.spec.ts` makes the line
  deliberate.
- The workspace opens with several requests (project, pages, sections, progress,
  tree); a friction note records the cost.
- Every renderer and content component is a plain standalone component with an
  inputs record — easy to story, easy to test with the fakes.
- A sticky column needs `min-height`, not `height`, on its container, or it scrolls
  away with the canvas — §23's "disappearing" by another route.

## Decisions that shape this system

- [Feedback is one toast with Undo](../../../decisions/2026-10-feedback-is-one-toast-with-undo.md) — one docked confirmation, shared ownership, timer and cross-owner receipt checks.
- [Archive is always visitable](../../../decisions/2026-10-archive-is-always-visitable.md) — navigation visibility never gates recovery or records an enable while opening Archive.

- [The Sub-Projects section is retired; Work is the hierarchy surface](../../../decisions/2026-10-retiring-the-sub-projects-section.md)

- [Markdown source and rendering](../../../decisions/2026-10-markdown-source-and-rendering.md) — source ownership, safe lazy rendering and explicit draft handling.
- [Schema version 6 converts Rich Text to Markdown and retires it](../../../decisions/2026-10-schema-version-6-markdown-conversion.md) — historical cutover; the registry omits Rich Text and Slice 66 removed the converter. Unreadable local files require reset or reseed.
- [A Markdown section's config is validated on every write](../../../decisions/2026-10-section-config-validated-on-write.md) — the schema comes from contracts; unreadable config shows only the guidance note.

- [Task Delete names its existing recovery routes](../../../decisions/2026-09-task-delete-recovery-feedback.md) — Todos names the owner and points to the existing header and root Archive.
- [Descendant rows link to their owner's existing header history](../../../decisions/2026-09-descendant-history-discovery.md) — owner route and fragment focus without a merged cursor.

- [Actionable Archive and archived-project recovery](../../../decisions/2026-09-actionable-archive-and-archived-projects.md) — ready-only root rows and separate workspace Settings recovery.

- [Direct canvas editing direction](../../../decisions/2026-09-direct-canvas-editing-direction.md) (implemented in Slice 27)
- [Contextual insertion names its position](../../../decisions/2026-09-contextual-insertion-names-its-position.md)
- [Canvas chrome is revealed, not moded](../../../decisions/2026-09-canvas-chrome-is-revealed-not-moded.md)
- [Flow and grid both remain prototype layout candidates](../../../decisions/2026-08-flow-vs-grid-layout-experiment.md)
- [View Mode shows work; Edit Layout Mode shows canvas chrome](../../../decisions/2026-08-view-mode-section-chrome.md) (superseded)
- [The project header's Quick Add adds a section](../../../decisions/2026-08-project-header-quick-add.md) (amended)
- [The smallest surface that makes §81's project verbs demonstrable](../../../decisions/2026-08-project-create-edit-archive-surface.md)
- [Where the project navigation column lives](../../../decisions/2026-09-where-the-project-navigation-column-lives.md)
- [Optional page management lives in project navigation](../../../decisions/2026-09-optional-page-management-lives-in-project-navigation.md)
- [A section has a name](../../../decisions/2026-09-a-section-has-a-name.md)
- [Container sections own their rows](../../../decisions/2026-09-sections-own-their-data.md)
- [A shortcut resolves source identity, not source content](../../../decisions/2026-09-a-shortcut-resolves-identity-not-content.md)
- [Home orders sections and shortcuts together](../../../decisions/2026-09-home-orders-sections-and-shortcuts-together.md)
- [A workstream's Work canvas takes shortcuts the way a root's Home does](../../../decisions/2026-10-work-canvas-shortcut-destinations.md)
- [What the Todos page decides for itself](../../../decisions/2026-09-todos-chronology-and-canonical-navigation.md)
- [Root Archive recovery guidance](../../../decisions/2026-09-root-archive-recovery-guidance.md)
- [Content-oriented Archive policy](../../../decisions/2026-09-content-oriented-archive-policy.md)
- [Section removal is one cascade gesture, and task Delete is reversible](../../../decisions/2026-09-one-step-section-removal-and-task-delete.md)
- [Disposable removal and immediate canvas Undo](../../../decisions/2026-09-disposable-removal-and-immediate-undo.md)
- [Reflection subjects and the root journal feed](../../../decisions/2026-09-reflection-subjects-and-the-journal-feed.md)
- [Task and reflection writes join operation history](../../../decisions/2026-09-row-operation-history.md) — row envelopes and compound-container live refresh
- [Undoing a first enable deletes the page it created; undoing a toggle moves one boolean](../../../decisions/2026-09-optional-page-operation-history.md) — the page envelope the store ignores, and a removed page's Home fallback
- [An existing project's writes are one action family](../../../decisions/2026-09-project-update-operation-history.md) — the project envelope every caller unwraps, and root projections re-reading on project-record frames from any root
- [Project creation belongs to the created project's history and can be recovered at its URL](../../../decisions/2026-09-project-creation-history.md) — the same-URL recovery state and creator-only summary after Undo
- [The project header offers Undo and Redo of the displayed project's history, and nothing else does](../../../decisions/2026-09-project-header-history-controls.md) — header controls, per-step blockers, write reporting, archive stays on the project; amended for receipt Undo
- [Below 48rem the global sidebar is a modal drawer](../../../decisions/2026-09-phone-navigation-drawer.md) — a narrow column choice re-collapses the column and focuses its toggle across a reload

## Spec sections

§23 shell and the navigation column · §26 project page and pages · §27 canvas, ownership,
shortcuts · §28 layout flag · §29 registry · §30 section types · §31 frame and archive ·
§32 editing · §34 the Todos page · §36 the Reflections page · §66 section structure ·
§68 routes.

**Archive copy renders the domain's recovery verdict; it never decides eligibility.**
`ArchivedRegion` labels the supplied `recovery` metadata — total content apart from the exact
"restores with this section" count, kept text, or conservative unknown content — and spells out
the two steps for an archived container whose rows were archived on their own. A live container
beneath an archived project is omitted until that project returns
([decision](../../../decisions/2026-09-content-oriented-archive-policy.md)).

[Depth V2](../../../decisions/2026-10-depth-blur-budget.md) separates the column pane from consistent header and content sheets without per-sheet blur on long canvases.

The [native lift mechanism](../../../decisions/2026-10-lifts-use-the-top-layer.md) escapes
section containment and reserves canvas width without placing a second drawer column inside a
Task List. [More is a menu with one details commit](../../../decisions/2026-10-more-is-a-menu-with-a-details-dialog.md):
immediate status choices stay short, while editing Name, Description and date creates one
history step. [Route focus](../../../decisions/2026-10-route-focus-lands-lost-focus.md)
recovers generic lost focus; explicit Archive intent belongs to root-lived projects state because
navigation can destroy its initiating shell. [Creation defaults](../../../decisions/2026-10-creation-defaults-follow-the-open-work.md)
now keep task quick-add in the list; workstream default/navigation changes remain pending.

[One toast with receipt Undo](../../../decisions/2026-10-feedback-is-one-toast-with-undo.md) keeps confirmations reachable from each acted region. [Always-visitable Archive](../../../decisions/2026-10-archive-is-always-visitable.md) makes visiting recovery navigation only, preserving the removal as the latest Undo.
