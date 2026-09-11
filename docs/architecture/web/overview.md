# Web

`apps/web` is the Angular 22 application on `http://localhost:4200` (§4, §19): the shell
with its sidebar and top bar, the dashboard, the project workspaces with their pages and
section canvases, the agent settings page, and the development tooling. It is
standalone-component, Signals-based and zoneless, styled with SCSS over CSS custom
properties, and it depends on the host **only** through gateway interfaces and one
`fetch`-holding adapter (§8).

**Code:** `apps/web/src/app` · **Styles:** `apps/web/src/styles/_tokens.scss`,
`_base.scss` · **Tests:** `*.spec.ts` beside each file, run by `ng test` (vitest under
`@angular/build:unit-test`); `*.stories.ts` for Storybook · **Package:** `web` ·
**Depends on:** `@angular/*`, `@angular/cdk`, `@cwm/contracts`, `zod`

## Responsibilities

- Render §23's shell and §68's routes: `/app`, `/projects/:projectId`,
  `/projects/:projectId/pages/:pageKind`, `/calendar`, `/search`, `/settings`,
  `/settings/agents`, `/prototype/design`, `/prototype/state`, and a not-found page.
- Hold feature state in feature-scoped signal stores (§19, §20): `Page → Store →
  Gateway`, never a global store.
- Paint optimistic writes and revert them visibly on failure (§63).
- Re-read the affected stores when the host announces a change (§62), quietly.
- Use design tokens for every colour, spacing and radius (§21); switch themes by one
  attribute (§22).

## Not responsible for

- Rules or validation beyond what a form needs: every write goes to the host, and the
  host's answer is the truth ([domain](../domain/overview.md)).
- Knowing the transport: nothing outside `core/gateway`, `core/identity`, `core/live`
  and `prototype/control` names `fetch`, a URL or a status code.

## Subsystems

- [core](core/overview.md) — the boundary and the shell: gateway interfaces and the
  prototype adapter, identity, live updates, settings and flags, theme, `AppShell`.
- [projects](projects/overview.md) — the project workspace: shell, navigation column,
  pages, the section canvas, section types, shortcuts, archive.
- [dashboard](dashboard/overview.md) — `/app`: the widget registry over one derived read.
- [tasks](tasks/overview.md) — `TaskRow`, the detail drawer and the per-section task
  store the canvas and the pages reuse.
- [prototype-tooling](prototype-tooling/overview.md) — the development panel,
  `/prototype/state`, the Design Lab, and the control port to the host's rig routes.

Smaller features that do not earn a folder of their own:

- `features/activity` — `ActivityFeed` and `ActivityStore` (§57), used by the Recent
  Activity section and the Recent Agent Activity widget; the feed composes its line from
  structured parts ([decision](../../decisions/2026-08-activity-feed-composes-from-parts.md)).
- `features/settings` — `SettingsPage` is a way in; `settings/agents` is §53's
  permission grid and revoke (`AgentConnectionsPage`, `AgentConnectionsStore`).
- `features/calendar`, `features/search` — placeholders until Slices 18 and 21.
- `shared/components/placeholder-page` — `PlaceholderPage`, `NotFoundPage`.

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
