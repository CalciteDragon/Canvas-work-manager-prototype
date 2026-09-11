# Core

`apps/web/src/app/core` is the boundary and the shell: the gateway interfaces every
store depends on and the one adapter that implements them over HTTP (§8–§10); the
identity provider (§18); the live-updates port and its `EventSource` adapter (§62); the
prototype settings and flags (§47); the theme service (§22); and `AppShell` with its
sidebar and top bar (§23). Nothing in `core/` depends on `prototype/` or on any feature.

**Code:** `apps/web/src/app/core/{config,gateway,identity,live,shell,theme}` ·
**Tests:** `*.spec.ts` beside each file; fakes in `gateway/testing`, `live/testing` ·
**Parent:** [web](../overview.md)

## Responsibilities

- `WorkManagerGateway` and its fourteen sub-interfaces (`TaskGateway`,
  `ProjectGateway`, `SectionGateway`, … `ActivityGateway`), injected through
  `WORK_MANAGER_GATEWAY`; `GatewayError` as the only failure type the UI sees.
- `PrototypeWorkManagerGateway`: every URL, `fetch`, header and status code, plus §63's
  latency and failure injection read from `PrototypeSettings`.
- `IdentityProvider` / `PrototypeIdentityProvider`: who the persona is, from `GET /api/me`.
- `LiveUpdates` / `PrototypeLiveUpdates`: "something changed, go and look", with
  exponential reconnect; the token's default is inert and asserted absent.
- `PrototypeSettings`: §47's six flags, network delay and failure rate, kept in
  `sessionStorage` so the panel's own reload does not wipe them.
- `ThemeService`: one signal, one `data-theme` attribute, session-only.
- `AppShell`, `ShellStore`, `Sidebar`, `ProjectTreeItem`, `TopBar`: the desktop-first
  layout and the project tree; `ShellStore.createProject` is where a root is created.

## Not responsible for

- Feature state: pages provide their own stores ([projects](../projects/overview.md),
  [dashboard](../dashboard/overview.md)).
- The rig controls: `PROTOTYPE_CONTROL` lives in
  [prototype-tooling](../prototype-tooling/overview.md), deliberately outside core.
- The project navigation column: it lives in the projects feature and is *placed* by
  one `:has()` rule in `app-shell.scss`
  ([decision](../../../decisions/2026-09-where-the-project-navigation-column-lives.md)).

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
