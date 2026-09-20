# Why the projects feature is shaped this way

## The problem it solves

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

**Page resolution is a positive rule** — root, navigable kind, enabled, renderable — so
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
for a type with an inspector; removal uses the domain's content and reference policy, with
an immediate canvas-local Undo action for its receipt
([canvas chrome](../../../decisions/2026-09-canvas-chrome-is-revealed-not-moded.md),
[removal and Undo](../../../decisions/2026-09-disposable-removal-and-immediate-undo.md)).

**Edit receipts belong to the gesture that committed them.** Add, rename, Rich Text blur,
collapse, snapped resize and completed move each capture one server receipt; previews, cancels,
no-ops, shortcut-only actions and implicit row containers do not. The notice keeps the newest
receipt by its history's `revision`, blocks Undo while a section write is pending, and runs the
action through the history transition, which restores only the operation's field or placement
footprint. Archive remains a removal-only repair path
([section edit boundaries](../../../decisions/2026-09-section-edit-undo-boundaries.md)).

**A history refusal is mapped, not parsed.** Slice 32's terminal `undo_consumed` has no
counterpart: its closest replacement, `history_not_next`, is repairable by undoing the newer change
first, so the store keeps the receipt. A stale revision is reconciled from the summary it carries
rather than retried blindly, which is what makes a lost response safe without a retry cache
([deferrals](../../../decisions/2026-09-history-stage-a-deferrals.md),
[retired actions](../../../decisions/2026-09-operation-history-retired-actions.md)).

**Section stores follow ownership.** A Task List provides its own `TaskListStore`, a
Reflections section its `ReflectionsStore`, Progress its `ProgressStore` — one per
section, synced against the page's data revision — because under
[sections own their data](../../../decisions/2026-09-sections-own-their-data.md) two
Task Lists must differ. A shortcut never gets a writable store: `ShortcutFrame` mounts
the source read-only ([decision](../../../decisions/2026-09-a-shortcut-resolves-identity-not-content.md)).

**The removal dialog opens only on the host's typed refusal.** `ProjectPageStore` holds
no rows, so the count in "It still holds 3 tasks" travels from the domain in
`DomainRuleError.details`, and the dialog offers containers by name
([decision](../../../decisions/2026-09-a-section-has-a-name.md)).

**Immediate Undo belongs to the page that committed the section operation.** `SectionUndoNotice`
holds only the returned server receipt in memory, offers typed refusal guidance and an
Archive path only for a removal the server said it listed there, and is cleared when the page or
project changes. It floats at the
viewport's end corner instead of sitting above the canvas: once adds, moves, resizes and blur
saves all offer a receipt, an in-flow notice pushed the canvas down under the pointer. The cost is
that it can cover content near that corner until dismissed. An uncertain remove has a
separate explicit retry using the original input; refresh retry only repeats the read.
This keeps recovery in the current work context without claiming durable browser history
([decision](../../../decisions/2026-09-disposable-removal-and-immediate-undo.md)).

**A route is offered only when the person can take it.** The notice reads `archiveListed` off the
removal result rather than inferring Archive from the operation's name, and a conflict's copy
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
- [What the Todos page decides for itself](../../../decisions/2026-09-todos-chronology-and-canonical-navigation.md)
- [Root Archive recovery guidance](../../../decisions/2026-09-root-archive-recovery-guidance.md)
- [Content-oriented Archive policy](../../../decisions/2026-09-content-oriented-archive-policy.md)
- [Disposable removal and immediate canvas Undo](../../../decisions/2026-09-disposable-removal-and-immediate-undo.md)
- [Reflection subjects and the root journal feed](../../../decisions/2026-09-reflection-subjects-and-the-journal-feed.md)
- [Task and reflection writes join operation history](../../../decisions/2026-09-row-operation-history.md) — row envelopes and compound-container live refresh

## Spec sections

§23 shell and the navigation column · §26 project page and pages · §27 canvas, ownership,
shortcuts · §28 layout flag · §29 registry · §30 section types · §31 frame and archive ·
§32 editing · §34 the Todos page · §36 the Reflections page · §66 section structure ·
§68 routes.

**Archive copy renders the domain's recovery verdict; it never decides eligibility.**
`ArchivedRegion` labels the supplied `recovery` metadata — total content apart from the exact
"restores with this section" count, kept text, or conservative unknown content — and spells out
the two steps for an archived container whose rows were archived on their own. A live container
beneath an archived project gets reactivation guidance only
([decision](../../../decisions/2026-09-content-oriented-archive-policy.md)).
