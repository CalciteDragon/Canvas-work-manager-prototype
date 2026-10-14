<!-- plan id="70" status="active" summary="User-requested frosted-glass redesign; baseline, independent audits and alternatives through Gate 1" -->
# Slice 70 — UI/UX overhaul — evidence and direction

## Goal

Establish reproducible evidence and a user-approved direction for a coherent frosted-glass web-app redesign, stopping before redesign slice planning at Gate 1.

## Spec sections

§21 tokens, §22 both themes and live tuning, §26 project canvas, §67 Design Lab, §68 route coverage, §69 verification, §77 design-first use, §79 friction notes; the [overhaul protocol](../../guides/ui-ux-overhaul-protocol.md) governs Phases 0–2.

## Build

Phase 0 inventories code, captures surfaces and core-task metrics on disposable e2e data, and presents Gate 0. Phase 1 uses independent cold-start task and seven lens auditors, with orchestrator reproduction before inclusion. Phase 2 clusters verified findings by root cause and layer, writes 5–8 design principles, and presents three visual alternatives and a motion demonstration. The umbrella stays active at Gate 1.

## Done when

The user can inspect the baseline and its coverage, reproduced findings and measured task costs, ordered themes, proposed direction, and side-by-side alternatives; the next action is the user's Gate 1 choice, not an implementation slice.

## Do not

Change domain, contracts, host, persistence, gateway behavior or production page styling. No redesign slices before selection. No unverified audit claims or invented usability metrics.

## Acceptance check

- Run the standalone capture command against the existing e2e server configuration and prepared scratch data. Capture all six seeds, both themes and 1440×900 / 1024×768 / 375×812 touch; use selected meaningful surface/state combinations rather than a Cartesian explosion.
- Each capture index entry names route, seed, persona, theme, viewport, state, screenshot, axe results, console errors and accessibility tree. Clock is SEED_NOW, animations disabled, network idle awaited. Index includes explicit unavailable/not-captured coverage rather than implying completeness.
- Script 8–12 core tasks from spec and notes; record successful and blocked steps, interaction counts, surfaces, dead ends. Discoverability remains an independent observer judgement, not a claim derived from a script's success.
- Show baseline as a private contact-sheet page and obtain Gate 0 inventory confirmation before audits count as complete.
- Task walkthroughs provide a full 8–12 tasks × three personas ledger, including explicit blocked or inapplicable outcomes, plus a separate 375 px touch pass and keyboard-only completion attempts for every core task; auditors narrate expectations before actions. Seven independent auditors each receive only their lens, inventory, capture locations and cold brief. Findings use the protocol JSON schema and no proposed fixes. Orchestrator reproduces every admitted finding; unreproduced claims remain excluded.
- At Gate 1 show 8–15 evidence-backed themes (or explain a smaller observed set), ordered tokens → primitives → patterns → shell → page; 5–8 principles; 2–3 distinct alternatives for every substantially changing visual theme, with a theme-to-alternative mapping when holistic directions cover multiple themes, and at least one transform/opacity motion demo. Glass constraints include AA over busy backing content, both preferences and no-filter fallback, long-canvas/phone performance, limited blur layers, token-only values and live Lab tuning.
- Run harness checks, e2e typecheck, docs:check and lint; relevant existing phone/browser journeys and build budget for any actual web-tooling change. Record all unrun checks honestly.

## File-level change list

| File | Responsibility |
|---|---|
| `docs/roadmap/active/70-ui-ux-overhaul.md` | Only plan; inventory, review rounds, evidence ledger and gate state |
| `docs/roadmap/goals.md`, `docs/roadmap/progress.md` | User-requested direction and generated board |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | CURRENT_SLICE 70 |
| `apps/e2e/seed.ts`, `apps/e2e/ux/isolation.ts` | Optional test host override and browser-only forwarding to isolated ports 4311/4201 |
| `apps/e2e/ux-capture.config.ts` | Separate Playwright entry, reuse existing servers and preparation |
| `apps/e2e/ux/report.ts` | Private contact sheet, raw diagnostic summary and explicit verification limits |
| `apps/e2e/ux/coverage.ts`, `apps/e2e/ux/coverage.test.ts`, `apps/e2e/ux/matrix.test.ts` | Every inventory row and target-state clause exported honestly; missing-axis and duplicate-path checks |
| `apps/e2e/ux/capture.ts`, `apps/e2e/ux/matrix.ts`, `apps/e2e/ux/tasks.ts` | Capture driver, selected coverage, scripted 8–12 core tasks |
| `apps/e2e/ux/harness.test.mjs`, `apps/e2e/ux/tasks.test.ts`, `apps/e2e/ux/evidence.mjs` | Offline harness contract tests, run explicitly |
| `apps/e2e/package.json`, `apps/e2e/playwright.config.ts`, `pnpm-lock.yaml` | Opt-in capture command, axe dependency, exclude capture from normal e2e |
| `.gitignore` | Commit-keyed screenshot/report output |
| `docs/roadmap/70-ui-ux/` | Evidence JSON, direction and comparison assets; no separate plans |
| `docs/architecture/testing/overview.md`, `docs/architecture/testing/how.md`, `docs/architecture/testing/what.md` | Capture harness responsibility, operation, dependency |
| `README.md` | Explicit opt-in capture command |
| `.prototype/notes.json` | Only observations made during actual use |
| `apps/e2e/ux/walk/` (`walkd.mjs`, `walk.mjs`, `static.mjs`, `env.sh`, `repro/r1–r10.js`) | Phase 1 interactive audit rig: per-auditor isolated hosts, persistent headless page, orchestrator reproduction scripts; outside every test command |
| `docs/roadmap/70-ui-ux/findings/*.json`, `walkthroughs/*.json` | Raw independent auditor output: eleven finding files, four walkthrough ledgers |
| `docs/roadmap/70-ui-ux/reproduction.json`, `themes.json` | Orchestrator verdict per finding; admitted findings clustered into ordered themes |
| `docs/roadmap/70-ui-ux/direction.md` | Proposed principles and glass constraints, awaiting Gate 1 |
| `docs/roadmap/70-ui-ux/alternatives/gate1.html`, `tooling/` | Generated Gate 1 page (alternatives, contrast readout, motion study) and the builders that regenerate it and the ledgers |

If feasible, alternatives use existing Lab exported tokens; otherwise isolated static mockups with an interactive motion study avoid implementing an unchosen design. Any necessary prototype-only source/token files are named here and reviewed before editing. Decisions/spec changes await actual user choices.

## Test plan — tests first

| Test | Proves |
|---|---|
| `ux/harness.test.mjs`: matrix axes and unique keys | All required seeds/themes/viewports represented, no overwritten capture evidence |
| `ux/harness.test.mjs`: coverage ledger | Unreachable/deferred states explicitly represented, no silent omission |
| `ux/harness.test.mjs`: task definitions | 8–12 named core tasks with counting rules and no manufactured discoverability |
| `ux/harness.test.mjs`: partial evidence failure | A failed screenshot, axe scan or tree is recorded as incomplete with its reason, never successful coverage |
| Real capture smoke before full matrix | Own data file, theme after identity, fixed clock, evidence artifacts produced |
| Existing phone layout journey | Harness/tooling work did not change product behavior |

Write meaningful harness tests first and observe their red result, then implement. Pure inventory and images use inspection, not tests that mirror prose.

## Boundaries touched

Web UI and its verification tooling only. Browser scripts may use existing rig API for fixtures but interactions use accessible roles. No components acquire transports, no types are duplicated, core never imports prototype. Glass prototypes remain isolated proposals; eventual values belong in `_tokens.scss`, never scattered component literals. Scripts do not write the developer's data file. Existing pnpm test and e2e remain separate from captures.

## Explicit non-goals

Implementation plans for themes; replacing product styling; API/MCP changes; production infrastructure; automatic accessibility or performance certification from screenshots; claiming synthetic script counts measure novice discovery.

## Open questions

Gate 0 inventory completeness and Gate 1 direction/priority/alternative choice belong to the user. These gates do not block preparation of concrete reviewable artifacts. Private publication capability will be checked before choosing a delivery mechanism.

## Revisions

**Round 1 (2026-10-12):** Reviewer required a full task × persona ledger rather than sparse persona coverage, explicit keyboard-only core-task attempts, and alternatives mapped to every substantially changing theme. Acceptance now names all three. The final first-round finding added a fault-injection test for incomplete screenshot/axe/tree evidence reporting. **Round 2:** Reviewer confirmed all four findings resolved with no remaining substantive findings; inventory has now been appended from code. harness implementation has not begun.

**Diff review round 1 (2026-10-12):** Reviewer found missing Undo/Restore postconditions, uncatalogued assertion failures, browser-clock drift in tasks, and unreconciled state coverage. Tasks now assert restored controls/removed Archive entries and record any failing postcondition; browser Date is fixed. Coverage exports every inventory row and semicolon-separated target state as individually unverified rather than inferring coverage from page presence. Matrix tests reject missing axes/duplicate paths. Internal scrolling now gets additional captures because fullPage cannot expose the shell's nested scroll regions. Diff review round 2 required settled disappearance before Undo and persisted date after reload; both were added. Round 3 returned no remaining substantive correctness or boundary findings, contingent on the corrected run. The first task execution exposed two script assumptions (root default parent and Rename-prefixed region name), corrected without treating them as accepted UX findings.

**Phase 1 execution (2026-10-13):**

- **Rig.** Playwright-MCP and the built-in browser are each a single shared browser, so parallel auditors could not use them. A small interactive rig (`apps/e2e/ux/walk/`) gave every auditor its own host and a persistent page instead. The production build was served statically, because the machine has 8 GB and `ng serve` per auditor did not fit.
- **Rig fault.** It crashed twice when an auditor's `page.route` raced the forwarding route. The daemon was hardened and the rule is now documented.
- **Interruptions.** Four auditors hit a usage limit mid-run and were resumed with their own context. None was replaced or merged into another.
- **Exclusions.** The orchestrator reproduced findings with ten scripts on its own host. Claims that did not reproduce were excluded rather than softened.

## Surface inventory

Paths in this checklist are relative to `apps/web/src/app/` unless stated otherwise.
States are code-supported coverage targets, not claims that captures have been completed.
Each HTML source has its corresponding component TypeScript file unless noted.

| Check | Surface | Source paths | States and reachability |
|---|---|---|---|
| [ ] | `/` redirect | `app.routes.ts` | Redirects to `/app`. |
| [ ] | Global shell, desktop sidebar, phone navigation drawer, top bar | `core/shell/app-shell.html`, `core/shell/sidebar/sidebar.html`, `core/shell/sidebar/project-tree-item.ts`, `core/shell/top-bar/top-bar.html` | Dark/light; identity present/absent; project group expanded/collapsed; empty/populated/error tree; active route; phone drawer open/closed; inline New project form and creation error. All routes. |
| [ ] | `/app` dashboard | `features/dashboard/dashboard-page.html` | Loading/error; populated; no visible widgets; unimplemented-widget fallback. Empty, personal, busy, overdue and agent seeds; no-widgets/fallback require configured persona fixture. |
| [ ] | Dashboard widgets | `features/dashboard/widgets/registry.ts`; child folders `today/`, `upcoming/`, `active-projects/`, `recent-progress/`, `daily-digest/`, `fun-fact/`, `recent-agent-activity/`; `widget-frame/dashboard-widget-frame.html` | Seven implementations: Today, Upcoming, Active Projects, Recent Progress, Daily Digest, Fun Fact, Recent Agent Activity. Empty/populated/dense content as applicable; widget size variants. Calendar and work-summary types render unavailable fallback. |
| [ ] | `/projects/:projectId` and `/projects/:projectId/pages/:pageKind` workspace | `features/projects/project-workspace-shell.html`, `features/projects/project-page-registry.ts` | Root defaults Home; workstream resolves sole Work canvas. Loading/error/missing; navigation lazy-load placeholder/failure; unknown/disabled page fallback notice; enable-disabled-page action; missing canonical page unavailable; workstream page URL redirect. |
| [ ] | Project header and More menu | `features/projects/project-header.html`, `features/projects/project-more-menu.html` | Root/workstream labels; optional description/date; progress absent/zero/positive; completed/archived; More open; rename/description/status/date editing; inline archive confirmation; write error; Archive opening retry. |
| [ ] | Project navigation and page settings panel | `features/projects/project-page-navigation.html`, `features/projects/project-work-item.ts` | Expanded/collapsed; Home only/all optional pages; active page/workstream; nested breadcrumbs/tree; no workstreams; settings open; saving/refusal/refresh retry; archived root/Add workstream blocked. Nested seed supplies hierarchy. |
| [ ] | Project history controls and feedback | `features/projects/history/project-history-controls.html`, `features/projects/history/project-history-feedback.ts` | Nothing available; undo/redo/both; saving/loading/unavailable/retry; blocked archived ancestor; successful/refused transition; conflict lines; other-owner Open link; dismiss. Writes, undo/redo and `#history-controls`. |
| [ ] | Creation-undone recovery | `features/projects/project-workspace-shell.html` | Missing project with captured creation; Redo available/pending/blocked by ancestor; history retry/feedback. Create then undo, or story fixture. |
| [ ] | Home and workstream Work canvases | `features/projects/project-canvas.html` | Empty/populated/dense; flow/grid; loading/error; section write error; partial placement-order notice; missing deep-link target; selected/focused target; drag/drop, keyboard movement, resizing and insertion points; unknown section fallback. |
| [ ] | Canvas insertion and section chrome | `features/projects/canvas-chrome/insertion-point.ts`, `features/projects/canvas-chrome/section-resize-handle.ts`, `features/projects/sections/section-frame/project-section-frame.html` | Hover/focus chrome; expanded/collapsed; title edit; move/resize; full/half spans; drag preview/placeholder. Settings inspector branch exists but no registered section currently supplies an inspector component. |
| [ ] | Section creation dialog | `features/projects/section-create-dialog.html` | Section/shortcut modes; type and title; pending/error; insertion anchor gone. Canvas insertion point; shortcut option only canonical Home/Work. |
| [ ] | Workstream creation dialog | `features/projects/work-create-dialog.html` | Root/nested parent choices; draft; pending/refused; parent note. Add workstream in project navigation. |
| [ ] | Shortcut picker | `features/projects/shortcuts/shortcut-picker.html` | Available sources; empty; already placed; loading/unreadable; adding/error. Creation dialog's Add shortcut. |
| [ ] | Shortcut frame | `features/projects/shortcuts/shortcut-frame.html` | Read-only section projection; expanded/collapsed; movement/resize/removal; nested source breadcrumb; archived/hidden/permission-denied source; unsupported source fallback. Nested seed supplies shortcuts. |
| [ ] | Markdown section and source editor | `features/projects/sections/markdown/markdown-section-body.html`, `features/projects/sections/markdown/markdown-source-editor.html`, `shared/components/markdown-renderer/markdown-renderer.ts` | Rendered/empty/unreadable; edit/preview; saving/refused; changed elsewhere; read-only shortcut; long/narrow prose, tables, safe-link/HTML/image handling. |
| [ ] | Task List section | `features/projects/sections/tasks/task-list-section.html` | Empty/populated/dense; loading/error; add draft; read-only shortcut; selected task; drag reorder; pending completion/delete; committed deletion recovery. |
| [ ] | Task row | `features/tasks/task-row.html` | Normal/overdue/completed/cancelled/high priority; selected/compact; inline title editing/error; completing/reopening/deleting. Section and fixtures. |
| [ ] | Task detail drawer | `features/tasks/task-detail-drawer.html` | Selected task; description present/absent; title draft/validation; priority/due date/estimate editing. Open task row; Design Lab embeds fixture. |
| [ ] | Progress section | `features/projects/sections/progress/progress-section.html` | Loading/error; unavailable/zero/positive percentage; count/weighted/manual selection and input; read-only projection. |
| [ ] | Reflections section and composer | `features/projects/sections/reflections/reflections-section.html`, `features/projects/sections/reflections/reflection-composer.html` | Empty/populated/loading/error; compose idle/armed/subject-linked/read-only; pending/refused; inline edit/cancel; edited entry timestamp. |
| [ ] | Timeline section | `features/projects/sections/timeline/timeline-section.html` | Empty/populated/dense; loading/error; selected/expanded detail; point/range dates; reversed source-range warning. |
| [ ] | Recent Activity section and shared feed | `features/projects/sections/activity/recent-activity-section.html`, `features/activity/activity-feed.html` | Empty/populated/dense; loading/error; human/agent actors and retained removed-entity labels. Agent and nested seeds. |
| [ ] | `/projects/:root/pages/todos` | `features/projects/pages/todos-page.html` | Empty/mixed chronology/dense; loading/unreadable; completion pending/refused; write/refresh errors; task delete recovery; descendant owner history links; archived-root writes blocked. |
| [ ] | `/projects/:root/pages/reflections` | `features/projects/pages/reflections-page.html` | Journal empty/full/unlinked; no/multiple containers; container, picker and journal loading/errors; refresh failure; subject candidates empty/populated; retained reopened/archived subjects; composer/read-only. |
| [ ] | `/projects/:root/pages/archive` and archived items | `features/projects/pages/archive-page.html`, `features/projects/archived-region/archived-region.html` | Empty/populated/dense; loading/read error/lazy content loading; ready restore/restoring/refused; archived root blocked; parent-first recovery; workstream status choice; Markdown/unknown/container recovery descriptions; descendant history links. |
| [ ] | Section removal/recovery feedback | `features/projects/section-recovery-notice.html` | Removed-to-Archive; failed removal; committed removal with failed refresh; retry/dismiss/Open Archive. Inline canvas status. |
| [ ] | `/calendar` | `features/calendar/calendar-page.ts`, `shared/components/placeholder-page/placeholder-page.ts` | Current placeholder. |
| [ ] | `/search` | `features/search/search-page.ts`, `shared/components/placeholder-page/placeholder-page.ts` | Current placeholder. |
| [ ] | `/settings` | `features/settings/settings-page.ts` | Entry page with links to agents and archived projects. |
| [ ] | `/settings/agents` | `features/settings/agents/agent-connections-page.html` | Empty/loading/error; populated permissions; busy/disabled; revoked; last-used variants. Agent seed supplies connections. |
| [ ] | `/settings/archived-projects` | `features/settings/archived-projects/archived-projects-page.html` | Empty/loading/populated; chosen status; restoring; refused/read retry; success followed by refresh error; ready roots/workstreams. Nested seed has archived hierarchy; root archive can be induced. |
| [ ] | `/prototype/design` | `prototype/design-lab/design-lab-page.html`, `prototype/design-lab/panels/live-panels.html`, `prototype/design-lab/panels/primitive-panels.html`, `prototype/design-lab/design-lab-fixtures.ts` | Token controls/reset/CSS export; copied/clipboard-unavailable/partial result. Live TaskRow, section frame/states, dashboard widget, sidebar, drawer, activity. Representative buttons, inputs, cards, project cards, menus, empty/loading/error. Fixtures independent of seed content. |
| [ ] | `/prototype/state` | `prototype/dev-panel/state-inspector-page.ts` | Shared prototype controls; layout experiment flag off; no projects/loading/error; flow/grid per-project saving states. |
| [ ] | Global development dialog | `prototype/dev-panel/dev-panel.html`, `prototype/dev-panel/dev-panel-controls.html`, `prototype/dev-panel/project-layout-control.ts` | Ctrl/Cmd+Shift+D; open/closed/loading/import error; controls error/busy; persona/seed/date/theme/layout/AI/delay/failure/flags; note draft/saved; agent empty/populated/revoked/token copied; layout flag off/no current project/refused. |
| [ ] | `**` not-found | `shared/components/placeholder-page/not-found-page.ts` | Unknown route. |
| [ ] | Toast/popover reconciliation | Feedback, More menu and page-settings sources above | No dedicated toast/popover implementation found. Inline project/history/recovery/page notices and More/page-settings surfaces are the implemented equivalents; select/date/title browser UI remain native. |
| [ ] | Storybook | `apps/web/.storybook/main.ts`; story paths below | Nineteen files. Component fixtures cover rare pending/refused/read-only conditions; route integration requires separate capture. |

### Storybook files

Relative to `apps/web/src/app/`:

```text
shared/components/markdown-renderer/markdown-renderer.stories.ts
features/tasks/task-row.stories.ts
features/settings/archived-projects/archived-projects-page.stories.ts
features/projects/work-create-dialog.stories.ts
features/projects/shortcuts/shortcut-picker.stories.ts
features/projects/shortcuts/shortcut-frame.stories.ts
features/projects/project-canvas.stories.ts
features/projects/project-page-navigation.stories.ts
features/projects/project-creation-recovery.stories.ts
features/projects/section-create-dialog.stories.ts
features/projects/section-recovery-notice.stories.ts
features/projects/archived-region/archived-region.stories.ts
features/projects/history/project-history-controls.stories.ts
features/projects/pages/archive-page.stories.ts
features/projects/pages/reflections-page.stories.ts
features/projects/pages/todos-page.stories.ts
features/projects/sections/markdown/markdown-section-body.stories.ts
features/projects/sections/reflections/reflection-composer.stories.ts
features/projects/sections/section-frame/project-section-frame.stories.ts
```

### Seed and state fixture anchors

Source: `packages/prototype-data/src/seeds.ts`.

- `empty`: no projects.
- `personal-workspace`: `project-personal`.
- `busy-week`: `project-launch`, `project-home`, `project-course`, nested `project-launch-comms`.
- `nested-projects`: `project-renovation` → `project-kitchen` → `project-cabinets`; sibling `project-garden`; archived `project-legacy` → `project-legacy-child`; separate-owner `project-alex-private`; shortcuts, reflection page container and archived Markdown.
- `overdue-chaos`: `project-client-migration`, `project-admin`.
- `agent-heavy`: `project-work-manager`, `project-agent-ops`, activity and agent connections.

Overloaded is a data-density condition, not a separate template branch. Busy/overdue/nested
seeds supply meaningful density; stronger overload requires deterministic fixture expansion.
Prototype delay/failure controls expose loading and error states. Domain-specific refusal,
malformed configuration, unknown section, and committed-write/failed-refresh states require
targeted fixtures or stories rather than an assumption that a seed reaches them.

## Outcome

**Gate 0 checkpoint (2026-10-13), inventory approved by the user.** The code-derived
inventory has 38 rows and names all 19 Storybook files. The opt-in harness produced 182
successful selected capture cells, with screenshots, axe scans, console logs, ARIA snapshots
and layout measurements. A subsequent run added scroll-region frames for busy-week,
agent-heavy, Design Lab and the task drawer. The full inventory/state denominator remains
explicitly unverified rather than inferred from page screenshots. Storybook variants,
transient drag states and rare failure/race fixtures are coverage gaps, not successes.

Ten expert task paths ran: nine completed; connecting an agent is recorded as blocked
because the existing page only manages seeded connections. Counts include text-field focus
when needed; native date keystrokes are unmeasured, not zero-cost evidence. Discoverability,
all-persona and keyboard/touch walkthroughs require Phase 1. The durable
[baseline ledger](../70-ui-ux/baseline.json) retains task steps and limits; generated captures
remain in `apps/e2e/ux-output/c94f0f0e97a3004ac8e2359a116bed6bc1fdf0fc`.

The capture servers use 4201/4311, preserving the developer's occupied live host and data.
The first standard-port attempt refused safely. Independent plan/diff review findings were
repaired and re-reviewed to no substantive findings. The task helper's usage-limit failure
was completed by the orchestrator; no independent audit was claimed on that basis.

**Verification:** both capture runs and the final task-only run passed; seven standalone
harness/counter/matrix/coverage checks, e2e TypeScript, documentation structure and all 11
focused dev-panel-store tests passed. Final offline-suite/lint results are recorded below.
No full ordinary e2e, Storybook run, production build, MCP walkthrough, glass contrast or
blur-performance assessment has been claimed. There is no production styling change.

**Deferred:** Phase 1 task/persona, keyboard and touch walkthroughs; seven fresh-context lens
audits and orchestrator reproduction; Phase 2 synthesis, principles, alternatives and motion
study. No redesign slices have been planned. The umbrella remains active through Gate 1.

**Documentation updated:** goals and generated board, testing overview/how/what, README,
and this plan. No taste decision or spec amendment is recorded before user selection.

**Final checks (2026-10-13):** pnpm test passed: 2,969 workspace tests plus nine root tooling tests, zero skipped. pnpm lint passed including docs:check. A first concurrent lint saw the documentation test's intentional temporary broken-link fixture; the sequential rerun passed after its cleanup. Private publication initially hit automatic-review rejection; the user explicitly approved the exact destination and seeded artifacts on 2026-10-13. Publication status is recorded below.

**Private Gate 0 publication:** [Baseline contact sheet](https://canvas-ux-baseline-oct12.wholecup17.chatgpt.site), verified succeeded on 2026-10-13. Site appgprj_6acdf2662edc8191881a5b7ef190e42a remains owner-private. Source packaging used installed Git Bash and TAR_OPTIONS=--force-local for the Windows drive path. The user subsequently confirmed "the inventory looks good" on 2026-10-13. Gate 0 inventory approval is recorded; it does not certify uncaptured states or approve a redesign.

**Gate 1 checkpoint (2026-10-13), awaiting the user's choice.**

*Phase 1 (independent comb).* Twelve fresh-context auditors drove the running app or read the
captures. Each got only its brief, the inventory, the capture locations and the finding schema,
and none saw another's output.

- **Walkthroughs:** Demo with mouse at 1440, plus T02 and T07 at 1024; a 375 px touch pass; a
  keyboard-only pass; Alex and Sam with mouse.
- **Lenses:** hierarchy, consistency, affordance, states, accessibility, copy and IA.
- **Persona ledger.** All ten tasks were run for every persona. Demo completed T01–T09 in all
  three input modes, and T10 (connect an agent) was blocked every time. For Alex and Sam,
  T01 completed and T02–T10 were inapplicable, because their workspaces lack the referenced
  objects. Their own-content equivalents completed, except T10, which was blocked.
- **No leaks.** No Demo data reached the other personas.

*Reproduction.* Every finding received an orchestrator verdict from live scripts r1–r10, from
full-resolution captures or from source.

- **Totals:** 318 filed, 296 admitted (5 S1, 142 S2, 149 S3), and 22 excluded: 3 not reproduced,
  1 not reached and 18 unverified. [reproduction.json](../70-ui-ux/reproduction.json) gives the
  method and verdict for each.
- **S1:** all five S1 findings are one problem. Connecting an agent exists only in the dev panel.
- **Corrections to auditor claims:** restoring is not silent (a header status appears, out of
  view of the row). The placeholder passes contrast at 4.56:1. The "body required" error clears
  on a filled save.

*Phase 2 (orchestrator synthesis).* [themes.json](../70-ui-ux/themes.json) clusters the admitted
findings into fifteen root-cause themes, in layer order:

- tokens: TH01–03
- primitives: TH04–06
- patterns: TH07–10
- shell: TH11–13
- content and page: TH14–15

[direction.md](../70-ui-ux/direction.md) holds eight principles and the glass constraints.

*The Gate 1 page.* [alternatives/gate1.html](../70-ui-ux/alternatives/gate1.html), published as a
private Claude artifact (https://claude.ai/artifact/SZ5TSfguMziAvFtRNEjYBq), shows:

- three alternatives side by side: A Frost, B Depth and C Pane;
- dark/light, desktop/phone, busy-backing, reduced-transparency and no-backdrop-filter toggles;
- a worst-case contrast readout for each alternative;
- a transform/opacity motion study with slow-motion and reduced-motion modes;
- a theme-to-alternative map and six product questions.

*Measured result.* Under the strict worst-case model, frosted surfaces need a tint alpha of
0.82–0.88 for AA on muted text. A and C meet it in both themes. B does not, and is presented
with that cost. The private ChatGPT Site from Gate 0 could not be updated from this tool
environment, so Gate 1 is a separate private page.

*Not done.* No `.prototype/notes.json` entries were added, because the orchestrator did not use
the app as a person, and inventing friction is barred. The other checks not run, and why, are
on the Gate 1 page under "Method and limits". No redesign slice has been planned. No decision
entry or spec amendment was written before the user's choice.

**Gate 1 approved (2026-10-14).** The user chose **B, Depth**, kept the theme priority and all
eight principles, and answered the six product questions. The answers are recorded as seven
decision entries, amendments to ten reopened entries, and corrections to §21, §22, §23, §26, §53
and §67:

- [Depth direction](../../decisions/2026-10-frosted-glass-depth-direction.md)
- [agent connections are a product surface](../../decisions/2026-10-agent-connections-are-a-product-surface.md)
- [prototype scaffolding stays](../../decisions/2026-10-prototype-scaffolding-stays-for-now.md)
- [split accents stay](../../decisions/2026-10-accents-stay-split-per-theme.md)
- [the theme follows the device and persists](../../decisions/2026-10-theme-follows-device-and-persists.md)
- [one navigation tree](../../decisions/2026-10-one-navigation-tree.md)
- [creation defaults](../../decisions/2026-10-creation-defaults-follow-the-open-work.md)

[direction.md](../70-ui-ux/direction.md) is marked approved. The Gate 1 page is unchanged and
still records the options as they were presented.

## Next-chat handoff — Phase 3 (slice plan)

**State.** Phases 0–2 are complete and Gate 1 is answered. No redesign slice has been planned or
started; the user asked to stop here. The umbrella stays active.

### Read first

1. AGENTS.md.
2. The [overhaul protocol](../../guides/ui-ux-overhaul-protocol.md), §6–§8.
3. This plan's Gate 1 checkpoint and the paragraph above.
4. [direction.md](../70-ui-ux/direction.md), [themes.json](../70-ui-ux/themes.json) and the seven
   Gate 1 decision entries.

Each redesign slice is an ordinary roadmap slice under this umbrella. Create it with
`roadmap.mjs new`, run the five AGENTS.md steps, and add the protocol §6 extras: findings
closed, capture scope, visual acceptance, and behaviour versus appearance.

### Proposed slice sequence (layer order; re-confirm at planning)

1. **Depth tokens, Lab and blur spike** (TH01, TH02 token part, TH03).
   - Plane, glass, motion, focus-ring, z-index, breakpoint and font-weight tokens; fix the
     undefined `--font-weight-medium`.
   - Design Lab knobs and plane specimens over busy backing.
   - **First, a measured spike on per-sheet blur**: busy-week and agent-heavy at 1440 and at a
     375 px touch emulation. It answers the Depth decision's open budget question, and its
     result goes to the user. Implement Depth's demo tints as shown; contrast is reported, not tuned up.
   - The theme follows the device and persists (a behaviour change with tests first).
2. **Primitives** (TH04, TH05). Buttons (primary, secondary, ghost, danger), icon button,
   field, select, checkbox, pill and tool. Replace browser-default controls. Targets of 24 px or
   more (44 px on touch); one focus ring.
3. **Lifts and focus** (TH06). The task drawer becomes a lift that takes focus and closes on
   Escape. More becomes a menu. A page-settings popover. Focus returns after dialogs, menus and
   route changes.
4. **Feedback pattern** (TH07, plus the task-add part of TH15). An inline Undo toast at the point
   of action, pending within 100 ms, new items scrolled into view and focused, a saved
   indicator, transform/opacity motion. Adding a task does not open its drawer.
5. **Section chrome** (TH08). Tools quiet at rest, a persistent add-section affordance, the full
   insertion hit area, headings that name their section (not "Rename X").
6. **Objects and states** (TH09, TH10). One task-row shape across surfaces; inert-looking rows
   become openable or stop looking openable; designed empty, loading, error and archived states;
   errors that clear.
7. **One navigation tree** (TH11, TH13, and the Add workstream part of TH15). Shell alternatives
   first, since the decision leaves the exact shape open; then implement with §77 test changes.
   Includes the phone pattern, document titles, a skip link and breadcrumbs.
8. **Agent connections** (the five S1 findings). A cross-system slice: contracts, domain, host,
   seeds and web, within §80. Its token mechanism is the first design question. It can run
   before slice 7 if the user wants the S1 closed sooner, but it needs slice 2's form primitives.
9. **Vocabulary** (TH14). Product words for ids, enums, dates and casing. Leave TH12 untouched,
   because scaffolding stays.

After each layer group: re-capture (`pnpm --filter @cwm/e2e ux:capture`), run a fresh comb with
new auditors (the rig in `apps/e2e/ux/walk/`), and hold Gate 3 if the direction needs amending.
Stop rule: protocol §8. Keep TH12's open S2 findings visible in that count; they are open by
decision.

### Answered after Gate 1 (2026-10-14)

- **Creation defaults.** The interpretation is confirmed: Parent defaults to the open workstream. A newly created workstream also opens itself.
- **Agent connections** move ahead of the navigation-tree slice, so the order becomes 1–6, then 8, then 7, then 9.
- **Contrast.** The user accepted Depth's demo tints. Worst-case AA is reported on every sheet but no longer gates the work. The fallbacks and principles 4–5 still hold ([decision](../../decisions/2026-10-frosted-glass-depth-direction.md)).

### Previously waiting on the user (now answered)

- **Creation defaults.** Confirm the reading of "adding a workstream should default open" as
  "the Parent defaults to the open workstream". Say whether a newly created workstream should
  also open itself (W1-014, W2-007, not yet decided).
- **Agent connections.** Whether that slice runs before the shell slice.

### Operational traps (carry forward)

- Run docs lint after the root documentation tests, never concurrently. The documentation test
  temporarily creates an intentionally invalid Compodoc link.
- Audit and capture servers must never use 4200/4310. The rig uses 4201 and 4320 and up.
- In rig page routes, use `route.fallback()`, never `route.continue()`.
- This machine has 8 GB. Run at most about four rig browsers at once, and serve a production
  build statically instead of running one `ng serve` per auditor.
- The production build is 1.02 MB initial, above the 850 kB warning and under the 1050 kB hard
  ceiling ([budget](../../decisions/2026-08-initial-bundle-budget.md)). Glass work must not
  push it over.
- **Gate 0 baseline.** The private Gate 0 baseline is a ChatGPT Site (project
  `appgprj_6acdf2662edc8191881a5b7ef190e42a`). It can only be updated from the Codex environment
  with its Sites skill, and its audience must not be broadened.
- **Gate 1 page.** Gate 1 is a private Claude artifact:
  https://claude.ai/artifact/SZ5TSfguMziAvFtRNEjYBq . Rebuild it with
  `node docs/roadmap/70-ui-ux/tooling/build-gate1.mjs`; rebuild the ledger with `build-ledger.mjs`.
