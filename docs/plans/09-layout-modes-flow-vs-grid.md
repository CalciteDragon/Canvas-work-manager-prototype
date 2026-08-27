# Slice 9 — Layout modes: flow vs grid

## Goal

Make flow and 12-column grid layouts usable on the same persisted project, with a clean view mode and a CDK-powered layout editing mode.

## Spec sections

- §27 — Section Canvas
- §28 — Layout Experiment Flag
- §32 — Section Editing

## Acceptance check

With the host and web app running against a realistic seed:

1. open `/prototype/state`, switch one project's persisted `projectLayoutMode` from flow to grid, navigate to that project, and observe the grid; then switch it back through the panel and observe flow;
2. enter Edit Layout Mode and drag a section to a different position in flow, reload, and observe the new order;
3. switch the project to grid through the development panel, then drag unequal-width sections across wrapped rows and reload to observe the new order;
4. change a section to each 12/8/6/4 width and observe the persisted proportional width in flow and grid after reload;
5. leave Edit Layout Mode and verify drag handles, size, remove, duplicate, add-section, and configuration controls are absent while collapse remains usable;
6. inspect `.prototype/data.json` to verify the project mode, section positions, and `columnSpan` values are the persisted source of the rendered layout.

The automated acceptance surface is `pnpm --filter web test`, `pnpm --filter web lint`, and `pnpm --filter web build`, followed by the browser sequence above.

## File-level change list

- `development.md` — mark Slice 9 in progress, then done with the verified result.
- `docs/plans/09-layout-modes-flow-vs-grid.md` — keep this plan and its review revisions current.
- `apps/web/package.json` and `pnpm-lock.yaml` — add Angular CDK at the Angular 22 version already used by the app.
- `apps/web/src/app/core/gateway/work-manager-gateway.ts` — expose only the project update and section move operations now exercised by Slice 9.
- `apps/web/src/app/core/gateway/prototype-work-manager-gateway.ts` — adapt those operations to the existing PATCH project and POST section-move routes and validate their contract bodies.
- `apps/web/src/app/core/gateway/prototype-work-manager-gateway.spec.ts` — prove methods, paths, actor headers, request bodies, response validation, and errors at the web boundary.
- `apps/web/src/app/core/gateway/testing/fake-gateway.ts` — support project layout updates, authoritative section reorder answers, and method-scoped/deferred answers so a page can load successfully before one write fails or resolves out of order.
- `apps/web/src/app/features/projects/project-page-store.ts` — own transient Edit Layout Mode, persist section moves, reject stale post-navigation answers, and force a rendered-order reset after a failed mixed-grid move.
- `apps/web/src/app/features/projects/project-page-store.spec.ts` — drive move success/no-op/failure, authoritative order reconciliation, stale-answer rejection, and clean mode reset on project navigation.
- `apps/web/src/app/features/projects/project-page.ts` — import Angular CDK drag/drop, translate drop events into store moves, and clear the page-owned Quick Add menu whenever Edit Layout Mode ends.
- `apps/web/src/app/features/projects/project-page.html` — add the project controls row and view/edit toggle, plus common CDK draggable wrappers for registered and unknown sections, explicit vertical/mixed orientations, span classes, mode-gated edit controls, and an empty-state instruction that names Edit Layout Mode when add controls are hidden.
- `apps/web/src/app/features/projects/project-page.scss` — render flow as a vertical stack whose 12/8/6/4 presets visibly map to proportional widths, render grid as twelve columns, and style drag states/responsive fallback using tokens only.
- `apps/web/src/app/features/projects/project-page.spec.ts` — prove both layout DOM states and orientation bindings, drop dispatch in both, proportional span classes, failed-drop DOM restoration, edit-only chrome, view-mode collapse, and correct indices with an unknown section between registered ones.
- `apps/web/src/app/features/projects/sections/section-frame/project-section-frame.ts` — accept the edit-mode contract and keep inspector state consistent when editing ends.
- `apps/web/src/app/features/projects/sections/section-frame/project-section-frame.html` — attach the CDK handle and hide layout/config/destructive chrome outside Edit Layout Mode.
- `apps/web/src/app/features/projects/sections/section-frame/project-section-frame.scss` — style enabled edit chrome and remove obsolete always-on handle assumptions.
- `apps/web/src/app/features/projects/sections/section-frame/project-section-frame.spec.ts` — prove view/edit chrome, handle attachment, collapse in view mode, and inspector closure.
- `apps/web/src/app/prototype/dev-panel/state-inspector-store.ts` — load visible projects, persist the §28 layout experiment flag, expose per-project pending state, and serialize changes per project so rapid toggles cannot resolve out of order.
- `apps/web/src/app/prototype/dev-panel/state-inspector-store.spec.ts` — prove project loading, layout persistence success/failure, and that a second change for a project is refused while its first PATCH is pending.
- `apps/web/src/app/prototype/dev-panel/state-inspector-page.ts` — replace only the placeholder portion needed by §28 with per-project flow/grid experiment controls, disabling only the project currently saving; retain an honest note that Slice 12 owns seed/state inspection.
- `apps/web/src/app/prototype/dev-panel/state-inspector-page.spec.ts` — prove the development panel lists projects, changes one project independently, and exposes failures.
- `apps/web/src/app/prototype/dev-panel/state-inspector-page.scss` — style the narrow experiment panel using tokens.
- `.prototype/notes.json` — record concrete friction and comparative observations from exercising both layouts.
- `docs/decisions/2026-08-flow-vs-grid-layout-experiment.md` — record what the realistic-data comparison showed without prematurely choosing the production model.
- `docs/decisions/2026-08-view-mode-section-chrome.md` — record why Duplicate is grouped with layout-editing chrome in this prototype while leaving the separate question of which section types should support duplication unresolved.

## Test plan

Write and observe these tests fail before implementation:

- `PrototypeWorkManagerGateway updates a project layout through PATCH and validates the project response` — proves the interface stays transport-free while the adapter owns the route/body/schema.
- `PrototypeWorkManagerGateway moves a section through the move route and validates the section response` — proves the CDK drop can reach the existing domain operation.
- `ProjectPageStore reorders through the gateway and reconciles every sibling position` — proves one returned section cannot leave stale sibling positions.
- `ProjectPageStore leaves order unchanged, emits a fresh canonical list, and reports a visible error when move fails` — proves CDK mixed sorting's direct DOM move is driven back to persisted order.
- `ProjectPageStore skips a same-index drop` — proves a no-op does not write or generate activity.
- `ProjectPageStore resets Edit Layout Mode when the route changes project and ignores a move answer for the previous project` — proves editing chrome and async writes do not leak across navigation.
- `ProjectPage renders flow and grid classes from projectLayoutMode, with 12/8/6/4 proportional widths in both` — proves the experiment flag and size presets drive actual layout.
- `ProjectPage binds a vertical CDK drop list in flow and a mixed-orientation list in grid` — proves wrapping grid pointer sorting uses CDK's supported two-dimensional strategy.
- `ProjectPage dispatches drops by the common draggable order when an unknown section is in the middle` — proves drop indices map to the complete persisted section array.
- `ProjectPage restores DOM order after a rejected mixed-grid drop` — proves direct CDK DOM movement cannot leave the visible grid diverged from persistence.
- `ProjectPage shows drag/size/remove/add/config controls only in Edit Layout Mode` — proves §32's exact clean-view list, including the unknown-section fallback.
- `ProjectPage also keeps duplicate with layout-editing chrome` — records and proves the additional product choice implied by the slice's “View mode stays clean” requirement; the decision entry records why.
- `ProjectPage gives an empty View Mode canvas an instruction to enter Edit Layout Mode, then exposes Quick Add in Edit Layout Mode` — proves no empty state points at hidden UI.
- `ProjectPage closes Quick Add when Edit Layout Mode ends and does not reopen it on re-entry` — prevents hidden page-owned state from returning stale, matching inspector closure.
- `ProjectSectionFrame leaves collapse usable in view mode but exposes a real cdkDragHandle only in edit mode` — proves content navigation remains usable without layout clutter.
- `ProjectSectionFrame closes an open inspector when Edit Layout Mode ends` — prevents hidden stale configuration state from reopening unexpectedly.
- `StateInspectorStore persists one project's changed layout and uses the host answer` — proves §28's switch is not a parallel browser-only flag.
- `StateInspectorStore reports a rejected update without changing the rendered mode` — proves a failed PATCH cannot fabricate persistence.
- `StateInspectorStore refuses a second change for the same project while its PATCH is pending` — proves rapid toggles cannot create out-of-order answers; other projects remain independently editable.
- `StateInspectorPage renders every project with independent flow/grid controls` — proves the experiment can be run against realistic projects from the specified panel.
- `StateInspectorPage disables only the project whose layout PATCH is pending` — proves a native control cannot visually claim a refused second value while other projects remain comparable.

Failure, deferred-answer, and contract parsing tests will extend the existing fake gateway and malformed HTTP-response patterns rather than add a second test architecture.

## Boundaries touched

- Components continue to inject only stores; `ProjectPage`, `ProjectSectionFrame`, and `StateInspectorPage` neither import the concrete gateway nor use HTTP (§8).
- The already-existing domain service remains the sole owner of sibling renumbering. The UI sends an intended position and re-reads the authoritative list; it does not recreate domain ordering rules (§12).
- `ProjectLayoutMode`, `SectionColumnSpan`, `UpdateProjectInput`, and `MoveSectionInput` remain the one contract vocabulary in `packages/contracts`; no parallel UI types are introduced (§11).
- CDK drag/drop handles pointer interaction. The page supplies ordering intent only and does not hand-roll sorting (§32).
- Component styles use existing design tokens; the numeric CSS grid line spans are structural values, not spacing tokens (§21).

## Explicit non-goals

- No freeform or absolute-position canvas and no persisted X/Y coordinates.
- No production choice between flow and grid; this slice creates evidence and records it.
- No general state inspector, seed switcher, time/failure controls, or other development-panel work from Slice 12. `/prototype/state` gains only §28's per-project flow/grid switch and keeps the remaining deferral explicit.
- No new section types (Slice 10), dashboard composition (Slice 11), or full prototype controls (Slice 12).
- No keyboard drag UX beyond Angular CDK's supported semantics, custom pointer sorting, arbitrary resize handles, breakpoint-specific persisted layouts, or optimistic ordering algorithm.
- No changes to contracts, repositories, domain services, or host routes unless a test demonstrates an existing Slice 9 capability is defective.

## Open questions

None blocking implementation. The development panel is reached by its existing §68 route rather than adding unrelated shell navigation; Slice 12 owns the broader panel and its discoverability.

## Revisions

- Initial plan written from the Slice 9 text, §§27/28/32, and the current gateway, store, frame, host-route, and domain-move implementations.
- Round 1 review moved the experiment switch to the development panel as §28 requires; defined visible proportional size presets in flow; required vertical versus mixed CDK orientation and a real unequal-span cross-row browser exercise; added failed-drop DOM restoration, common unknown-section draggables, navigation-race tests, and exact-versus-additional edit-chrome assertions.
- Round 2 review made method-scoped/deferred fake answers explicit, added a mode-aware empty-canvas state, serialized layout changes per project, and split the view-mode chrome decision from the flow-vs-grid experiment finding.
- Round 3 review made serialization visible by disabling only a saving project's controls and required Quick Add state to close, rather than merely hide, when layout editing ends.
