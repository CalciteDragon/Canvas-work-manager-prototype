<!-- plan id="59" status="planned" summary="Umbrella proposal for Markdown sections, task selection and reopening, sidebar controls and work-canvas shortcuts" -->
# Slice 59 — Markdown, reversible task completion and work navigation

**Umbrella implementation proposal — 2026-09-30. Planning only; no runtime changes.**

User-requested direction on branch `codex/markdown-and-work-navigation`. Like the
[Slice 34 umbrella](../completed/34-undo-redo-and-archive.md), this explicitly requested
plan carries more detail than an ordinary candidate. Create bounded child slices with
`scripts/roadmap.mjs` when implementation begins, activate and review one at a time, and
refresh its exact file/test list from the then-current repository. A–F below are stages,
not reserved slice numbers. Keep this umbrella planned until its implementation lifecycle
begins; do not execute the entire direction as one coding phase.

## Goal

Replace Rich Text sections with editable, rendered Markdown, make task completion reversible
from its checkbox, simplify task selection and project navigation, and manage nested work
through the sidebar with section shortcuts on its canvases.

## Spec sections

§§8–14 (gateway, contracts, domain, persistence); §§19–23 (state, accessibility, tokens,
shell); §§26–34 (project kinds, canvases, shortcuts, registry, tasks); §36 (reflection
subjects after reopening); §39 (progress); §§53–54 (permissions/MCP); §57 (Activity);
§§61–63 (HTTP, live updates, optimistic writes); §66 (section structure); §68 (routes);
§69 (verification); §§75–79 (phase process, decisions, friction).
[Main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md).

This direction deliberately changes §23's Manage pages disclosure; §§29–30's Rich Text
and Sub-Projects registrations; §§27, 30 and 32's Home-only shortcuts; and §34's one-way
Todos completion. Amend the spec with implementation, tests and §78 entries. Current
architecture remains a description of shipped behavior during this planning request.

## Build

1. **A — Vocabulary and sidebar controls:** evaluate “Workstream”; gear beside the root
   project name opens its existing page settings; plus beside Work creates nested work.
2. **B — Task interaction:** reversible completion checkbox; row/title click selects;
   retain the existing drawer for task editing.
3. **C — Markdown sections:** source editor, safe renderer, explicit data/history conversion,
   recovery semantics, seeds and agent examples.
4. **D — Shortcuts on work canvases:** generalize destinations through all layers, retaining
   canonical ownership, combined ordering, per-project history and reparent safety.
5. **E — Retire the Sub-Projects section:** remove renderer and creation entry after sidebar
   creation works; explicitly convert legacy placements and affected history.
6. **F — Integrated acceptance and documentation closure:** demonstrate every request,
   including failure, keyboard, touch, reload, history and MCP paths.

## Done when

Every request has browser evidence in the acceptance matrix. Markdown and work shortcuts
also have HTTP/MCP and same-file conversion evidence. Existing prose survives; retiring a
hierarchy view removes no project or task. Checkboxes reopen canonical tasks, clear completion
timestamps and update derived reads. Required checks pass and the decisions, spec, architecture,
guides and roadmap agree with the implemented product.

## Do not

Implement application code in this planning task. Add WYSIWYG editing, Markdown execution,
remote embeds, arbitrary pages, new task statuses, remembered pre-completion status, a new
hierarchy model, cross-root shortcuts, editable shortcut content, bulk completion, production
infrastructure or unrelated recovery UX. Do not rename stored `kind: 'subproject'`, IDs,
MCP tool names or URL shapes solely to change user terminology. Do not rewrite frozen records.

## Current behavior and required changes

| Observed code | Consequence |
|---|---|
| `RichTextSection` stores `{ text: string }` and is a plain textarea saved on blur | Replace the section type with `markdown`, source config `{ markdown: string }`, and a renderer. This is not an HTML-document conversion. Other descriptions/reflection bodies keep their existing string fields. |
| `TaskService.update` already clears `completedAt` when leaving `done`; PATCH and `update_task` expose it | Reuse this write for reopening. Keep `complete_task` idempotent and one-way; no new reopen endpoint/tool is needed. |
| TaskRow disables done checkboxes, starts title editing on click, and has Details | Enable finished checkboxes; replace Details with accessible selection; move direct title editing to the existing drawer. |
| Todos has separate rows/store and hides Complete on finished rows | Implement task toggles there separately. Preserve work-unit completion behavior. |
| `ProjectPageNavigation` contains root name, Manage pages and Work; creation lives in `SubProjectsStore` | Gear and plus belong in this project column; settings remain root-scoped on descendant routes. Creation belongs in the workspace feature store. |
| Shortcuts are Home-only in service, document integrity, history executor and canvas inputs | Remove all these assumptions together, not just the UI guard. |
| Schema v5 seeds/history contain old section types and config snapshots | Explicit backed-up conversions are needed; do not reset user data or modify historical v2/v3/v4 fixtures. |

Sources: [task UI](../../architecture/web/tasks/how.md), [project UI](../../architecture/web/projects/how.md),
[domain](../../architecture/domain/how.md), [contracts](../../architecture/contracts/how.md),
[repositories](../../architecture/repositories/how.md), [prototype data](../../architecture/prototype-data/how.md),
[MCP tools](../../architecture/mcp-tools/how.md).

## Proposed product rules

“Required” records the request. “Proposed” supplies a default for review and a decision entry
in its owning stage; it does not claim a shipped decision.

| Topic | Rule and rationale |
|---|---|
| Markdown — required | Persist source, never generated HTML. Preserve section IDs, title overrides, page, position, span, collapse, archive markers and shortcut source references. |
| Editor — proposed | Render when idle; Edit Markdown opens source with Save/Cancel and preview. A successful changed Save is one config history action. Cancel/no-op writes nothing; failure retains draft. Read-only shortcuts render only. Replace the current fire-and-forget blur callback with a write-result callback. |
| Dialect — proposed | Headings, paragraphs, emphasis, lists, quotes, fenced code, ordinary links. No raw HTML, remote images/embeds or executable code initially. Select a maintained parser during C after checking its current official API, safe links, Angular integration and bundle cost. Keep Angular sanitization; never use `bypassSecurityTrustHtml`. |
| Reopen — required; target proposed | Unchecking calls `tasks.update(id, { status: 'todo' })`; domain clears `completedAt`. Accessible label “Reopen task …”. Do not guess an earlier blocked/in-progress status. Reopen is its own ordinary action; Undo of completion still restores its captured previous state. |
| Other task states — proposed | Keep current Task List completion semantics for non-done live tasks. Todos keeps cancelled rows and its current no-Complete treatment of cancellation. Do not change workstream completion/reopening in this request. |
| Selection — required | Row background or title click selects and shows the existing drawer. Title is a keyboard selection button (Enter/Space); no interactive row wrapper around nested controls. Checkbox, Delete, links and editors do not also select. Drawer close clears selection and returns focus to the surviving selection control. |
| Gear — required; location proposed | Reuse Icon `settings` beside the root-name link in the project navigation column. Name it “Project page settings for …”. Open a local disclosure panel with fixed Home and current optional toggles/pending/error/retry behavior. Escape closes and returns focus. No unrelated settings. |
| Work plus — required; parent proposed | “Add workstream” dialog has name and explicit parent selector. Root is default even on a descendant route because Work lists the whole root tree; live descendants allow nested creation. Show parent before submit; cancel writes nothing, pending prevents duplicates, failure retains input. Use existing `projects.create`, report child-owned history, keep route and offer Open to child. |
| Terminology — proposed | **Workstream** distinguishes a substantial canvas-bearing unit from a task. Keep root “Project” and heading “Work”. Compare “Work unit” (accurate but mechanical), “Work item” (confusable with tasks), and “Subproject” (familiar but structurally focused). Validate nested/completed language before choosing; do not rename personal names or historical labels. |
| Shortcuts — required; scope proposed | Interpret “shortcut section to a sub-project” as placing a canonical section reference on its Work canvas. Destinations are root Home or subproject Work; sources may be ancestor/sibling sections in the same root. No same-page reference, cross-workspace/root reference or shortcut-as-source. Source content stays read-only. |
| History — proposed | Placement actions belong to the destination project, root or workstream. Source-row writes stay in their source owner's history. Recreating an archived/hidden source reference keeps today's unavailable placeholder semantics. |
| View retirement — required | Remove Sub-Projects as a canvas view and creation option. Preserve all hierarchy/project metadata, descendants, tasks, Todos entries, reflections and archived-project recovery. Deliver sidebar creation first. |

## Phases and acceptance check

Each stage reads its listed spec sections, relevant systems' overview/how files, actual code
and linked decisions before its child plan is written; follows AGENTS.md plan review, TDD,
diff review and real-use requirements; then closes its own record.

### A — Vocabulary and sidebar controls

Read §§19–23, 26, 31, 68 and web/projects and web/core. Evaluate the proposed noun in personal,
renovation and deep nested trees for creation, breadcrumbs, completion, empty and archive states.
Record terminology, gear and parent rules in §78 entries. Apply current UI/agent wording using
an explicit vocabulary map; leave contract/tool identifiers and historical labels intact.

Gear opens root settings from Home, Todos and nested routes. Keep Home fixed; never add a Work
toggle. Plus creates at root or selected live descendant through the gateway; second-tab tree
and Todos refresh. Its receipt points to the child's history. Verify creation Undo/Redo and
same-ID recovery without a Sub-Projects section. Focus and overflow work on phone and keyboard.

### B — Task reopening and selection

Read §§33–34, 36, 39, 57, 63 and web/tasks, web/projects, web/core and domain. Extend the
TaskListStore mutation guard for bidirectional intent, optimistic status/timestamp, field-scoped
rollback, pending state, receipts and stale reads. Domain owns canonical completion timestamps.
Implement task checkboxes separately in Todos' serialized store; keep canonical links, Delete
and workstream completion. TaskRow selection applies to Task Lists; Todos retains navigation.
Title click selects; the drawer's existing title field edits. Update stories/gallery/selectors.

Complete → uncheck → reload must show `todo`, no `completedAt`, lower progress and a refreshed
completed-work picker. An existing linked reflection survives. Header Undo/Redo restores exact
captured timestamps in the owning project's history. Read-only shortcut rows expose no mutation
or drawer selection. Refusal restores the actual native checkbox and model with an error;
delayed writes/live frames/navigation never repaint a different container or discard unrelated edits.

### C — Markdown source, renderer and conversion

Read §§11, 14, 27, 29–32, 54, 66 and contracts, domain, repositories, prototype-data and
web/projects. Generic `SectionConfigSchema` stays opaque; Markdown's folder owns its config
schema. Domain recovery narrowly inspects the prose key without importing web code. Rendering
is a shared presentational web component; HTML never enters storage/domain/MCP.

Introduce the next schema version (v6 if v5 is still current) and a named v5 conversion.
Convert live/archived rich-text sections and every recoverable snapshot/config footprint in
operation actions: add, update, removal, restore, compound row-container snapshots and relevant
captured source identities. Snapshot-only sections must convert too. Enumerate the actual payload
union; no recursive string replacement. Preserve IDs, cursor/order, revision, attribution, expiry
and captured timestamps. Keep historical labels; new prose actions say Markdown.

Proposed legacy conversion escapes Markdown metacharacters and preserves visible line breaks,
so plain prose is not accidentally reinterpreted. Unknown keys/malformed text remain conservative
recoverable content with visible guidance; never silently turn them into empty text. Fail conversion
with a diagnostic if preservation cannot be proved. Extend the existing owner-lock, backup and
validate-before-replace pipeline. Keep historical fixtures and v2→v3/v3→v4 behavior unchanged.
The existing v4→v5 converter currently uses `SCHEMA_VERSION`, `PrototypeDocument` and final
integrity validation: freeze its output to literal v5 opaque data, as the prior steps already
do, preserving its Activity backfill/refusals. Move current-schema validation to the end of the
extended CLI chain. Test each fixed intermediate output and support every starting version.
Upgrade copies, restart on the same file and prove repeated upgrade
changes no bytes. Document the command.

Test Save/Cancel, safe rendering, empty/malformed states, draft retention, read-only shortcuts,
removal/Archive Restore, converted and new Undo/Redo, reload/live propagation and Flow/Grid resize.
MCP creates/updates `markdown` source config, never HTML. Refuse new `rich-text` section creates
through a narrow domain retired-type guard over the otherwise-open type string, including
HTTP/MCP inputs; do not let agents recreate the old type after conversion. Existing converted
history must recreate only Markdown. Check build budget before closing C.

### D — Shortcuts on Work canvases

Read §§27, 30–32, 54, 61–63 and contracts, domain, repositories, mcp-tools and web/projects.
Generalize destination eligibility to root Home or its owner's canonical Work page; omitted
page resolves that owner's canonical page. Source checks compare the roots of **both** owners,
not destination ID against source root. Preserve workspace isolation, archived-owner guards,
disabled-page placement rules, source read permissions and live-source eligibility.

Update ordinary service writes, integrity validation and history executors together. History
`projectId` names destination owner. Reparent preflight examines every affected shortcut edge:
moving source out, destination out, or both together. Allow moving both when the result remains
same-root; refuse any resulting cross-root edge atomically, including Undo/Redo. Creation Undo
refuses a new shortcut dependent on its Work page. Use existing pure helpers; no new service edge.

Enable the existing picker/dialog on Work and load combined section/shortcut order. Incomplete
order blocks insertion/movement. Preserve stable insertion anchor, source breadcrumb/Open source,
independent placement layout and archived/hidden placeholders. Source edits, project moves,
reconnect and history refresh affected canvases without copying content.

### E — Retire Sub-Projects without deleting work

After A and D, read §§14, 29–32, 54, 66 and prototype-data, domain, repositories and web/projects.
Remove registry entry, renderer/store files and seed placements. A legacy capability may remain
only if converted history validation needs it; the type cannot remain a creatable/rendered view.

Use a separate next-version converter (v6→v7 if C used v6). Remove only legacy `sub-projects`
views and shortcuts targeting those views; densely renumber surviving combined placements per
page. Preserve projects/pages/rows, authored content, surviving shortcuts and archive data.
Report removed IDs and retain backup. Include snapshot-only retired view/placement records.

Retire actions that could recreate/mutate removed views or their placements. Keep actions whose
only connection is a missing neighbor, since neighbor fallback already handles it. Preserve
unrelated actions/order and settle cursor/revision/next-step selection using the existing history
state machine; specify the precise retirement algorithm/diagnostic before coding and prove no
transition resurrects a retired view after restart. Refuse new HTTP/MCP creates of this retired
type through the domain; hiding the picker is insufficient. Keep unrelated unknown recovery safe.

### F — Integrated acceptance and closure

Use isolated `nested-projects` for hierarchy, `personal-workspace` for simple/empty flows and
`agent-heavy` for grants. Browser evidence covers desktop keyboard, 375 px touch, both themes
and narrow Grid sections. Start `pnpm dev:web` and `pnpm dev:host` separately for real use;
stop them before Playwright's own servers. Upgrade temporary files, and run stdio sequentially
with HTTP when sharing a data file, respecting the one-writer rule. Record friction with the
current child CURRENT_SLICE; no runtime friction is claimed during planning.

| Request / invariant | Executable acceptance evidence |
|---|---|
| Markdown replacement | Picker exposes Markdown and no Rich Text. Save headings/lists/code/links, inspect exact source via API, reload and verify rendering. HTTP and both MCP transports create/update/read source. |
| Content preservation | Upgrade legacy fixture copies through final version, compare prose/IDs/references and reversible steps, restart, run upgrade again unchanged; assert malformed/unknown and blank recovery rules. |
| Reopen task | Check/uncheck in Task List and Todos; API proves `todo` and absent timestamp; progress/picker update, linked reflection remains; owner header reverses/reapplies exact fields. |
| Click selects | No Details button; row/title click and Enter/Space open drawer; title edits there. Checkbox/Delete do not select. Close restores focus and narrow drawer remains usable. |
| Gear | Beside root name on root/nested routes; keyboard/touch opening; fixed Home and persistent optional toggles; refusal preserves native check/error; Escape returns focus. |
| Terminology | Selected noun recorded and applied across navigation, creation, Todos, Archive, reflections and agent descriptions; identifiers/historical labels compatible. |
| Work plus | Explicit-parent root/nested creation; cancel/failure/pending writes zero/zero/one project; second-tab tree/Todos update and same-ID creation Undo/Redo. |
| No hierarchy view | Registry/picker/seeds omit Sub-Projects; converted canvases/history cannot revive it; compare preserved project/task counts and content before/after. |
| Work shortcut | Add ancestor/sibling source at chosen position; resize/collapse/reorder/remove and Undo/Redo change only placement/destination history; Open source editing refreshes both canvases. |
| Failure and scope | Missing grants, foreign IDs, invalid page, same-page source, archived owner, cross-root edge, incomplete order, failed/delayed writes, navigation and reconnect cause no unintended changes. |

Implementation gates: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm storybook:build`,
`pnpm e2e`, and `pnpm --filter @cwm/prototype-host acceptance`, `agent-acceptance`,
`mcp-acceptance`, `live-acceptance` (same filter for each). Build `pnpm docs:api` before final
tests to exercise the optional generated-fragment assertion. This planning task runs
`pnpm docs:check` and `pnpm lint`; it claims no application acceptance.

## File-level change list

Initial concrete inventory; child plans must expand every touched source/test/template/story/doc
path after re-reading code. Suffix lists below mean separate files in the stated directory.
New paths are proposals, not links to existing artifacts.

| Stage | Paths | Responsibility |
|---|---|---|
| Planning | `docs/roadmap/planned/59-markdown-and-work-navigation.md`, `docs/roadmap/goals.md`, generated `progress.md` | Proposal and roadmap direction. |
| A | `apps/web/src/app/features/projects/project-page-navigation.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts`; `project-workspace-shell.ts`, `.html`, `.spec.ts`; `project-workspace-store.ts`, `.spec.ts`; proposed `work-create-dialog.ts`, `.html`, `.scss`, `.spec.ts` in projects | Gear disclosure, explicit-parent dialog, guarded feature writes, receipts and focus. Reuse existing Icon settings/plus. |
| A | `apps/web/src/app/features/projects/project-work-item.ts`; `pages/todos-page.ts`, `pages/archive-page.ts`, `pages/reflections-page.ts` in projects; `packages/mcp-tools/src/tools/projects.ts`, `project-pages.ts`, `shortcuts.ts`, `reflections.ts` | Vocabulary; child plan audits additional actual template/error/empty-state paths. |
| B | `apps/web/src/app/features/tasks/task-row.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts`; `task-list-store.ts`, `.spec.ts`; `task-detail-drawer.ts`, `.html`, `.spec.ts` | Toggle intent, optimistic reopen, selection and drawer focus. |
| B | `apps/web/src/app/features/projects/sections/tasks/task-list-section.ts`, `.html`, `.spec.ts`; `pages/todos-page.ts`, `.html`, `.scss`, `.spec.ts`; `pages/todos-page-store.ts`, `.spec.ts` in projects | Separate Task List/Todos wiring and retained navigation. |
| B | `packages/domain/src/task-service.test.ts`, `task-history.test.ts`, `project-journal-service.test.ts`; `packages/mcp-tools/src/contract.test.ts` | Canonical reopen/history/reflection/grant assertions; implementation changes only for demonstrated gaps. |
| C | Existing `apps/web/src/app/features/projects/sections/rich-text/rich-text-config.ts`, `rich-text-section.ts`, `.html`, `.scss`, `.spec.ts` → proposed `sections/markdown/markdown-config.ts`, `markdown-section.ts`, `.html`, `.scss`, `.spec.ts`; new `apps/web/src/app/shared/components/markdown-renderer/markdown-renderer.ts`, `.scss`, `.spec.ts` | Replace section/editor; safe source renderer. |
| C | `apps/web/src/app/features/projects/sections/registry.ts`, `.spec.ts`, `section-contract.ts`; `project-canvas.ts`, `.spec.ts`, `project-page-store.ts`, `.spec.ts` in projects; `apps/web/package.json`, `pnpm-lock.yaml` | Registration, save-result wiring/draft retention and parser dependency. |
| C | `packages/contracts/src/section.ts`, `.test.ts`, `document.ts`, `.test.ts`; `packages/domain/src/section-recovery-policy.ts`, `.test.ts`, `section-edit-undo.ts`, `.test.ts`, `section-service.ts`, `.test.ts`; new `packages/prototype-data/src/upgrade-markdown.ts`, `.test.ts`; `upgrade-activity-identity.ts`, `.test.ts`, `upgrade-cli.ts`, `.test.ts`, `seeds.ts`, `seeds.test.ts` in prototype-data; `apps/prototype-host/api/routes.test.ts`, `packages/mcp-tools/src/contract.test.ts` | Markdown capability/label/recovery, retired create refusal, frozen v5 converter, final validation, snapshots and seeds. |
| D | `packages/contracts/src/section-shortcut.ts`, `inputs.ts`, `shortcut-history.ts` and adjacent `.test.ts`; `packages/domain/src/section-shortcut-service.ts`, `.test.ts`, `shortcut-history.ts`, `.test.ts`, `project-history.ts`, `.test.ts`, `project-service.ts`, `.test.ts`; `packages/repositories/src/data-store.ts`, `.test.ts` | Destinations, both-root checks, history and both-end reparent/integrity. |
| D | `apps/web/src/app/features/projects/project-page-registry.ts`, `.spec.ts`, `project-workspace-shell.ts`, `.spec.ts`, `project-page-store.ts`, `.spec.ts`, `project-canvas.ts`, `.spec.ts`, `section-create-dialog.ts`, `.html`, `.spec.ts`, `shortcuts/shortcut-picker.ts`, `.spec.ts`, `shortcuts/shortcut-store.ts`, `.spec.ts`; `packages/mcp-tools/src/tools/shortcuts.ts`, `contract.test.ts`; `apps/prototype-host/api/routes.test.ts` | Work renderer inputs, picker, combined order and API/MCP proofs. |
| E | `apps/web/src/app/features/projects/sections/sub-projects/sub-projects-section.ts`, `.html`, `.scss`, `.spec.ts`, `sub-projects-store.ts`, `.spec.ts` (delete); projects `sections/registry.ts`, `.spec.ts`; `packages/domain/src/section-service.ts`, `.test.ts`; contracts `document.ts`, `.test.ts`; new prototype-data `upgrade-retired-work-views.ts`, `.test.ts`, existing `upgrade-cli.ts`, `.test.ts`, `seeds.ts`, `seeds.test.ts` | Retired view/type refusal, separate conversion and final schema; enumerate affected history shapes before coding. |
| A–E | `apps/e2e/web.spec.ts`, `todos.spec.ts`, `canvas-editing.spec.ts`, `canvas-history.spec.ts`, `section-edit-undo.spec.ts`, `project-creation-history.spec.ts`, `row-history.spec.ts`, `page-history.spec.ts`, `archive.spec.ts`, `phone-layout.spec.ts`, `mcp.spec.ts`; `apps/prototype-host/scripts/acceptance.mjs`, `mcp-acceptance.mjs` | Replace changed intents/selectors and add concrete acceptance while retaining regressions. |
| A–F | `apps/web/src/app/prototype/design-lab/design-lab-fixtures.ts`, `panels/live-panels.ts`, `.html`; projects `project-canvas.stories.ts`, `archived-region/archived-region.stories.ts`; `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts`; `.prototype/notes.json` | Gallery/fixture state, child CURRENT_SLICE and actual-use friction. |
| C, E | `prototype/seeds/empty.json`, `personal-workspace.json`, `busy-week.json`, `nested-projects.json`, `overdue-chaos.json`, `agent-heavy.json` | Regenerate all six committed snapshots from updated builders in each schema/type stage; preserve historical conversion fixtures separately. |
| Docs | Main spec; `README.md`; `AGENTS.md` (schema version); `docs/guides/first-milestone-walkthrough.md`, `mcp-setup.md`; child roadmap records, goals and generated board | Same-change intent, upgrade instructions, walkthrough, agent examples and status. |

Architecture inventory: `docs/architecture/contracts/`, `domain/`, `repositories/`,
`prototype-data/`, `mcp-tools/`, `prototype-host/api/`, `web/projects/`, `web/tasks/`,
`web/core/`, `testing/`: each has `overview.md`, `why.md`, `what.md`, `how.md`. Review all
four per touched system and update changed facts, symbols, edges and diagrams in that stage.
Inspect `web/prototype-tooling`, `prototype-host/mcp-transport` and top-level/web/host
overview/how for gallery, transport evidence, schema and section-count references too.

Create these proposed §78 entries only when their owning stage resolves the question:
`docs/decisions/2026-09-workstream-user-terminology.md`,
`2026-09-project-navigation-gear-and-work-create.md`,
`2026-09-task-checkbox-reopen-and-selection.md`,
`2026-09-markdown-source-rendering-and-conversion.md`,
`2026-09-work-canvas-shortcut-destinations.md`,
`2026-09-retiring-the-sub-projects-section.md` (use actual month if implemented later).
Index in `docs/decisions/README.md` and link system why files. Append dated amendments to
superseded config, Todos completion, page controls, Home shortcuts, reparent and prose-label
decisions; do not rewrite their historical prose.

## Test plan — tests first

Observe each new intended failure before implementation. For an already-working reopen
assertion used as new evidence, use a temporary reverted targeted fault to prove sensitivity.
Commit meaningful green points with child slice and §N. Planning adds no runtime tests.

| Location / stage | Named cases and proof |
|---|---|
| Navigation/workspace specs — A | `gear controls root pages from descendant`; `failed page write restores native check`; `plus uses confirmed parent`; `cancel/repeated submit create zero/one`; `late create cannot paint another root`; `child receipt names child history`; `Escape returns focus`. |
| Task row/list/drawer specs — B | `checked checkbox requests reopen`; `title selects without editing`; `row background selects once`; `checkbox/Delete do not select`; `keyboard selection/close restores focus`; `reopen clears time`; `refusal restores native check/timestamp`; `live frame waits`; `late answer cannot paint another section`. |
| Todos/domain/history specs — B | `done task reopens but cancellation stays retained`; `owner receipt is correct`; `Undo restores exact done time`; `Redo clears time`; `reopen retains reflection and drops picker eligibility`; `foreign ID/missing grant writes nothing`. |
| Renderer/editor specs — C | `headings/lists/code render`; `HTML/unsafe links cannot execute`; `read-only has no editor`; `cancel/no-op writes nothing`; `failed save retains draft`; `live frame cannot erase draft`; `empty source renders`. |
| Converter/CLI/domain/API/MCP specs — C | `literal legacy prose keeps meaning`; `live/archived/snapshot-only conversion`; `before/after config footprints still step`; `v4 converter writes literal v5 before final validation`; `every legacy starting version reaches current schema`; `unknown keys preserve content`; `failure leaves original bytes`; `repeat upgrade unchanged`; `prose recoverable/blank disposable`; `Restore keeps source`; `HTTP/MCP cannot recreate rich-text even with projects.write`. |
| Service/history/integrity specs — D | `Home/Work same-tree sources`; `omitted page resolves Work`; `same page/cross root refuse`; `minimal grants suffice`; `destination owns history`; `source edit is not placement conflict`; `incoming/outgoing reparent checked`; `both ends move safely`; `creation Undo refuses shortcut dependent`; `archived-source Redo is placeholder`. |
| Canvas/MCP specs — D | `Work offers shortcut`; `incomplete order blocks add/move`; `anchor survives refresh`; `receipt names destination`; `source update refreshes read-only view`; `minimal-grant create/list/remove/history through MCP`. |
| Retirement/CLI/service specs — E | `views removed without deleting work`; `only retired-source shortcuts leave`; `combined order dense`; `snapshot-only view cannot revive`; `neighbor-only action usable`; `cursor/unrelated steps survive restart`; `API/MCP refuses retired type`; `v2 through final conversion preserves content`. |
| Browser/SDK journeys — F | Every acceptance row has named assertions, created IDs and canonical reads, so it cannot pass vacuously. Include keyboard/touch/focus, two transports and sequential same-file restarts. |

## Boundaries touched

UI uses gateway interfaces; project controls stay in the feature, not core or a mega-store.
Domain uses contracts/repository interfaces, injected Clock, existing pure history helpers and
OperationRecorder, with no new service edge. MCP calls domain, never repositories. Section
config keys stay owned by the section; shared persisted shapes remain defined once in contracts.
Renderer is web-only, sanitized and token-styled. Central flags and core/prototype separation
stay intact. Exact-actor history and durable Archive remain; converters reuse owner locks and
atomic file replacement. No new infrastructure abstraction or production dependency.

## Explicit non-goals

The Do not list applies to all stages. No drawer removal, unrelated-string Markdown migration,
status-memory field, hierarchy-kind migration for terminology, embedded source editing,
shortcut chains, archive cascade changes, new transport tool family or frozen-record rewrites.

## Open questions

None blocks this planning artifact. Resolve in the owning child plan and decision entry before
coding; escalate if a resolution changes user scope:

- **A:** Validate Workstream against personal/deep work and choose the final noun. Project
  column placement and root-default explicit parent are the assumptions above.
- **B:** Confirm `done → todo` and title-selection/drawer-edit in interaction review; do not
  silently reconstruct prior status or invent double-click editing.
- **C:** Select parser/version using current primary docs; settle plain-text escaping/line-break
  preservation and unknown-config handling with golden fixtures.
- **D:** Validate “shortcut section” as a canonical section reference on Work; a project-link
  card is a different capability and requires revising the child plan.
- **E:** Enumerate payload variants and retirement/cursor algorithm before conversion; no
  choice may discard user-authored project/task content silently.

## Revisions

- **Initial draft (2026-09-30):** Grounded in schema v5, existing task reopen, plain-text
  RichTextSection, separate Todos rows, Home-only service/integrity/history guards and Slice 58
  focus/layout. Split A–F into bounded stages and made proposed defaults explicit.
- **Review round 1 (2026-09-30):** Verified the reviewer's two code-backed findings: freeze
  v4→v5 to its historical output and validate only after the full new chain; refuse new Rich Text
  creates in domain/API/MCP after replacement. Added concrete files and tests for both. Self-review
  also added all six committed seed snapshots to C/E's inventory.
- **Review round 2 (2026-09-30):** Reviewer checked the revised document and closed both
  findings; no substantive findings remained. Proposed product defaults are still explicitly
  subject to the owning child plan's design review and decision entry.
