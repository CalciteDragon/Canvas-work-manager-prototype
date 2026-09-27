<!-- completed-record id="44" closed="2026-09-27" summary="Parent-first Archive and workspace Settings recovery for archived projects" -->
# Slice 44 — Actionable Archive and archived-project recovery

## Goal

Show only currently restorable, highest-owner entries in root Archive and make archived root and sub-project recovery reachable from workspace Settings.

## Spec sections

Main §§9, 11–12 (gateway, contracts, domain), §§20–23 (scoped UI state and Settings), §§26–27 and 31 (project hierarchy, pages and Archive), §§53–54 (grants/MCP), §§61–63 (API, live refresh and refusals), §§68–70 (routes and verification), §§77–79 (real use and decisions). [Main spec](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md) §31 still describes blocked rows; correct it when this behavior ships. [Slice 34 Stage D2](../planned/34-undo-redo-and-archive.md#archive-and-settings) supplies the changed intent; [Slice 43](../completed/43-one-step-removal-and-task-delete.md) supplies one-step removal.

## Build

1. Define pure structural restore eligibility shared by root Archive and a workspace archived-project query. Keep `sectionRecoveryOf` for meaningful content; content and present restorability answer different questions. Canonical restore methods already recheck current blockers inside their write units.
2. Return only archived, currently restorable entries from `ProjectArchiveService`: archived project before descendants, archived section before rows, archived task before archived subtasks. Exclude live content merely hidden by archived projects and blocked entries without deleting canonical records. Keep origin, cause, cascade and separate-restore metadata on listed entries.
3. Add a workspace query for archived roots and sub-projects with live ancestors, exposed over HTTP and MCP under `projects.read`; no persisted collection.
4. Add Settings → Archived projects, independent of any project or optional Archive page. Provide explicit non-archived status selection, Restore via the existing project write, Open project, loading/empty/error/pending states, live refresh, and safe refusal/retry after a race.
5. Reconcile specs, architecture, decisions, guides and acceptance evidence. Use the app and MCP client before phase closure.

## Done when

Slice 34 Stage D's remaining gate is demonstrated: parent-first recovery and whole-project restoration from Settings. Root Archive and MCP list exactly structurally restorable content, including a container holding only independently archived rows; restoring each owner reveals independently archived children. Settings lists archived roots and independently restorable sub-projects throughout the actor's workspace, even if Archive is disabled. Restore requires an explicit status, preserves archived descendants, refuses concurrent blockers without partial writes and refreshes navigation. D1's removal and task Delete still work. Stage E integrated closure stays separate.

## Do not

- Implement runtime behavior during this planning request; this active document is the reviewed implementation handoff.
- Add `ArchiveItem` storage, a schema migration, automatic project cascade, task purge, history browser, a new Undo surface or production infrastructure.
- Remove ordinary task moves or stored version-1 reassign history.

## Acceptance check

Use `nested-projects` and `personal-workspace` in isolated data; assert returned IDs and exact archive markers. During implementation run the focused tests below, `pnpm test`, `pnpm docs:check`, `pnpm lint`, `pnpm build`, `pnpm e2e`, `pnpm --filter @cwm/prototype-host acceptance` and `pnpm --filter @cwm/prototype-host mcp-acceptance`. Then use the browser and a connected MCP client, record friction in `.prototype/notes.json` and set `CURRENT_SLICE` to 44.

1. Archive a task parent, a section with live and independently archived rows, sub-projects, then their root. HTTP `GET /api/projects/:rootId/archive` and `get_project_archive` show only highest ready owners with the correct restore grant. They omit cascade children, archived descendants and live content hidden solely by an archived project. A read-only agent with the existing three Archive read grants sees the same list; its Restore fails without the matching write grant.
2. Restore the root from `/settings/archived-projects` with a chosen status. The root disappears from Settings; its still-archived child appears in Settings and root Archive. Restore that child, then its independently archived section, then independent task/reflection rows; check the exact IDs, markers and recovery counts after each step and reload. Cascade-restored rows disappear from Archive. Repeat with the optional Archive page disabled.
3. A persona sees only its workspace. The empty state is honest, read failure offers Retry, and an ancestor archived after listing causes a refusal and fresh list with no partial write. If a listed archived sub-project moves to another live root before Restore, current ancestry permits the write and both roots' projections reconcile. Successful write followed by failed read says it succeeded and offers a read-only Retry; Open project uses the canonical route. The shell tree and open root projections refresh on project frames.
4. Browser checks cover keyboard and touch Restore/status choice, 375 px in both themes, focus after a row disappears, navigation/reload/persona switch, and the existing More-menu Open Archive path. Exercise the new query and project Restore through Streamable HTTP and stdio MCP.

## File-level change list

| File | Change / responsibility |
|---|---|
| `packages/contracts/src/archived-projects.ts` (create), `packages/contracts/src/archived-projects.test.ts` (create), `packages/contracts/src/project-archive.ts`, `packages/contracts/src/project-archive.test.ts`, `packages/contracts/src/index.ts` | Dedicated workspace result and ready-only root Archive result invariant; reuse project/breadcrumb schemas. |
| `packages/domain/src/restore-eligibility.ts` (create), `packages/domain/src/restore-eligibility.test.ts` (create), `packages/domain/src/project-archive-service.ts`, `packages/domain/src/project-archive-service.test.ts` | Pure read-projection eligibility; filter highest ready owner with metadata and workspace scope. |
| `packages/domain/src/archived-projects-service.ts` (create), `packages/domain/src/archived-projects-service.test.ts` (create), `packages/domain/src/index.ts` | Workspace projection and `projects.read` check. |
| `apps/prototype-host/api/services.ts`, `apps/prototype-host/api/services.test.ts`, `apps/prototype-host/api/routes.ts`, `apps/prototype-host/api/routes.test.ts` | Wire/query `GET /api/archived-projects`; update explicit route fixture; forward domain result. |
| `packages/mcp-tools/src/tool.ts`, `packages/mcp-tools/src/tools/projects.ts`, `packages/mcp-tools/src/tools/project-pages.ts`, `packages/mcp-tools/src/registry.ts`, `packages/mcp-tools/src/registry.test.ts`, `packages/mcp-tools/src/contract.test.ts`, `packages/mcp-tools/test/harness.ts` | Service interface and read tool; correct Archive description, pin registry, grant and shape. |
| `apps/prototype-host/main.ts`, `apps/prototype-host/mcp/stdio.ts`, `apps/prototype-host/mcp/handler.test.ts`, `apps/prototype-host/live-updates.test.ts` | Supply the new service at every registry construction site and verify real transports. |
| `apps/web/src/app/core/gateway/work-manager-gateway.ts`, `apps/web/src/app/core/gateway/prototype-work-manager-gateway.ts`, `apps/web/src/app/core/gateway/prototype-work-manager-gateway.spec.ts`, `apps/web/src/app/core/gateway/testing/fake-gateway.ts` | Gateway method, adapter and fake for the shared workspace result. |
| `apps/web/src/app/features/projects/archived-region/archived-region.ts`, `apps/web/src/app/features/projects/archived-region/archived-region.html`, `apps/web/src/app/features/projects/archived-region/archived-region.spec.ts`, `apps/web/src/app/features/projects/archived-region/archived-region.stories.ts` | Present ready-only entries, origin and two-step guidance; revise fixtures. |
| `apps/web/src/app/features/projects/pages/archive-page-store.ts`, `apps/web/src/app/features/projects/pages/archive-page-store.spec.ts`, `apps/web/src/app/features/projects/pages/archive-page.ts`, `apps/web/src/app/features/projects/pages/archive-page.html`, `apps/web/src/app/features/projects/pages/archive-page.spec.ts`, `apps/web/src/app/features/projects/pages/archive-page.stories.ts` | Empty/error/retry and live refresh with the filtered domain projection. |
| `apps/web/src/app/features/settings/settings-page.ts`, `apps/web/src/app/app.routes.ts`, `apps/web/src/app/app.routes.spec.ts` | Settings link and route outside any project. |
| `apps/web/src/app/features/settings/archived-projects/archived-projects-store.ts` (create), `apps/web/src/app/features/settings/archived-projects/archived-projects-store.spec.ts` (create), `apps/web/src/app/features/settings/archived-projects/archived-projects-page.ts` (create), `apps/web/src/app/features/settings/archived-projects/archived-projects-page.html` (create), `apps/web/src/app/features/settings/archived-projects/archived-projects-page.scss` (create), `apps/web/src/app/features/settings/archived-projects/archived-projects-page.spec.ts` (create), `apps/web/src/app/features/settings/archived-projects/archived-projects-page.stories.ts` (create) | Scoped state, status choice, Restore/Open, error/retry, live refresh and accessible states. |
| `apps/e2e/archive.spec.ts`, `apps/e2e/archived-projects.spec.ts` (create), `apps/prototype-host/scripts/acceptance.mjs`, `apps/prototype-host/scripts/mcp-acceptance.mjs` | Exact-ID browser/API/MCP journeys and D1 regression. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` (§§9, 23, 26–27, 31, 54, 61–63, 68–69), `AGENTS.md`, `README.md`, `docs/architecture/overview.md`, `docs/guides/mcp-setup.md`, `docs/guides/first-milestone-walkthrough.md` | Correct current claims, tool count, route and recovery instructions. |
| `docs/architecture/contracts/overview.md`, `docs/architecture/contracts/why.md`, `docs/architecture/contracts/what.md`, `docs/architecture/contracts/how.md`; `docs/architecture/domain/overview.md`, `docs/architecture/domain/why.md`, `docs/architecture/domain/what.md`, `docs/architecture/domain/how.md` | Read shapes, domain projection rule and decision links. |
| `docs/architecture/mcp-tools/overview.md`, `docs/architecture/mcp-tools/why.md`, `docs/architecture/mcp-tools/what.md`, `docs/architecture/mcp-tools/how.md`; `docs/architecture/prototype-host/api/overview.md`, `docs/architecture/prototype-host/api/why.md`, `docs/architecture/prototype-host/api/what.md`, `docs/architecture/prototype-host/api/how.md` | Tool/route inventory, grants, wiring and examples. |
| `docs/architecture/web/overview.md`, `docs/architecture/web/why.md`, `docs/architecture/web/what.md`, `docs/architecture/web/how.md`; `docs/architecture/web/core/overview.md`, `docs/architecture/web/core/why.md`, `docs/architecture/web/core/what.md`, `docs/architecture/web/core/how.md` | Settings route and gateway behavior/decision. |
| `docs/architecture/web/projects/overview.md`, `docs/architecture/web/projects/why.md`, `docs/architecture/web/projects/what.md`, `docs/architecture/web/projects/how.md`; `docs/architecture/testing/overview.md`, `docs/architecture/testing/why.md`, `docs/architecture/testing/what.md`, `docs/architecture/testing/how.md` | Root Archive behavior and verification evidence. Settings stays within web. |
| `docs/decisions/2026-09-actionable-archive-and-archived-projects.md` (create), `docs/decisions/README.md`, `docs/decisions/2026-09-root-archive-recovery-guidance.md`, `docs/decisions/2026-09-content-oriented-archive-policy.md`, `docs/decisions/2026-09-recovery-routes-name-what-is-actually-there.md` | Record/index choice, link from `why.md`, amend older claims append-only. |
| `docs/roadmap/active/44-actionable-archive-and-archived-projects.md`, `docs/roadmap/goals.md`, `docs/roadmap/progress.md` (generated), `.prototype/notes.json`, `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | Outcome/revisions, direction/board, friction and slice indicator during implementation. |

## Test plan — tests first

| Test | Proves |
|---|---|
| `project-archive.test.ts`: a ready-only result parses, a blocked/hidden item in a result fails | Old blocked-row projection cannot silently pass the API/gateway contract. |
| `restore-eligibility.test.ts`: archived root/child/section/parent task, live hidden content, disabled page | Highest restorable owner is selected without mixing in read grants or page toggle state. |
| `project-archive-service.test.ts`: exact-ID parent-first sequence, independent-only container, cascade counts, unknown config, disabled page, foreign root, shortcut-backed disposable source and meaningful source | No stranded content, blocked/hidden row, shortcut-placeholder regression, or cross-workspace leak. |
| `archived-projects-service.test.ts`: archived root, live-ancestor child, archived-ancestor child, reparent, foreign workspace, minimal/no grant | Workspace list is current and scoped under `projects.read` alone. |
| `archived-projects-service.test.ts` and existing canonical restore suites: list, archive an ancestor, attempt Restore; move listed child to another live root, then Restore | Projection and canonical write agree on current ancestry: blocked Restore changes no content/history/frame, while legal reparent stays restorable. Existing write grants remain covered by the canonical suites. |
| `routes.test.ts`: query contract, persona isolation, read error, chosen restore status, concurrent refusal | Thin route and existing project write are the only restore path. |
| MCP registry/contract/handler tests: query with `projects.read`, no-read refusal, ready metadata without write grant, Restore refusal; both transports | No repository bypass; read/write grants are distinct. |
| Gateway adapter/fake specs: envelope, invalid response, network error, URL and persona | Shared result crosses the only concrete adapter. |
| `archived-region.spec.ts`, `archive-page-store.spec.ts`, `archive-page.spec.ts`: ready rows, guidance, empty/error/retry, project frame | UI presents domain result and reconciles writes without re-filtering. |
| Settings store/page/route specs: status/pending, stale persona/response, live frame from any root, race refusal, write success/read failure, Open link/focus | No wrong-person list, duplicate write, lost success or dead route. |
| E2E `archive.spec.ts`, `archived-projects.spec.ts`, host and MCP acceptance scripts | Stage D gate runs over exact IDs, disabled Archive, narrow/touch/two-theme UI and both MCP transports. |

## Boundaries touched

Contracts own public read shapes. Pure domain eligibility uses canonical records in the two read projections; existing restore services keep their own write-time preflight, with no new service edge. MCP calls domain services and HTTP routes do not filter. Angular stores/components use the gateway interface; only `app.config.ts` names the concrete adapter. Settings is workspace-scoped, not a new project page or global store. No schema bump or persistent collection is expected. Read-only agents can see ready rows only with required read grants; actual Restore checks current ancestry and its write grant. Styles use tokens, `core/` never imports `prototype/`, and domain adds no `new Date()`.

## Explicit non-goals

- Stage E's full Slice 34 coverage-matrix and documentation closure; this phase verifies Stage D2 and D1 regressions.
- New restore API, changed project-history semantics, automatic ancestor restoration, purge or cross-workspace archive.
- Replacing the optional root Archive or its More-menu entry.

## Open questions

None changes this phase's shape. Adopt Slice 34's proposed `/settings/archived-projects` route, explicit status selection and `projects.read` workspace query, then record the behavior in the implementation decision after use. A sub-project archived beneath an archived ancestor waits in storage until that ancestor returns; an archived root appears in Settings, not as an item in its own root Archive.

## Revisions

- **Draft (2026-09-25):** Split Stage D2 from shipped Slice 43 and reserved integrated closure for Stage E. Grounded the contract, domain, host, MCP, gateway and UI seams in current source and architecture docs.
- **Review round 1 (2026-09-25):** Added the explicit MCP service interface, every registry-construction call site and a separate archived-project contract matching Slice 34's file map. Corrected the existing `get_project_archive` tool description's owner in `project-pages.ts`. Made ready-only a parsed result invariant and added shortcut-source regression cases. Corrected the race check: archiving an ancestor blocks Restore, while legal reparenting to another live root permits it and requires both roots to refresh. Added the three docs with tool-count claims (`AGENTS.md`, `README.md`, architecture overview). Removed speculative edits to four canonical write services; their existing preflight remains the write-time arbiter.
- **Review round 2 (2026-09-25):** Re-review found no substantive gap after the exact-path checklist and scope correction. Named `pnpm docs:check` explicitly beside lint as the phase-closing gate.
- **Implementation continuation (2026-09-27):** Corrected three browser assertions/fixtures left at handoff: created the optional Archive page before disabling it, expected only the archived task parent, and omitted a live child hidden by its archived owner. Added a typed ProjectId fixture for E2E lint.
- **Diff review round 1 (2026-09-27):** Independent correctness, spec/boundary and documentation/acceptance reviewers found a duplicate Restore write after a successful write/failed refresh, a stale contracts runtime claim and missing key-symbol/E2E inventory entries, and incomplete reparent/race acceptance evidence. Added a red store test, guarded Restore on error/loading, tested the disabled button, corrected the docs, and asserted current-ancestry Restore and both roots' Archive projections.
- **Diff review rounds 2–4 (2026-09-27):** Re-review found that a quiet frame read could clear a retained-list error before it settled, then that a persona reload during the follow-up read could paint the former persona's error. Deferred-read tests failed for each race before the fixes. The store now retains an error until a replacement read succeeds and checks the refresh generation before reporting post-read errors. Final independent review reported no substantive finding.

## Outcome

**Deliverables.** Root Archive now projects only structurally ready archived entries, highest
owner first, using `restoreEligibility` and the existing content policy. The shared
`ArchivedProjectsResultSchema`, `ArchivedProjectsService`, HTTP route and
`list_archived_projects` MCP tool expose archived roots and ready subprojects throughout the
actor's workspace under `projects.read`. Settings → Archived projects uses the gateway to
choose an explicit non-archived status, Restore through the existing project write, Open the
canonical project route, and recover from errors and live updates. The optional Archive page
and its More-menu path remain available. No persisted collection or schema change was needed.

**Choices and deviations.** [The Slice 44 decision](../../decisions/2026-09-actionable-archive-and-archived-projects.md)
records why blocked descendants wait behind their owner and why workspace Settings supplies
root recovery. Canonical writes still recheck ancestry. The implementation handoff left three
browser cases expecting the former projection; they were corrected. Independent diff reviews
then exposed stale-row retry and persona-switch races in Settings. Tests reproduced each before
the store and button guards were added. A reparented archived child is covered through actual
Restore and both old/new root projections, and a newly blocked child gets a real 409 write
refusal. The updated spec, architecture tree, decision amendments, README and guides describe
the current behavior. `CURRENT_SLICE` and `.prototype/notes.json` record the real-use pass.

**Verification and follow-up.** The `nested-projects` and `personal-workspace` browser journeys
exercised parent-first recovery, an Archive-disabled root, persona isolation, 375 px keyboard
and touch use in both themes, focus, reload and live frames. Connected MCP acceptance used
Streamable HTTP and stdio, with exact IDs and read/write grant separation. Full `pnpm test`,
`pnpm docs:check`, `pnpm lint`, `pnpm build`, `pnpm e2e`, host acceptance and MCP acceptance
passed. The build retains its existing initial-bundle size warning. Slice 34 Stage E's integrated
closure remains separate; no new product question was left open by this phase.
