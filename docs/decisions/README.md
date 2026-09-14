# Decision log

§78's log: one small entry per answered question, in the shape **Question / Options tested
/ What we learned / Current decision / Confidence / Revisit when**. This index groups every
entry by the system it shapes, so a reader of a system's [`why.md`](../architecture/overview.md)
and a reader of this page arrive at the same list. `pnpm docs:check` fails when an entry is
missing from here.

**How to add one:** copy [`docs/templates/decision.md`](../templates/decision.md) to
`YYYY-MM-<slug>.md`, list it below under its system, link it from that system's `why.md`.
**How to change one:** never rewrite. Append a dated `**Amended, YYYY-MM-DD**` paragraph or
put a `> **Superseded by …**` banner under the title, and mark it here.

Status column: **current** unless marked. *amended* — a later dated note inside the entry
corrects part of it. *extended* — later entries add rules on top without contradicting it.
*open experiment* — the entry deliberately does not choose yet.

## Whole prototype

| Entry | Settled | Status |
|---|---|---|
| [The web app and the host start separately](2026-08-web-and-host-start-separately.md) | `pnpm dev` prints two commands and exits; `concurrently` hung `tsx watch` | current |
| [The host's port variable is `CWM_HOST_PORT`, not `PORT`](2026-08-host-port-is-not-the-generic-port.md) | The host ignores the generic `PORT` entirely | current |
| [The initial bundle budget is set deliberately at 850 kB](2026-08-initial-bundle-budget.md) | Warning budget with the measurement behind it; 25.x builds exceed it warning-only | current |

## Contracts

| Entry | Settled | Status |
|---|---|---|
| [Persona contract fields](2026-08-persona-contract-fields.md) | `id`/`workspaceId` spelling and the preference shape | current |
| [Project statuses, milestone statuses, task priorities](2026-08-status-and-priority-value-sets.md) | The starting value sets, flagged as guesses (§83) | current |
| [A date-only task due date is stored at UTC end-of-day](2026-08-task-date-only-due-time.md) | How a date-only due date becomes an instant | current |
| [A section config is an object at rest, replaced whole on write](2026-08-section-config-ownership.md) | Config keys belong to the section definition; no partial writes | amended; recovery inspection landed in Slice 29 |
| [What an `Identity` is, and where it comes from](2026-08-identity-contract-and-me-route.md) | The `Identity` contract and `GET /api/me` | current |
| [What `ActivityEvent.summary` is for, and what it is not](2026-08-activity-summary-ownership.md) | `summary` is a log line the domain writes; the UI composes its own | current |

## Domain

| Entry | Settled | Status |
|---|---|---|
| [Project nesting rules and what archiving a parent does](2026-08-project-nesting-and-archive-rules.md) | Same workspace, no cycles, no depth limit; children archived first | extended |
| [Task status transitions, `completedAt`, and how a task is archived](2026-08-task-status-transitions-and-archive.md) | Archive is `archivedAt`, not a status; `done` stamps `completedAt` | amended |
| [Workspace scoping, and why a foreign id is 404 rather than 409](2026-08-workspace-scoping-and-not-found.md) | Every read and write is scoped by the actor's workspace | current |
| [Where the agent permission model is enforced](2026-08-permissions-live-on-the-actor.md) | The domain asserts capability on the actor; no `agents.*` permission | current |
| [How §53's "Last used" is recorded](2026-08-last-used-is-a-throttled-write.md) | A throttled write on distance, not elapsed time | current |
| [Why `workspace.read` needed a service of its own](2026-08-workspace-tools-need-their-own-service.md) | `WorkspaceService` asserts one grant and reads repositories | current |
| [Project progress has one canonical formula, and "no tasks" is not "0%"](2026-08-project-progress-count-based.md) | `progressFormula` per project; count is the default | current |
| [Progress formulas are selectable per project](2026-08-progress-formula-experiment.md) | Count, weighted and manual all remain switchable | open experiment |
| [Timeline derives ranges without inventing a project start date](2026-08-timeline-range-semantics.md) | How timeline ranges are derived | current |
| [Reflections use reverse chronology and optional prompts](2026-08-reflection-chronology-and-prompts.md) | Body required; prompts are suggestions | current |
| [What counts as AI in the prototype](2026-08-prototype-ai-scope-and-fun-fact.md) | Fun Fact is a fixture rotation, not `AIProvider` | current |
| [A section's activity event names its project, not the section](2026-08-section-activity-targets-the-project.md) | `project.section_*` events target the project | amended |
| [Where a live event is emitted, and when it is delivered](2026-08-live-events-ride-the-activity-record.md) | At most one frame per operation, on `ActivityService.record`, after commit | amended (Undo adds no channel, Slice 30) |
| [Container sections own their rows; view sections own nothing](2026-09-sections-own-their-data.md) | `sectionId` on rows; cascade or reassign on removal | amended |
| [A section has a name, and the default is derived rather than stored](2026-09-a-section-has-a-name.md) | `nameOf` over `type`, optional `title` override | amended |
| [What undo means for an archived row](2026-09-what-undo-means-for-an-archived-row.md) | Removal archives; restore is exact; nothing hard-deletes | amended; content projection landed in Slice 29; Archive Restore distinct from Undo (Slice 30) |
| [Content-oriented Archive policy](2026-09-content-oriented-archive-policy.md) | Meaningful content, conservative unknowns and owner-container recovery | current (Slice 29) |
| [A root project is a workspace with pages; a subproject is a unit of work](2026-09-project-workspaces-and-subproject-work-units.md) | The 25.x model: kinds, pages, v3 converter, Archive and Todos semantics | current |
| [A root's optional pages are created on first enable](2026-09-optional-pages-are-created-on-first-enable.md) | First enable creates the page; enabling escapes the archive freeze | current |
| [A disabled page refuses new content and keeps everything already on it](2026-09-a-disabled-page-hides-navigation-not-data.md) | Disabled is navigation state, not data loss | current |
| [Reassigning a container's rows may cross pages within a project](2026-09-reassign-may-cross-pages.md) | §31 constrains the type, not the page | current |
| [Live work under an archived ancestor is hidden, and cannot be newly created](2026-09-reactivating-under-an-archived-ancestor.md) | The archived-ancestor rule and its transition check | current |
| [A shortcut resolves source identity, not source content](2026-09-a-shortcut-resolves-identity-not-content.md) | `SectionShortcutService` never reads rows | current |
| [Home orders sections and shortcuts together](2026-09-home-orders-sections-and-shortcuts-together.md) | One combined placement sequence per page | amended (Undo restores by neighbours, Slice 30) |
| [Contextual insertion remembers its target and creates in one positioned write](2026-09-contextual-insertion-names-its-position.md) | Optional domain `position`; UI resolves stable anchors; Grid gaps are transient targets; renumbering leaves shifted siblings' `updatedAt` amended | amended |
| [What the Todos page decides for itself](2026-09-todos-chronology-and-canonical-navigation.md) | Instants compared as text; no tab required; completion one-way | current |
| [Reflection subjects and the root journal feed](2026-09-reflection-subjects-and-the-journal-feed.md) | Optional subject id; journal resolves current state | current |
| [Root Archive recovery guidance](2026-09-root-archive-recovery-guidance.md) | What the Archive projection says about each item's restore path | amended |
| [A section removal commits one scoped, expiring Undo record](2026-09-section-removal-undo-records.md) | Defaulted v3 collection, 24 h / 50 bound, exact-actor scope, structural conflicts, neighbor placement | current (Slice 30) |

## Repositories

| Entry | Settled | Status |
|---|---|---|
| [How repository queries combine and compare values](2026-08-repository-query-semantics.md) | Query filters AND together; empty arrays match nothing | current |

## MCP tools

| Entry | Settled | Status |
|---|---|---|
| [What the tool registry knows about MCP](2026-08-tool-registry-is-transport-free.md) | Nothing: the registry is transport-free; the host mounts it | current |
| [MCP tools advertise their required permission in namespaced metadata](2026-08-mcp-tool-permission-metadata.md) | `_meta["local.canvas-work-manager/requiredPermission(s)"]` | current |

## Prototype data

| Entry | Settled | Status |
|---|---|---|
| [Persona workspace topology in seeds](2026-08-persona-workspace-topology.md) | Three personas with separately owned workspaces in every seed | current |
| [Where §51's bearer tokens live](2026-08-agent-tokens-are-fixtures-not-records.md) | Tokens are fixtures beside the seeds, not a contract field | current |

## Prototype host

| Entry | Settled | Status |
|---|---|---|
| [CORS on the host, not a dev-server proxy](2026-08-host-cors-over-dev-proxy.md) | The preflight is load-bearing; the host answers it | current |
| [Stdio uses an environment token and reloads identity per call](2026-08-stdio-token-and-live-auth.md) | `CWM_MCP_TOKEN`; stdio re-reads the file every call | current |
| [Live updates reach the browser over HTTP, and not over stdio](2026-08-live-updates-are-http-only.md) | A stdio process owns a separate store | current |
| [Latency and failure injection live in the client, not the host](2026-08-latency-and-failure-live-in-the-client.md) | The gateway injects; the host has no delay endpoint | current |

## Web app

| Entry | Settled | Status |
|---|---|---|
| [Direct canvas editing is the next development direction](2026-09-direct-canvas-editing-direction.md) | Approved direction, implemented in Slice 27 | implemented in Slice 27 |
| [Canvas chrome is revealed in place, not gated by an editing mode](2026-09-canvas-chrome-is-revealed-not-moded.md) | Contextual reveal, keyboard and touch behavior, optimistic resize; pending shortcut writes, complete-order movement guards and browser-review reveal and handle fixes, slider handle and script-fitted Rich Text amended | amended |
| [The gateway interface grows with its implementations](2026-08-gateway-surface-grows-with-implementations.md) | No stubbed gateway members | current |
| [A theme change lasts the session, not the persona](2026-08-theme-selection-is-session-only.md) | `ThemeService` owns `data-theme`; nothing persists it | current |
| [How live reconnects recover derived project views](2026-08-live-recovery-invalidates-derived-views.md) | Reconnect invalidates derived reads quietly | current |
| [The activity feed composes its line; `summary` stays a log line](2026-08-activity-feed-composes-from-parts.md) | The feed renders from structured parts with a live title | current |
| [The dashboard splits layout from content](2026-08-dashboard-layout-and-content-split.md) | Widgets from `IdentityProvider`, content from one read | current |
| [Where dashboard widgets live](2026-08-dashboard-widget-ownership.md) | One folder per widget, one registry line | current |
| [Flow and grid both remain prototype layout candidates](2026-08-flow-vs-grid-layout-experiment.md) | Both modes persist per project; no freeform canvas | open experiment |
| [View Mode shows work; Edit Layout Mode shows canvas chrome](2026-08-view-mode-section-chrome.md) | Earlier mode-based visibility rules | superseded |
| [The project header's Quick Add adds a section](2026-08-project-header-quick-add.md) | Quick Add's former meaning and placement | amended |
| [The smallest surface that makes §81's project verbs demonstrable](2026-08-project-create-edit-archive-surface.md) | Sidebar create; More menu for rename, status, date, archive | current |
| [§4's *Agent Modified* task row has no data behind it](2026-08-agent-modified-has-no-data-behind-it.md) | Six of seven `TaskRow` variants; the seventh is a §58 question | current |
| [Where the project navigation column lives, and what moved with it](2026-09-where-the-project-navigation-column-lives.md) | In the projects feature; height and recovery entry amended in Slice 27 | amended |
| [Optional page management lives in project navigation](2026-09-optional-page-management-lives-in-project-navigation.md) | The page toggles sit in the navigation column | current |
| [The development panel is an overlay and a route, sharing one control set](2026-08-development-panel-surface.md) | `DevPanelControls` is the one implementation of every control | current |
| [What §46's Agent Connection control is](2026-08-agent-connection-panel-control-is-a-roster.md) | A read-only roster with copyable tokens | current |
| [The Design Lab is a route with live knobs, not a third theme](2026-08-design-lab-tokens-are-session-knobs.md) | Seven inline custom properties, session-only | current |

## Testing

| Entry | Settled | Status |
|---|---|---|
| [The end-to-end suite starts its own servers and writes its own data file](2026-08-e2e-owns-its-servers-and-its-data.md) | Playwright owns both processes and `.prototype/e2e-data.json` | current |
| [Storybook runs on the Vite framework, not the webpack one](2026-08-storybook-runs-on-the-vite-framework.md) | `@storybook/angular-vite`, zoneless, `@angular/build` | current |
