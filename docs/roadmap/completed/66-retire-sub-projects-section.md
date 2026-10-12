<!-- completed-record id="66" closed="2026-10-09" summary="Retired Sub-Projects, removed the upgrade pipeline, and verified six seeds through browser, HTTP and both MCP transports" -->
# Slice 66 — Retire the Sub-Projects section (Slice 59 Stage E)

## Goal

Remove the Sub-Projects section as a canvas view and creation option, refuse it on create and on
load, and delete the upgrade pipeline that existed only to carry old local data forward (Stage E of
[Slice 59](59-markdown-and-work-navigation.md)).

## Spec sections

- **§14 (local prototype storage).** Local data is disposable: a file the build cannot read is
  reset or reseeded, never converted. The policy prose at lines 600–609 ("each later cutover writes
  its own named converter or resets") is **corrected** to "reset or reseed; no converters", linking
  the decision (AGENTS §2 rule 5). The *Landed in Slice 25.1* notes (617–627) and "Re-running the
  upgrade…" (646–648) get a Slice 66 note saying the converters were removed. Schema version stays
  **6**.
- **§26, §29 (line 1424).** "A Sub-Projects section is a *view* of that hierarchy" becomes history.
  A project's work hierarchy is shown and created only through the project column's **Work** list
  and its **Add workstream** plus (Slice 60).
- **§29 (line 1618), §30 (lines 1640, 1661).** The registered types become six: Markdown, Task List,
  Progress, Reflections, Timeline, Recent Activity. `sub-projects` joins `rich-text` as a retired
  type. §30's aspirational "Prototype" list keeps its history and gains a Slice 66 note.
- **§31 (lines 1784–1787, 1901).** Recovery prose that lists Sub-Projects as a disposable view loses
  it. The archived-project sentence at 1901 is re-worded: archived descendants are reached through
  Archive and workspace Settings (Slices 44, 47).
- **§54.** `list_sections` stops naming `sub-projects` among view types; `create_section` refuses it
  through the domain. No tool, grant or input shape changes.
- **Other spec lines:** 1216 (Slice 60's note that the "Sub-Projects section remain unchanged") gains a
  Slice 66 note; 3701 drops "every Sub-Projects section" from the list of link sources; 3817 (Slice
  42's journey "create a child from its Sub-Projects section") gains a note that creation now goes
  through Add workstream; §81's
  milestone list (line 4314) gains a "retired in Slice 66" note, since §81 is itself a record.
- **§66, §69, §77** (section structure, verification, actual use).

Spec line 2816 already promises that the legacy `sub-projects` identifier is unchanged. That stays
true: it is the stored name of a retired type, never a renamed one.

## Build

- **Part A — retire the type.** Drop `sub-projects` from `SECTION_CAPABILITIES` and list it in
  `RETIRED_SECTION_TYPES` with replacement guidance. `SectionService.add` refuses it for every
  caller; integrity refuses any document holding it, live or in history, with a hint to reset.
  Delete the web section folder, its registry entry and the section-level hierarchy callback only
  it called. Remove it from the seed builder and regenerate the seeds.
- **Part B — remove the upgrade pipeline** (per the
  [disposable-data decision](../../decisions/2026-10-prototype-data-is-disposable.md)). Delete the
  v2→v6 converters, the legacy-prose encoder, their tests and fixtures, and `pnpm prototype:upgrade`.
  Keep `captureActivityIdentities`, which the seed builder uses. Messages that named the upgrade
  name reset or reseed instead.
- Update the spec, the architecture tree, guides, README and decisions in the same change.

## Done when

The picker offers six types and no Sub-Projects. Browser, HTTP and both MCP transports refuse a new
Sub-Projects section with a sentence naming the workstream route. A file holding one, or any file at
another schema version, refuses to load and names `pnpm prototype:reset`. Every seed loads, passes
integrity, and renders with a dense combined order. Workstreams are still created, listed,
completed and archived through the project column. `pnpm prototype:upgrade` no longer exists, and
nothing in the code, tests or living docs refers to it. All required checks pass, and the slice is
used in the real app.

## Do not

- Write any converter, migration or compatibility path for local data.
- Bump `SCHEMA_VERSION`. Nothing about the document's shape changes; the retired type is refused by
  integrity, as Rich Text already is.
- Rename stored `kind: 'subproject'`, project ids, MCP tool names, URL shapes or the legacy type
  string. Do not relabel stored history labels.
- Add a replacement hierarchy view, or status, due dates or completion dates to the Work list
  (accepted loss; see *Decisions taken before planning*).
- Remove `projectHierarchyRevision`, the page-level `onProjectHierarchyChange` contract member, or
  `SECTION_DISPLAY_NAMES`.
- Do Stage F's integrated acceptance matrix; this slice proves its own rows only.
- Rewrite frozen roadmap records or the historical prose of decisions (amend them instead).

<!-- ───────────── Written when the slice starts ───────────── -->

## Decisions taken before planning (user, 2026-10-08 and 2026-10-09)

1. **Local prototype data is disposable until further notice.** No converter for this change;
   old files are reset. Logic that exists only to preserve old local data is deleted, not
   extended. A couple of working seeds are what must survive
   ([decision](../../decisions/2026-10-prototype-data-is-disposable.md)).
2. **Remove the dead section-level callback** in this slice.
3. **Accept losing the Sub-Projects view's per-row details.** The Work list rows show icon, name,
   nesting and a ✓ for completed work. They do not show status, due date or completion date, and
   the hierarchy can no longer be placed on a canvas. Real use decides whether a later slice adds
   any of that.

## Findings from the repository that shape the plan

- **Where Sub-Projects views live.** In seeds: `section-project-launch-sub-projects` (busy-week),
  `section-project-renovation-sub-projects` and `section-project-kitchen-sub-projects`
  (nested-projects), all at position 2 from `sliceTenCanvas` in `seeds.ts`. No seed has a shortcut
  to one, and no seed has history. The developer's `.prototype/data.json` holds none, so it keeps
  loading unchanged.
- **Integrity already refuses retired types** (`assertNotRetired` in `data-store.ts`) on `sections`,
  on `section.add`/`section.remove` snapshots and on created containers. Adding `sub-projects` to the
  list covers every place that could recreate one, with no new check. Its message currently says
  "Run pnpm prototype:upgrade"; `describeVersion` says "prototype:upgrade … or prototype:reset".
- **The refusal sentence is Rich Text-specific.** `SectionService.add` says "add a Markdown section
  instead" for every retired type.
- **The upgrade pipeline's footprint.**
  - Source: `packages/prototype-data/src/upgrade-{project-pages,operation-history,activity-identity,markdown-sections,cli}.ts`,
    `legacy-prose.ts`, with tests, and `version-3-undo-compatibility.test.ts`.
  - Fixtures: `test/fixtures/` (four JSON files and a README). Three of them hold Sub-Projects
    views, so with Part A alone their chain tests would fail at final validation. That is what makes
    Part B part of this slice rather than a follow-up.
  - Callers: `packages/domain/src/markdown-conversion.test.ts`; five cases in
    `apps/prototype-host/recovery-undo-acceptance.test.ts`; `data-file-ownership.test.ts` (one
    `upgradeDataFileOwned` refusal); the root `prototype:upgrade` script and the package's
    `upgrade-data` script.
  - Dependencies: the `upgrade` member of `DataFileOwnerKind` and its remedy text; `markdown-it` as
    a devDependency of `@cwm/prototype-data`, which only `legacy-prose.test.ts` uses.
  - **One survivor:** `seeds.ts` imports `captureActivityIdentities` from
    `upgrade-activity-identity.ts` to fill seed Activity context. It moves to a seed-owned module.
- **Owner records are parsed as plain strings** (`data-file-ownership.ts`): an unknown `kind` falls
  back to a generic remedy, so dropping `upgrade` from the union cannot break reading a stale owner
  file.
- **The host acceptance cases.** Two of the five (`cursor, revision and both entries survive a
  restart…` and `Archive outlives expired and pruned actions`) use the upgrade only to get a
  current file from `nested-projects-v3.json`. They test history and Archive, not conversion, and
  can start from `writeSeedFile` with the `nested-projects` seed. The other three
  (`v2 and v3 files convert…`, `a v5 file with Rich Text history converts…`, `a hand-edited v6 file
  holding Rich Text…`) test conversion and are deleted. Helpers that only they use
  (`legacyReceipts`, `legacyTombstone`, `upgrade`, `upgradeCli`) are removed with them.
- **`onProjectHierarchyChange` on a section has one caller.** `SubProjectsSection.create` is the only
  section that calls it. `projectHierarchyRevision` stays, because `TimelineSection` reads it.
  `ProjectCanvas`'s page-level `onProjectHierarchyChange` also loses its only call, but
  `project-page-contract.ts` requires it of every page, and the Todos, Archive and Reflections pages
  call theirs.
- **Ordering.** `listPlacements` sorts a page's live sections and shortcuts by `position`, then
  `id.localeCompare`. Removing position 2 from `sliceTenCanvas` also shifts nested-projects' Recent
  Activity sections (6) and Renovation Home's four shortcuts (7–10); `seeds.test.ts` checks section
  density only.

## Design

### Part A — retire the type

**Contracts (`section.ts`).**
- Remove `'sub-projects'` from `SECTION_CAPABILITIES`.
- `RETIRED_SECTION_TYPES` changes from a string list to a frozen record of **type → replacement
  sentence**:
  - `'rich-text'`: "add a Markdown section instead";
  - `'sub-projects'`: "create a workstream under the project instead".

  The sentence is surface-neutral, because the domain throws it to browser, HTTP and MCP callers
  alike and must not name a UI control or an MCP tool (AGENTS §1). The surfaces add their own
  route: `create_section`'s MCP description names `create_project` with a parent, and the web never
  offers the type at all. `isRetiredSectionType` keeps
  its signature (own-key check); a new `retiredSectionReplacement(type): string | undefined` returns
  the sentence. The doc comment links both decisions.
- `SECTION_DISPLAY_NAMES` keeps `'sub-projects': 'Sub-Projects'`, because the refusal message names
  the type that way. Its comment says why it outlives the type.

**Domain (`section-service.ts`).** The check stays where Slice 63 put it: after the actor and grant
checks, before any lookup. Its message becomes
`` `${displayNameOf(type)} sections are retired and can no longer be created; ${retiredSectionReplacement(type)}.` ``
The refusal order is unchanged: an agent without `projects.write` gets the permission error first.

**Integrity (`data-store.ts`).** No new check. `assertNotRetired` now also catches `sub-projects`.
Its message, and `describeVersion`'s, name `pnpm prototype:reset` (or `prototype:seed`) instead of
the upgrade. The comment links the disposable-data decision.

**Web.**
- Delete `sections/sub-projects/` (six files) and its registry entry and import. The registry
  comment stops naming `sub-projects` as the one display-name override.
- **Remove the section-level `onProjectHierarchyChange` callback:**
  - `SectionContentInputs` and its key check in `section-contract.ts`;
  - the output and wiring in `project-section-frame.ts`;
  - the no-op in `shortcut-frame.ts`;
  - `projectHierarchyChanged` and its template binding in `project-canvas`;
  - the input on the six remaining section components;
  - `design-lab-fixtures.ts`;
  - the stories and specs that pass it.

  `ProjectCanvas` keeps its page-level input for the page contract. Its doc comment says the canvas
  no longer calls it.
- **Re-word comments** that give the Sub-Projects section as a reason for something still true:
  - `project-page-store.ts`: the hierarchy revision now exists for Timeline;
  - `project-workspace-store.ts`: `notifyHierarchyChanged` is now called by pages;
  - `project-page-navigation.ts`, `primitive-panels.ts`/`.html`, `project-canvas.stories.ts`;
  - `project-workspace-shell.spec.ts`, `core/shell/shell-store.spec.ts`.

**Seeds (`seeds.ts`).** `sliceTenCanvas` drops the Sub-Projects line and every later placement on
those pages moves up one:
- Progress, Reflections and Timeline become 2–4;
- nested-projects' explicit Recent Activity sections become 5;
- Renovation Home's four shortcuts become 6–9;
- the Launch canvas in busy-week renumbers the same way.

The archived `section-project-renovation-archived-notes` keeps its stale position 7: archived
records are outside the live order, and Restore appends. Regenerate `prototype/seeds/*.json`; only
`busy-week` and `nested-projects` change. In `seeds.test.ts`, the four hard-coded type lists (around
lines 141, 189, 504 and 513) drop `sub-projects`, and a combined section-and-shortcut density check
is added over **live** placements per page.

**MCP (`tools/sections.ts`).** `list_sections` drops `sub-projects` from its view list. The contract
test's `sub-projects` exemption is removed. `create_section`'s description gains one sentence,
parallel to its Rich Text one, saying the work-hierarchy view is retired and nested work is created
with `create_project` and a parent. It uses prose, not the identifier, so the description test's ban
on the identifier holds.

**Tests that name the view.** These swap it for Progress, Timeline or Recent Activity, or drop it
from a type list:
- `section.test.ts`, `section-ownership.test.ts`, `section-recovery-policy.test.ts`,
  `project-archive-service.test.ts`;
- `registry.spec.ts`, `section-create-dialog.spec.ts`;
- `project-section-frame.spec.ts`: the Sub-Projects display-name case is deleted;
- `recovery-undo-acceptance.test.ts`, `apps/e2e/archive.spec.ts`, `apps/e2e/section-edit-undo.spec.ts`.

**Counts that assume seven sections on nested-projects Home** drop to six:
`apps/e2e/canvas-editing.spec.ts:296` and `:348` (`[data-section-frame]`) and
`apps/e2e/web.spec.ts:138` (`[data-section-item]`). A new assertion is **added** to
`canvas-editing.spec.ts`, next to the journey around line 346: the nested-projects Home and Kitchen
canvases render their live sections and shortcuts in the seed's order, by id. It is written first,
so it fails while the Sub-Projects frame is still there. This is Acceptance 4's evidence.

### Part B — remove the upgrade pipeline

- **Move** `captureActivityIdentities` and its local helpers (`collection`, `text`, `byId`,
  `rootOf`, and the `Row` type alias; no other upgrade imports) from `upgrade-activity-identity.ts` to a new
  `packages/prototype-data/src/activity-identity.ts`. `seeds.ts` imports it from there, and its doc
  comment describes seed use only. Its rules are tested today only through
  `upgrade-activity-identity.test.ts`, which is deleted, so the capture cases move to a new
  `activity-identity.test.ts`:
  - root vs subproject root;
  - no project for agent events;
  - the titleless-reflection fallback;
  - the five refusals.

  The refusal branches stay, because a hand-edited seed builder could still hit them.
- **Delete:**
  - `upgrade-project-pages.ts`, `upgrade-operation-history.ts`, `upgrade-activity-identity.ts`,
    `upgrade-markdown-sections.ts`, `upgrade-cli.ts` and `legacy-prose.ts`, with their tests (five
    test files; `upgrade-operation-history.ts` has none of its own);
  - `version-3-undo-compatibility.test.ts`;
  - `test/fixtures/` (all five files);
  - `packages/domain/src/markdown-conversion.test.ts`.
- **`index.ts`** keeps only the seed, persona, token and seed-CLI exports, plus
  `captureActivityIdentities` if anything outside the package needs it; otherwise it is not exported.
- **Scripts.** Remove `prototype:upgrade` from the root `package.json` and `upgrade-data` from
  `@cwm/prototype-data`'s. Remove the `markdown-it` devDependency there and refresh `pnpm-lock.yaml`.
- **Ownership.** Remove `'upgrade'` from `DataFileOwnerKind` and its remedy. Remove the
  `upgradeDataFileOwned` refusal case from `data-file-ownership.test.ts`; the seed case still covers
  CLI refusal.
- **Host acceptance.** In `recovery-undo-acceptance.test.ts`:
  - delete the three conversion cases;
  - start the two history/Archive cases from a `nested-projects` seed written by `writeSeedFile`;
  - delete the helpers left unused.

  The kept cases need only seed content (`project-alex-private`, `section-project-kitchen-tasks`,
  Recent Activity, an empty history so `revision` counts hold). One assertion depends on converted
  data: "Archive outlives…" expects the brief's config in the legacy-prose escaped form
  (`recovery-undo-acceptance.test.ts:338`). It changes to the seed's raw Markdown
  (`seeds.ts`, Renovation's brief). `legacyReceipts`, `legacyTombstone`, `upgrade` and `upgradeCli`
  are used only by the deleted cases and are removed.
- **Contracts tests.** In `document.test.ts`, delete `strips a version-3 undoRecords collection…`
  (line 29), which exists only for the converter. Rename `rejects a version-3 file, which needs
  pnpm prototype:upgrade` (line 35) to say it needs a reset; the behaviour it asserts stays.
- **Contracts comments.** `document.ts`'s version history comment and `project.ts`'s mention stop
  pointing to converters that no longer exist; they say versions 2–5 are no longer readable.

## Acceptance check

1. **Create is refused everywhere.**
   - `SectionService.add` with `sub-projects` throws `DomainRuleError` naming the workstream route
     and writes nothing; an agent without `projects.write` still gets the permission error first.
   - `POST /api/projects/:id/sections` returns the mapped rule error.
   - MCP `create_section` over Streamable HTTP and over stdio returns the tool error
     (`mcp-acceptance.mjs`).
   - `rich-text` is still refused, naming Markdown.
2. **Load is refused with the reset remedy.** `data-store.test.ts` covers three documents: a seed
   copy with a live Sub-Projects section; one with a `section.add` snapshot of one in history; one
   at schema version 5. Each throws `DocumentIntegrityError` (or the version error) whose message
   names `pnpm prototype:reset` and does not name `prototype:upgrade`.
3. **Every seed works.** `seeds.test.ts` loads all six seeds through integrity. It finds no
   `sub-projects` anywhere and a dense combined order on every page. The host serves each seed
   through `prototype:seed`.
4. **The picker and canvas.** The add-section dialog lists six types, Markdown first. The
   `nested-projects` Home and Kitchen canvases render in seed order with no gap (e2e).
5. **Work still works.** The existing e2e journeys for Add workstream, Work navigation, workstream
   completion, archive and Settings recovery pass unchanged.
6. **The pipeline is gone.** Run
   `rg "prototype:upgrade|upgrade-data|upgrade[A-Z]\w+|upgrade-(cli|project-pages|operation-history|activity-identity|markdown-sections)|[Ll]egacy-?[Pp]rose|V3_SCHEMA_VERSION|prototype-data/test/fixtures"`
   over `apps packages scripts .github package.json README.md AGENTS.md docs/architecture docs/guides`
   and the main spec. It finds only dated amendment or Slice 66 notes; frozen roadmap records and
   historical decision prose are expected to keep theirs. `pnpm prototype:upgrade` exits as an
   unknown script.
7. **Gates:** `pnpm test`, `pnpm lint` (with `docs:check`), `pnpm build` (initial bundle under the
   unchanged 1,050,000-byte ceiling), `pnpm storybook:build`, `pnpm e2e`, and host `acceptance`,
   `agent-acceptance`, `mcp-acceptance`, `live-acceptance`. Build `pnpm docs:api` first.
8. **Actual use.** Start `pnpm dev:host` and `pnpm dev:web` separately on the developer's
   `.prototype/data.json`, which should load unchanged.
   - Load `nested-projects` and `busy-week` from the dev panel. Confirm Home and Kitchen render
     without the view, Add workstream creates and lists a child, and header Undo/Redo still work.
   - Try `create_section` with `sub-projects` from a real MCP client and read the refusal.
   - Record friction with `CURRENT_SLICE = 66`.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/section.ts`, `section.test.ts` | modify | drop capability; `RETIRED_SECTION_TYPES` record; `retiredSectionReplacement`; comments |
| `packages/contracts/src/document.ts`, `project.ts` | modify | comments only (no converters exist) |
| `packages/contracts/src/document.test.ts` | modify | delete the `undoRecords` stripping case; rename the version-3 case to name reset |
| `packages/domain/src/section-service.ts`, `section-service.test.ts` | modify | per-type refusal sentence |
| `packages/domain/src/project-service.ts`, `project-visibility.ts`, `apps/web/src/app/features/projects/project-canvas.spec.ts` | modify | current public comments after hierarchy-view retirement |
| `packages/domain/src/section-ownership.test.ts`, `section-recovery-policy.test.ts`, `project-archive-service.test.ts` | modify | drop `sub-projects` from type tables and view lists |
| `packages/domain/src/markdown-conversion.test.ts` | delete | converter-only test |
| `packages/repositories/src/data-store.ts`, `data-store.test.ts` | modify | reset remedy in both messages; refusal cases |
| `packages/repositories/src/data-file-ownership.ts` | modify | drop `upgrade` kind and remedy |
| `packages/prototype-data/src/activity-identity.ts`, `activity-identity.test.ts` | create | `captureActivityIdentities` for seeds, with its ported capture and refusal cases |
| `packages/prototype-data/src/upgrade-*.ts` (five) and their four tests, `legacy-prose.ts` and test, `version-3-undo-compatibility.test.ts` | delete | pipeline |
| `packages/prototype-data/test/fixtures/*` (five) | delete | pipeline fixtures |
| `packages/prototype-data/src/index.ts`, `seeds.ts`, `seeds.test.ts` | modify | exports; drop the view and renumber; combined density |
| `packages/prototype-data/package.json`, root `package.json`, `pnpm-lock.yaml` | modify | drop `upgrade-data`, `prototype:upgrade`, `markdown-it` devDependency |
| `prototype/seeds/busy-week.json`, `nested-projects.json` | regenerate | seeds without the view |
| `packages/mcp-tools/src/tools/sections.ts`, `contract.test.ts` | modify | descriptions; drop exemption; refusal |
| `apps/prototype-host/api/routes.test.ts` | modify | HTTP refusal |
| `apps/prototype-host/recovery-undo-acceptance.test.ts` | modify | delete conversion cases and their helpers; seed-based start; raw brief Markdown at line 338; replace view id |
| `apps/prototype-host/data-file-ownership.test.ts` | modify | drop the upgrade refusal case |
| `apps/prototype-host/scripts/acceptance.mjs`, `mcp-acceptance.mjs` | modify | refusal over HTTP API and both MCP transports |
| `apps/web/src/app/features/projects/sections/sub-projects/*` (six) | delete | the view |
| `apps/web/src/app/features/projects/sections/registry.ts`, `registry.spec.ts`, `section-create-dialog.spec.ts` | modify | six types |
| `apps/web/src/app/features/projects/sections/section-contract.ts` | modify | drop section-level callback |
| `apps/web/src/app/features/projects/sections/section-frame/project-section-frame.ts`, `.spec.ts` | modify | drop the output; drop the display-name case |
| `apps/web/src/app/features/projects/shortcuts/shortcut-frame.ts` | modify | drop the no-op |
| `apps/web/src/app/features/projects/project-canvas.ts`, `.html`, `.stories.ts` | modify | drop `projectHierarchyChanged` and binding; comments |
| `apps/web/src/app/features/projects/sections/{markdown,tasks,progress,reflections,timeline,activity}/*-section.ts` and specs that pass the input | modify | drop the input |
| `apps/web/src/app/features/projects/project-page-store.ts`, `project-workspace-store.ts`, `project-page-navigation.ts`, `project-workspace-shell.spec.ts`, `core/shell/shell-store.spec.ts` | modify | comments only |
| `apps/web/src/app/prototype/design-lab/design-lab-fixtures.ts`, `panels/primitive-panels.ts`, `.html` | modify | drop the input; re-word the note |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 66` |
| `apps/e2e/archive.spec.ts`, `section-edit-undo.spec.ts` | modify | replace the view id |
| `apps/e2e/project-history.spec.ts` | modify | Progress starts at position 2 after seed retirement |
| `apps/e2e/canvas-editing.spec.ts`, `web.spec.ts` | modify | Home section counts 7 → 6; Home order assertion |
| `.prototype/notes.json` | modify | friction from actual use |
| Main spec | modify | lines listed under *Spec sections* |
| `docs/decisions/2026-10-retiring-the-sub-projects-section.md`, `README.md` | create / modify | §78 entry and index |
| `docs/decisions/2026-09-schema-version-4-conversion.md`, `2026-09-schema-version-5-conversion.md`, `2026-10-schema-version-6-markdown-conversion.md`, `2026-09-one-writer-per-data-file.md`, `2026-09-historical-activity-identity.md`, `2026-10-prototype-data-is-disposable.md` | modify | dated amendments: converters, upgrade command and `upgrade` owner removed; capture now a seed module; the pipeline removal landed; index statuses |
| `docs/decisions/2026-09-project-workspaces-and-subproject-work-units.md`, `2026-09-a-section-has-a-name.md`, `2026-09-sections-own-their-data.md`, `2026-09-workstream-user-terminology.md`, `2026-09-reactivating-under-an-archived-ancestor.md`, `2026-10-work-canvas-shortcut-destinations.md` | modify | dated amendments where they describe the Sub-Projects view as current; index statuses |
| `docs/architecture/prototype-data/` (all four) | modify | no converters; seeds and seed CLI only; `activity-identity.ts` |
| `docs/architecture/{contracts,domain,repositories,mcp-tools,web/projects}/` (four files each, as changed), `testing/what.md`, `testing/how.md` (line 254, `upgrade-cli.ts`), `prototype-host/live-updates/why.md`, `docs/architecture/how.md`, `what.md`, `why.md` | modify | types, remedies, removed callback, removed pipeline and command |
| `docs/architecture/prototype-host/what.md` | modify | ownership suite no longer tests an upgrade writer |
| `docs/guides/first-milestone-walkthrough.md`, `mcp-setup.md`, `README.md` | modify | six types; step 18; reset instead of upgrade |
| `docs/roadmap/planned/59-markdown-and-work-navigation.md`, `goals.md` | modify | Stage E note at close |

## Test plan — tests first

Each new case is written and watched failing before the code it drives. Deleting a test is not a
red step; the deletions happen after the new refusal tests are green.

| Test | Proves |
|---|---|
| `section.test.ts`: `sub-projects is retired with a workstream replacement` | record shape; no capability; `isRetiredSectionType` and `retiredSectionReplacement` for both types; `undefined` for `toString` |
| `section-service.test.ts`: `refuses a new Sub-Projects section naming the workstream route` | message; nothing written; grant-first order for agents |
| `data-store.test.ts`: `refuses a live Sub-Projects section, naming reset` | load refusal and remedy |
| `data-store.test.ts`: `refuses a Sub-Projects snapshot in history, naming reset` | history can't recreate one |
| `data-store.test.ts`: `an older schema version names reset, not upgrade` | `describeVersion` |
| `seeds.test.ts`: `no seed holds a retired section type`; `every page's live sections and shortcuts are densely ordered together` | seeds, including shifted shortcuts |
| `routes.test.ts`: `POST sections refuses sub-projects` | HTTP |
| `contract.test.ts`: `create_section refuses sub-projects`; descriptions free of the identifier | MCP registry |
| `registry.spec.ts`, `section-create-dialog.spec.ts` | six types, Markdown first |
| `project-section-frame.spec.ts` | content inputs no longer carry the callback; hierarchy revision still forwarded (the shortcut frame and canvas specs never referenced it and stay unchanged) |
| `activity-identity.test.ts`: ported capture cases and five refusals | the seed-only module keeps its rules |
| `document.test.ts`: `rejects a version-3 file, which needs a reset` | renamed; behaviour unchanged |
| `recovery-undo-acceptance.test.ts` (kept cases) | history restart and Archive behaviour, now from a seed |
| e2e `archive.spec.ts`, `section-edit-undo.spec.ts` | same journeys on another view |
| e2e `canvas-editing.spec.ts`: `nested-projects Home and Kitchen render their live sections and shortcuts in seed order` | Acceptance 4; red while the view exists |
| e2e `canvas-editing.spec.ts:296,348`, `web.spec.ts:138` | Home counts now six |

## Boundaries touched

- **Contracts once.** The retired record and its sentences live only in `section.ts`; the domain,
  integrity and MCP read them.
- **Domain abstractions only.** The refusal is input validation in `SectionService`; no new edge.
- **MCP calls the domain.** No tool reads the store.
- **Gateways.** The web change deletes a component and a callback; no component gains a gateway or a
  concrete adapter.
- **Disposable (§71).** Part B deletes disposable infrastructure; it adds none.
- **One writer.** The seed and reset CLIs, e2e preparation and the host keep their owner locks; only
  the upgrade writer disappears.

## Explicit non-goals

- Converting, cleaning up or preserving any existing local file.
- Showing status, due dates or completion dates in the Work list.
- Removing `RETIRED_SECTION_TYPES`' `rich-text` entry. It still refuses new Rich Text sections.
- Stage F's integrated matrix, phone/theme sweeps beyond this slice's own journeys, and any
  terminology change.

## Open questions

None. The three decisions above settle the shape. If removing the pipeline turns up a kept test
that cannot be satisfied from a seed, the Outcome reports it rather than inventing a fixture.

## Revisions

- **Initial draft (2026-10-08).** A v6→v7 converter removed views and their shortcuts, renumbered
  pages and marked unreachable history steps as retired, with an integrity exemption for retired
  steps.
- **Review round 1 (2026-10-08).** The core algorithm held. Fixes went to the fixture recipe, test
  placement, seed renumbering (shortcuts at 7–10 shift too), the exemption's scope, an Activity
  guard, the comparator, agent-facing refusal text, the canvas's page-level callback, the pinned
  clock and missed docs.
- **Review round 2 (2026-10-08).** All round-1 findings were closed; no substantive findings remained.
- **Rewrite (2026-10-09), user direction.** Local prototype data is disposable
  ([decision](../../decisions/2026-10-prototype-data-is-disposable.md)), so the converter, the
  retired-step design, the schema bump and the fixture recipe are gone. Rewriting surfaced one
  consequence the earlier plan didn't have: three existing upgrade fixtures hold Sub-Projects views.
  Once integrity refuses the type, the old pipeline's own tests fail. So the pipeline is removed in
  this slice (Part B). The user also confirmed removing the dead callback and accepting the loss of
  the per-row status line. Several round-1/2 findings carry over: seed renumbering, agent-facing
  refusal text, the page-level callback, and the missed spec lines.
- **Review round 3 (2026-10-09), fresh reviewer on the rewrite.** Parts A and B were sound in
  outline. Verified and fixed:
  - Three e2e counts assume seven Home sections (`canvas-editing.spec.ts:296,348`,
    `web.spec.ts:138`). Added, with a named order assertion for Acceptance 4.
  - A kept host case expects the escaped legacy brief (`:338`). It now expects the seed's raw
    Markdown.
  - `captureActivityIdentities` would have lost all its tests; `activity-identity.test.ts` ports them.
  - `document.test.ts`' converter-only cases were missing.
  - The domain refusal sentence named an MCP tool; it is now surface-neutral, and only the MCP
    description names `create_project`.
  - §14's policy prose is corrected rather than merely annotated, and spec line 3817 was added.
  - Added: amendments to six Sub-Projects-era decisions, three pipeline-era ones and the
    disposable-data entry; `testing/how.md`; a wider `rg` check.
  - Factual fixes: the upgrade modules have four test files, not five; `seeds.test.ts` has four
    hard-coded type lists; the archived seed note keeps its stale position. Removed three web files
    that have nothing to change.
- **Review round 4 (2026-10-09).** Eleven of twelve closed. The Home order assertion did not exist
  yet, so the plan now adds a Home-and-Kitchen seed-order e2e test, written first, plus a Test plan
  row. Two minor fixes: the `Row` alias moves with the capture helpers, and a leftover "if unused"
  hedge is gone. No substantive findings remain.

- **Implementation resumed (2026-10-09).** Contracts, domain, HTTP and MCP registry tests were written first and failed because Sub-Projects could still be created; live/history integrity cases failed because it could still load. The per-type retirement and reset remedies made these new cases green. Execution was interrupted to diagnose a Windows sandbox runtime file lock; restarting Codex restored normal sandboxed commands. Web retirement, seed/pipeline removal and living documentation now proceed as independent work areas.

- **Implementation verification (2026-10-09).** Seed retirement first failed on busy-week and nested-projects, then all 112 prototype-data checks passed. The moved Activity helper's reflection-fallback assertion also failed under a deliberate, reverted fault. Web registry, picker and frame cases failed for the six-type/callback expectations, then passed 36/36. The new Home/Kitchen order journey failed with reversed placements and passed after restoring the comparator. That temporary fault overlapped the first full verification run; the final test, app build and Storybook checks were rerun after it was reverted. A later subprocess-based domain boundary check timed out under concurrent build load, so the full offline suite was rerun without those builds; no implementation assertion failed in that run.

- **Integrated browser finding (2026-10-09).** The full browser suite exposed one more seed-order assumption: the header-history journey expected restored Progress at index 3. Removing the preceding view correctly returns it at index 2. Updated that expectation and added the previously missed file to the change list; the failure was the expected 3 versus actual 2, not a history implementation defect.

- **Diff review round 1 (2026-10-09), three independent reviewers.** Correctness/spec and the dedicated architectural-boundary pass found no substantive issues. The documentation/acceptance reviewer identified stale conversion-test coverage, decision-link annotations implying retained converters, a host ownership-suite row naming the deleted upgrade wrapper, and §77's reference to committed legacy fixtures. Each claim was checked against the diff and corrected to current seeded-file coverage or explicitly historical evidence. The reviewer confirmed that the retained history cases protect restart, exact actor isolation, pruning, expiry and durable Archive. The six-seed host load and actual-app evidence remain part of the final walkthrough, rather than being inferred from unit tests.

- **Diff review round 2 (2026-10-09), fresh independent reviewer.** Previous repairs matched the code. The remaining finding was two public domain comments describing the retired hierarchy renderer; they now explain the unchanged archived-status query and Archive/Settings eligibility. A related canvas-spec comment now names six types. No additional correctness, spec, boundary or test gaps were found.

- **Review closure and actual use (2026-10-09).** The round-2 reviewer rechecked the public comments and returned no substantive findings. All 2,957 offline tests passed with browser/build processes stopped; the earlier subprocess timeouts were not reproduced and no timeout was widened. Compodoc, lint, build, Storybook and all four host acceptance scripts passed. The developer's data loaded unchanged before seed swaps; the host loaded and served reads for all six seeds. Dev-panel busy-week and nested-projects use confirmed the six-option picker and ordered Home/Kitchen canvases. A workstream explicitly parented to Kitchen appeared in Work, creation Undo removed it, and Redo restored the same address. The real-clock SDK HTTP client refused the retired type with workstream guidance and preserved every business field; only existing authentication `lastUsedAt` bookkeeping is excluded from that comparison. Note `note-2026-10-09-001` records the accepted Work-row detail loss. The temporary walkthrough helper was deleted. The final full browser rerun follows the corrected Progress-index expectation.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

**Deliverables** — The [registry](../../../apps/web/src/app/features/projects/sections/registry.ts) offers six types, Markdown first, and the Sub-Projects renderer and section-only hierarchy callback are gone. [Contracts](../../../packages/contracts/src/section.ts) give both retired types their own replacement guidance; domain, HTTP and both MCP transports refuse creation, and [integrity](../../../packages/repositories/src/data-store.ts) refuses live or recreating history copies with reset/reseed guidance. All six seeds load with dense combined placement order. The conversion pipeline, command, fixtures and encoder are deleted; [Activity capture](../../../packages/prototype-data/src/activity-identity.ts) remains seed-owned with its focused tests. Creation, history, Archive and work-canvas shortcuts still work. The final full browser suite passed all 106 journeys, including the corrected header-history journey; 2,957 offline tests, all four host acceptance scripts, lint, documentation checks, Compodoc, app build and Storybook passed. The initial bundle is about 1.021 MB under the unchanged 1,050,000-byte ceiling. No required check was skipped.

**Deliberate choices** — Schema version stays 6 and stored identifiers and historical labels remain unchanged. The [disposable-data policy](../../decisions/2026-10-prototype-data-is-disposable.md) makes refusal plus reset preferable to another converter. The [retirement decision](../../decisions/2026-10-retiring-the-sub-projects-section.md) accepts losing a movable hierarchy overview and its row details: Work remains the hierarchy surface, while Timeline and each workstream's header expose dates and status. Page-level callbacks and Timeline's hierarchy revision are preserved. Seed/reset ownership locks remain intact.

**Deviations from the plan** — Integrated browser verification found one extra hard-coded seed index in the header-history journey; Progress now returns at index 2. Independent review also found public domain comments and living test inventories outside the initial file list still describing the retired renderer or deleted converters. Those narrowly scoped repairs were added to the plan and reviewed to closure. Windows sandbox restrictions interrupted execution; commands that the sandbox could not run used reviewed escalation. Concurrent subprocess checks timed out, so the full offline suite was rerun with browser/build processes stopped; all 2,957 tests passed without widening any timeout.

**Deferred** — Slice 59 Stage F's integrated direction-wide matrix remains separate work. Richer Work rows and a replacement hierarchy overview are not added here. Actual use is recorded in [the friction notes](../../../.prototype/notes.json), note `note-2026-10-09-001`, so later work can judge the accepted detail loss from use rather than from speculation.

**Open questions** — None blocks this slice. Sustained use must establish whether the Work list needs more row details. The walkthrough created a Kitchen child through the explicit-parent dialog, then removed and restored the same id through its own header; a real SDK client received the refusal and changed no business fields, excluding only existing authentication `lastUsedAt` bookkeeping.

**Documentation updated** — The main spec, architecture root and contracts/domain/repositories/prototype-data/prototype-host/MCP/web-projects/testing systems, both guides and README describe current behavior. The retirement decision is indexed and linked from the affected systems; twelve older decisions carry dated amendments instead of rewritten history. Compodoc was regenerated after the public-comment repairs and its fragment regression passed. Slice 59's Stage E note and remaining Stage F acceptance use the disposable-data policy; the goals and generated board mark this slice complete.
