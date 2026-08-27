# Slice 8 — Project page + section registry

## Goal

Make `/projects/:projectId` a real page whose canvas renders modular sections through a
registry and a shared frame, so a new section type costs its own folder plus one registry
line.

## Spec sections

- §26 — project page structure: header (icon, name, status, progress, target date, quick add, more), a navigation/controls row, and a section canvas.
- §29 — `SectionDefinition` interface and `SECTION_REGISTRY`.
- §30 — the first two of the ten section types: Rich Text and Task List; adding a type must stay local to its folder.
- §31 — `ProjectSectionFrame` provides drag handle, title, collapse, configuration, size, duplicate, remove; the content component handles only its feature.
- §39 — Progress: count-based, weighted, and manual are all to be prototyped; this slice ships count-based only.
- §57 — one attributable activity event per mutation.
- §66 — `features/projects/sections/<type>/` folders plus one `registry.ts`.
- §32 is deliberately *not* implemented here — see Explicit non-goals.
- Standing: §8/§19 (page → feature store → gateway), §11 (contracts once), §20 (no mega-store), §21 (tokens only), §45 (`Clock` in domain), §68 (route map).

## Acceptance check

Run `pnpm test` and `pnpm lint`, then reset to the `busy-week` seed, start the app, and
open the `Website launch` project from the sidebar. Verify that:

1. the header renders the project's icon, name, status, count-based progress, and target
   date, all read over HTTP;
2. the canvas renders the seeded **Rich Text** section and the seeded **Task List**
   section, in `position` order, each inside the same frame chrome;
3. the Task List section lists only that project's tasks and still creates, completes,
   inline-renames, reprioritizes, and dates them, persisting to `.prototype/data.json`;
   completing a task moves the header's progress immediately, because both read one store;
4. the Rich Text section's body can be edited and the new text survives a page reload;
5. collapsing a section hides its content and the collapsed state survives a reload;
6. the frame's size control changes `columnSpan`, duplicate produces a second section of
   the same type below the original, and remove deletes it. Size has **no visual effect in
   this slice** (nothing renders columns until Slice 9), so verify size in
   `.prototype/data.json`; verify duplicate and remove on screen *and* in the file. After
   the remove, restart the host: it must load the file without a
   `DocumentIntegrityError`, which is what proves no activity event was orphaned;
7. header Quick Add adds a section of a chosen registry type to the canvas, and the new
   section's `config` in `.prototype/data.json` is the value its registry definition's
   `createDefaultConfig()` returns;
8. after re-seeding to `nested-projects`, opening `Cabinets` — the one project deliberately
   left without sections — shows a visible empty-canvas invitation, not a blank page;
9. `/tasks` renders the not-found page rather than the task workspace, and
   `/projects/:projectId` for an unknown id shows a visible not-found message rather than
   an empty canvas.

Then prove §30's registry claim mechanically: adding a section **type** must require only
`features/projects/sections/<type>/**` plus one line of `registry.ts`. Check it by reading
the rich-text portion of the diff, excluding `packages/prototype-data` — seeding an
*instance* of a section is data, not type code, and is not part of the claim. The
canvas-level fallback for an unregistered `type` is asserted in `project-page.spec.ts`.

## File-level change list

### Contracts (`packages/contracts`)

- `src/inputs.ts` — add:
  - `CreateSectionInputSchema`: `type` (non-empty string), optional `title`, optional
    `columnSpan`, optional `config`.
  - `UpdateSectionInputSchema`: `title` **nullable** and optional (the title is an
    optional override on `ProjectSection`, so clearing it needs `null`), `columnSpan`,
    `collapsed`, and `config`.
  - `MoveSectionInputSchema`: `position` (`PositionSchema`).
  - `SectionQuerySchema`: `projectId`.
  - `config` on both inputs is `SectionConfigSchema.optional()`, **not** `z.unknown()`.
    `unknown` makes "absent" and "explicitly `undefined`" indistinguishable after parsing,
    and leaves `null` ambiguous between "clear" and "a legitimate config value" — exactly
    where the update tests claim to prove the idiom. A config is replaced whole; absence
    means leave alone; there is no "clear".
  - No new entity type — `ProjectSection` already exists.
- `src/section.ts` — introduce `SectionConfigSchema = z.record(z.string(), z.unknown())`
  and make `ProjectSection.config` use it instead of `z.unknown()`. Storage and the write
  inputs then describe the same thing: as it stands a section could hold `[]`, `"text"`,
  or `null` at rest while no input schema can produce or edit that value. All 30 `config`
  values across the five committed seeds are `{}`, so the tightening costs nothing and
  makes the round trip total. The field becomes **required**, not optional — `z.unknown()`
  infers `config?: unknown`, a record does not — because an absent config and an empty one
  should not be two different states. `SectionService.add` therefore always supplies one
  (`{}` when the caller sends none) and `duplicate` always copies one.
  §29's `createDefaultConfig(): unknown` stays verbatim; the one call site that sends its
  result parses it through `SectionConfigSchema`, which is a validation rather than a
  cast, and fails loudly if a definition ever returns a non-object.
- `src/section.test.ts` — a non-object `config` is now rejected.
- `src/inputs.test.ts` — accept/reject cases for each, including a rejected
  `columnSpan: 7`, a rejected negative `position`, a rejected `config: null`, and an
  accepted `title: null`.

### Repositories (`packages/repositories`)

- `src/interfaces.ts` — `SectionRepository.list(query?: SectionQuery)` and
  `remove(id: SectionId): Promise<void>`. Remove is a hard delete: a section is view
  configuration with no independent history, and §31 offers no undo. A soft-delete flag
  would force a `packages/contracts` change that §30 argues against.
- `src/json-repositories.ts` — `JsonSectionRepository.list` filters by `projectId`;
  a protected `delete` on the shared base, guarded by `assertCanMutateDataStore`, raising
  `RepositoryNotFoundError` for an unknown id.
- `src/repositories.test.ts` — filtering by project, deleting, deleting twice, and
  deletion being rejected outside an open unit of work.

### Domain (`packages/domain`)

- `src/section-service.ts` — `SectionService` over `SectionRepository`,
  `ProjectRepository`, `ActivityService`, `Clock`, `IdGenerator`, `UnitOfWork`:
  `list`, `add`, `update` (title/columnSpan/collapsed/config), `move`, `duplicate`,
  `remove`. Workspace scoping goes through the owning project exactly as `TaskService`
  does — a section in a foreign workspace is "not found". `add` appends at the end;
  `move` renumbers the project's sections into a dense `0..n-1` sequence so positions
  cannot drift.

  **Activity events for section mutations target the project, not the section**:
  `entityType: 'project'`, `entityId: section.projectId`, `projectId: section.projectId`
  (set explicitly — `ActivityEntry` requires it whenever the target has a project, and
  `validateDocumentIntegrity` checks that it equals the resolved target's project), and
  actions `project.section_added` / `project.section_updated` / `project.section_moved` /
  `project.section_removed`, with the section named in `summary`. `duplicate` records
  `project.section_added`, naming the copy.

  The action names keep `ActivityActionSchema`'s documented `entity.verb` convention —
  "exactly two lowercase snake_case segments, matching `ActivityEntityType`'s spelling" —
  which `section.removed` on a `project` event would break, and Slice 13's feed will
  switch on `action`. A consequence to record rather than discover: `ActivityEntityType`'s
  `'section'` member and the `entityType === 'section'` branch of
  `validateDocumentIntegrity` become unreachable from `SectionService`. Both stay — MCP
  writes and hand-edited fixtures can still produce them, and that validator branch is the
  reason this decision exists.

  This is not cosmetic. `validateDocumentIntegrity`
  (`packages/repositories/src/data-store.ts`) resolves every activity event's target at
  the close of **every** unit of work: an event with `entityType: 'section'` whose section
  has been deleted fails `activity target section "…" does not exist`, so a hard delete
  would roll back its own unit of work, and any earlier `section.created` event would fail
  the same check on every subsequent boot. Targeting the project keeps the feed
  attributable (§57) with no dangling reference and no cascade delete of history. Recorded
  in `docs/decisions/2026-08-section-activity-targets-the-project.md`.

  The service does **not** see `SECTION_REGISTRY` — that lives in Angular and carries
  `Type<unknown>`. The domain defaults only `columnSpan`, `collapsed`, and an empty
  `config`; a definition's `createDefaultConfig()` reaches persistence through
  `CreateSectionInput.config`, sent by the caller.
- `src/section-service.test.ts` — see test plan.
- `src/index.ts` — export the service.

### Host (`apps/prototype-host`)

- `persistence/store.ts` — expose `sections: JsonSectionRepository`.
- `api/services.ts` — construct `SectionService` and add it to `ApiDependencies`.
- `api/routes.ts` — `GET|POST /api/projects/:id/sections`, `PATCH|DELETE /api/sections/:id`,
  `POST /api/sections/:id/move`, `POST /api/sections/:id/duplicate`.
- `api/routes.test.ts` — happy paths plus the scoping and validation cases in the test plan.
- `router.ts` — add `DELETE` to the CORS allow-methods list, without which the browser
  preflight rejects the remove call.
- `router.test.ts` — assert the preflight advertises `DELETE`.

### Web — boundary (`apps/web/src/app/core`)

- `gateway/work-manager-gateway.ts` — `SectionGateway` (`list`, `create`, `update`,
  `duplicate`, `remove`) added to `WorkManagerGateway`; update the comment that lists which
  members arrive in which slice. **`move` is deliberately absent.** That file's own rule is
  "a method the UI cannot exercise is a claim no test backs", and nothing in this slice
  reorders: drag reordering is Slice 9's, with CDK. The domain service, the repository, and
  `POST /api/sections/:id/move` still ship, because development.md's Build list names
  reorder; the gateway method arrives with the drop handler that calls it.
- `gateway/prototype-work-manager-gateway.ts` — the transport for those five calls.
- `gateway/prototype-work-manager-gateway.spec.ts` — URL/method/body assertions and
  contract validation of the responses.
- `gateway/testing/fake-gateway.ts` — a `sections` fake alongside `projects`/`tasks`.

### Web — project feature (`apps/web/src/app/features/projects`)

- `project-page.ts|html|scss` — §26's header and section canvas; injects
  `ProjectPageStore` only. **Provides `ProjectPageStore` and `TaskListStore`** — both,
  here, and nowhere else. No section component re-provides either; `TaskListSection`
  injects `TaskListStore` from the host injector that `NgComponentOutlet` resolves
  through. Two instances would give the header and the section two different truths, which
  is precisely what acceptance #3 is checking against.
- `project-page.spec.ts` — page/store wiring, loading, empty-canvas, unknown-type
  fallback, and not-found states. The unknown-type fallback card carries its own **remove**
  control: it needs only the section id, and the state is only reachable from a section
  that really is in the data file, so without one the user is left with a card they can
  never get rid of.
- `project-page-store.ts` — §19's store: `project`, `sections`, `loading`, `error`, and a
  count-based `progress` computed from the injected `TaskListStore`.
  `ProjectPageStore.load(projectId)` is the only caller of `TaskListStore.load(projectId)`.
  Section mutations go through the gateway and update signals.
- `project-page-store.spec.ts` — see test plan.
- `sections/registry.ts` — `SectionDefinition` (§29, verbatim) and `SECTION_REGISTRY`;
  `definitionFor(type)` returns `undefined` for an unknown type.
- `sections/registry.spec.ts` — every entry is complete, every `type` is unique, and
  `definitionFor` returns `undefined` for an unknown type. Deliberately generic: an
  assertion that each entry's `createDefaultConfig()` parses against its own section's
  schema would make `registry.spec.ts` import every section folder, so adding a type would
  touch three places instead of two and falsify the §30 claim this plan promises to check.
  That round trip is asserted inside the owning section's spec instead.
- `sections/section-frame/project-section-frame.ts|html|scss` — §31 chrome: drag handle
  (presentational in this slice), title, collapse toggle, config toggle, size control,
  duplicate, remove. Renders the content component via `NgComponentOutlet` with the
  section as its input, and the definition's `inspectorComponent` when config is open.
  The frame requires a `SectionDefinition`, so the *canvas* — not the frame — owns the
  unregistered-type fallback.

  The frame also carries the **config-change contract**: a content component emits its
  whole replacement config (matching `UpdateSectionInput.config`'s replace-whole
  semantics), the frame re-emits it, and the canvas sends it to
  `ProjectPageStore.updateConfig`. `NgComponentOutlet` has no bindings input, so the
  content component receives a **callback in its inputs record** rather than declaring an
  `output()`. (`ViewContainerRef.createComponent({ bindings: [outputBinding(…)] })` would
  bind a real `output()`; rejected because it trades a declarative template for imperative
  component creation to carry one callback.)

  **The callback's identity must be stable.** `NgComponentOutlet` applies its inputs in
  `ngDoCheck` and calls `componentRef.setInput` for every key on every change-detection
  pass; the only thing preventing a re-render each cycle is `setInput`'s internal
  `Object.is` check. An arrow function written inline in the template is a new identity
  every pass, which in a zoneless app is a self-feeding dirty loop over the section
  subtree. So: the callback is a class-property arrow on the frame, the inputs record comes
  from a `computed()` keyed on the section rather than an object literal in the template,
  and `ProjectPageStore` must not rebuild `ProjectSection` objects on every read — a
  section's identity changes only when the section does.

  The frame renders the definition's optional `inspectorComponent` when the config panel is
  open, and a plain "this section has no settings" when the definition supplies none —
  which is the case for both types this slice ships.
- `sections/section-frame/project-section-frame.spec.ts` — emits collapse/resize/
  duplicate/remove **and config-change** intent without touching a gateway, and renders the
  registered content component. Config-change is the one hop that carries a section's
  actual content upward, so it is the last one that may go unasserted. Also asserts that a
  change-detection pass with an unchanged section does **not** re-set the content
  component's inputs — the two-line test that catches the stable-identity trap above before
  the browser does — and, using a test-only definition, that an `inspectorComponent` is
  rendered when one exists and a no-settings message when it does not.
- `sections/rich-text/rich-text-section.ts|html|scss` — reads `config.text`, edits it in a
  textarea, and emits the new config **on blur**, not per keystroke: a debounce would still
  PATCH mid-sentence, and the section has no other commit point.
- `sections/rich-text/rich-text-config.ts` — the section's own Zod config schema and
  `createDefaultConfig`.
- `sections/rich-text/rich-text-section.spec.ts` — renders seeded text, saves an edit on
  blur, tolerates malformed config, and asserts `createDefaultConfig()` parses against the
  section's own schema.
- `sections/tasks/task-list-section.ts|html|scss` — reuses `TaskRow` and
  `TaskDetailDrawer` over the injected project-scoped `TaskListStore`.
- `sections/tasks/task-list-section.spec.ts` — renders the project's tasks, quick-creates,
  and completes through the store.

### Web — tasks feature and routes

- `features/tasks/task-list-store.ts` — refactor from workspace-wide to project-scoped:
  `load(projectId)`. The `projects`, `selectedProjectId`, and `chooseProject` surface is
  **deleted**, not deprecated, along with its specs. The optimistic completion, revision,
  and per-field queue machinery is unchanged.
- `features/tasks/task-list-store.spec.ts` — updated for the project-scoped surface; every
  §63 optimistic/rollback/staleness case is kept.
- Delete `features/tasks/tasks-page.ts|html|scss|spec.ts` — Slice 7 declared the route
  temporary and §68 has no `/tasks`.
- `app.routes.ts`, `app.routes.spec.ts` — drop `/tasks`; assert it now falls through to
  `NotFoundPage`.
- `styles/_tokens.scss` — only if the canvas needs a value that is not already a token.

### Seeds (`packages/prototype-data`, `prototype/seeds`)

- `src/seeds.ts` — add a `richTextSection` helper, and give the projects of
  `personal-workspace`, `busy-week`, `nested-projects`, and `overdue-chaos` a Rich Text
  section above their Task List section — **with one deliberate exception**:
  `project-cabinets` in `nested-projects` keeps **no sections at all**. Otherwise every
  project in every seed has two sections and the empty-canvas state that Slice 8's Build
  list names is unreachable in the browser, leaving acceptance #8 unexecutable. A leaf
  sub-project with no canvas yet is also the most realistic place for it.
  **Per-project positions must be renumbered densely**: rich text `0`, task list `1`,
  within each project. Today `busy-week` numbers sections by *project* ordinal
  (`projects.map((item, position) => …)`, so one project's only section sits at position
  `2`), and `nested-projects`/`overdue-chaos` give every section position `0` — both
  break as soon as a project holds two sections.
- `src/seeds.test.ts` — assert the seeded sections' types, per-project dense positions, and
  that `nested-projects` still contains one project with no sections.
- `prototype/seeds/*.json` — regenerated.

### Documentation

- `development.md` — Slice 8 `in progress`, then `done` with the divergence note.
- `docs/decisions/2026-08-section-activity-targets-the-project.md` — the integrity
  constraint above and the option rejected (cascade-deleting a section's events).
- `docs/decisions/2026-08-project-header-quick-add.md` — what Quick Add adds, and its
  tension with §32.
- `docs/decisions/2026-08-project-progress-count-based.md` — count-based progress, and
  that archived tasks are outside the denominator.
- `.prototype/notes.json` — friction from the real-browser pass.

- `docs/decisions/2026-08-section-config-ownership.md` — kept after all, but reframed. The
  first draft dropped it as a restatement of `section.ts`; that justification quoted the
  very line this slice now changes. What is decided here is real: a config is an **object**
  at rest and is **replaced whole** on write, while its *shape* stays the section's own
  business.

## Test plan

Each test is written before its implementation and observed failing for the right reason.

### Domain — `section-service.test.ts`

- `lists a project's sections in position order` — proves ordering is the service's
  responsibility, not the caller's.
- `appends an added section at the end with the caller's config and stamped Clock times` —
  proves `add` computes `position` and uses `Clock`, and that config arrives from the
  caller rather than from a registry the domain cannot see.
- `updates title, columnSpan, collapsed and config independently` — proves `undefined`
  leaves alone, `title: null` clears the override, and `config` replaces whole.
- `renumbers siblings densely when a section moves` — proves `move` cannot leave gaps or
  duplicate positions.
- `duplicates a section directly below its original with a copied config` — proves §31's
  duplicate, that the copy has a new id, and that its config is a copy rather than a
  shared reference.
- `removes a section and closes the position gap` — proves remove keeps the sequence dense.
- `removes a section without orphaning its activity events` — the unit of work commits,
  and re-validating the resulting document raises nothing. This is the test that would
  have caught the integrity trap; it must be observed failing against a
  `entityType: 'section'` implementation first.
- `records one activity event per mutation, against the project, and none for a no-op
  update` — proves §57 attribution matches the `TaskService`/`ProjectService` contract, and
  pins the `project.section_*` action names and the explicit `projectId`.
- `refuses every mutation on a project or section in another workspace` — one table-driven
  case over `add`, `update`, `move`, `duplicate`, and `remove`, each asserting
  `EntityNotFoundError` rather than a rule violation, so no mutation path leaks.

### Repositories

- `filters sections by project` / `deletes a section` / `raises not-found deleting twice` /
  `refuses to delete outside an open unit of work`.

### Host — `routes.test.ts`, `router.test.ts`

- `GET /api/projects/:id/sections` answers the project's sections in order, and `[]` for a
  project that has none.
- `POST` creates one; `PATCH` collapses one; `POST /move` reorders; `POST /duplicate`
  copies; `DELETE` removes.
- `answers 404 for the sections of a project in another workspace`, and `answers 404 for
  PATCH, DELETE, move and duplicate against a section in another workspace` — table-driven.
- `answers 400 for an unsupported columnSpan`.
- `answers 404 for a section that was already removed`.
- `advertises DELETE in the CORS preflight` — in `router.test.ts`, guarding the one-word
  change that would otherwise regress silently.

### Web — store and components

- `loads the project, its sections and its tasks, and orders sections by position` —
  proves the page's single load path.
- `exposes count-based progress that follows task completion` — proves the header stays
  live with the Task List section because both read one store.
- `reports zero progress rather than NaN for a project with no tasks` — the empty case the
  formula divides by.
- `counts only unarchived tasks in progress` — pins the denominator, since
  `TaskListStore.load` passes `includeArchived: false`.
- `two Task List sections in one project share one store instance` — proves the
  single-provision rule the header's live progress depends on.
- `surfaces a not-found project as a visible error rather than an empty canvas` — proves
  the failure path.
- `renders the header and sections when only the task load fails, and reports progress as
  unavailable rather than zero` — one load path now drives two fetches with different
  failure modes, and an unrelated task error must not blank the Rich Text section and the
  header. "Unknown" and "0%" are different claims to make about a project; this pins the
  first.
- `renders an empty-canvas invitation when the project has no sections` — Slice 8's Build
  list names the empty canvas explicitly.
- `adds, collapses, resizes, duplicates, removes and re-configures sections through the
  gateway` — proves every §31 affordance reaches the boundary, `updateConfig` included:
  that is the last hop of the config-change path, and every other hop of it is asserted.
- `sends the registry definition's createDefaultConfig() when Quick Add creates a section`
  — proves the registry's defaults actually reach persistence.
- `keeps the canvas unchanged and shows an error when a section mutation fails` — proves
  section edits are not silently lost.
- `renders each registered section type inside one frame` — proves §31's composition.
- `renders a visible fallback for an unregistered section type and offers a way to remove
  it` — in `project-page.spec.ts`: the canvas must not blank out on an unknown `type` from
  the data file, and must not strand the user with an unremovable card.
- `emits collapse, resize, duplicate, remove and config-change intent without calling a
  gateway` — proves the frame is chrome only.
- `renders rich text, saves it on blur, and tolerates config that is not its shape` —
  proves the section owns its config.
- `createDefaultConfig() parses against the rich-text section's own schema` — proves the
  registry default is a config the section can actually read.
- `renders only the project's tasks and completes one through the store` — proves the
  Task List section reuses Slice 7 without re-implementing it.
- `resolves /projects/:projectId to ProjectPage and /tasks to NotFoundPage` — proves §68
  conformance after the temporary route is deleted.

### Verification checks

- `pnpm test`, `pnpm lint`, and the design-token checker.
- The browser acceptance sequence above against `busy-week` and a section-less project,
  with `.prototype/data.json` inspected after the section mutations and the host restarted
  after the remove.
- The registry-extensibility claim checked by reading the rich-text diff, excluding
  `packages/prototype-data`.
- **One acceptance gap, stated rather than hidden:** "progress unavailable when only the
  task load fails" is unit-tested only. Slice 7's precedent for proving a failure in the
  browser was stopping the host, but that fails *both* fetches and lands on the not-found
  path instead. Failing `GET /api/tasks` alone needs the failure injection that Slice 12
  builds; this path becomes browser-checkable there.

## Boundaries touched

- **Page → store → gateway (§8, §19, §20).** `ProjectPage` and every section component
  inject stores, never `WORK_MANAGER_GATEWAY`. `ProjectPageStore` and `TaskListStore` are
  provided on the page component only — feature-scoped, single-instance, not global.
- **Domain purity (§12, §45).** `SectionService` sees `SectionRepository`,
  `ProjectRepository`, `ActivityService`, `Clock`, `IdGenerator`, `UnitOfWork`. It has no
  knowledge of HTTP, JSON, or `SECTION_REGISTRY`, and no `new Date()`.
- **Contracts once (§11).** `ProjectSection` is not redefined. Stored `config` is an
  opaque **object** — this slice narrows it from `unknown` to a record so storage and the
  write inputs describe the same thing — and only the section's own folder interprets its
  keys. `SectionDefinition` cannot live in
  contracts — it carries an Angular `Type<unknown>`.
- **Document integrity (§14).** Every new mutation must leave a document that
  `validateDocumentIntegrity` accepts, which is why section activity targets the project.
- **Tokens (§21).** All new SCSS uses custom properties; any new literal goes in
  `_tokens.scss` alone.
- **Prototype flag (§47).** No new `prototypeMode` branch; failures surface as
  `GatewayError`.

## Explicit non-goals

- **No layout modes.** `projectLayoutMode`, the 12-column grid renderer, and the flow/grid
  comparison belong to Slice 9 (§27, §28). The canvas is one vertical stack. `columnSpan`
  is stored and editable because §31 names size as a frame affordance, but nothing renders
  columns, so size has no visual effect this slice.
- **No §32 Edit Layout Mode / View Mode toggle, and no `editMode` signal.** §32 assigns
  drag handles, sizing controls, remove controls, add-section buttons, and section
  configuration to a mode that does not exist yet, so this slice shows them
  unconditionally and Slice 9 gates them. §19's example store does sketch
  `editMode = signal(false)`; it is omitted here because nothing would read it, and adding
  it is Slice 9's first line.
- **No §26 "Project Navigation / Controls" row.** §26's middle row is deferred to Slice 9,
  where §32's mode toggle and §28's layout switch give it something to hold. Rendering an
  empty band now would be decoration.
- **No CDK drag-drop reordering.** The frame renders a drag handle as chrome and the
  service supports `move`, but pointer reordering is Slice 9's, explicitly with CDK.
- **No further section types.** Sub-Projects, Milestones, Timeline, Calendar, Progress,
  Reflections, AI Summary, and Recent Activity are §30's list for later slices.
- **No rich-text formatting.** The Rich Text section edits plain text in a textarea; a
  real editor is not a prototype question this slice must answer.
- **No project create/edit/archive UI.** The header's "More" control exposes no mutations
  yet; project writes arrive with the slice that needs them.
- **No weighted or manual progress models, and no `ProgressService`.** §39 wants all three
  behind a feature setting; count-based in the page store is the temporary that the
  Progress section slice replaces.
- **No subtasks, drag ordering of tasks, event stream, or MCP tools.**

## Open questions

1. **What does §26's "Quick Add" add?** The spec does not say. Decision: it adds a
   *section*, because this slice's subject is the section canvas and task quick-create
   already lives inside the Task List section. The cost is real and must be recorded: §32
   assigns add-section buttons to Edit Layout Mode, so Slice 9 may move this control there;
   and a project with no Task List section then has no way to add a task at all. Recorded
   in `docs/decisions/2026-08-project-header-quick-add.md`.
2. **What does §26's "Progress" mean here?** §39 offers count-based, weighted, and manual
   behind a feature setting. Decision: count-based (`done / unarchived total`), the only
   one the current data supports, computed in the page store rather than in a
   `ProgressService`. Recorded as a decision entry.
3. **Where does a section's activity event point once sections can be deleted?** Answered
   above by the integrity constraint, not by preference. Recorded as a decision entry
   because it changes what the §57 feed says about section work.

None of the three changes the shape of the work; each is a defensible default with a
logged decision.

## Revisions

- Initial plan written from the Slice 8 text, §§19, 26, 29, 30, 31, 66, and 68, and the
  existing contracts / repositories / domain / host / gateway / tasks code.
- Review round 1 found one blocking defect and fourteen substantive findings. The blocker:
  a hard section delete orphans the section's activity events, and
  `validateDocumentIntegrity` runs at the close of every unit of work — so the delete
  would have rolled itself back and any earlier `section.created` event would have failed
  every subsequent boot. Section activity now targets the project, with a decision entry
  and a domain test that fails against the naive implementation. The same round also:
  re-cited Progress as §39 (§37 is Calendar); named §32 as the reason the frame's
  affordances are unconditional and the reason Quick Add may move; added §26's
  navigation/controls row as an explicit deferral rather than an omission; pinned
  `TaskListStore` to a single page-level provision, with a test, since the header's live
  progress depends on it; corrected the seeds change to renumber per-project positions
  densely, which the existing `busy-week`/`nested-projects`/`overdue-chaos` data does not
  do; made `UpdateSectionInput.title` nullable and `config` a record rather than
  `unknown`, so "clear" and "leave alone" are distinguishable; added the empty canvas,
  zero-task progress, archived-denominator, registry-default, all-mutations workspace
  scoping, foreign-section route, and CORS preflight tests; moved the unregistered-type
  fallback to the canvas and named the file that asserts it; restated the §30
  extensibility claim to exclude seed data; and corrected two acceptance steps that were
  not verifiable as written (size has no visual effect; `/tasks` still resolves, to
  `NotFoundPage`).
- Dropped `docs/decisions/2026-08-section-config-ownership.md`: `section.ts` already
  encodes that answer, so the entry would have documented existing code, not a decision.
- Review round 2 confirmed the project-targeting fix against the validator (an event whose
  `entityType` is `project` resolves `target.projectId` to the same id it carries, so the
  `activity.projectId` equality check passes) and found nine further items, seven of them
  real. Fixed: the seeds change as written would have given *every* project two sections,
  silently deleting the empty-canvas acceptance step round 1 had just added — one project
  is now deliberately section-less; the action names became `project.section_*` so they
  keep `ActivityActionSchema`'s documented `entity.verb` convention, with the now-unreachable
  `entityType: 'section'` validator branch called out so no one later "cleans it up";
  `SectionGateway.move` was dropped to Slice 9, because shipping it here would break the
  rule written into `work-manager-gateway.ts` that a method the UI cannot exercise is a
  claim no test backs; the config round-trip assertion moved out of `registry.spec.ts`,
  where it would have made the §30 extensibility claim false by its own hand; the frame's
  config-change hop — the only one carrying a section's content — gained a test, a defined
  contract, and a save cadence; the unknown-type fallback gained a remove control; a
  half-failed load (project ok, tasks not) gained a test; `duplicate`'s activity action was
  named; and `ProjectSection.config` was tightened to the same record shape as the write
  inputs, so storage can no longer hold a config no input can produce.
- Review round 3 verified the two mechanisms the revision now depends on, against the
  installed packages rather than from memory. `NgComponentOutlet` in `@angular/common@22.1.3`
  really has no bindings input, so the callback-in-inputs contract stands — but the
  directive applies inputs from `ngDoCheck` and calls `setInput` for every key on every
  change-detection pass, so an inline arrow in the template would have been a new identity
  each cycle and a self-feeding dirty loop in a zoneless app. The callback is now pinned to
  a class-property arrow with a `computed()` inputs record and stable section identity, with
  a test. The round also confirmed the `config` tightening breaks nothing (all 30 committed
  seed configs are `{}`; `repositories.test.ts`'s casts stay legal; `data-store.ts` never
  reads `config`) while noting it makes the field required, and that dropping the
  config-ownership decision entry had become self-contradicting — its justification quoted
  the line this slice changes — so the entry is restored and reframed around what actually
  got decided. Remaining fixes: the `updateConfig` hop was the one link of the
  config-change path still unasserted; the frame's `inspectorComponent` claim is now
  testable via a test-only definition and a no-settings fallback; the "progress unavailable"
  browser step was replaced with an explicit statement that it cannot be one until Slice 12;
  and three stale lines (a "six calls" that is now five, a boundary statement still saying
  `config` stays `unknown`, and an acceptance step needing a second re-seed) were corrected.
