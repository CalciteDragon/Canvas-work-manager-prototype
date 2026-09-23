# How core works

## Runtime flow

1. `appConfig` provides `PrototypeIdentityProvider` as `IDENTITY_PROVIDER`,
   `PrototypeWorkManagerGateway` as `WORK_MANAGER_GATEWAY`, `PrototypeLiveUpdates` as
   `LIVE_UPDATES` and, from the tooling folder, `PrototypeHttpControl` as
   `PROTOTYPE_CONTROL`.
2. `PrototypeIdentityProvider` fetches `GET /api/me` with the `x-prototype-user` header
   it keeps (guarded `localStorage`), exposing the persona as a signal; `ThemeService`
   applies `preferences.theme` to `<html data-theme>`.
3. `PrototypeLiveUpdates` opens `EventSource(/prototype/events?user=…)`, parses each
   frame with `LiveEventSchema`, and fans it out to subscribed listeners; on error it
   reconnects with exponential backoff and tells listeners to recover.
4. A gateway call builds the URL from `PROTOTYPE_API_BASE_URL`, adds the persona header,
   waits the configured delay, fails with the configured probability, then `fetch`es;
   a non-2xx envelope becomes a `GatewayError` with the host's code, message and details.
   Section responses and strict task/reflection/shortcut/page/project `{ entity, operation }` envelopes are
   parsed at this boundary; normalized no-ops preserve `operation: null` — which for a page toggle
   means the tab was already where the call asked it to go — a shortcut delete parses
   its 200 `{ shortcutId, projectId, pageId, operation }` body, and transition results remain
   discriminated by direction and operation. `ProjectPageGateway.setEnabled` answers
   `{ page, operation }`, validated so a host that stopped sending it fails here rather than
   silently; `ProjectGateway.update` answers `{ project, operation }` the same way since Slice 39.
   Every browser caller reports the receipt through `OPERATION_HISTORY_REPORTER` (Slice 41) —
   `ProjectGateway.create` still answers the bare project. No API route answers 204 any more, so the adapter has
   no body-less send path.
5. `AppShell` provides `ShellStore`, which loads projects, derives the tree
   (`ProjectTreeNode`), and re-reads on `project.*` frames.
6. A writer calls `reportedWrite(reporter, write, report)`: `begin()` before the request returns an
   `OperationWriteHandle` for that one write; `committed(...)` on it with the report built from the
   response, `end()` in `finally`. Tying the commit to its own write is what lets the history ignore
   a write from before a navigation and know that this write — not another — ended uncommitted. Outside a
   project workspace the inert default swallows all three; inside one the shell's binding makes
   them reach `ProjectHistoryStore` ([why](../../../decisions/2026-09-project-header-history-controls.md)).

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `WorkManagerGateway` | interface | The composite gateway | [API](../../../api/interfaces/WorkManagerGateway.html) |
| `TaskGateway`, `ProjectGateway`, `SectionGateway`, `OperationHistoryGateway`, `ProjectPageGateway`, `SectionShortcutGateway`, `ReflectionGateway`, `TodosGateway`, `ArchiveGateway`, `JournalGateway`, `DashboardGateway`, `ProgressGateway`, `TimelineGateway`, `AgentGateway`, `ActivityGateway` | interfaces | The fifteen members, including the history summary and transition | [API](../../../api/interfaces/TaskGateway.html) |
| `GatewayError` | class | The one failure type | [API](../../../api/classes/GatewayError.html) |
| `PrototypeWorkManagerGateway` | injectable | The adapter | [API](../../../api/injectables/PrototypeWorkManagerGateway.html) |
| `IdentityProvider` | interface | §18's contract | [API](../../../api/interfaces/IdentityProvider.html) |
| `PrototypeIdentityProvider` | injectable | `GET /api/me` | [API](../../../api/injectables/PrototypeIdentityProvider.html) |
| `LiveUpdates` | interface | Subscribe to "go and look" | [API](../../../api/interfaces/LiveUpdates.html) |
| `OperationHistoryReporter`, `OperationWriteHandle`, `OperationWriteReport` | interfaces | `begin()` hands out a per-write handle with `committed` and `end` | [API](../../../api/interfaces/OperationHistoryReporter.html) |
| `reportedWrite` | function | Runs one write under a reporter | [API](../../../api/miscellaneous/variables.html#reportedWrite) |
| `PrototypeLiveUpdates` | injectable | `EventSource` client with reconnect | [API](../../../api/injectables/PrototypeLiveUpdates.html) |
| `PrototypeSettings`, `PrototypeFlags` | injectable / interface | §47 flags, delay, failure | [API](../../../api/injectables/PrototypeSettings.html) |
| `ThemeService` | injectable | `data-theme` | [API](../../../api/injectables/ThemeService.html) |
| `AppShell`, `Sidebar`, `ProjectTreeItem`, `TopBar` | components | §23 | [API](../../../api/components/AppShell.html) |
| `ShellStore`, `ProjectTreeNode` | injectable / interface | The project tree; `createProject` | [API](../../../api/injectables/ShellStore.html) |

## Dependencies

**Depends on**

- [contracts](../../contracts/overview.md) — types, `LiveEventSchema`, `Identity`.
- [prototype-host / api](../../prototype-host/api/overview.md) and
  [live-updates](../../prototype-host/live-updates/overview.md) — over HTTP.
- `@angular/core`, `router`, `common`.

**Depended on by**

- Every feature folder and [prototype-tooling](../prototype-tooling/overview.md) — through
  the tokens, never the classes.

## Invariants and lints

- **Only the adapters name a transport.** Reviewed, not linted; the four files are
  listed in the parent's [how](../how.md).
- **`core/` never imports `prototype/`** — the dev panel attaches at `App`.
- **The gateway has no stub members** — every member has an adapter method, a fake, and
  a caller.
- **`GatewayError` is the only thrown type past the adapter** —
  `prototype-work-manager-gateway.spec.ts` and `prototype-identity-provider.spec.ts`
  pin the mapping, including the host-stopped case.
- **`status: []` matches nothing**, not everything — the query-semantics rule holds on
  this side too.
- **Theme is not in `sessionStorage`**; flags, delay and failure rate are.
- **The reporter token names no feature.** `core/history` imports only contracts; the projects
  feature implements it, and a shell spec asserts the binding reaches every writer.

## Commands

```bash
pnpm --filter web test -- core    # the core specs
pnpm --filter web lint            # includes the token lint that covers app-shell.scss
```

## Changing it

- **A new gateway member:** interface first (a sub-interface if it is a new family),
  then the adapter method with its spec (success, envelope error, network error), then
  the fake in `gateway/testing`, then the host route. Nothing else in the app changes.
- **A new flag:** `PrototypeFlags` and the default in `PrototypeSettings`; the panel's
  control appears in `DevPanelControls`; the consumer reads the signal.
- **The trap:** reading `localStorage` or `sessionStorage` unguarded. Both throw when
  site data is blocked; wrap every access.
