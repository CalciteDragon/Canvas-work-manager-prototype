<!-- completed-record id="29" closed="2026-09-14" summary="Archive projects recoverable content via one capability source and a pure domain policy, with recovery metadata and two-step guidance" -->
# Slice 29 — Recovery policy and content-oriented Archive

## Goal

Make Archive a useful projection of recoverable content without weakening row ownership.

## Spec sections

[Refactor specification](../../specifications/archive-removal-undo-refactor-spec.md) and
[main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md):
Refactor §§6–9, 14–16, 18–22, 25–27; main §§11–13, 27, 29–32, 54, 61.
See [goals](../goals.md) for sequence and the activation/review protocol.

## Build

- Begin after planning Slice 28. Evolve `ProjectArchiveService` and `ProjectArchiveItem` in place; do not introduce a competing Archive service or duplicate contract. Keep root-tree origin, blockers, hidden-by-ancestor cases, independently archived rows and current grants.
- Extend the contracts capability source behind `SECTION_OWNERSHIP` / `ownedKindOf`; derive ownership helpers from it. A pure domain recovery policy combines capabilities with actual remaining content. Cover all seven registered types (including sub-projects) and conservative handling of unknown types/configs; never infer deletion eligibility from missing metadata.
- Gate before implementation: settle meaningful rich text (including whitespace/malformed config), unknown types, containers holding only pre-archived rows, and recovery guidance when their section entry would otherwise be hidden. A hidden tombstone must not strand an independently archived row. Record choices in a new decision and amend the existing archive/restore decision with a dated note.
- Keep tombstones and cascade markers. Reassignment already moves archived as well as live rows when live rows exist; preserve whole subtrees. Treat empty-after-reassignment differently from cascade. Expose recovery metadata through the existing host/MCP read and Archive store, not UI policy.
- Update main §§29–32 and contracts/domain/web-projects documentation with the landed projection semantics; update API/MCP docs if their public shape changes. Archive Restore keeps deterministic append placement, exact cascade membership and idempotency.

## Done when

Write failing policy/projection tests first for every Refactor §14 case, legacy view tombstones, unknown types, rich text and pre-archived-only containers. Domain/contract and web Archive tests demonstrate that disposable views are absent, notes/cascaded content remain recoverable, independently archived rows still have an actionable recovery path, and root/ancestor blockers plus minimal multi-grant checks are preserved. Run pnpm test, pnpm lint and an Archive browser/MCP pass with nested-projects-showcase, including a disabled Archive tab. This covers Refactor §26 criteria 1, 3–6 and the projection part of 10–11.

## Do not

- Hard-delete sections, persist undo, rename all archive APIs for terminology alone, hide archived projects or lose row-level recovery. Later slices own Undo and deletion.

## Planning status

Activated for the user's plan-only request on 2026-09-13. This document specifies future
implementation; no runtime changes or implementation acceptance are claimed. Slice 28 is
complete. Stop after plan review and documentation validation; leave Slice 29 active for
implementation. Bump `CURRENT_SLICE` when runtime implementation begins, before app use.

## Implementation design

### One capability source, separate ownership and recovery

Extend `packages/contracts/src/section.ts` with `SECTION_CAPABILITIES` covering exactly the
seven currently registered types. Each entry has optional `ownedData` and `recovery`:

| Type | Owned data | Recovery capability |
|---|---|---|
| task-list | tasks | owned-content |
| reflections | reflections | owned-content |
| rich-text | none | config |
| sub-projects | none | none |
| progress | none | none |
| timeline | none | none |
| recent-activity | none | none |

Define the capability schema/type once in contracts. Derive `SECTION_OWNERSHIP` from this
source and preserve `ownedKindOf`, `sectionKindOf` and `containerTypeFor` behavior for existing
callers. Lookups must use own properties (including `constructor`, `toString`, `__proto__`
cases). Keep section `type` open. Unknown types own no rows but have **unknown recovery**,
never implicitly `none`. Pin registry/capability coverage in the web registry test; adding a
registered type now requires an explicit recovery declaration, documented in main §§29–30.

Add a pure `section-recovery-policy.ts` function in domain. It consumes a section and its
actual remaining canonical owned rows, including archived rows, and returns an include/exclude
decision and typed recovery metadata. It does not query repositories, mutate, read clocks,
import Angular, or decide permanent deletion. `ProjectArchiveService.derive` gathers/scopes
rows from its existing reads and calls it. Evaluate current state after removal/reassignment,
not historical intent: an input saying reassign is not proof that rows moved.

### Settled policy gates

These are [planning choices](../../decisions/2026-09-content-oriented-archive-policy.md), pending implementation:

| Canonical content at projection time | Section entry |
|---|---|
| Any of the four known disposable views, with any config | Absent, including legacy tombstones and live views hidden beneath an archived project |
| Rich text with only a string `text` key and `text.trim().length > 0` | Present: config content |
| Rich text with only a string `text` key that is empty/whitespace | Absent |
| Rich text with missing/non-string `text`, or additional config keys | Present conservatively: unknown content; preserve config verbatim |
| Unknown section type, including prototype-property names | Present conservatively: unknown content; never infer ownership or safe deletion |
| Task/reflection container with any rows still assigned to it | Present: owned content, including pre-archived-only rows |
| Task/reflection container with no rows remaining | Absent, including empty-after-reassignment |

Rich text is currently plain textarea prose; use JavaScript string trim, with no HTML parsing,
coercion or content rewriting. A title or layout setting alone does not make a known empty
container recoverable. Malformed typed rich-text config is uncertainty, not proof of emptiness;
the storage schema still requires an object and is not relaxed. Do not duplicate the web's
rich-text editor schema in domain: inspect the recovery-relevant keys as a pure predicate.

A pre-archived-only container is intentionally **shown** because it is the dependency required
to recover meaningful rows. Its owned-row count is positive and its cascade count is zero.
Restore the section first; those rows remain archived, then their existing row-level actions
become available (parent task before child when needed). This resolves the hidden-tombstone
trap without a new blocker action, automatic multi-step restore, or special recovery service.

Current `SectionService.settleRows` returns immediately when no live rows exist. Preserve that
behavior even if a caller supplies reassign: archived-only rows remain in the source, so its
entry remains visible. When live rows do exist, reassign moves **all** rows (including archived
subtrees) to the valid target; the emptied source disappears from Archive. Test both paths.

### Projection and metadata

Evolve `ProjectArchiveSectionItemSchema` in `packages/contracts/src/project-archive.ts` with
optional `recovery` metadata, as a shared discriminated union:

- `{ kind: 'owned-content', ownedData: 'tasks' | 'reflections', contentCount: positive integer }`
- `{ kind: 'config' }`
- `{ kind: 'unknown' }`

Optionality permits existing fixtures/consumers during migration; the domain emits metadata
for **every section entry it projects**. Do not add metadata to stored `ProjectSection` or
change document version 3. `contentCount` counts every canonical row still assigned to the
container once, including all descendants and independently archived rows; it does not promise
that one section Restore revives all of them. Keep `cascadeCount` as the exact count of rows
whose `archivedWithSectionId` names this section; never replace it with the total.

Filter only the section-item loop, after the existing archived/hidden eligibility gate. Keep
subproject, task and reflection item loops, canonical entities, IDs, root context, sorting,
origin breadcrumbs/page state, causes and highest-blocker priority unchanged. Actual archived
projects remain visible regardless of the Sub-Projects view's recovery capability. Meaningful
live sections under archived ancestry remain `not-archived`, with no direct Restore. Archived
sections stay blocked by that ancestor until it is reactivated. Row blockers continue to resolve
to a visible content-bearing container or task, or the root/project recovery control.

The HTTP Archive route and `get_project_archive` already forward `derive` results; propagate
metadata through those existing seams and `ArchivePageStore.items`, with contract/route/tool/store
tests proving it survives. Do not add a gateway member, endpoint, service dependency or MCP tool.
The presentational `ArchivedRegion` renders the metadata: total owned content, exact 'restores
with this section' cascade count, rich-text content, or a conservative unknown-content label.
For an archived zero-cascade container make the two-step action explicit: restore the section,
then restore its archived rows separately. For an archived container blocked by a project, name
that highest project blocker first. A live zero-cascade container beneath archived ancestry is
`not-archived`: show project reactivation guidance, never instruct restoring its live section or
live rows. Independently archived rows under it retain their own subsequent recovery guidance.
Existing ready/blocked actions and store dispatch remain canonical.
Preserve the existing pending/error, stale-navigation and live-refresh guards.

All removal writes still retain tombstones; restoring a hidden disposable tombstone directly
through the existing section API remains supported. Archive Restore still appends to the original
page's current combined section/shortcut order and restores exact cascade membership, with no
second activity event, timestamp change or movement on retry. Full Undo and hard deletion belong
to later slices. Update misleading source doc comments without renaming the archive APIs.

## Acceptance check

The original Done when above remains the completion contract; the Refactor §14 matrix is tested
for its **Archive column only** here. Its hard-delete and Undo columns are deferred.

1. Tests first: add the policy, capability and projection cases below; observe new semantic
   assertions fail for the expected missing behavior, then implement minimally and keep them green.
   Existing invariant tests may already pass: run and retain them, do not manufacture red failures.
2. Run `pnpm --filter @cwm/contracts test`, `pnpm --filter @cwm/domain test`,
   `pnpm --filter @cwm/mcp-tools test`, `pnpm --filter @cwm/prototype-host test`, and
   `pnpm --filter web test` as the corresponding increments land. Finish with `pnpm test`,
   `pnpm lint`, and `pnpm docs:check`; record results and any environment-limited skips honestly.
3. With dev servers stopped, run `pnpm --filter @cwm/e2e e2e archive.spec.ts`. Extend that
   existing journey using `nested-projects-showcase` and the real MCP client. Assert by created
   IDs: four removed disposable views absent; nonempty Notes present; empty Notes absent;
   cascaded list plus rows present; reassigned source absent; pre-archived-only task/reflection
   containers present with zero cascade count. Reload and check persisted IDs and config.
4. In the same journey, restore a pre-archived-only container and then its rows, and restore
   a cascaded container while independently archived rows stay archived. Interpose a Home
   shortcut/section before restore and assert append placement, exact membership and retry
   idempotency. Demonstrate the same projection/metadata through `get_project_archive` and
   the canonical `restore_section`/`restore_task`/`restore_reflection` tools. Keep root/ancestor
   blockers and project status selection assertions. Read with the Archive tab disabled, then
   use More → Open archive from a nested route to enable/open it and perform recovery.
5. Use the actual application after automated review: start `pnpm dev:host` and `pnpm dev:web`
   in separate terminals, load `nested-projects-showcase` through the dev panel, perform the
   content cases and two-step recovery, and inspect readable counts, copy and blockers. Use
   the existing MCP setup guide for a real client. Record observed friction through the dev
   panel into `.prototype/notes.json` with slice 29. Do not invent observations from tests.
6. Review the implementation diff for correctness/spec, boundaries, acceptance and living docs
   with subagents, fix verified findings, and re-run affected checks. At close, write Outcome,
   complete via `roadmap.mjs`, update goals, and leave checks green. This plan-only session does
   not execute these implementation steps or close the slice.

## File-level change list

Paths below are the bounded **implementation** checklist; tests and stories are explicit.
No repository adapter, stored schema migration, seed snapshot or new transport is required.

| File | Change and responsibility |
|---|---|
| `packages/contracts/src/section.ts` | Capability schema/map, derived compatibility ownership map/helpers, accurate doc comments |
| `packages/contracts/src/section.test.ts` | Seven capabilities, ownership compatibility, unknown/prototype-key behavior |
| `packages/contracts/src/project-archive.ts` | Recovery metadata schema/type and optional section item field |
| `packages/contracts/src/project-archive.test.ts` | Valid variants, malformed metadata rejection, existing item compatibility |
| `packages/domain/src/section-recovery-policy.ts` (new) | Pure content eligibility and recovery metadata |
| `packages/domain/src/section-recovery-policy.test.ts` (new) | Full policy matrix, rich-text uncertainty, counts and no input mutation |
| `packages/domain/src/project-archive-service.ts` | Scoped row context, policy-based section projection, emitted metadata |
| `packages/domain/src/project-archive-service.test.ts` | Matrix against canonical state, blockers, scope, grants and counts |
| `packages/domain/src/section-service.ts` | Doc comments distinguish retained removal and Archive Restore from future Undo; no mutation behavior change |
| `packages/domain/src/section-ownership.test.ts` | Cascade/reassign/archived-only regression sequences and whole subtrees |
| `packages/domain/src/section-service.test.ts` | Append to combined page order, exact restore membership and idempotency regression coverage |
| `apps/prototype-host/api/routes.test.ts` | Existing Archive route carries filtered result/metadata and scope errors |
| `packages/mcp-tools/src/tools/project-pages.ts` | Archive tool description explains content projection; same grants and execution |
| `packages/mcp-tools/src/contract.test.ts` | Nonempty Archive fixture, metadata, exact minimal-grant success and each missing-grant denial |
| `apps/web/src/app/features/projects/sections/registry.spec.ts` | Every registered type has exactly one contracts capability |
| `apps/web/src/app/features/projects/sections/rich-text/rich-text-config.ts` | Comment clarifies editor parsing versus domain recovery inspection; no editor behavior change |
| `apps/web/src/app/features/projects/archived-region/archived-region.ts` | Presentational labels for supplied recovery metadata |
| `apps/web/src/app/features/projects/archived-region/archived-region.html` | Render counts and zero-cascade recovery guidance with existing styles |
| `apps/web/src/app/features/projects/archived-region/archived-region.spec.ts` | Metadata copy, zero-cascade steps, unchanged disabled/pending actions |
| `apps/web/src/app/features/projects/archived-region/archived-region.stories.ts` | Content, unknown and pre-archived-only examples |
| `apps/web/src/app/features/projects/pages/archive-page-store.spec.ts` | Metadata passes through unchanged and two-step canonical restore calls |
| `apps/web/src/app/features/projects/pages/archive-page.spec.ts` | Projection rendering, empty result, root blocking and error behavior |
| `apps/e2e/archive.spec.ts` | Executable browser/MCP acceptance described above |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | Set CURRENT_SLICE to 29 when implementation starts |
| `.prototype/notes.json` | Real-use friction through the existing note action |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | Update §§29–32 and §54 projection wording only when implemented; keep future Undo/deletion distinct |
| `docs/architecture/contracts/overview.md`, `docs/architecture/contracts/how.md`, `docs/architecture/contracts/what.md`, `docs/architecture/contracts/why.md` | Single capability source, metadata contract, registration cost and decision link |
| `docs/architecture/domain/overview.md`, `docs/architecture/domain/how.md`, `docs/architecture/domain/what.md`, `docs/architecture/domain/why.md` | Pure policy, meaningful projection and recovery invariants; API symbol links |
| `docs/architecture/web/projects/overview.md`, `docs/architecture/web/projects/how.md`, `docs/architecture/web/projects/what.md`, `docs/architecture/web/projects/why.md` | Domain-supplied content display and two-step recovery |
| `docs/architecture/prototype-host/api/how.md`, `docs/architecture/mcp-tools/how.md` | Explain enriched existing Archive response; review their other three files for continued accuracy |
| `docs/architecture/testing/how.md` | Document extended Archive acceptance in the existing journey; review its other three files |
| `docs/guides/mcp-setup.md` | Content projection and unchanged canonical restore sequence |
| `docs/decisions/2026-09-content-oriented-archive-policy.md` | Planning choices now; append implementation evidence at landing |
| `docs/decisions/2026-09-what-undo-means-for-an-archived-row.md`, `docs/decisions/2026-09-root-archive-recovery-guidance.md`, `docs/decisions/2026-08-section-config-ownership.md` | Dated amendments distinguishing planned projection/recovery inspection from current runtime, then landed semantics |
| `docs/decisions/README.md` | Index the new policy decision and amendments |
| `docs/roadmap/active/29-recovery-policy-and-archive.md`, `docs/roadmap/goals.md`, `docs/roadmap/progress.md` | Review evidence, implementation Outcome later, accurate active status and generated board |

`section.ts` and `project-archive.ts` are already barrel-exported. Keep the domain helper internal
to its package unless another legitimate consumer appears; no unused public export or service.
During this planning session only the active plan, goals/board, decision entry/index and dated
planning amendments are changed. Architecture links to the planned choice may be added in `why.md`
explicitly labelled pending; current behavior prose remains true.

## Test plan — tests first

| Test file / named case | What it proves |
|---|---|
| `section.test.ts`: capability/ownership table and prototype keys | All seven types; two row owners; four disposable views; rich-text config; unknown never defaults to disposable |
| `project-archive.test.ts`: recovery variants | Positive integer owned counts and valid owned kinds; config/unknown variants; malformed/missing discriminants rejected; old items still parse |
| `section-recovery-policy.test.ts`: Refactor §14 Archive matrix | Each matrix row plus Sub-Projects and empty reflections; no inference from ownership alone |
| `section-recovery-policy.test.ts`: meaningful plain text and conservative uncertainty | Empty, spaces, tabs, newlines, Unicode whitespace, literal markup as prose, missing/non-string text, extra keys, unknown types; frozen inputs unchanged |
| `project-archive-service.test.ts`: legacy projection and origin | Preexisting disposable tombstones remain stored but absent; rich prose/config unchanged; section metadata emitted; tasks/reflections/projects unchanged; stable sort and correct page/breadcrumb |
| `section-ownership.test.ts` + projection suite: actual remaining rows | Cascade marks only live rows, reassign with live rows moves all archived/live descendants across valid pages, archived-only reassign is a no-op for rows, emptied source excluded |
| projection suite: pre-archived-only recovery chain | Task/reflection containers remain visible at contentCount > 0, cascadeCount 0; blocked rows become ready only after section/parent restore, with independent markers preserved |
| projection suite: hidden by ancestor | Highest archived root/project wins over section/task blockers; meaningful live content uses not-archived; archived subprojects remain items even when Sub-Projects views are absent |
| projection suite: authorization and scope | Exactly projects.read + tasks.read + reflections.read succeeds; each missing grant denies before repository reads, even empty; foreign/missing root not found, subproject rejected, sibling roots excluded |
| `section-service.test.ts`: canonical Restore regressions | Original page append after current sections/shortcuts, disabled source page allowed, exact cascade only, retry no reorder/time/event; direct hidden-tombstone restore still works |
| existing ownership/restore suites: failure and permissions | Keep invalid target type/project/workspace, self/archived/disabled reassign target, missing policy, ancestor freeze, write-only minimum grants and refused-write atomicity coverage; add only missing cases |
| `routes.test.ts` + `contract.test.ts`: boundary payload | Real service result, nonempty metadata, no UI filter; no partial-grant MCP result; no projection writes/events |
| `archived-region.spec.ts`: content copy/actions | Total count distinct from cascade count; archived zero-cascade two-step guidance; live zero-cascade containers with live/mixed independently archived rows under project ancestry show reactivation guidance only; unknown/config labels; blocked/not-archived/pending items cannot dispatch |
| `archive-page-store.spec.ts` + `archive-page.spec.ts`: projection use | Metadata passes unchanged, section restore followed by explicit row restore, empty/error states, stale/live guards retained, no UI eligibility logic |
| `apps/e2e/archive.spec.ts`: content recovery via browser and MCP | Created-ID assertions, reload durability, disabled tab entry, canonical recovery paths and metadata through actual transport |

## Boundaries touched

Contracts define every shared shape once. Capabilities are framework-free contract metadata;
content evaluation is a pure domain helper over repository-derived state. Domain retains its
existing repository-only Archive dependencies, with no new service edge and no infrastructure
imports. MCP calls services only; routes forward results; Angular consumes the existing gateway
interface and renders supplied metadata without reimplementing eligibility. Preserve all existing
read and write grants and no-partial combined reads. No domain wall clock, component design
literals, prototypeMode branches or core-to-prototype dependency. Retained section/row IDs and
cascade markers keep current document integrity; no schema version or transaction seam changes.

## Explicit non-goals

- Hard deletion, purge, retention windows, undo records/receipts/persistence, Undo UI, placement
  snapshots, Redo, or an independent ArchiveItem aggregate (Slices 30–33 and optional future work).
- Removal-dialog redesign, generic operation frameworks, archive API renaming, automatic
  dependency restoration, grouping away row entries, or changing grants/project visibility.
- Rich-text editor migration, HTML semantics, config repair, whole-registry cleanup, seed rewrites,
  new repositories/transports, or any production infrastructure prohibited by AGENTS.md.

## Open questions

No unresolved implementation gate in this draft: the conservative text/unknown policy and
pre-archived-only dependency entry are explicit choices for reviewer challenge. Revisit copy and
Archive density after the browser pass; record friction without expanding this slice. If the
review identifies a choice that changes the scope, resolve it in this plan before implementation.

## Revisions

- **Initial draft (2026-09-13):** Grounded in both specs, capability helpers, the existing
  ProjectArchiveService/item union, settleRows/restoreSection, Archive store/list, tests and
  previous recovery decisions. Chose visible dependency containers instead of new restore actions;
  limited the slice to projection, metadata and documentation over retained storage. Review pending.
- **Round 1 (2026-09-13, review_slice29):** Reviewer found that unconditional zero-cascade
  two-step copy would misdirect live containers hidden beneath an archived project. Restricted
  section-then-row guidance to archived sections, kept highest-project blockers first, and added
  component tests for live-only and mixed independently archived rows under a hidden live
  container. Reviewer otherwise found no substantive spec, boundary, scope or coverage gaps.
  Also recorded the pending config-inspection exception in the existing config decision.
- **Round 2 (2026-09-13, review_slice29):** Re-reviewed the complete revised plan and the
  pending decision/amendments, goals and architecture links. No substantive findings. The
  reviewer confirmed the lifecycle-specific recovery copy and tests, preserved ownership,
  cascade membership, blockers, scope/grants, and the separation from deletion/Undo.

## Planning verification

Plan review is complete with no remaining substantive findings. `node scripts/roadmap.mjs check`
and `pnpm docs:check` passed (18 system folders, 194 documents). The first docs check could not
read the installed Mermaid package under sandbox permissions; the same check passed with that
access allowed. `git diff --check` passed. Runtime tests, lint and browser/MCP implementation
acceptance are intentionally deferred: this request creates and reviews the plan, and no runtime
files were changed. Slice 29 remains active and has no implementation Outcome yet.

## Implementation status (2026-09-13)

Runtime implementation began in a later session on 2026-09-13; `CURRENT_SLICE` is 29. The
"Planning status" and "Planning verification" sections above are the historical record of the
plan-only session. This section records the first implementation session; the Outcome below closes the slice.

**Landed, tests first.** Contracts capabilities and recovery metadata (`section.ts`,
`project-archive.ts`), the pure `section-recovery-policy.ts`, the filtered/annotated section loop
in `ProjectArchiveService`, ownership and restore regressions, host route and MCP contract
pass-through cases, the MCP description, `ArchivedRegion` copy, store/page/registry specs and
stories, the extended `archive.spec.ts` journey, and the documentation in the change list. New
policy, projection and component assertions were observed failing for the missing behavior before
implementation; the boundary, store, registry and several ownership/restore regressions passed on
first run because they pin existing invariants, as step 1 anticipates.

**Checks.** `pnpm test` and `pnpm lint` (including `pnpm docs:check`, after `pnpm docs:api`)
pass. After review fixes: domain 446, MCP tools 139 and web projects 389 tests pass, and web/e2e
type-checks and docs check pass.

**Not run — needs the user.** Step 3 (`pnpm --filter @cwm/e2e e2e archive.spec.ts`) and step 5
(real-application pass and notes) were not executed: a developer `pnpm dev:host` started earlier
held port 4310, Playwright refuses to reuse servers, and stopping that process was declined by the
session's permission policy. The e2e spec type-checks and a reviewer traced its routes, seed ids
and selectors, but it has not passed. `.prototype/notes.json` has no Slice 29 entries yet.

**Deviations.** `SectionCapabilitySchema.recovery` is required rather than optional, so every
declared type states its recovery. The plan names the seed `nested-projects-showcase`; the seed is
`nested-projects`. The journey is a second test in `archive.spec.ts` rather than a rewrite of the
first. Copy also covers an archived container with a non-zero cascade smaller than its content
("N other tasks stay archived"). Cascade copy changed from "N tasks with it" to "N task(s)
restore(s) with this section", updating `web.spec.ts`.

**Diff review (two subagents: correctness/spec; boundaries/docs).** No correctness bugs or
boundary violations. Fixed: MCP description and guide gave zero-cascade restore steps that would
misdirect a live hidden container; stale "planned" status in the decision index; spec §31's
"every archived section"; remaining "undo" wording in `restoreSection`; ownership-map comment
now says undeclared recovery is unknown; `cascadeLabel` keyed on restoration and no longer guesses
"tasks"; a sort assertion that could pass vacuously; missing test that a hidden disposable
tombstone still restores directly. Recorded, not fixed here:
- The "N other tasks stay archived" count includes subtasks that return with their parent.
- Rich Text created without config (MCP `create_section`) stores `{}` and appears in Archive as
  unknown content — conservative by design, possibly noisy; revisit after real use.
- The frame's remove control still reads "Archive section …" although a removed disposable view
  is no longer listed; wording belongs to the removal/Undo UI slice (31), a non-goal here.

## Outcome

**Deliverables.** Archive now lists recoverable content rather than every section tombstone.
[`SECTION_CAPABILITIES`](../../../packages/contracts/src/section.ts) declares the seven registered
types, with ownership derived from it; the pure
[`sectionRecoveryOf`](../../../packages/domain/src/section-recovery-policy.ts) decides which section
entries [`ProjectArchiveService`](../../../packages/domain/src/project-archive-service.ts) projects
and emits `recovery` metadata (`owned-content` with `contentCount` and `separateRestoreCount`,
`config`, `unknown`) beside the exact `cascadeCount`. The host route and `get_project_archive`
forward it unchanged, and [`ArchivedRegion`](../../../apps/web/src/app/features/projects/archived-region/archived-region.ts)
words it: total content, what restores with the section, and the two-step path for rows archived
on their own, or reactivation only for live content beneath an archived project. Tombstones,
cascade markers, append placement, exact membership and idempotent restore are unchanged.

**Deliberate choices.** A container holding only independently archived rows stays listed as
the first step of their recovery instead of a new blocker operation or automatic multi-step
restore. Uncertain Rich Text config and unknown types are kept as unknown content. Two
refinements followed review at the user's request: copy counts Restore calls rather than rows
(subtasks archived with a parent come back with it), and an empty Rich Text config (`{}`, which
`create_section` stores without `config`) is empty. See the
[content-oriented Archive policy](../../decisions/2026-09-content-oriented-archive-policy.md).

**Deviations from the plan.** Listed under Implementation status above, plus: the
`separateRestoreCount` field and the zero-key Rich Text rule were added after the first review;
the plan's `nested-projects-showcase` seed is `nested-projects`; the content journey is a second
test in `archive.spec.ts`. The first session could not run e2e because a developer host held the
port; the closing session ran it with that host stopped.

**Deferred.** Removal Undo, disposable-removal wording ("Archive section …" on a view that
Archive no longer lists) and hard deletion remain Slices 30–31. Real use recorded three notes
(`note-2026-09-14-001`–`003`): two removed Notes sections are indistinguishable in Archive
without a text preview; a removed view has no visible way back until Undo lands; and
"0 tasks restore with this section" repeats the two-step guidance.

**Open questions.** Whether Archive entries need a content preview or frame title for
duplicated section names, and whether a zero cascade count should be hidden. Both are copy and
density questions for the next Archive or Undo UI slice, not blockers here.

**Documentation and verification.** Updated main spec §§29–32 and §54; contracts, domain,
web/projects, prototype-host/api, mcp-tools and testing architecture pages; the MCP setup
guide; the new policy decision and amendments to the undo, root-archive guidance and
section-config decisions, plus the index; goals; and `.prototype/notes.json`. `pnpm test`,
`pnpm lint` (with `pnpm docs:api` and `pnpm docs:check`) pass, and `pnpm e2e` passes 22/22,
including both Archive journeys. The real-application pass used `pnpm dev:host`/`dev:web` with
`nested-projects` loaded from the dev panel: views, an empty Reflections section and a Rich Text
brief removed through the canvas; a Task List cascade-removed through the dialog; a real MCP
client building a list with an archived parent and two subtasks and an unconfigured Notes
section; Archive opened from the Kitchen route's More menu with its tab disabled; and the
section-then-row recovery, with restored sections appended after the Home shortcuts.
